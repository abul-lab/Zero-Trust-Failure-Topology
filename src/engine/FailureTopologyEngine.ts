import { TopologyAuditLedger } from "../audit/TopologyAuditLedger.js";
import { createDefaultEnterpriseTopology } from "../graph/presets.js";
import { detectStructuralRisks } from "../graph/RiskDetector.js";
import { TopologyGraph } from "../graph/TopologyGraph.js";
import { LiveMeshChaosHarness } from "../harness/LiveMeshChaosHarness.js";
import { BlastRadiusSimulator } from "../simulator/BlastRadiusSimulator.js";
import { ContainmentPlanner } from "../simulator/ContainmentPlanner.js";
import { IncidentCorrelator } from "../telemetry/IncidentCorrelator.js";
import type {
  BulkheadPatchAction,
  ChainVerificationReport,
  ContainmentPlanResult,
  LiveChaosTestResult,
  NodeRuntimeHealth,
  RuntimeIncidentEvent,
  SimulationRequest,
  SimulationResult,
  StructuralRiskFinding,
  TopologyAuditEntry,
  TopologyDefinition,
} from "../types/index.js";

export interface FailureTopologyEngineOptions {
  initialTopology?: TopologyDefinition;
  defaultOverloadMultiplier?: number;
  quarantineThreshold?: number;
  maxAuditEntries?: number;
  onAuditEntry?: (entry: TopologyAuditEntry) => void | Promise<void>;
}

/**
 * Unified coordinator for Zero-Trust Failure Topology:
 * manages the active dependency graph, structural risk analysis, deterministic
 * blast-radius simulation, counterfactual containment planning, live incident
 * quarantine tracking, and the SHA-256 tamper-evident audit ledger.
 */
export class FailureTopologyEngine {
  private graph: TopologyGraph;
  private readonly simulator: BlastRadiusSimulator;
  private readonly planner: ContainmentPlanner;
  private readonly chaosHarness: LiveMeshChaosHarness;
  private readonly correlator: IncidentCorrelator;
  private readonly audit: TopologyAuditLedger;
  private lastSimulation: SimulationResult | null = null;
  private simulationCount = 0;

  constructor(options: FailureTopologyEngineOptions = {}) {
    const def = options.initialTopology ?? createDefaultEnterpriseTopology();
    this.graph = new TopologyGraph(def);
    const overloadMult =
      options.defaultOverloadMultiplier ??
      (Number(process.env.TOPOLOGY_OVERLOAD_MULTIPLIER) || 4);
    const qThreshold =
      options.quarantineThreshold ??
      (Number(process.env.TOPOLOGY_QUARANTINE_THRESHOLD) || 3);
    this.simulator = new BlastRadiusSimulator({
      defaultOverloadMultiplier: overloadMult,
    });
    this.planner = new ContainmentPlanner(this.simulator);
    this.chaosHarness = new LiveMeshChaosHarness();
    this.correlator = new IncidentCorrelator({
      quarantineThreshold: qThreshold,
    });
    this.audit = new TopologyAuditLedger({
      maxEntries: options.maxAuditEntries ?? 5000,
      onEntry: options.onAuditEntry,
    });
  }

  public getGraph(): TopologyGraph {
    return this.graph;
  }

  public getTopology(): TopologyDefinition {
    return this.graph.definition;
  }

  public updateTopology(definition: TopologyDefinition): {
    topology: TopologyDefinition;
    risks: StructuralRiskFinding[];
    auditEntry: TopologyAuditEntry;
  } {
    this.graph = new TopologyGraph(definition);
    const risks = detectStructuralRisks(this.graph);
    const auditEntry = this.audit.record({
      eventType: "TOPOLOGY_UPDATED",
      topologyId: this.graph.definition.topologyId,
      summary: `Loaded topology '${this.graph.definition.name}' (${this.graph.getNodes().length} nodes, ${this.graph.getEdges().length} edges, ${risks.length} structural findings).`,
      blastRadiusScore: 0,
    });
    return {
      topology: this.graph.definition,
      risks,
      auditEntry,
    };
  }

  public resetToDefaultTopology(): {
    topology: TopologyDefinition;
    risks: StructuralRiskFinding[];
    auditEntry: TopologyAuditEntry;
  } {
    this.correlator.resetAll();
    return this.updateTopology(createDefaultEnterpriseTopology());
  }

  public getRisks(): StructuralRiskFinding[] {
    return detectStructuralRisks(this.graph);
  }

