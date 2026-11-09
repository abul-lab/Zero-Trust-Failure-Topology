import type {
  StructuralRiskFinding,
  TopologyEdge,
} from "../types/index.js";
import type { TopologyGraph } from "./TopologyGraph.js";

/**
 * Inspects a TopologyGraph for structural cascading-failure risks, lateral movement
 * paths, retry amplification chains, and single points of failure.
 */
export function detectStructuralRisks(
  graph: TopologyGraph,
): StructuralRiskFinding[] {
  const findings: StructuralRiskFinding[] = [];
  const nodes = graph.getNodes();
  const edges = graph.getEdges();

  // 1. Cyclic Agent Delegation Loops
  const cycles = graph.findDirectedCycles();
  for (const cycle of cycles) {
    const uniqueIds = Array.from(new Set(cycle));
    const hasAgent = uniqueIds.some((id) => graph.getNode(id)?.kind === "agent");
    findings.push({
      code: "CYCLIC_AGENT_DELEGATION_LOOP",
      severity: hasAgent ? "critical" : "high",
      title: `Cyclic dependency loop (${cycle.join(" → ")})`,
      description: `Detected a closed feedback cycle across [${cycle.join(" → ")}]. Without hard hop budgets or circuit breakers, a single prompt or retry loop can cycle indefinitely.`,
      affectedNodeIds: uniqueIds,
      affectedEdgeIds: collectCycleEdgeIds(graph, cycle),
      remediation:
        "Break the delegation cycle with a one-way queue/event boundary or enforce a strict maximum delegation depth with a circuit breaker.",
    });
  }

  // 2. Compounded Retry Amplification Chains
  for (const target of nodes) {
    const limit = target.capacityMultiplierLimit ?? 4;
    const worstChain = findWorstRetryAmplificationToNode(graph, target.id);
    if (worstChain.multiplier > limit) {
      findings.push({
        code: "UNBOUNDED_RETRY_AMPLIFICATION",
        severity: worstChain.multiplier >= limit * 2 ? "critical" : "high",
        title: `${worstChain.multiplier}x retry amplification into '${target.label}'`,
        description: `Nested retries along [${worstChain.nodePath.join(" → ")}] multiply downstream load up to ${worstChain.multiplier}x, exceeding '${target.label}' capacity limit (${limit}x).`,
        affectedNodeIds: worstChain.nodePath,
        affectedEdgeIds: worstChain.edgeIds,
        remediation:
          "Cap retries at the outermost caller (maxRetries <= 1 on inner hops) and enable circuitBreaker=true before downstream services.",
      });
    }
  }

  // 3. Unsanitized Taint Path from Untrusted Zone to Privileged/Critical Sink
  const untrustedSources = nodes.filter((n) => n.zone === "untrusted");
  for (const src of untrustedSources) {
    const taintPaths = findUnsanitizedPathsToSinks(graph, src.id);
    for (const tp of taintPaths) {
      const sinkNode = graph.getNode(tp.sinkId);
      findings.push({
        code: "UNSANITIZED_TAINT_PATH_TO_SINK",
        severity: "critical",
        title: `Unsanitized path from '${src.label}' to '${sinkNode?.label ?? tp.sinkId}'`,
        description: `Untrusted input from '${src.label}' reaches privileged sink '${sinkNode?.label ?? tp.sinkId}' via [${tp.nodePath.join(" → ")}] with no sanitization gate on any hop.`,
        affectedNodeIds: tp.nodePath,
        affectedEdgeIds: tp.edgeIds,
        remediation:
          "Insert a deterministic validation gate (blocksTaint=true or sanitized=true on the boundary edge) before untrusted context reaches tools or datastores.",
      });
    }
  }

  // 4. Shared Credentials Across Different Trust Zones
  const byCred = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.credentialScope) continue;
    const list = byCred.get(n.credentialScope) ?? [];
    list.push(n.id);
    byCred.set(n.credentialScope, list);
  }
  for (const [scope, holderIds] of byCred.entries()) {
    if (holderIds.length < 2) continue;
    const zones = new Set(holderIds.map((id) => graph.getNode(id)?.zone));
    if (zones.size > 1) {
      findings.push({
        code: "SHARED_CREDENTIAL_CROSS_BOUNDARY",
        severity: zones.has("untrusted") || zones.has("critical") ? "critical" : "high",
        title: `Shared credential '${scope}' spans multiple trust zones`,
        description: `Nodes [${holderIds.join(", ")}] across zones [${Array.from(zones).join(", ")}] share credential scope '${scope}', allowing lateral compromise across trust boundaries.`,
        affectedNodeIds: holderIds,
        affectedEdgeIds: [],
        remediation:
          "Assign distinct, least-privilege credential scopes per service/agent and verify scoped tokens on every cross-zone call.",
      });
    }
  }

  // 5. Missing Circuit Breaker on Critical Stateful Dependency Edges
  for (const edge of edges) {
    const target = graph.getNode(edge.to);
    const source = graph.getNode(edge.from);
    if (!target || !source) continue;
    const isCriticalStateful =
      target.zone === "critical" ||
      target.kind === "datastore" ||
      (target.kind === "api" && (edge.maxRetries ?? 0) >= 2);
    if (
      isCriticalStateful &&
      edge.hardDependency !== false &&
      !edge.circuitBreaker &&
      !edge.fallbackMode
    ) {
      findings.push({
        code: "MISSING_CIRCUIT_BREAKER_CRITICAL_PATH",
        severity: "medium",
        title: `Unprotected hard call '${source.label} → ${target.label}'`,
        description: `Edge '${edge.id}' (${source.id} → ${target.id}) is a hard dependency with neither a circuit breaker nor fallback degradation.`,
        affectedNodeIds: [source.id, target.id],
        affectedEdgeIds: [edge.id],
        remediation:
          "Enable circuitBreaker=true or fallbackMode=true on this edge to prevent downstream stalls from locking upstream callers.",
      });
    }
  }

  // 6. Single Point of Failure (SPOF) Nodes
  if (nodes.length >= 3) {
    const threshold = Math.ceil((nodes.length - 1) * 0.5);
    for (const n of nodes) {
      const impactedUpstream = graph.findUnprotectedUpstreamCallers(n.id);
      if (impactedUpstream.size >= threshold) {
        findings.push({
          code: "SINGLE_POINT_OF_FAILURE_NODE",
          severity: "high",
          title: `Single point of failure: '${n.label}' cascades to ${impactedUpstream.size} upstream nodes`,
          description: `An outage at '${n.label}' propagates uncontained to ${impactedUpstream.size} of ${nodes.length - 1} other nodes ([${Array.from(impactedUpstream).join(", ")}]).`,
          affectedNodeIds: [n.id, ...Array.from(impactedUpstream)],
          affectedEdgeIds: [],
          remediation:
            "Add circuit breakers or graceful fallback caches on callers depending on this node.",
        });
      }
    }
  }

  return diversifyFindingsOrder(findings);
}

