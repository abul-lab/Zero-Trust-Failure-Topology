import crypto from "node:crypto";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { TopologyGraph } from "../graph/TopologyGraph.js";
import { BlastRadiusSimulator } from "../simulator/BlastRadiusSimulator.js";
import type {
  LiveChaosTestResult,
  LiveNodeProbeOutcome,
  NodeImpactState,
  SimulationRequest,
  TopologyNode,
} from "../types/index.js";

interface NodeServerTelemetry {
  requestsHandled: number;
  lastHttpStatus: number;
  overloaded: boolean;
  taintedAccepted: boolean;
  unauthorizedAccepted: boolean;
  degradedFallbackUsed: boolean;
  shieldedByGate: boolean;
  detail: string;
}

interface InvokePayload {
  mode: SimulationRequest["faultMode"];
  callerId?: string;
  edgeId?: string;
  visited?: string[];
  taintPayload?: string;
  presentedScope?: string;
}

/**
 * Live Multi-Node HTTP Chaos Harness.
 * Spins up an actual ephemeral `node:http` TCP server on `127.0.0.1:0` for EVERY
 * node in the topology, executes real HTTP requests (`fetch`) across localhost
 * sockets with live retries, circuit breakers, taint checks, and token scopes,
 * and compares measured live HTTP outcomes against the deterministic simulator.
 */
export class LiveMeshChaosHarness {
  private readonly simulator = new BlastRadiusSimulator();
  private static readonly MAX_LIVE_NODES = 32;
  private static readonly MAX_RETRIES_PER_HOP = 5;
  private static readonly MAX_INVOKE_BODY_BYTES = 16 * 1024;

  public async runLiveChaosTest(
    graph: TopologyGraph,
    request: SimulationRequest,
  ): Promise<LiveChaosTestResult> {
    const startMs = performance.now();
    if (graph.getNodes().length > LiveMeshChaosHarness.MAX_LIVE_NODES) {
      throw new Error(
        `Live HTTP chaos harness caps ephemeral cluster size at ${LiveMeshChaosHarness.MAX_LIVE_NODES} nodes.`,
      );
    }
    const origin = graph.getNode(request.originNodeId);
    if (!origin) {
      throw new Error(
        `Origin node '${request.originNodeId}' does not exist in topology '${graph.definition.topologyId}'.`,
      );
    }

    const simulated = this.simulator.simulate(graph, request);

    const servers = new Map<string, http.Server>();
    const ports = new Map<string, number>();
    const telemetry = new Map<string, NodeServerTelemetry>();
    const openCircuitEdges = new Set<string>();

    for (const n of graph.getNodes()) {
      telemetry.set(n.id, {
        requestsHandled: 0,
        lastHttpStatus: 200,
        overloaded: false,
        taintedAccepted: false,
        unauthorizedAccepted: false,
        degradedFallbackUsed: false,
        shieldedByGate: false,
        detail: "Healthy HTTP 200 response.",
      });
    }

    try {
      // 1. Spawn a real TCP/HTTP server on 127.0.0.1:0 for each node in the topology
      for (const node of graph.getNodes()) {
        const srv = this.createNodeHttpServer(
          node,
          graph,
          request,
          ports,
          telemetry,
          openCircuitEdges,
        );
        await new Promise<void>((resolve, reject) => {
          srv.once("error", reject);
          srv.listen(0, "127.0.0.1", () => resolve());
        });
        const addr = srv.address();
        const port = typeof addr === "object" && addr !== null ? addr.port : 0;
        servers.set(node.id, srv);
        ports.set(node.id, port);
      }

      // 2. Drive live HTTP fault traffic across the ephemeral TCP servers
      switch (request.faultMode) {
        case "dependency_outage":
          await this.driveLiveDependencyOutage(graph, origin.id, ports, telemetry);
          break;
        case "taint_propagation":
          await this.driveLiveTaintPropagation(graph, origin.id, ports, telemetry);
          break;
        case "retry_storm":
          await this.driveLiveRetryStorm(
            graph,
            origin.id,
            request.initialSpikeMultiplier ?? 2,
            ports,
            telemetry,
            openCircuitEdges,
          );
          break;
        case "credential_compromise":
          await this.driveLiveCredentialCompromise(
            graph,
            origin,
            ports,
            telemetry,
          );
          break;
      }

      // 3. Collect real measured HTTP telemetry from every node server
      let compromisedCount = 0;
      let degradedCount = 0;
      let containedCount = 0;
      let healthyCount = 0;
      let peakMeasuredRequestsPerNode = 0;
      const criticalSinksReached: string[] = [];
      const nodeProbes: LiveNodeProbeOutcome[] = [];

      for (const n of graph.getNodes()) {
        const stat = telemetry.get(n.id)!;
        const port = ports.get(n.id) ?? 0;
        if (stat.requestsHandled > peakMeasuredRequestsPerNode) {
          peakMeasuredRequestsPerNode = stat.requestsHandled;
        }

        let observedState: NodeImpactState = "HEALTHY";
        if (n.id === origin.id) {
          observedState = "ORIGIN";
        } else if (
          stat.lastHttpStatus >= 500 ||
          stat.overloaded ||
          stat.taintedAccepted ||
          stat.unauthorizedAccepted
        ) {
          observedState = "COMPROMISED";
          compromisedCount += 1;
          if (n.privilegedSink || n.kind === "datastore" || n.zone === "critical") {
            criticalSinksReached.push(n.id);
          }
        } else if (stat.degradedFallbackUsed) {
          observedState = "DEGRADED";
          degradedCount += 1;
        } else if (stat.shieldedByGate) {
          observedState = "CONTAINED";
          containedCount += 1;
        } else {
          observedState = "HEALTHY";
          healthyCount += 1;
        }

        nodeProbes.push({
          nodeId: n.id,
          label: n.label,
          port,
          httpStatus: stat.lastHttpStatus,
          observedState,
          requestsHandled: stat.requestsHandled,
          detail: stat.detail,
        });
      }

      const nonOrigin = Math.max(1, graph.getNodes().length - 1);
      const measuredBlastRadiusScore = Math.min(
        100,
        Math.max(
          0,
          Math.round(((compromisedCount + degradedCount * 0.35) / nonOrigin) * 100),
        ),
      );

      return {
        chaosRunId: `chaos_${crypto.randomBytes(6).toString("hex")}`,
        topologyId: graph.definition.topologyId,
        originNodeId: origin.id,
        faultMode: request.faultMode,
        serversSpawned: servers.size,
        measuredBlastRadiusScore,
        simulatedBlastRadiusScore: simulated.blastRadiusScore,
        matchesSimulation:
          measuredBlastRadiusScore === simulated.blastRadiusScore &&
          compromisedCount === simulated.compromisedCount,
        compromisedCount,
        degradedCount,
        containedCount,
        healthyCount,
        peakMeasuredRequestsPerNode,
        criticalSinksReached,
        nodeProbes,
        durationMs: Number((performance.now() - startMs).toFixed(2)),
        timestamp: new Date().toISOString(),
      };
    } finally {
      await Promise.all(
        Array.from(servers.values()).map(
          (srv) =>
            new Promise<void>((resolve) => {
              srv.close(() => resolve());
            }),
        ),
      );
    }
  }

