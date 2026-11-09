import { describe, expect, it } from "vitest";
import {
  ContainmentPlanner,
  createDefaultEnterpriseTopology,
  LiveMeshChaosHarness,
  TopologyGraph,
} from "../src/index.js";

describe("LiveMeshChaosHarness (Real 9-Server TCP/HTTP Verification)", () => {
  const harness = new LiveMeshChaosHarness();
  const planner = new ContainmentPlanner();

  it("verifies dependency_outage over 9 real HTTP servers before (88%) and after bulkheads (9%)", async () => {
    const baseGraph = new TopologyGraph(createDefaultEnterpriseTopology());

    // 1. Live HTTP chaos test BEFORE bulkheads
    const beforeLive = await harness.runLiveChaosTest(baseGraph, {
      originNodeId: "ledger-db",
      faultMode: "dependency_outage",
    });

    expect(beforeLive.serversSpawned).toBe(9);
    expect(beforeLive.nodeProbes.every((p) => p.port > 0)).toBe(true);
    expect(beforeLive.compromisedCount).toBe(7);
    expect(beforeLive.measuredBlastRadiusScore).toBe(88);
    expect(beforeLive.matchesSimulation).toBe(true);

    // 2. Apply recommended bulkheads & re-run live HTTP chaos test
    const plan = planner.plan(baseGraph, {
      originNodeId: "ledger-db",
      faultMode: "dependency_outage",
    });
    const hardenedGraph = new TopologyGraph(plan.combinedHardenedTopology);

    const afterLive = await harness.runLiveChaosTest(hardenedGraph, {
      originNodeId: "ledger-db",
      faultMode: "dependency_outage",
    });

    expect(afterLive.compromisedCount).toBe(0);
    expect(afterLive.degradedCount).toBe(2);
    expect(afterLive.containedCount).toBe(5);
    expect(afterLive.healthyCount).toBe(1);
    expect(afterLive.measuredBlastRadiusScore).toBe(9);
    expect(afterLive.matchesSimulation).toBe(true);
  });

  it("verifies taint_propagation over real HTTP servers before (75%) and after sanitization gate (0%)", async () => {
    const baseGraph = new TopologyGraph(createDefaultEnterpriseTopology());

    const beforeLive = await harness.runLiveChaosTest(baseGraph, {
      originNodeId: "inbound-webhook",
      faultMode: "taint_propagation",
    });
    expect(beforeLive.compromisedCount).toBe(6);
    expect(beforeLive.measuredBlastRadiusScore).toBe(75);
    expect(beforeLive.criticalSinksReached).toContain("payments-api");
    expect(beforeLive.criticalSinksReached).toContain("ledger-db");
    expect(beforeLive.matchesSimulation).toBe(true);

    const plan = planner.plan(baseGraph, {
      originNodeId: "inbound-webhook",
      faultMode: "taint_propagation",
    });
    const hardenedGraph = new TopologyGraph(plan.combinedHardenedTopology);

    const afterLive = await harness.runLiveChaosTest(hardenedGraph, {
      originNodeId: "inbound-webhook",
      faultMode: "taint_propagation",
    });
    expect(afterLive.compromisedCount).toBe(0);
    expect(afterLive.measuredBlastRadiusScore).toBe(0);
    expect(afterLive.criticalSinksReached).toHaveLength(0);
    expect(afterLive.matchesSimulation).toBe(true);
  });

  it("verifies real TCP request amplification during retry_storm and circuit-breaker shedding", async () => {
    const baseGraph = new TopologyGraph(createDefaultEnterpriseTopology());

    const beforeLive = await harness.runLiveChaosTest(baseGraph, {
      originNodeId: "inbound-webhook",
      faultMode: "retry_storm",
      initialSpikeMultiplier: 2,
    });
    expect(beforeLive.peakMeasuredRequestsPerNode).toBeGreaterThan(10);
    expect(beforeLive.compromisedCount).toBeGreaterThan(0);

    const plan = planner.plan(baseGraph, {
      originNodeId: "inbound-webhook",
      faultMode: "retry_storm",
      initialSpikeMultiplier: 2,
    });
    const hardenedGraph = new TopologyGraph(plan.combinedHardenedTopology);

    const afterLive = await harness.runLiveChaosTest(hardenedGraph, {
      originNodeId: "inbound-webhook",
      faultMode: "retry_storm",
      initialSpikeMultiplier: 2,
    });
    expect(afterLive.compromisedCount).toBe(0);
    expect(afterLive.measuredBlastRadiusScore).toBe(0);
  });

  it("verifies live HTTP 403 rejection of lateral credential_compromise after scope isolation", async () => {
    const baseGraph = new TopologyGraph(createDefaultEnterpriseTopology());

    const beforeLive = await harness.runLiveChaosTest(baseGraph, {
      originNodeId: "triage-agent",
      faultMode: "credential_compromise",
    });
    expect(beforeLive.compromisedCount).toBeGreaterThan(0);
    expect(beforeLive.matchesSimulation).toBe(true);

    const plan = planner.plan(baseGraph, {
      originNodeId: "triage-agent",
      faultMode: "credential_compromise",
    });
    const hardenedGraph = new TopologyGraph(plan.combinedHardenedTopology);

    const afterLive = await harness.runLiveChaosTest(hardenedGraph, {
      originNodeId: "triage-agent",
      faultMode: "credential_compromise",
    });
    expect(afterLive.compromisedCount).toBe(0);
    expect(afterLive.measuredBlastRadiusScore).toBe(0);
    expect(afterLive.matchesSimulation).toBe(true);
  });
});

