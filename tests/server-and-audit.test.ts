import { afterEach, describe, expect, it } from "vitest";
import {
  FailureTopologyEngine,
  RunningTopologyServer,
  startTopologyServer,
  TopologyAuditLedger,
} from "../src/index.js";

describe("Audit Ledger, Incident Correlator & HTTP Server", () => {
  let running: RunningTopologyServer | null = null;

  afterEach(async () => {
    if (running) {
      await running.close();
      running = null;
    }
  });

  it("maintains a verifiable SHA-256 hash chain, masks secrets, and detects payload tampering", () => {
    const observed: string[] = [];
    const ledger = new TopologyAuditLedger({
      onEntry: (entry) => {
        observed.push(entry.entryId);
      },
    });

    ledger.record({
      eventType: "SIMULATION",
      topologyId: "mesh-01",
      summary: "Simulated outage with Authorization Bearer tok_example_secret_123456",
      blastRadiusScore: 65,
    });
    ledger.record({
      eventType: "CONTAINMENT_APPLIED",
      topologyId: "mesh-01",
      summary: "Applied circuit breaker on e-orders-ledger",
      blastRadiusScore: 0,
    });

    expect(observed).toHaveLength(2);
    const entries = ledger.getEntries();
    expect(entries[0]?.summary).toContain("[REDACTED]");
    expect(entries[0]?.summary).not.toContain("tok_example_secret_123456");

    const validReport = ledger.verifyChain();
    expect(validReport.valid).toBe(true);
    expect(validReport.checked).toBe(2);

    const jsonl = ledger.exportJsonl();
    expect(TopologyAuditLedger.verifyJsonl(jsonl).valid).toBe(true);

    // Tamper with historical blastRadiusScore
    const forged = entries.map((e) => ({ ...e }));
    forged[0] = { ...forged[0]!, blastRadiusScore: 0 };
    const brokenReport = ledger.verifyChain(forged);
    expect(brokenReport.valid).toBe(false);
    expect(brokenReport.brokenAtIndex).toBe(0);
  });

  it("trips automatic node quarantine after consecutive runtime incidents and records an audit entry", () => {
    const engine = new FailureTopologyEngine({ quarantineThreshold: 3 });

    const r1 = engine.recordIncident({
      nodeId: "triage-agent",
      sourceGate: "agent-firewall",
      signalCode: "API_SSRF_LOOPBACK_OR_METADATA",
      severity: "medium",
    });
    expect(r1.newlyQuarantined).toBe(false);

    engine.recordIncident({
      nodeId: "triage-agent",
      sourceGate: "agent-firewall",
      signalCode: "API_SSRF_LOOPBACK_OR_METADATA",
      severity: "medium",
    });

    const r3 = engine.recordIncident({
      nodeId: "triage-agent",
      sourceGate: "agent-firewall",
      signalCode: "API_SSRF_LOOPBACK_OR_METADATA",
      severity: "high",
    });
    expect(r3.newlyQuarantined).toBe(true);
    expect(engine.getQuarantinedNodeIds()).toContain("triage-agent");

    engine.clearQuarantine("triage-agent");
    expect(engine.getQuarantinedNodeIds()).not.toContain("triage-agent");
  });

  it("serves the Web Console, enforces constant-time X-API-Key auth, and executes simulation + containment APIs", async () => {
    running = await startTopologyServer({
      port: 0,
      host: "127.0.0.1",
      apiKey: "synthetic-test-key-99",
    });
    const base = `http://127.0.0.1:${running.port}`;

    // Public console & healthz
    const uiRes = await fetch(`${base}/`);
    expect(uiRes.status).toBe(200);
    const html = await uiRes.text();
    expect(html).toContain("Zero-Trust Failure Topology");

    const healthRes = await fetch(`${base}/healthz`);
    expect(healthRes.status).toBe(200);

    // Unauthorized without X-API-Key
    const unauthRes = await fetch(`${base}/v1/stats`);
    expect(unauthRes.status).toBe(401);

    const headers = {
      "Content-Type": "application/json",
      "X-API-Key": "synthetic-test-key-99",
    };

    // Valid simulation
    const simRes = await fetch(`${base}/v1/simulate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        originNodeId: "ledger-db",
        faultMode: "dependency_outage",
      }),
    });
    expect(simRes.status).toBe(200);
    const simData = (await simRes.json()) as { blastRadiusScore: number };
    expect(simData.blastRadiusScore).toBeGreaterThan(50);

    // Containment plan & apply
    const planRes = await fetch(`${base}/v1/containment/plan`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        originNodeId: "ledger-db",
        faultMode: "dependency_outage",
      }),
    });
    expect(planRes.status).toBe(200);
    const planData = (await planRes.json()) as {
      recommendations: Array<{ action: unknown }>;
    };
    expect(planData.recommendations.length).toBeGreaterThan(0);

    const applyRes = await fetch(`${base}/v1/containment/apply`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        patches: planData.recommendations.map((r) => r.action),
      }),
    });
    expect(applyRes.status).toBe(200);

    // Non-destructive tamper test endpoint
    const tamperRes = await fetch(`${base}/v1/audit/tamper-test`, {
      method: "POST",
      headers,
    });
    expect(tamperRes.status).toBe(200);
    const tamperData = (await tamperRes.json()) as {
      simulated: boolean;
      valid: boolean;
    };
    expect(tamperData.simulated).toBe(true);
    expect(tamperData.valid).toBe(false);

    // Live ledger remains intact
    const verifyRes = await fetch(`${base}/v1/audit/verify`, { headers });
    const verifyData = (await verifyRes.json()) as { valid: boolean };
    expect(verifyData.valid).toBe(true);
  });

  it("enforces payload limits (413), schema validation (422), and unknown-node errors (404)", async () => {
    running = await startTopologyServer({
      port: 0,
      host: "127.0.0.1",
      maxBodyBytes: 256,
      seedDemoOnStart: false,
    });
    const base = `http://127.0.0.1:${running.port}`;
    const headers = { "Content-Type": "application/json" };

    // 422 invalid faultMode
    const invalidRes = await fetch(`${base}/v1/simulate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        originNodeId: "ledger-db",
        faultMode: "invalid_mode",
      }),
    });
    expect(invalidRes.status).toBe(422);

    // 404 unknown origin node
    const notFoundRes = await fetch(`${base}/v1/simulate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        originNodeId: "ghost-node-999",
        faultMode: "dependency_outage",
      }),
    });
    expect(notFoundRes.status).toBe(404);

    // 413 oversized payload
    const hugeRes = await fetch(`${base}/v1/simulate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        originNodeId: "a".repeat(600),
        faultMode: "dependency_outage",
      }),
    });
    expect(hugeRes.status).toBe(413);
  });
});
