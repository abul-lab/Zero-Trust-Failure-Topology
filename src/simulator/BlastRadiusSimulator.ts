import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import type { TopologyGraph } from "../graph/TopologyGraph.js";
import type {
  NodeImpactState,
  NodeSimulationOutcome,
  PropagationHop,
  SimulationRequest,
  SimulationResult,
} from "../types/index.js";

/**
 * Deterministic blast-radius and cascading-failure propagation engine.
 * Evaluates how outages, retry storms, untrusted taint, and credential leaks
 * propagate across multi-agent and service boundaries in sub-millisecond memory.
 */
export class BlastRadiusSimulator {
  private readonly defaultOverloadMultiplier: number;

  constructor(options: { defaultOverloadMultiplier?: number } = {}) {
    this.defaultOverloadMultiplier = options.defaultOverloadMultiplier ?? 4;
  }

  public simulate(
    graph: TopologyGraph,
    request: SimulationRequest,
  ): SimulationResult {
    const startPerf = performance.now();
    const origin = graph.getNode(request.originNodeId);
    if (!origin) {
      throw new Error(
        `Origin node '${request.originNodeId}' does not exist in topology '${graph.definition.topologyId}'.`,
      );
    }

    const states = new Map<string, NodeImpactState>();
    const reasons = new Map<string, string>();
    const loadMap = new Map<string, number>();
    const trace: PropagationHop[] = [];

    for (const n of graph.getNodes()) {
      states.set(n.id, "HEALTHY");
      reasons.set(n.id, "Unaffected by fault path.");
      loadMap.set(n.id, 1);
    }

    states.set(origin.id, "ORIGIN");
    reasons.set(
      origin.id,
      `Fault injected at '${origin.label}' (${request.faultMode}).`,
    );

    switch (request.faultMode) {
      case "dependency_outage":
        this.simulateDependencyOutage(graph, origin.id, states, reasons, trace);
        break;
      case "retry_storm":
        this.simulateRetryStorm(
          graph,
          origin.id,
          request.initialSpikeMultiplier ?? 2,
          states,
          reasons,
          loadMap,
          trace,
        );
        break;
      case "taint_propagation":
        this.simulateTaintPropagation(graph, origin.id, states, reasons, trace);
        break;
      case "credential_compromise":
        this.simulateCredentialCompromise(
          graph,
          origin.id,
          states,
          reasons,
          trace,
        );
        break;
    }

    let compromisedCount = 0;
    let degradedCount = 0;
    let containedCount = 0;
    let healthyCount = 0;
    let maxLoadAmplification = 1;
    const criticalSinksReached: string[] = [];
    const nodeOutcomes: NodeSimulationOutcome[] = [];

    for (const n of graph.getNodes()) {
      const st = states.get(n.id) ?? "HEALTHY";
      const load = Number((loadMap.get(n.id) ?? 1).toFixed(2));
      if (load > maxLoadAmplification) {
        maxLoadAmplification = load;
      }

      if (n.id !== origin.id) {
        if (st === "COMPROMISED") {
          compromisedCount += 1;
          if (n.privilegedSink || n.kind === "datastore" || n.zone === "critical") {
            criticalSinksReached.push(n.id);
          }
        } else if (st === "DEGRADED") {
          degradedCount += 1;
        } else if (st === "CONTAINED") {
          containedCount += 1;
        } else {
          healthyCount += 1;
        }
      }

      nodeOutcomes.push({
        nodeId: n.id,
        label: n.label,
        kind: n.kind,
        zone: n.zone,
        state: st,
        loadMultiplier: load,
        reason: reasons.get(n.id) ?? "",
      });
    }

    const nonOriginTotal = Math.max(1, graph.getNodes().length - 1);
    const weightedImpact = compromisedCount + degradedCount * 0.35;
    const blastRadiusScore = Math.min(
      100,
      Math.max(0, Math.round((weightedImpact / nonOriginTotal) * 100)),
    );

    const evaluatedInMs = Number((performance.now() - startPerf).toFixed(3));

    return {
      simulationId: `sim_${crypto.randomBytes(6).toString("hex")}`,
      topologyId: graph.definition.topologyId,
      originNodeId: origin.id,
      faultMode: request.faultMode,
      totalNodes: graph.getNodes().length,
      compromisedCount,
      degradedCount,
      containedCount,
      healthyCount,
      blastRadiusScore,
      maxLoadAmplification,
      criticalSinksReached,
      nodeOutcomes,
      propagationTrace: trace,
      evaluatedInMs,
      timestamp: new Date().toISOString(),
    };
  }

