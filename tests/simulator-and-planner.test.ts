import { describe, expect, it } from "vitest";
import {
  BlastRadiusSimulator,
  ContainmentPlanner,
  createDefaultEnterpriseTopology,
  TopologyGraph,
} from "../src/index.js";

describe("BlastRadiusSimulator & ContainmentPlanner", () => {
  const simulator = new BlastRadiusSimulator();
  const planner = new ContainmentPlanner(simulator);

  it("simulates upstream cascading dependency_outage from Core Ledger DB and contains it with bulkheads", () => {
    const graph = new TopologyGraph(createDefaultEnterpriseTopology());
    const baseline = simulator.simulate(graph, {
      originNodeId: "ledger-db",
      faultMode: "dependency_outage",
    });

    expect(baseline.compromisedCount).toBeGreaterThanOrEqual(6);
    expect(baseline.blastRadiusScore).toBeGreaterThan(70);

    const plan = planner.plan(graph, {
      originNodeId: "ledger-db",
      faultMode: "dependency_outage",
    });

    expect(plan.recommendations.length).toBeGreaterThan(0);
    expect(plan.combinedHardenedSimulation.compromisedCount).toBe(0);
    expect(plan.combinedHardenedSimulation.blastRadiusScore).toBeLessThan(
      baseline.blastRadiusScore,
    );
  });

  it("simulates untrusted taint_propagation to privileged sinks and blocks it at a sanitized boundary", () => {
    const graph = new TopologyGraph(createDefaultEnterpriseTopology());
    const unguarded = simulator.simulate(graph, {
      originNodeId: "inbound-webhook",
      faultMode: "taint_propagation",
    });

    expect(unguarded.criticalSinksReached).toContain("payments-api");
    expect(unguarded.criticalSinksReached).toContain("ledger-db");

    const plan = planner.plan(graph, {
      originNodeId: "inbound-webhook",
      faultMode: "taint_propagation",
    });

    expect(plan.recommendations[0]?.projectedBlastRadiusScore).toBe(0);
    expect(plan.combinedHardenedSimulation.criticalSinksReached).toHaveLength(0);
  });

  it("simulates compounded retry_storm load amplification and caps load when circuit breakers are enabled", () => {
    const graph = new TopologyGraph(createDefaultEnterpriseTopology());
    const storm = simulator.simulate(graph, {
      originNodeId: "inbound-webhook",
      faultMode: "retry_storm",
      initialSpikeMultiplier: 2,
    });

    expect(storm.maxLoadAmplification).toBeGreaterThan(10);
    expect(storm.compromisedCount).toBeGreaterThan(0);

    const plan = planner.plan(graph, {
      originNodeId: "inbound-webhook",
      faultMode: "retry_storm",
      initialSpikeMultiplier: 2,
    });

    expect(plan.combinedHardenedSimulation.compromisedCount).toBe(0);
    expect(plan.combinedHardenedSimulation.maxLoadAmplification).toBeLessThan(
      storm.maxLoadAmplification,
    );
  });

  it("simulates lateral credential_compromise across shared scopes and isolates it via scoped identities", () => {
    const graph = new TopologyGraph(createDefaultEnterpriseTopology());
    const credSim = simulator.simulate(graph, {
      originNodeId: "triage-agent",
      faultMode: "credential_compromise",
    });

    const plannerOutcome = credSim.nodeOutcomes.find(
      (n) => n.nodeId === "planner-agent",
    );
    expect(plannerOutcome?.state).toBe("COMPROMISED");

    const plan = planner.plan(graph, {
      originNodeId: "triage-agent",
      faultMode: "credential_compromise",
    });

    expect(plan.combinedHardenedSimulation.blastRadiusScore).toBe(0);
  });
});

