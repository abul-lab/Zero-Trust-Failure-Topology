import crypto from "node:crypto";
import http from "node:http";
import { URL } from "node:url";
import { z } from "zod";
import { TopologyAuditLedger } from "./audit/TopologyAuditLedger.js";
import { FailureTopologyEngine } from "./engine/FailureTopologyEngine.js";
import type {
  BulkheadPatchAction,
  RuntimeIncidentEvent,
  SimulationRequest,
  TopologyAuditEntry,
  TopologyDefinition,
} from "./types/index.js";
import { renderConsoleHtml } from "./ui/consoleApp.js";

const TopologyNodeSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(160),
  kind: z.enum(["agent", "tool", "api", "queue", "datastore", "gate"]),
  zone: z.enum(["untrusted", "dmz", "restricted", "critical"]),
  credentialScope: z.string().max(128).optional(),
  capacityMultiplierLimit: z.number().positive().max(100).optional(),
  blocksTaint: z.boolean().optional(),
  privilegedSink: z.boolean().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

const TopologyEdgeSchema = z.object({
  id: z.string().min(1).max(128),
  from: z.string().min(1).max(128),
  to: z.string().min(1).max(128),
  relation: z.enum(["calls", "reads_context", "writes_state", "delegates_to"]),
  hardDependency: z.boolean().optional(),
  fallbackMode: z.boolean().optional(),
  circuitBreaker: z.boolean().optional(),
  maxRetries: z.number().int().nonnegative().max(10).optional(),
  timeoutMs: z.number().positive().max(60000).optional(),
  sanitized: z.boolean().optional(),
  scopedTokenVerified: z.boolean().optional(),
});

const TopologyDefinitionSchema = z.object({
  topologyId: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(64),
  description: z.string().max(1000).optional(),
  nodes: z.array(TopologyNodeSchema).min(1).max(64),
  edges: z.array(TopologyEdgeSchema).max(256),
});

const SimulationRequestSchema = z.object({
  originNodeId: z.string().min(1).max(128),
  faultMode: z.enum([
    "dependency_outage",
    "retry_storm",
    "taint_propagation",
    "credential_compromise",
  ]),
  initialSpikeMultiplier: z.number().positive().max(20).optional(),
});

const BulkheadPatchActionSchema = z.discriminatedUnion("targetType", [
  z.object({
    targetType: z.literal("edge"),
    edgeId: z.string().min(1).max(128),
    patch: z.object({
      circuitBreaker: z.boolean().optional(),
      maxRetries: z.number().int().nonnegative().max(10).optional(),
      sanitized: z.boolean().optional(),
      fallbackMode: z.boolean().optional(),
      scopedTokenVerified: z.boolean().optional(),
    }),
    summary: z.string().min(1).max(400),
  }),
  z.object({
    targetType: z.literal("node"),
    nodeId: z.string().min(1).max(128),
    patch: z.object({
      credentialScope: z.string().max(128).optional(),
      blocksTaint: z.boolean().optional(),
    }),
    summary: z.string().min(1).max(400),
  }),
]);

const ApplyContainmentSchema = z.object({
  patches: z.array(BulkheadPatchActionSchema).min(1).max(64),
  summary: z.string().max(500).optional(),
});

const RuntimeIncidentSchema = z.object({
  eventId: z.string().optional(),
  nodeId: z.string().min(1),
  timestamp: z.string().optional(),
  sourceGate: z.enum(["agent-firewall", "prompt-shield", "service-monitor"]),
  signalCode: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
});

const IncidentResetSchema = z.object({
  nodeId: z.string().optional(),
});

function verifyApiKeyConstantTime(expected: string, provided: string): boolean {
  const expectedDigest = crypto
    .createHash("sha256")
    .update(expected, "utf8")
    .digest();
  const providedDigest = crypto
    .createHash("sha256")
    .update(provided, "utf8")
    .digest();
  return crypto.timingSafeEqual(expectedDigest, providedDigest);
}