  private simulateDependencyOutage(
    graph: TopologyGraph,
    originId: string,
    states: Map<string, NodeImpactState>,
    reasons: Map<string, string>,
    trace: PropagationHop[],
  ): void {
    const queue: string[] = [originId];
    const visited = new Set<string>([originId]);

    while (queue.length > 0) {
      const failedId = queue.shift()!;
      for (const edge of graph.getIncomingEdges(failedId)) {
        const callerId = edge.from;
        if (callerId === originId) continue;

        if (edge.hardDependency === false) {
          if (states.get(callerId) === "HEALTHY") {
            states.set(callerId, "CONTAINED");
            reasons.set(
              callerId,
              `Isolated from '${failedId}' via optional soft dependency (${edge.id}).`,
            );
          }
          trace.push({
            step: trace.length + 1,
            fromNodeId: failedId,
            toNodeId: callerId,
            edgeId: edge.id,
            outcome: "BLOCKED_BY_CONTROL",
            controlTriggered: "soft_dependency",
            reason: `Soft dependency on '${edge.id}' prevented upstream outage cascade.`,
          });
          continue;
        }

        if (edge.circuitBreaker || edge.fallbackMode) {
          const control = edge.circuitBreaker ? "circuit_breaker" : "fallback_mode";
          if (states.get(callerId) !== "COMPROMISED") {
            states.set(callerId, "DEGRADED");
            reasons.set(
              callerId,
              `Gracefully degraded via ${control} when '${failedId}' failed — upstream cascade halted.`,
            );
          }
          trace.push({
            step: trace.length + 1,
            fromNodeId: failedId,
            toNodeId: callerId,
            edgeId: edge.id,
            outcome: "DEGRADED",
            controlTriggered: control,
            reason: `'${callerId}' tripped ${control} on '${edge.id}', stopping further cascade.`,
          });
          // Mark upstream callers of this protected caller as CONTAINED if still healthy
          this.markProtectedUpstreamContained(graph, callerId, originId, states, reasons);
          continue;
        }

        if (!visited.has(callerId)) {
          visited.add(callerId);
          states.set(callerId, "COMPROMISED");
          reasons.set(
            callerId,
            `Cascaded outage: hard dependency on '${failedId}' via '${edge.id}' with no circuit breaker or fallback.`,
          );
          trace.push({
            step: trace.length + 1,
            fromNodeId: failedId,
            toNodeId: callerId,
            edgeId: edge.id,
            outcome: "PROPAGATED",
            reason: `Outage cascaded upstream from '${failedId}' to '${callerId}'.`,
          });
          queue.push(callerId);
        }
      }
    }
  }

  private markProtectedUpstreamContained(
    graph: TopologyGraph,
    shieldedNodeId: string,
    originId: string,
    states: Map<string, NodeImpactState>,
    reasons: Map<string, string>,
  ): void {
    const q = [shieldedNodeId];
    const seen = new Set<string>([shieldedNodeId, originId]);
    while (q.length > 0) {
      const curr = q.shift()!;
      for (const incoming of graph.getIncomingEdges(curr)) {
        if (!seen.has(incoming.from)) {
          seen.add(incoming.from);
          if (states.get(incoming.from) === "HEALTHY") {
            states.set(incoming.from, "CONTAINED");
            reasons.set(
              incoming.from,
              `Protected by downstream bulkhead/breaker at '${shieldedNodeId}'.`,
            );
          }
          q.push(incoming.from);
        }
      }
    }
  }