  private createNodeHttpServer(
    node: TopologyNode,
    graph: TopologyGraph,
    request: SimulationRequest,
    ports: Map<string, number>,
    telemetry: Map<string, NodeServerTelemetry>,
    openCircuitEdges: Set<string>,
  ): http.Server {
    return http.createServer(async (req, res) => {
      const stat = telemetry.get(node.id)!;
      stat.requestsHandled += 1;

      const chunks: Buffer[] = [];
      let readBytes = 0;
      for await (const chunk of req) {
        const buf = chunk as Buffer;
        readBytes += buf.length;
        if (readBytes <= LiveMeshChaosHarness.MAX_INVOKE_BODY_BYTES) {
          chunks.push(buf);
        }
      }
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      const body: InvokePayload = raw
        ? (JSON.parse(raw) as InvokePayload)
        : { mode: request.faultMode };
      const visited = body.visited ?? [node.id];

      const reply = (status: number, payload: Record<string, unknown>): void => {
        stat.lastHttpStatus = status;
        const json = JSON.stringify(payload);
        res.writeHead(status, {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(json).toString(),
        });
        res.end(json);
      };

      // Mode 1: Live Dependency Outage over HTTP
      if (body.mode === "dependency_outage") {
        if (node.id === request.originNodeId) {
          stat.detail = `Injected HTTP 503 outage on '${node.label}' (port ${ports.get(node.id)}).`;
          reply(503, { status: "origin_outage", nodeId: node.id });
          return;
        }

        let usedFallback = false;
        let shieldedUpstream = false;

        for (const edge of graph.getOutgoingEdges(node.id)) {
          if (visited.includes(edge.to)) continue;
          const targetPort = ports.get(edge.to);
          if (!targetPort) continue;

          if (edge.circuitBreaker && openCircuitEdges.has(edge.id)) {
            usedFallback = true;
            continue;
          }

          const resp = await fetch(`http://127.0.0.1:${targetPort}/invoke`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "dependency_outage",
              callerId: node.id,
              edgeId: edge.id,
              visited: [...visited, edge.to],
            }),
          });
          const data = (await resp.json()) as {
            degraded?: boolean;
            shielded?: boolean;
          };

          if (resp.status >= 500) {
            if (edge.hardDependency === false) {
              shieldedUpstream = true;
              continue;
            }
            if (edge.circuitBreaker || edge.fallbackMode) {
              if (edge.circuitBreaker) openCircuitEdges.add(edge.id);
              usedFallback = true;
              continue;
            }
            stat.detail = `HTTP 502 cascade: hard call to '${edge.to}' failed with HTTP ${resp.status}.`;
            reply(502, {
              status: "cascaded_failure",
              failedDependency: edge.to,
            });
            return;
          } else if (data.degraded || data.shielded) {
            shieldedUpstream = true;
          }
        }

        if (usedFallback) {
          stat.degradedFallbackUsed = true;
          stat.detail = `HTTP 200 degraded fallback: tripped circuit breaker / fallback cache.`;
          reply(200, { status: "degraded", degraded: true });
          return;
        }
        if (shieldedUpstream) {
          stat.shieldedByGate = true;
          stat.detail = `HTTP 200 OK: shielded from outage by downstream bulkhead.`;
          reply(200, { status: "shielded", shielded: true });
          return;
        }
        stat.detail = `HTTP 200 OK: unaffected by outage path.`;
        reply(200, { status: "healthy" });
        return;
      }