function seedBaselineScenarios(engine: FailureTopologyEngine): void {
  engine.scanRisksWithAudit();
  engine.simulate({
    originNodeId: "inbound-webhook",
    faultMode: "taint_propagation",
  });
  engine.simulate({
    originNodeId: "inbound-webhook",
    faultMode: "retry_storm",
    initialSpikeMultiplier: 2,
  });
  engine.simulate({
    originNodeId: "triage-agent",
    faultMode: "credential_compromise",
  });
  engine.simulate({
    originNodeId: "ledger-db",
    faultMode: "dependency_outage",
  });
}

export interface TopologyServerOptions {
  port?: number;
  host?: string;
  apiKey?: string;
  maxBodyBytes?: number;
  seedDemoOnStart?: boolean;
  engine?: FailureTopologyEngine;
}

export interface RunningTopologyServer {
  server: http.Server;
  engine: FailureTopologyEngine;
  port: number;
  close: () => Promise<void>;
}

export async function startTopologyServer(
  options: TopologyServerOptions = {},
): Promise<RunningTopologyServer> {
  const engine = options.engine ?? new FailureTopologyEngine();
  const configuredKey = (
    options.apiKey ??
    process.env.TOPOLOGY_API_KEY ??
    ""
  ).trim();
  const maxBodyBytes = options.maxBodyBytes ?? 512 * 1024;

  if (options.seedDemoOnStart !== false) {
    seedBaselineScenarios(engine);
  }

  function sendJson(
    res: http.ServerResponse,
    statusCode: number,
    payload: unknown,
    extraHeaders: Record<string, string> = {},
  ): void {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body).toString(),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      ...extraHeaders,
    });
    res.end(body);
  }

  function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let rejectedTooLarge = false;

      req.on("data", (chunk: Buffer) => {
        if (rejectedTooLarge) return;
        totalBytes += chunk.length;
        if (totalBytes > maxBodyBytes) {
          rejectedTooLarge = true;
          chunks.length = 0;
          req.resume();
          reject(new Error("PAYLOAD_TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        if (rejectedTooLarge) return;
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        if (!raw) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error("INVALID_JSON"));
        }
      });

      req.on("error", (err) => {
        if (!rejectedTooLarge) reject(err);
      });
    });
  }

  const server = http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const parsedUrl = new URL(req.url ?? "/", "http://localhost");
    const pathname = parsedUrl.pathname;

    // Serve Web Console UI & healthz without requiring X-API-Key
    if (method === "GET" && pathname === "/") {
      const html = renderConsoleHtml();
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(html).toString(),
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      });
      res.end(html);
      return;
    }

    if (method === "GET" && pathname === "/healthz") {
      const topo = engine.getTopology();
      const verification = engine.verifyAuditChain();
      sendJson(res, 200, {
        status: "ok",
        service: "zero-trust-failure-topology",
        topologyId: topo.topologyId,
        nodeCount: topo.nodes.length,
        edgeCount: topo.edges.length,
        quarantinedNodes: engine.getQuarantinedNodeIds().length,
        auditChainValid: verification.valid,
      });
      return;
    }

    if (configuredKey) {
      const headerVal = req.headers["x-api-key"];
      const candidate = Array.isArray(headerVal)
        ? (headerVal[0] ?? "")
        : (headerVal ?? "");
      if (!candidate || !verifyApiKeyConstantTime(configuredKey, candidate)) {
        sendJson(res, 401, {
          error: "UNAUTHORIZED",
          message: "Valid X-API-Key header is required.",
        });
        return;
      }
    }

    if (method === "GET" && pathname === "/v1/stats") {
      const topology = engine.getTopology();
      const findings = engine.getRisks();
      const auditEntries = engine.getAuditEntries();
      const auditVerification = engine.verifyAuditChain();
      const codeCounts = new Map<string, number>();

      let criticalHighRiskCount = 0;
      for (const f of findings) {
        if (f.severity === "critical" || f.severity === "high") {
          criticalHighRiskCount += 1;
        }
        codeCounts.set(f.code, (codeCounts.get(f.code) ?? 0) + 1);
      }

      let peakBlastRadiusScore = 0;
      for (const e of auditEntries) {
        if (e.eventType === "SIMULATION" && e.blastRadiusScore > peakBlastRadiusScore) {
          peakBlastRadiusScore = e.blastRadiusScore;
        }
      }

      const risksByCode = Array.from(codeCounts.entries())
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count);

      sendJson(res, 200, {
        topology,
        findings,
        riskCount: findings.length,
        criticalHighRiskCount,
        risksByCode,
        lastSimulation: engine.getLastSimulation(),
        simulationCount: engine.getSimulationCount(),
        peakBlastRadiusScore,
        runtimeHealth: engine.getRuntimeHealth(),
        quarantinedNodeIds: engine.getQuarantinedNodeIds(),
        quarantineThreshold: engine.getQuarantineThreshold(),
        auditVerification,
        totalAuditEntries: auditEntries.length,
      });
      return;
    }

    if (method === "GET" && pathname === "/v1/topology") {
      sendJson(res, 200, {
        topology: engine.getTopology(),
        risks: engine.getRisks(),
      });
      return;
    }

    if (method === "PUT" && pathname === "/v1/topology") {
      let rawBody: unknown;
      try {
        rawBody = await readJsonBody(req);
      } catch (err) {
        const code = err instanceof Error ? err.message : "INVALID_JSON";
        sendJson(res, code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: code });
        return;
      }

      const parsed = TopologyDefinitionSchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, 422, {
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      try {
        const result = engine.updateTopology(parsed.data as TopologyDefinition);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 422, {
          error: "TOPOLOGY_GRAPH_INVALID",
          message: err instanceof Error ? err.message : "Invalid topology graph.",
        });
      }
      return;
    }

    if (method === "POST" && pathname === "/v1/topology/reset") {
      const result = engine.resetToDefaultTopology();
      sendJson(res, 200, result);
      return;
    }

    if (method === "POST" && pathname === "/v1/demo/seed") {
      engine.resetToDefaultTopology();
      seedBaselineScenarios(engine);
      sendJson(res, 200, {
        status: "seeded",
        totalAuditEntries: engine.getAuditEntries().length,
      });
      return;
    }

    if (method === "GET" && pathname === "/v1/risks") {
      sendJson(res, 200, { findings: engine.getRisks() });
      return;
    }

    if (method === "POST" && pathname === "/v1/risks/scan") {
      sendJson(res, 200, engine.scanRisksWithAudit());
      return;
    }

    if (method === "POST" && pathname === "/v1/simulate") {
      let rawBody: unknown;
      try {
        rawBody = await readJsonBody(req);
      } catch (err) {
        const code = err instanceof Error ? err.message : "INVALID_JSON";
        sendJson(res, code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: code });
        return;
      }

      const parsed = SimulationRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, 422, {
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      try {
        const sim = engine.simulate(parsed.data as SimulationRequest);
        sendJson(res, 200, sim, {
          "X-Blast-Radius-Score": String(sim.blastRadiusScore),
          "X-Topology-Audit-Hash": sim.auditEntryHash ?? "",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown node.";
        const isLimit = msg.includes("caps ephemeral cluster size");
        sendJson(res, isLimit ? 422 : 404, {
          error: isLimit ? "CLUSTER_LIMIT_EXCEEDED" : "NODE_NOT_FOUND",
          message: msg,
        });
      }
      return;
    }

    if (method === "POST" && pathname === "/v1/containment/plan") {
      let rawBody: unknown;
      try {
        rawBody = await readJsonBody(req);
      } catch (err) {
        const code = err instanceof Error ? err.message : "INVALID_JSON";
        sendJson(res, code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: code });
        return;
      }

      const parsed = SimulationRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, 422, {
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      try {
        const plan = engine.planContainment(parsed.data as SimulationRequest);
        sendJson(res, 200, plan);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown node.";
        const isLimit = msg.includes("caps ephemeral cluster size");
        sendJson(res, isLimit ? 422 : 404, {
          error: isLimit ? "CLUSTER_LIMIT_EXCEEDED" : "NODE_NOT_FOUND",
          message: msg,
        });
      }
      return;
    }

    if (method === "POST" && pathname === "/v1/chaos/live") {
      let rawBody: unknown;
      try {
        rawBody = await readJsonBody(req);
      } catch (err) {
        const code = err instanceof Error ? err.message : "INVALID_JSON";
        sendJson(res, code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: code });
        return;
      }

      const parsed = SimulationRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, 422, {
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      try {
        const liveResult = await engine.runLiveChaosTest(
          parsed.data as SimulationRequest,
        );
        sendJson(res, 200, liveResult);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown node.";
        const isLimit = msg.includes("caps ephemeral cluster size");
        sendJson(res, isLimit ? 422 : 404, {
          error: isLimit ? "CLUSTER_LIMIT_EXCEEDED" : "NODE_NOT_FOUND",
          message: msg,
        });
      }
      return;
    }

    if (method === "POST" && pathname === "/v1/containment/apply") {
      let rawBody: unknown;
      try {
        rawBody = await readJsonBody(req);
      } catch (err) {
        const code = err instanceof Error ? err.message : "INVALID_JSON";
        sendJson(res, code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: code });
        return;
      }

      const parsed = ApplyContainmentSchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, 422, {
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      const applied = engine.applyContainmentPatches(
        parsed.data.patches as BulkheadPatchAction[],
        parsed.data.summary,
      );
      sendJson(res, 200, applied);
      return;
    }

    if (method === "POST" && pathname === "/v1/incidents") {
      let rawBody: unknown;
      try {
        rawBody = await readJsonBody(req);
      } catch (err) {
        const code = err instanceof Error ? err.message : "INVALID_JSON";
        sendJson(res, code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: code });
        return;
      }

      const parsed = RuntimeIncidentSchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, 422, {
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      try {
        const recorded = engine.recordIncident(
          parsed.data as RuntimeIncidentEvent,
        );
        sendJson(res, 200, recorded);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown node.";
        const isLimit = msg.includes("caps ephemeral cluster size");
        sendJson(res, isLimit ? 422 : 404, {
          error: isLimit ? "CLUSTER_LIMIT_EXCEEDED" : "NODE_NOT_FOUND",
          message: msg,
        });
      }
      return;
    }

    if (method === "POST" && pathname === "/v1/incidents/reset") {
      let rawBody: unknown;
      try {
        rawBody = await readJsonBody(req);
      } catch {
        rawBody = {};
      }
      const parsed = IncidentResetSchema.safeParse(rawBody);
      if (parsed.success && parsed.data.nodeId) {
        const health = engine.clearQuarantine(parsed.data.nodeId);
        sendJson(res, 200, { status: "cleared", health });
      } else {
        for (const h of engine.getRuntimeHealth()) {
          engine.clearQuarantine(h.nodeId);
        }
        sendJson(res, 200, { status: "cleared_all" });
      }
      return;
    }

    if (method === "GET" && pathname === "/v1/audit") {
      sendJson(res, 200, {
        entries: engine.getAuditEntries(),
        verification: engine.verifyAuditChain(),
      });
      return;
    }

    if (method === "GET" && pathname === "/v1/audit/verify") {
      sendJson(res, 200, engine.verifyAuditChain());
      return;
    }

    if (method === "POST" && pathname === "/v1/audit/tamper-test") {
      const entries = engine.getAuditEntries();
      if (entries.length === 0) {
        sendJson(res, 200, {
          simulated: false,
          valid: true,
          checked: 0,
          headHash: "GENESIS",
        });
        return;
      }
      const cloned: TopologyAuditEntry[] = entries.map((e) => ({ ...e }));
      const targetIdx = cloned.findIndex((e) => e.eventType === "SIMULATION");
      const mutateIdx = targetIdx >= 0 ? targetIdx : 0;
      const target = cloned[mutateIdx]!;
      cloned[mutateIdx] = {
        ...target,
        blastRadiusScore: target.blastRadiusScore === 0 ? 99 : 0,
      };
      const verifier = new TopologyAuditLedger();
      const report = verifier.verifyChain(cloned);
      sendJson(res, 200, {
        simulated: true,
        ...report,
      });
      return;
    }

    sendJson(res, 404, {
      error: "NOT_FOUND",
      message: `Route ${method} ${pathname} not found.`,
    });
  });

  const requestedPort =
    options.port ?? (Number(process.env.TOPOLOGY_PORT) || 4200);
  const host = options.host ?? process.env.TOPOLOGY_HOST ?? "127.0.0.1";

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => resolve());
  });

  const address = server.address();
  const actualPort =
    typeof address === "object" && address !== null
      ? address.port
      : requestedPort;

  return {
    server,
    engine,
    port: actualPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