  private simulateRetryStorm(
    graph: TopologyGraph,
    originId: string,
    initialSpike: number,
    states: Map<string, NodeImpactState>,
    reasons: Map<string, string>,
    loadMap: Map<string, number>,
    trace: PropagationHop[],
  ): void {
    const baseSpike = Math.max(1, initialSpike);
    loadMap.set(originId, baseSpike);

    const outgoing = graph.getOutgoingEdges(originId);
    // If origin is a leaf/downstream service with no outgoing calls, simulate upstream callers retrying against it
    if (outgoing.length === 0) {
      let cumulativeIncoming = baseSpike;
      for (const inEdge of graph.getIncomingEdges(originId)) {
        if (inEdge.circuitBreaker) {
          if (states.get(inEdge.from) === "HEALTHY") {
            states.set(inEdge.from, "CONTAINED");
            reasons.set(
              inEdge.from,
              `Circuit breaker on '${inEdge.id}' prevented retry storm against '${originId}'.`,
            );
          }
          trace.push({
            step: trace.length + 1,
            fromNodeId: inEdge.from,
            toNodeId: originId,
            edgeId: inEdge.id,
            outcome: "BLOCKED_BY_CONTROL",
            controlTriggered: "circuit_breaker",
            amplificationFactor: 1,
            reason: `Circuit breaker opened on '${inEdge.id}', shedding retry load.`,
          });
        } else {
          const factor = 1 + Math.max(0, inEdge.maxRetries ?? 0);
          cumulativeIncoming *= factor;
          states.set(inEdge.from, factor > 2 ? "COMPROMISED" : "DEGRADED");
          loadMap.set(inEdge.from, factor);
          reasons.set(
            inEdge.from,
            `Exhausted worker pool retrying '${originId}' (${factor}x amplification).`,
          );
          trace.push({
            step: trace.length + 1,
            fromNodeId: inEdge.from,
            toNodeId: originId,
            edgeId: inEdge.id,
            outcome: "PROPAGATED",
            amplificationFactor: cumulativeIncoming,
            reason: `Unbounded retries (${inEdge.maxRetries ?? 0}) amplified load to ${cumulativeIncoming}x.`,
          });
        }
      }
      loadMap.set(originId, cumulativeIncoming);
      return;
    }

    // Forward retry amplification along outgoing call chains
    const queue: Array<{ nodeId: string; currentLoad: number; path: Set<string> }> = [
      { nodeId: originId, currentLoad: baseSpike, path: new Set([originId]) },
    ];

    while (queue.length > 0) {
      const item = queue.shift()!;
      for (const edge of graph.getOutgoingEdges(item.nodeId)) {
        const target = graph.getNode(edge.to);
        if (!target || item.path.has(target.id)) continue;

        if (edge.circuitBreaker) {
          if (states.get(target.id) === "HEALTHY") {
            states.set(target.id, "CONTAINED");
            reasons.set(
              target.id,
              `Shielded from retry surge by circuit breaker on '${edge.id}'.`,
            );
          }
          trace.push({
            step: trace.length + 1,
            fromNodeId: item.nodeId,
            toNodeId: target.id,
            edgeId: edge.id,
            outcome: "BLOCKED_BY_CONTROL",
            controlTriggered: "circuit_breaker",
            amplificationFactor: 1,
            reason: `Circuit breaker on '${edge.id}' capped retry amplification before '${target.label}'.`,
          });
          this.markDownstreamContained(graph, target.id, originId, states, reasons);
          continue;
        }

        const hopFactor = 1 + Math.max(0, edge.maxRetries ?? 0);
        const nextLoad = item.currentLoad * hopFactor;
        const prevRecorded = loadMap.get(target.id) ?? 1;
        if (nextLoad > prevRecorded) {
          loadMap.set(target.id, nextLoad);
        }

        const limit =
          target.capacityMultiplierLimit ?? this.defaultOverloadMultiplier;

        if (nextLoad > limit) {
          states.set(target.id, "COMPROMISED");
          reasons.set(
            target.id,
            `Overload collapse: incoming retry amplification (${nextLoad.toFixed(1)}x) exceeded capacity limit (${limit}x).`,
          );
          trace.push({
            step: trace.length + 1,
            fromNodeId: item.nodeId,
            toNodeId: target.id,
            edgeId: edge.id,
            outcome: "PROPAGATED",
            amplificationFactor: nextLoad,
            reason: `'${edge.id}' (retries=${edge.maxRetries ?? 0}) amplified load to ${nextLoad.toFixed(1)}x > ${limit}x limit.`,
          });
        } else if (nextLoad > 1.5 && states.get(target.id) !== "COMPROMISED") {
          states.set(target.id, "DEGRADED");
          reasons.set(
            target.id,
            `Elevated latency under ${nextLoad.toFixed(1)}x retry load (within ${limit}x capacity limit).`,
          );
          trace.push({
            step: trace.length + 1,
            fromNodeId: item.nodeId,
            toNodeId: target.id,
            edgeId: edge.id,
            outcome: "DEGRADED",
            amplificationFactor: nextLoad,
            reason: `'${target.label}' absorbed ${nextLoad.toFixed(1)}x load in degraded state.`,
          });
        }

        const nextPath = new Set(item.path);
        nextPath.add(target.id);
        queue.push({ nodeId: target.id, currentLoad: nextLoad, path: nextPath });
      }
    }
  }

