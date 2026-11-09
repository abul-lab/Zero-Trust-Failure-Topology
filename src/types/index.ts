export type NodeKind =
  | "agent"
  | "tool"
  | "api"
  | "queue"
  | "datastore"
  | "gate";

export type TrustZone =
  | "untrusted"
  | "dmz"
  | "restricted"
  | "critical";

export type EdgeRelation =
  | "calls"
  | "reads_context"
  | "writes_state"
  | "delegates_to";

export type FaultMode =
  | "dependency_outage"
  | "retry_storm"
  | "taint_propagation"
  | "credential_compromise";

export type NodeImpactState =
  | "ORIGIN"
  | "COMPROMISED"
  | "DEGRADED"
  | "CONTAINED"
  | "HEALTHY";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type StructuralRiskCode =
  | "CYCLIC_AGENT_DELEGATION_LOOP"
  | "UNBOUNDED_RETRY_AMPLIFICATION"
  | "UNSANITIZED_TAINT_PATH_TO_SINK"
  | "SHARED_CREDENTIAL_CROSS_BOUNDARY"
  | "MISSING_CIRCUIT_BREAKER_CRITICAL_PATH"
  | "SINGLE_POINT_OF_FAILURE_NODE";

export interface TopologyNode {
  id: string;
  label: string;
  kind: NodeKind;
  zone: TrustZone;
  /** Identifier of the credential/identity scope used by this node */
  credentialScope?: string;
  /** Maximum load multiplier this node tolerates before overload collapse (default: 4) */
  capacityMultiplierLimit?: number;
  /** True if this node is a security/sanitization gate that blocks untrusted taint propagation */
  blocksTaint?: boolean;
  /** True if this node performs privileged state writes or shell/system execution */
  privilegedSink?: boolean;
  /** Optional 2D layout coordinates (0..1000, 0..560) for deterministic topology rendering */
  x?: number;
  y?: number;
}

export interface TopologyEdge {
  id: string;
  from: string;
  to: string;
  relation: EdgeRelation;
  /** True if failure of `to` causes `from` to fail when no fallback is present (default: true) */
  hardDependency?: boolean;
  /** True if `from` can degrade gracefully using cached/default behavior when `to` fails */
  fallbackMode?: boolean;
  /** True if an open circuit breaker halts cascading failure & retry storms across this edge */
  circuitBreaker?: boolean;
  /** Number of automatic retries performed by `from` when `to` times out or errors (default: 0) */
  maxRetries?: number;
  /** Request timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
  /** True if payloads crossing this edge pass deterministic sanitization / schema validation */
  sanitized?: boolean;
  /** True if `to` enforces per-caller scoped token verification rather than trusting shared ambient auth */
  scopedTokenVerified?: boolean;
}

export interface TopologyDefinition {
  topologyId: string;
  name: string;
  version: string;
  description?: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface StructuralRiskFinding {
  code: StructuralRiskCode;
  severity: RiskSeverity;
  title: string;
  description: string;
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  remediation: string;
}

export interface PropagationHop {
  step: number;
  fromNodeId: string;
  toNodeId: string;
  edgeId: string;
  outcome: "PROPAGATED" | "DEGRADED" | "BLOCKED_BY_CONTROL";
  controlTriggered?: string;
  amplificationFactor?: number;
  reason: string;
}

export interface NodeSimulationOutcome {
  nodeId: string;
  label: string;
  kind: NodeKind;
  zone: TrustZone;
  state: NodeImpactState;
  loadMultiplier: number;
  reason: string;
}

export interface SimulationRequest {
  originNodeId: string;
  faultMode: FaultMode;
  /** Initial retry/traffic spike factor for retry_storm simulations (default: 2) */
  initialSpikeMultiplier?: number;
}

export interface SimulationResult {
  simulationId: string;
  topologyId: string;
  originNodeId: string;
  faultMode: FaultMode;
  totalNodes: number;
  compromisedCount: number;
  degradedCount: number;
  containedCount: number;
  healthyCount: number;
  /** Percentage of non-origin nodes compromised or degraded (0..100) */
  blastRadiusScore: number;
  maxLoadAmplification: number;
  criticalSinksReached: string[];
  nodeOutcomes: NodeSimulationOutcome[];
  propagationTrace: PropagationHop[];
  evaluatedInMs: number;
  auditEntryHash?: string;
  timestamp: string;
}

export type BulkheadPatchAction =
  | {
      targetType: "edge";
      edgeId: string;
      patch: Partial<
        Pick<
          TopologyEdge,
          "circuitBreaker" | "maxRetries" | "sanitized" | "fallbackMode" | "scopedTokenVerified"
        >
      >;
      summary: string;
    }
  | {
      targetType: "node";
      nodeId: string;
      patch: Partial<Pick<TopologyNode, "credentialScope" | "blocksTaint">>;
      summary: string;
    };

export interface ContainmentRecommendation {
  rank: number;
  action: BulkheadPatchAction;
  baselineBlastRadiusScore: number;
  projectedBlastRadiusScore: number;
  scoreReduction: number;
  compromisedBefore: number;
  compromisedAfter: number;
}

export interface ContainmentPlanResult {
  originNodeId: string;
  faultMode: FaultMode;
  baseline: SimulationResult;
  recommendations: ContainmentRecommendation[];
  combinedHardenedTopology: TopologyDefinition;
  combinedHardenedSimulation: SimulationResult;
}

export interface RuntimeIncidentEvent {
  eventId?: string;
  nodeId: string;
  timestamp?: string;
  sourceGate: "agent-firewall" | "prompt-shield" | "service-monitor";
  signalCode: string;
  severity: RiskSeverity;
}

export interface NodeRuntimeHealth {
  nodeId: string;
  consecutiveSignals: number;
  quarantined: boolean;
  lastSignalCode?: string;
  lastUpdatedIso?: string;
}

export interface TopologyAuditEntry {
  index: number;
  entryId: string;
  timestamp: string;
  eventType:
    | "SIMULATION"
    | "LIVE_CHAOS_TEST"
    | "RISK_SCAN"
    | "CONTAINMENT_APPLIED"
    | "QUARANTINE_TRIPPED"
    | "TOPOLOGY_UPDATED";
  topologyId: string;
  summary: string;
  blastRadiusScore: number;
  prevHash: string;
  entryHash: string;
}

export interface ChainVerificationReport {
  valid: boolean;
  checked: number;
  headHash: string;
  brokenAtIndex?: number;
  brokenEntryId?: string;
  reason?: string;
}

export interface LiveNodeProbeOutcome {
  nodeId: string;
  label: string;
  port: number;
  httpStatus: number;
  observedState: NodeImpactState;
  requestsHandled: number;
  detail: string;
}

export interface LiveChaosTestResult {
  chaosRunId: string;
  topologyId: string;
  originNodeId: string;
  faultMode: FaultMode;
  serversSpawned: number;
  measuredBlastRadiusScore: number;
  simulatedBlastRadiusScore: number;
  matchesSimulation: boolean;
  compromisedCount: number;
  degradedCount: number;
  containedCount: number;
  healthyCount: number;
  peakMeasuredRequestsPerNode: number;
  criticalSinksReached: string[];
  nodeProbes: LiveNodeProbeOutcome[];
  durationMs: number;
  timestamp: string;
}

