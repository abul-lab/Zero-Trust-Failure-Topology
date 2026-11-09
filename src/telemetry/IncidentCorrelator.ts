import type {
  NodeRuntimeHealth,
  RuntimeIncidentEvent,
} from "../types/index.js";

export interface IncidentCorrelatorOptions {
  /** Consecutive runtime security/health signals before a node is quarantined (default: 3) */
  quarantineThreshold?: number;
}

/**
 * Runtime incident correlator that tracks live violation and outage signals
 * per topology node and automatically trips node quarantine when consecutive
 * failures reach the configured threshold.
 */
export class IncidentCorrelator {
  private readonly quarantineThreshold: number;
  private readonly healthMap = new Map<string, NodeRuntimeHealth>();

  constructor(options: IncidentCorrelatorOptions = {}) {
    this.quarantineThreshold = Math.max(1, options.quarantineThreshold ?? 3);
  }

  public getQuarantineThreshold(): number {
    return this.quarantineThreshold;
  }

  public recordIncident(event: RuntimeIncidentEvent): {
    health: NodeRuntimeHealth;
    newlyQuarantined: boolean;
  } {
    const timestamp = event.timestamp ?? new Date().toISOString();
    const prev = this.healthMap.get(event.nodeId) ?? {
      nodeId: event.nodeId,
      consecutiveSignals: 0,
      quarantined: false,
    };

    const nextCount = prev.consecutiveSignals + 1;
    const shouldQuarantine =
      prev.quarantined ||
      event.severity === "critical" && nextCount >= Math.min(2, this.quarantineThreshold) ||
      nextCount >= this.quarantineThreshold;

    const updated: NodeRuntimeHealth = {
      nodeId: event.nodeId,
      consecutiveSignals: nextCount,
      quarantined: shouldQuarantine,
      lastSignalCode: event.signalCode,
      lastUpdatedIso: timestamp,
    };

    this.healthMap.set(event.nodeId, updated);

    return {
      health: { ...updated },
      newlyQuarantined: !prev.quarantined && updated.quarantined,
    };
  }

  public clearQuarantine(nodeId: string): NodeRuntimeHealth {
    const reset: NodeRuntimeHealth = {
      nodeId,
      consecutiveSignals: 0,
      quarantined: false,
      lastUpdatedIso: new Date().toISOString(),
    };
    this.healthMap.set(nodeId, reset);
    return { ...reset };
  }

  public resetAll(): void {
    this.healthMap.clear();
  }

  public getHealth(nodeId: string): NodeRuntimeHealth {
    const found = this.healthMap.get(nodeId);
    return found
      ? { ...found }
      : { nodeId, consecutiveSignals: 0, quarantined: false };
  }

  public getAllHealth(): NodeRuntimeHealth[] {
    return Array.from(this.healthMap.values()).map((h) => ({ ...h }));
  }

  public getQuarantinedNodeIds(): string[] {
    const quarantined: string[] = [];
    for (const h of this.healthMap.values()) {
      if (h.quarantined) {
        quarantined.push(h.nodeId);
      }
    }
    return quarantined;
  }
}