  private simulateTaintPropagation(
    graph: TopologyGraph,
    originId: string,
    states: Map<string, NodeImpactState>,
    reasons: Map<string, string>,
    trace: PropagationHop[],
  ): void {
    const queue: string[] = [originId];
    const visited = new Set<string>([originId]);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      for (const edge of graph.getOutgoingEdges(currId)) {
        const target = graph.getNode(edge.to);
        if (!target || target.id === originId) continue;

        if (edge.sanitized || target.blocksTaint) {
          const control = target.blocksTaint
            ? "sanitization_gate_node"
            : "sanitized_edge_contract";
          if (states.get(target.id) === "HEALTHY") {
            states.set(target.id, "CONTAINED");
            reasons.set(
              target.id,
              `Untrusted taint stripped/blocked by ${control} on '${edge.id}'.`,
            );
          }
          trace.push({
            step: trace.length + 1,
            fromNodeId: currId,
            toNodeId: target.id,
            edgeId: edge.id,
            outcome: "BLOCKED_BY_CONTROL",
            controlTriggered: control,
            reason: `Tainted payload halted at '${target.label}' (${control}).`,
          });
          this.markDownstreamContained(graph, target.id, originId, states, reasons);
          continue;
        }

        if (!visited.has(target.id)) {
          visited.add(target.id);
          states.set(target.id, "COMPROMISED");
          reasons.set(
            target.id,
            `Reached by unsanitized taint from '${currId}' via '${edge.id}'.`,
          );
          trace.push({
            step: trace.length + 1,
            fromNodeId: currId,
            toNodeId: target.id,
            edgeId: edge.id,
            outcome: "PROPAGATED",
            reason: `Untrusted payload flowed across unguarded edge '${edge.id}' into '${target.label}'.`,
          });
          queue.push(target.id);
        }
      }
    }
  }

  private simulateCredentialCompromise(
    graph: TopologyGraph,
    originId: string,
    states: Map<string, NodeImpactState>,
    reasons: Map<string, string>,
    trace: PropagationHop[],
  ): void {
    const originNode = graph.getNode(originId)!;
    const queue: string[] = [originId];
    const visited = new Set<string>([originId]);

    // 1. Lateral blast across shared credentialScope
    if (originNode.credentialScope) {
      for (const peer of graph.getNodes()) {
        if (
          peer.id !== originId &&
          peer.credentialScope === originNode.credentialScope
        ) {
          visited.add(peer.id);
          states.set(peer.id, "COMPROMISED");
          reasons.set(
            peer.id,
            `Lateral compromise: shares credential scope '${originNode.credentialScope}' with '${originNode.label}'.`,
          );
          trace.push({
            step: trace.length + 1,
            fromNodeId: originId,
            toNodeId: peer.id,
            edgeId: `shared_cred:${originNode.credentialScope}`,
            outcome: "PROPAGATED",
            reason: `Shared credential '${originNode.credentialScope}' allowed direct lateral takeover of '${peer.label}'.`,
          });
          queue.push(peer.id);
        }
      }
    }

    // 2. Downstream access from compromised nodes along edges lacking per-caller scoped token verification
    while (queue.length > 0) {
      const currId = queue.shift()!;
      for (const edge of graph.getOutgoingEdges(currId)) {
        const target = graph.getNode(edge.to);
        if (!target || target.id === originId) continue;

        if (edge.scopedTokenVerified || target.blocksTaint) {
          const control = edge.scopedTokenVerified
            ? "scoped_token_verification"
            : "execution_firewall_gate";
          if (states.get(target.id) === "HEALTHY") {
            states.set(target.id, "CONTAINED");
            reasons.set(
              target.id,
              `Lateral call rejected by ${control} on '${edge.id}'.`,
            );
          }
          trace.push({
            step: trace.length + 1,
            fromNodeId: currId,
            toNodeId: target.id,
            edgeId: edge.id,
            outcome: "BLOCKED_BY_CONTROL",
            controlTriggered: control,
            reason: `Target '${target.label}' enforced ${control}, blocking lateral access.`,
          });
          this.markDownstreamContained(graph, target.id, originId, states, reasons);
          continue;
        }

        if (!visited.has(target.id)) {
          visited.add(target.id);
          states.set(target.id, "COMPROMISED");
          reasons.set(
            target.id,
            `Unauthorized access from compromised caller '${currId}' via '${edge.id}' (scopedTokenVerified=false).`,
          );
          trace.push({
            step: trace.length + 1,
            fromNodeId: currId,
            toNodeId: target.id,
            edgeId: edge.id,
            outcome: "PROPAGATED",
            reason: `Compromised node '${currId}' invoked '${target.label}' without scoped token isolation.`,
          });
          queue.push(target.id);
        }
      }
    }
  }

  private markDownstreamContained(
    graph: TopologyGraph,
    gateNodeId: string,
    originId: string,
    states: Map<string, NodeImpactState>,
    reasons: Map<string, string>,
  ): void {
    const q = [gateNodeId];
    const seen = new Set<string>([gateNodeId, originId]);
    while (q.length > 0) {
      const curr = q.shift()!;
      for (const out of graph.getOutgoingEdges(curr)) {
        if (!seen.has(out.to)) {
          seen.add(out.to);
          if (states.get(out.to) === "HEALTHY") {
            states.set(out.to, "CONTAINED");
            reasons.set(
              out.to,
              `Shielded behind upstream containment gate '${gateNodeId}'.`,
            );
          }
          q.push(out.to);
        }
      }
    }
  }
}

