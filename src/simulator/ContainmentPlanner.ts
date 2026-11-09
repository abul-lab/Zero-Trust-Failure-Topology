import type { TopologyGraph } from "../graph/TopologyGraph.js";
import type {
  BulkheadPatchAction,
  ContainmentPlanResult,
  ContainmentRecommendation,
  SimulationRequest,
} from "../types/index.js";
import { BlastRadiusSimulator } from "./BlastRadiusSimulator.js";

/**
 * Counterfactual bulkhead and containment planner.
 * Uses iterative greedy cut-set search to identify both single-point bulkheads
 * and multi-path parallel boundary controls (e.g., diamond dependencies or
 * shared credentials paired with unverified delegation edges).
 */
export class ContainmentPlanner {
  private readonly simulator: BlastRadiusSimulator;

  constructor(simulator?: BlastRadiusSimulator) {
    this.simulator = simulator ?? new BlastRadiusSimulator();
  }

  public plan(
    graph: TopologyGraph,
    request: SimulationRequest,
  ): ContainmentPlanResult {
    const baseline = this.simulator.simulate(graph, request);
    const allCandidates = this.generateCandidatePatches(graph, request);

    const remaining = [...allCandidates];
    const recommendations: ContainmentRecommendation[] = [];
    let workingGraph = graph;
    let currentSim = baseline;

    const maxSteps = 6;
    for (let step = 0; step < maxSteps && remaining.length > 0; step += 1) {
      if (
        currentSim.compromisedCount === 0 &&
        currentSim.blastRadiusScore === 0
      ) {
        break;
      }

      let bestIdx = -1;
      let bestSim = currentSim;
      let bestScoreDelta = 0;
      let bestCompDelta = 0;
      let bestAmpDelta = 0;

      for (let i = 0; i < remaining.length; i += 1) {
        const candidate = remaining[i]!;
        const nextGraph = workingGraph.applyPatches([candidate]);
        const sim = this.simulator.simulate(nextGraph, request);

        const scoreDelta = currentSim.blastRadiusScore - sim.blastRadiusScore;
        const compDelta = currentSim.compromisedCount - sim.compromisedCount;
        const ampDelta =
          currentSim.maxLoadAmplification - sim.maxLoadAmplification;

        const isBetter =
          scoreDelta > bestScoreDelta ||
          (scoreDelta === bestScoreDelta && compDelta > bestCompDelta) ||
          (scoreDelta === bestScoreDelta &&
            compDelta === bestCompDelta &&
            ampDelta > bestAmpDelta);

        if (isBetter && (scoreDelta > 0 || compDelta > 0 || ampDelta > 0)) {
          bestIdx = i;
          bestSim = sim;
          bestScoreDelta = scoreDelta;
          bestCompDelta = compDelta;
          bestAmpDelta = ampDelta;
        }
      }

      // Handle parallel cut-sets (e.g., shared credential + unguarded edge to same peer):
      // if no single patch alone lowers blast radius yet, harden a direct boundary of originNodeId
      if (bestIdx === -1 && currentSim.compromisedCount > 0) {
        const directIdx = remaining.findIndex((c) =>
          this.isDirectOriginBoundary(graph, request.originNodeId, c),
        );
        if (directIdx >= 0) {
          const directPatch = remaining[directIdx]!;
          const afterDirectGraph = workingGraph.applyPatches([directPatch]);
          const afterDirectSim = this.simulator.simulate(
            afterDirectGraph,
            request,
          );
          // Only keep this cut-set member if a follow-up candidate unlocks an actual reduction
          const unlocksFollowUp = remaining.some((other, idx) => {
            if (idx === directIdx) return false;
            const twoStepSim = this.simulator.simulate(
              afterDirectGraph.applyPatches([other]),
              request,
            );
            return (
              twoStepSim.compromisedCount < currentSim.compromisedCount ||
              twoStepSim.blastRadiusScore < currentSim.blastRadiusScore
            );
          });

          if (unlocksFollowUp) {
            bestIdx = directIdx;
            bestSim = afterDirectSim;
          }
        }
      }

      if (bestIdx === -1) {
        break;
      }

      const chosen = remaining.splice(bestIdx, 1)[0]!;
      const stepBeforeScore = currentSim.blastRadiusScore;
      const stepBeforeComp = currentSim.compromisedCount;

      workingGraph = workingGraph.applyPatches([chosen]);
      currentSim = bestSim;

      recommendations.push({
        rank: recommendations.length + 1,
        action: chosen,
        baselineBlastRadiusScore: stepBeforeScore,
        projectedBlastRadiusScore: currentSim.blastRadiusScore,
        scoreReduction: Math.max(
          0,
          stepBeforeScore - currentSim.blastRadiusScore,
        ),
        compromisedBefore: stepBeforeComp,
        compromisedAfter: currentSim.compromisedCount,
      });
    }

    return {
      originNodeId: request.originNodeId,
      faultMode: request.faultMode,
      baseline,
      recommendations,
      combinedHardenedTopology: workingGraph.definition,
      combinedHardenedSimulation: currentSim,
    };
  }