  public scanRisksWithAudit(): {
    findings: StructuralRiskFinding[];
    auditEntry: TopologyAuditEntry;
  } {
    const findings = detectStructuralRisks(this.graph);
    const criticalOrHigh = findings.filter(
      (f) => f.severity === "critical" || f.severity === "high",
    ).length;
    const auditEntry = this.audit.record({
      eventType: "RISK_SCAN",
      topologyId: this.graph.definition.topologyId,
      summary: `Structural risk scan completed: ${findings.length} total findings (${criticalOrHigh} critical/high).`,
      blastRadiusScore: 0,
    });
    return { findings, auditEntry };
  }

  public simulate(request: SimulationRequest): SimulationResult {
    const result = this.simulator.simulate(this.graph, request);
    const auditEntry = this.audit.record({
      eventType: "SIMULATION",
      topologyId: this.graph.definition.topologyId,
      summary: `Simulated ${request.faultMode} from '${request.originNodeId}': blast radius ${result.blastRadiusScore}% (${result.compromisedCount} compromised, ${result.degradedCount} degraded, ${result.containedCount} contained).`,
      blastRadiusScore: result.blastRadiusScore,
    });
    const signed: SimulationResult = {
      ...result,
      auditEntryHash: auditEntry.entryHash,
    };
    this.lastSimulation = signed;
    this.simulationCount += 1;
    return signed;
  }

  public planContainment(request: SimulationRequest): ContainmentPlanResult {
    return this.planner.plan(this.graph, request);
  }

  public async runLiveChaosTest(
    request: SimulationRequest,
  ): Promise<LiveChaosTestResult> {
    const result = await this.chaosHarness.runLiveChaosTest(
      this.graph,
      request,
    );
    this.audit.record({
      eventType: "LIVE_CHAOS_TEST",
      topologyId: this.graph.definition.topologyId,
      summary: `Live HTTP chaos test (${result.serversSpawned} TCP servers) for ${request.faultMode} at '${request.originNodeId}': measured ${result.measuredBlastRadiusScore}% vs simulated ${result.simulatedBlastRadiusScore}% (${result.compromisedCount} compromised, ${result.degradedCount} degraded, ${result.containedCount} shielded).`,
      blastRadiusScore: result.measuredBlastRadiusScore,
    });
    return result;
  }

  public applyContainmentPatches(
    patches: readonly BulkheadPatchAction[],
    reasonSummary?: string,
  ): {
    topology: TopologyDefinition;
    remainingRisks: StructuralRiskFinding[];
    auditEntry: TopologyAuditEntry;
  } {
    this.graph = this.graph.applyPatches(patches);
    const remainingRisks = detectStructuralRisks(this.graph);
    const auditEntry = this.audit.record({
      eventType: "CONTAINMENT_APPLIED",
      topologyId: this.graph.definition.topologyId,
      summary:
        reasonSummary ??
        `Applied ${patches.length} bulkhead containment patch(es); ${remainingRisks.length} structural finding(s) remain.`,
      blastRadiusScore: 0,
    });
    return {
      topology: this.graph.definition,
      remainingRisks,
      auditEntry,
    };
  }

  public recordIncident(event: RuntimeIncidentEvent): {
    health: NodeRuntimeHealth;
    newlyQuarantined: boolean;
    auditEntry?: TopologyAuditEntry;
  } {
    if (!this.graph.getNode(event.nodeId)) {
      throw new Error(
        `Node '${event.nodeId}' does not exist in topology '${this.graph.definition.topologyId}'.`,
      );
    }
    const { health, newlyQuarantined } = this.correlator.recordIncident(event);
    let auditEntry: TopologyAuditEntry | undefined;
    if (newlyQuarantined) {
      auditEntry = this.audit.record({
        eventType: "QUARANTINE_TRIPPED",
        topologyId: this.graph.definition.topologyId,
        summary: `Node '${event.nodeId}' auto-quarantined after ${health.consecutiveSignals} runtime incident signals (last signal: ${event.signalCode} from ${event.sourceGate}).`,
        blastRadiusScore: 0,
      });
    }
    return { health, newlyQuarantined, auditEntry };
  }

  public clearQuarantine(nodeId: string): NodeRuntimeHealth {
    return this.correlator.clearQuarantine(nodeId);
  }

  public getRuntimeHealth(): NodeRuntimeHealth[] {
    return this.correlator.getAllHealth();
  }

  public getQuarantinedNodeIds(): string[] {
    return this.correlator.getQuarantinedNodeIds();
  }

  public getQuarantineThreshold(): number {
    return this.correlator.getQuarantineThreshold();
  }

  public getLastSimulation(): SimulationResult | null {
    return this.lastSimulation;
  }

  public getSimulationCount(): number {
    return this.simulationCount;
  }

  public getAuditEntries(): readonly TopologyAuditEntry[] {
    return this.audit.getEntries();
  }

  public verifyAuditChain(): ChainVerificationReport {
    return this.audit.verifyChain();
  }

  public exportAuditJsonl(): string {
    return this.audit.exportJsonl();
  }
}
