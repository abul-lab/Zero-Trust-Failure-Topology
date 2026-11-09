import type {
  BulkheadPatchAction,
  TopologyDefinition,
  TopologyEdge,
  TopologyNode,
} from "../types/index.js";

/**
 * Immutable, indexed directed dependency and trust graph for multi-agent and
 * distributed service topologies.
 */
export class TopologyGraph {
  public readonly definition: TopologyDefinition;
  private readonly nodeMap = new Map<string, TopologyNode>();
  private readonly edgeMap = new Map<string, TopologyEdge>();
  private readonly outEdges = new Map<string, TopologyEdge[]>();
  private readonly inEdges = new Map<string, TopologyEdge[]>();

  constructor(definition: TopologyDefinition) {
    if (!definition.topologyId.trim()) {
      throw new Error("TopologyDefinition requires a non-empty topologyId.");
    }
    if (definition.nodes.length === 0) {
      throw new Error("TopologyDefinition requires at least one node.");
    }

    for (const node of definition.nodes) {
      if (this.nodeMap.has(node.id)) {
        throw new Error(`Duplicate node id '${node.id}' in topology.`);
      }
      this.nodeMap.set(node.id, { ...node });
      this.outEdges.set(node.id, []);
      this.inEdges.set(node.id, []);
    }

    for (const edge of definition.edges) {
      if (this.edgeMap.has(edge.id)) {
        throw new Error(`Duplicate edge id '${edge.id}' in topology.`);
      }
      if (!this.nodeMap.has(edge.from)) {
        throw new Error(
          `Edge '${edge.id}' references unknown source node '${edge.from}'.`,
        );
      }
      if (!this.nodeMap.has(edge.to)) {
        throw new Error(
          `Edge '${edge.id}' references unknown target node '${edge.to}'.`,
        );
      }
      const copy: TopologyEdge = { ...edge };
      this.edgeMap.set(edge.id, copy);
      this.outEdges.get(edge.from)!.push(copy);
      this.inEdges.get(edge.to)!.push(copy);
    }

    this.definition = {
      ...definition,
      nodes: Array.from(this.nodeMap.values()),
      edges: Array.from(this.edgeMap.values()),
    };
  }

  public getNodes(): readonly TopologyNode[] {
    return this.definition.nodes;
  }

  public getEdges(): readonly TopologyEdge[] {
    return this.definition.edges;
  }

  public getNode(nodeId: string): TopologyNode | undefined {
    return this.nodeMap.get(nodeId);
  }

  public getEdge(edgeId: string): TopologyEdge | undefined {
    return this.edgeMap.get(edgeId);
  }

  public getOutgoingEdges(nodeId: string): readonly TopologyEdge[] {
    return this.outEdges.get(nodeId) ?? [];
  }

  public getIncomingEdges(nodeId: string): readonly TopologyEdge[] {
    return this.inEdges.get(nodeId) ?? [];
  }

  /**
   * Detects directed cycles (such as recursive agent-to-agent delegation loops)
   * using deterministic 3-color depth-first search.
   */
  public findDirectedCycles(): string[][] {
    const color = new Map<string, 0 | 1 | 2>(); // 0=unvisited, 1=visiting, 2=done
    const stack: string[] = [];
    const seenCycleKeys = new Set<string>();
    const cycles: string[][] = [];

    for (const node of this.definition.nodes) {
      color.set(node.id, 0);
    }

    const dfs = (u: string): void => {
      color.set(u, 1);
      stack.push(u);

      for (const edge of this.getOutgoingEdges(u)) {
        const v = edge.to;
        const vState = color.get(v) ?? 0;
        if (vState === 0) {
          dfs(v);
        } else if (vState === 1) {
          const cycleStart = stack.indexOf(v);
          if (cycleStart >= 0) {
            const rawCycle = [...stack.slice(cycleStart), v];
            // Canonicalize cycle key to avoid duplicate rotations
            const loopNodes = rawCycle.slice(0, -1);
            const minNode = [...loopNodes].sort()[0]!;
            const minIdx = loopNodes.indexOf(minNode);
            const canonical = [
              ...loopNodes.slice(minIdx),
              ...loopNodes.slice(0, minIdx),
            ].join("->");
            if (!seenCycleKeys.has(canonical)) {
              seenCycleKeys.add(canonical);
              cycles.push(rawCycle);
            }
          }
        }
      }

      stack.pop();
      color.set(u, 2);
    };

    for (const node of this.definition.nodes) {
      if ((color.get(node.id) ?? 0) === 0) {
        dfs(node.id);
      }
    }

    return cycles;
  }

  /**
   * Computes all upstream callers that transitively depend on `targetNodeId`
   * along hard, non-fallback, non-circuit-broken edges.
   */
  public findUnprotectedUpstreamCallers(targetNodeId: string): Set<string> {
    const visited = new Set<string>();
    const queue: string[] = [targetNodeId];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const edge of this.getIncomingEdges(curr)) {
        if (edge.hardDependency === false || edge.fallbackMode || edge.circuitBreaker) {
          continue;
        }
        if (edge.from !== targetNodeId && !visited.has(edge.from)) {
          visited.add(edge.from);
          queue.push(edge.from);
        }
      }
    }

    return visited;
  }

  /**
   * Returns a new TopologyGraph with one or more bulkhead/containment patches applied.
   */
  public applyPatches(patches: readonly BulkheadPatchAction[]): TopologyGraph {
    const clonedNodes = this.definition.nodes.map((n) => ({ ...n }));
    const clonedEdges = this.definition.edges.map((e) => ({ ...e }));

    for (const p of patches) {
      if (p.targetType === "edge") {
        const idx = clonedEdges.findIndex((e) => e.id === p.edgeId);
        if (idx >= 0) {
          clonedEdges[idx] = { ...clonedEdges[idx]!, ...p.patch };
        }
      } else {
        const idx = clonedNodes.findIndex((n) => n.id === p.nodeId);
        if (idx >= 0) {
          clonedNodes[idx] = { ...clonedNodes[idx]!, ...p.patch };
        }
      }
    }

    return new TopologyGraph({
      ...this.definition,
      version: `${this.definition.version}-hardened`,
      nodes: clonedNodes,
      edges: clonedEdges,
    });
  }
}