  private isDirectOriginBoundary(
    graph: TopologyGraph,
    originNodeId: string,
    action: BulkheadPatchAction,
  ): boolean {
    if (action.targetType === "node") {
      return action.nodeId === originNodeId;
    }
    const edge = graph.getEdge(action.edgeId);
    if (!edge) return false;
    return edge.from === originNodeId || edge.to === originNodeId;
  }

  private generateCandidatePatches(
    graph: TopologyGraph,
    request: SimulationRequest,
  ): BulkheadPatchAction[] {
    const candidates: BulkheadPatchAction[] = [];
    const edges = graph.getEdges();
    const nodes = graph.getNodes();
    const origin = graph.getNode(request.originNodeId);

    switch (request.faultMode) {
      case "dependency_outage": {
        for (const e of edges) {
          if (
            e.hardDependency !== false &&
            (!e.circuitBreaker || !e.fallbackMode)
          ) {
            const fromLabel = graph.getNode(e.from)?.label ?? e.from;
            const toLabel = graph.getNode(e.to)?.label ?? e.to;
            candidates.push({
              targetType: "edge",
              edgeId: e.id,
              patch: { circuitBreaker: true, fallbackMode: true },
              summary: `Enable circuit breaker & graceful fallback on '${fromLabel} → ${toLabel}' (${e.id})`,
            });
          }
        }
        break;
      }

      case "retry_storm": {
        for (const e of edges) {
          if (!e.circuitBreaker || (e.maxRetries ?? 0) > 1) {
            const fromLabel = graph.getNode(e.from)?.label ?? e.from;
            const toLabel = graph.getNode(e.to)?.label ?? e.to;
            candidates.push({
              targetType: "edge",
              edgeId: e.id,
              patch: {
                circuitBreaker: true,
                maxRetries: Math.min(1, e.maxRetries ?? 0),
              },
              summary: `Cap retries to <= 1 and enable circuit breaker on '${fromLabel} → ${toLabel}' (${e.id})`,
            });
          }
        }
        break;
      }

      case "taint_propagation": {
        for (const e of edges) {
          if (!e.sanitized) {
            const fromLabel = graph.getNode(e.from)?.label ?? e.from;
            const toLabel = graph.getNode(e.to)?.label ?? e.to;
            candidates.push({
              targetType: "edge",
              edgeId: e.id,
              patch: { sanitized: true },
              summary: `Enforce deterministic schema & taint sanitization on '${fromLabel} → ${toLabel}' (${e.id})`,
            });
          }
        }
        for (const n of nodes) {
          if (
            n.id !== request.originNodeId &&
            !n.blocksTaint &&
            (n.kind === "gate" || n.kind === "agent")
          ) {
            candidates.push({
              targetType: "node",
              nodeId: n.id,
              patch: { blocksTaint: true },
              summary: `Convert '${n.label}' (${n.id}) into a taint-blocking boundary gate`,
            });
          }
        }
        break;
      }

      case "credential_compromise": {
        if (origin?.credentialScope) {
          const peersSharing = nodes.filter(
            (n) =>
              n.id !== origin.id &&
              n.credentialScope === origin.credentialScope,
          );
          if (peersSharing.length > 0) {
            candidates.push({
              targetType: "node",
              nodeId: origin.id,
              patch: { credentialScope: `${origin.id}-isolated-scope` },
              summary: `Isolate '${origin.label}' identity scope (replace shared '${origin.credentialScope}')`,
            });
          }
        }
        for (const e of edges) {
          if (!e.scopedTokenVerified) {
            const fromLabel = graph.getNode(e.from)?.label ?? e.from;
            const toLabel = graph.getNode(e.to)?.label ?? e.to;
            candidates.push({
              targetType: "edge",
              edgeId: e.id,
              patch: { scopedTokenVerified: true },
              summary: `Enforce per-caller scoped token verification on '${fromLabel} → ${toLabel}' (${e.id})`,
            });
          }
        }
        break;
      }
    }

    return candidates;
  }
}