function diversifyFindingsOrder(
  findings: StructuralRiskFinding[],
): StructuralRiskFinding[] {
  const sevWeight: Record<StructuralRiskFinding["severity"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  const sorted = [...findings].sort(
    (a, b) => sevWeight[b.severity] - sevWeight[a.severity],
  );

  // Surface one representative per distinct code first (preserving severity order), then remaining
  const seenCodes = new Set<string>();
  const primary: StructuralRiskFinding[] = [];
  const secondary: StructuralRiskFinding[] = [];

  for (const item of sorted) {
    if (!seenCodes.has(item.code)) {
      seenCodes.add(item.code);
      primary.push(item);
    } else {
      secondary.push(item);
    }
  }

  return [...primary, ...secondary];
}

function collectCycleEdgeIds(graph: TopologyGraph, cycle: string[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < cycle.length - 1; i += 1) {
    const from = cycle[i]!;
    const to = cycle[i + 1]!;
    const match = graph.getOutgoingEdges(from).find((e) => e.to === to);
    if (match) ids.push(match.id);
  }
  return ids;
}

function findWorstRetryAmplificationToNode(
  graph: TopologyGraph,
  targetId: string,
): { multiplier: number; nodePath: string[]; edgeIds: string[] } {
  let best = { multiplier: 1, nodePath: [targetId], edgeIds: [] as string[] };

  // Walk backwards from targetId along incoming edges that lack circuitBreaker
  const walkBack = (
    curr: string,
    accMultiplier: number,
    visited: Set<string>,
    nodePath: string[],
    edgeIds: string[],
  ): void => {
    if (accMultiplier > best.multiplier) {
      best = { multiplier: accMultiplier, nodePath: [...nodePath], edgeIds: [...edgeIds] };
    }
    for (const edge of graph.getIncomingEdges(curr)) {
      if (edge.circuitBreaker) continue;
      if (visited.has(edge.from)) continue;
      const factor = 1 + Math.max(0, edge.maxRetries ?? 0);
      visited.add(edge.from);
      walkBack(
        edge.from,
        accMultiplier * factor,
        visited,
        [edge.from, ...nodePath],
        [edge.id, ...edgeIds],
      );
      visited.delete(edge.from);
    }
  };

  walkBack(targetId, 1, new Set([targetId]), [targetId], []);
  return best;
}

function findUnsanitizedPathsToSinks(
  graph: TopologyGraph,
  sourceId: string,
): Array<{ sinkId: string; nodePath: string[]; edgeIds: string[] }> {
  const results: Array<{ sinkId: string; nodePath: string[]; edgeIds: string[] }> = [];
  const seenSinks = new Set<string>();

  const queue: Array<{
    curr: string;
    nodePath: string[];
    edgeIds: string[];
  }> = [{ curr: sourceId, nodePath: [sourceId], edgeIds: [] }];

  const visited = new Set<string>([sourceId]);

  while (queue.length > 0) {
    const item = queue.shift()!;
    const currNode = graph.getNode(item.curr);
    if (!currNode) continue;

    if (item.curr !== sourceId && currNode.blocksTaint) {
      continue;
    }

    const isSink =
      item.curr !== sourceId &&
      (currNode.privilegedSink ||
        currNode.kind === "datastore" ||
        currNode.zone === "critical");

    if (isSink && !seenSinks.has(item.curr)) {
      seenSinks.add(item.curr);
      results.push({
        sinkId: item.curr,
        nodePath: item.nodePath,
        edgeIds: item.edgeIds,
      });
    }

    for (const edge of graph.getOutgoingEdges(item.curr) as TopologyEdge[]) {
      if (edge.sanitized) continue;
      const nextNode = graph.getNode(edge.to);
      if (nextNode?.blocksTaint) continue;
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push({
          curr: edge.to,
          nodePath: [...item.nodePath, edge.to],
          edgeIds: [...item.edgeIds, edge.id],
        });
      }
    }
  }

  return results;
}