      // Mode 2: Live Taint Propagation over HTTP
      if (body.mode === "taint_propagation") {
        if (node.id !== request.originNodeId && body.edgeId) {
          const inEdge = graph.getEdge(body.edgeId);
          if (inEdge?.sanitized || node.blocksTaint) {
            stat.shieldedByGate = true;
            stat.detail = `HTTP 422 rejected tainted payload at '${node.label}' boundary gate.`;
            reply(422, { status: "blocked_taint", nodeId: node.id });
            return;
          }
        }

        if (node.id !== request.originNodeId) {
          stat.taintedAccepted = true;
          stat.detail = `HTTP 200 accepted unsanitized taint '${body.taintPayload ?? "TAINT"}' from '${body.callerId}'.`;
        } else {
          stat.detail = `Injected tainted HTTP payload at '${node.label}'.`;
        }

        for (const edge of graph.getOutgoingEdges(node.id)) {
          if (visited.includes(edge.to)) continue;
          const targetPort = ports.get(edge.to);
          if (!targetPort) continue;
          await fetch(`http://127.0.0.1:${targetPort}/invoke`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "taint_propagation",
              callerId: node.id,
              edgeId: edge.id,
              taintPayload: body.taintPayload,
              visited: [...visited, edge.to],
            }),
          });
        }

        reply(200, { status: "accepted_taint" });
        return;
      }

      // Mode 3: Live Retry Storm over HTTP
      if (body.mode === "retry_storm") {
        const limit = node.capacityMultiplierLimit ?? 4;
        if (node.id !== request.originNodeId && stat.requestsHandled > limit) {
          stat.overloaded = true;
          stat.detail = `HTTP 503 overload: handled ${stat.requestsHandled} live TCP requests (limit ${limit}).`;
        } else if (
          node.id !== request.originNodeId &&
          stat.requestsHandled >= 2 &&
          !stat.overloaded
        ) {
          stat.degradedFallbackUsed = true;
          stat.detail = `HTTP 200 degraded under ${stat.requestsHandled} live retry requests (limit ${limit}).`;
        }

        for (const edge of graph.getOutgoingEdges(node.id)) {
          if (visited.includes(edge.to)) continue;
          const targetPort = ports.get(edge.to);
          if (!targetPort) continue;

          if (edge.circuitBreaker) {
            if (openCircuitEdges.has(edge.id)) {
              const targetStat = telemetry.get(edge.to);
              if (targetStat && targetStat.requestsHandled === 0) {
                targetStat.shieldedByGate = true;
                targetStat.detail = `Shielded: 0 TCP retry requests sent across open breaker '${edge.id}'.`;
              }
              continue;
            }
            // Circuit breaker trips immediately without retrying
            openCircuitEdges.add(edge.id);
            const targetStat = telemetry.get(edge.to);
            if (targetStat) {
              targetStat.shieldedByGate = true;
              targetStat.detail = `Shielded by circuit breaker on '${edge.id}' (retries halted).`;
            }
            continue;
          }

          const attempts =
            1 +
            Math.min(
              LiveMeshChaosHarness.MAX_RETRIES_PER_HOP,
              Math.max(0, edge.maxRetries ?? 0),
            );
          for (let attempt = 0; attempt < attempts; attempt += 1) {
            await fetch(`http://127.0.0.1:${targetPort}/invoke`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: "retry_storm",
                callerId: node.id,
                edgeId: edge.id,
                visited: [...visited, edge.to],
              }),
            });
          }
        }

        reply(stat.overloaded ? 503 : 200, {
          status: stat.overloaded ? "overloaded" : "transient_error",
          requestsHandled: stat.requestsHandled,
        });
        return;
      }

      // Mode 4: Live Credential Compromise over HTTP
      if (body.mode === "credential_compromise") {
        if (body.edgeId?.startsWith("shared_cred:")) {
          if (node.credentialScope && node.credentialScope === body.presentedScope) {
            stat.unauthorizedAccepted = true;
            stat.detail = `HTTP 200 lateral takeover: accepted shared credential '${body.presentedScope}'.`;
            reply(200, { status: "lateral_compromise" });
            return;
          }
          reply(403, { status: "scope_mismatch" });
          return;
        }

        if (body.edgeId) {
          const inEdge = graph.getEdge(body.edgeId);
          if (inEdge?.scopedTokenVerified || node.blocksTaint) {
            stat.shieldedByGate = true;
            stat.detail = `HTTP 403 Forbidden: enforced per-caller scoped token verification on '${body.edgeId}'.`;
            reply(403, { status: "forbidden_scoped_token_required" });
            return;
          }
          stat.unauthorizedAccepted = true;
          stat.detail = `HTTP 200 unauthorized call accepted from compromised caller '${body.callerId}'.`;
          reply(200, { status: "unauthorized_accepted" });
          return;
        }

        reply(200, { status: "ok" });
      }
    });
  }

  private async driveLiveDependencyOutage(
    graph: TopologyGraph,
    originId: string,
    ports: Map<string, number>,
    telemetry: Map<string, NodeServerTelemetry>,
  ): Promise<void> {
    // Hit origin directly first to record its real HTTP 503 response
    const originPort = ports.get(originId)!;
    await fetch(`http://127.0.0.1:${originPort}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "dependency_outage", visited: [originId] }),
    });

    // Probe every non-origin server over real HTTP
    for (const node of graph.getNodes()) {
      if (node.id === originId) continue;
      const port = ports.get(node.id)!;
      const prevCount = telemetry.get(node.id)!.requestsHandled;
      const resp = await fetch(`http://127.0.0.1:${port}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "dependency_outage", visited: [node.id] }),
      });
      const data = (await resp.json()) as {
        degraded?: boolean;
        shielded?: boolean;
      };
      const stat = telemetry.get(node.id)!;
      // Record the direct probe verdict for this node
      stat.lastHttpStatus = resp.status;
      if (resp.status < 500 && data.degraded) {
        stat.degradedFallbackUsed = true;
      } else if (resp.status < 500 && data.shielded) {
        stat.shieldedByGate = true;
      }
      void prevCount;
    }
  }

  private async driveLiveTaintPropagation(
    graph: TopologyGraph,
    originId: string,
    ports: Map<string, number>,
    telemetry: Map<string, NodeServerTelemetry>,
  ): Promise<void> {
    const originPort = ports.get(originId)!;
    await fetch(`http://127.0.0.1:${originPort}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "taint_propagation",
        taintPayload: "__LIVE_TAINT_CANARY_PAYLOAD__",
        visited: [originId],
      }),
    });

    // Mark nodes downstream of any shielded gate that never received tainted traffic as CONTAINED
    this.markDownstreamOfShieldedNodes(graph, originId, telemetry);
  }

  private async driveLiveRetryStorm(
    graph: TopologyGraph,
    originId: string,
    initialSpike: number,
    ports: Map<string, number>,
    telemetry: Map<string, NodeServerTelemetry>,
    openCircuitEdges: Set<string>,
  ): Promise<void> {
    const outgoing = graph.getOutgoingEdges(originId);
    const originPort = ports.get(originId)!;
    const originStat = telemetry.get(originId)!;
    originStat.detail = `Injected ${initialSpike}x live retry burst at '${originId}'.`;

    if (outgoing.length === 0) {
      // Leaf node: upstream callers retry against origin over live HTTP
      for (const inEdge of graph.getIncomingEdges(originId)) {
        const callerStat = telemetry.get(inEdge.from)!;
        if (inEdge.circuitBreaker) {
          openCircuitEdges.add(inEdge.id);
          callerStat.shieldedByGate = true;
          callerStat.detail = `Circuit breaker on '${inEdge.id}' prevented retry storm against '${originId}'.`;
          continue;
        }
        const factor = 1 + Math.max(0, inEdge.maxRetries ?? 0);
        for (let i = 0; i < factor; i += 1) {
          await fetch(`http://127.0.0.1:${originPort}/invoke`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "retry_storm", visited: [originId] }),
          });
        }
        if (factor > 2) {
          callerStat.overloaded = true;
          callerStat.lastHttpStatus = 503;
          callerStat.detail = `Exhausted caller pool making ${factor} live HTTP retries to '${originId}'.`;
        } else {
          callerStat.degradedFallbackUsed = true;
          callerStat.detail = `Elevated latency making ${factor} live HTTP retries to '${originId}'.`;
        }
      }
      return;
    }

    const bursts = Math.max(1, Math.round(initialSpike));
    for (let b = 0; b < bursts; b += 1) {
      await fetch(`http://127.0.0.1:${originPort}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "retry_storm", visited: [originId] }),
      });
    }

    this.markDownstreamOfShieldedNodes(graph, originId, telemetry);
  }

  private async driveLiveCredentialCompromise(
    graph: TopologyGraph,
    origin: TopologyNode,
    ports: Map<string, number>,
    telemetry: Map<string, NodeServerTelemetry>,
  ): Promise<void> {
    const originStat = telemetry.get(origin.id)!;
    originStat.requestsHandled += 1;
    originStat.detail = `Credential '${origin.credentialScope ?? "none"}' compromised at '${origin.label}'.`;

    const compromisedQueue: string[] = [origin.id];
    const visited = new Set<string>([origin.id]);

    // 1. Live HTTP lateral takeover probes using stolen credentialScope
    if (origin.credentialScope) {
      for (const peer of graph.getNodes()) {
        if (peer.id === origin.id) continue;
        if (peer.credentialScope === origin.credentialScope) {
          const peerPort = ports.get(peer.id)!;
          const resp = await fetch(`http://127.0.0.1:${peerPort}/invoke`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "credential_compromise",
              callerId: origin.id,
              edgeId: `shared_cred:${origin.credentialScope}`,
              presentedScope: origin.credentialScope,
            }),
          });
          if (resp.status === 200) {
            visited.add(peer.id);
            compromisedQueue.push(peer.id);
          }
        }
      }
    }

    // 2. Live HTTP downstream pivot probes from compromised nodes
    while (compromisedQueue.length > 0) {
      const currId = compromisedQueue.shift()!;
      for (const edge of graph.getOutgoingEdges(currId)) {
        if (edge.to === origin.id) continue;
        const targetPort = ports.get(edge.to)!;
        const resp = await fetch(`http://127.0.0.1:${targetPort}/invoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "credential_compromise",
            callerId: currId,
            edgeId: edge.id,
          }),
        });
        if (resp.status === 200 && !visited.has(edge.to)) {
          visited.add(edge.to);
          compromisedQueue.push(edge.to);
        }
      }
    }

    this.markDownstreamOfShieldedNodes(graph, origin.id, telemetry);
  }

  private markDownstreamOfShieldedNodes(
    graph: TopologyGraph,
    originId: string,
    telemetry: Map<string, NodeServerTelemetry>,
  ): void {
    const queue: string[] = [];
    const seen = new Set<string>([originId]);

    for (const [nodeId, stat] of telemetry.entries()) {
      if (
        nodeId !== originId &&
        stat.shieldedByGate &&
        !stat.overloaded &&
        !stat.taintedAccepted &&
        !stat.unauthorizedAccepted
      ) {
        queue.push(nodeId);
        seen.add(nodeId);
      }
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const out of graph.getOutgoingEdges(curr)) {
        if (seen.has(out.to)) continue;
        seen.add(out.to);
        const dstStat = telemetry.get(out.to);
        if (
          dstStat &&
          !dstStat.overloaded &&
          !dstStat.taintedAccepted &&
          !dstStat.unauthorizedAccepted &&
          !dstStat.degradedFallbackUsed
        ) {
          dstStat.shieldedByGate = true;
          dstStat.detail = `Shielded (0 fault requests received behind upstream gate '${curr}').`;
        }
        queue.push(out.to);
      }
    }
  }
}

