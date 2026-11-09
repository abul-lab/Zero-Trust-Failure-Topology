import { describe, expect, it } from "vitest";
import {
  createDefaultEnterpriseTopology,
  detectStructuralRisks,
  TopologyGraph,
} from "../src/index.js";

describe("TopologyGraph & Structural Risk Detector", () => {
  it("rejects duplicate node IDs and edges pointing to unknown nodes", () => {
    expect(
      () =>
        new TopologyGraph({
          topologyId: "dup-test",
          name: "Dup Test",
          version: "1.0",
          nodes: [
            { id: "n1", label: "Node 1", kind: "agent", zone: "dmz" },
            { id: "n1", label: "Duplicate", kind: "api", zone: "restricted" },
          ],
          edges: [],
        }),
    ).toThrow(/Duplicate node id/);

    expect(
      () =>
        new TopologyGraph({
          topologyId: "missing-target",
          name: "Missing Target",
          version: "1.0",
          nodes: [{ id: "n1", label: "Node 1", kind: "agent", zone: "dmz" }],
          edges: [
            {
              id: "e1",
              from: "n1",
              to: "nonexistent",
              relation: "calls",
            },
          ],
        }),
    ).toThrow(/unknown target node/);
  });

  it("detects all 6 structural cascading-failure risk categories on the default unhardened mesh", () => {
    const graph = new TopologyGraph(createDefaultEnterpriseTopology());
    const risks = detectStructuralRisks(graph);
    const codes = new Set(risks.map((r) => r.code));

    expect(codes.has("CYCLIC_AGENT_DELEGATION_LOOP")).toBe(true);
    expect(codes.has("UNBOUNDED_RETRY_AMPLIFICATION")).toBe(true);
    expect(codes.has("UNSANITIZED_TAINT_PATH_TO_SINK")).toBe(true);
    expect(codes.has("SHARED_CREDENTIAL_CROSS_BOUNDARY")).toBe(true);
    expect(codes.has("MISSING_CIRCUIT_BREAKER_CRITICAL_PATH")).toBe(true);
    expect(codes.has("SINGLE_POINT_OF_FAILURE_NODE")).toBe(true);
  });

  it("returns zero structural risks when a topology is properly isolated with gates and breakers", () => {
    const cleanGraph = new TopologyGraph({
      topologyId: "hardened-mesh",
      name: "Hardened Mesh",
      version: "1.0",
      nodes: [
        {
          id: "ingress",
          label: "Ingress API",
          kind: "api",
          zone: "untrusted",
          credentialScope: "scope-ingress",
        },
        {
          id: "gate",
          label: "Validation Gate",
          kind: "gate",
          zone: "dmz",
          blocksTaint: true,
          credentialScope: "scope-gate",
        },
        {
          id: "worker",
          label: "Worker Agent",
          kind: "agent",
          zone: "restricted",
          credentialScope: "scope-worker",
        },
        {
          id: "db",
          label: "State Store",
          kind: "datastore",
          zone: "critical",
          privilegedSink: true,
          credentialScope: "scope-db",
        },
      ],
      edges: [
        {
          id: "e1",
          from: "ingress",
          to: "gate",
          relation: "calls",
          circuitBreaker: true,
          maxRetries: 1,
          sanitized: true,
          scopedTokenVerified: true,
        },
        {
          id: "e2",
          from: "gate",
          to: "worker",
          relation: "delegates_to",
          circuitBreaker: true,
          maxRetries: 1,
          sanitized: true,
          scopedTokenVerified: true,
        },
        {
          id: "e3",
          from: "worker",
          to: "db",
          relation: "writes_state",
          circuitBreaker: true,
          fallbackMode: true,
          maxRetries: 0,
          sanitized: true,
          scopedTokenVerified: true,
        },
      ],
    });

    const findings = detectStructuralRisks(cleanGraph);
    expect(findings).toHaveLength(0);
  });

  it("applies bulkhead patches immutably without mutating the original TopologyGraph", () => {
    const original = new TopologyGraph(createDefaultEnterpriseTopology());
    const patched = original.applyPatches([
      {
        targetType: "edge",
        edgeId: "e-webhook-triage",
        patch: { sanitized: true, circuitBreaker: true },
        summary: "Harden ingress edge",
      },
    ]);

    expect(original.getEdge("e-webhook-triage")?.sanitized).toBe(false);
    expect(patched.getEdge("e-webhook-triage")?.sanitized).toBe(true);
    expect(patched.getEdge("e-webhook-triage")?.circuitBreaker).toBe(true);
  });
});

