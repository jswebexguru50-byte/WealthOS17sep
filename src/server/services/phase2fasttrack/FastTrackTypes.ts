export type SignalStatus =
  | "SIGNAL"
  | "NO_SIGNAL"
  | "DATA_INSUFFICIENT"
  | "PIT_INVALID"
  | "IDENTITY_INVALID";

export type ValidationStatus =
  | "PASS"
  | "PASS_WITH_LIMITATIONS"
  | "FAIL"
  | "BLOCKED";

export interface FastTrackRunManifest {
  runId: string;
  gitCommit: string;
  datasetHash: string;
  pitUniverseHash: string;
  signalLedgerHash: string;
  calendarHash: string;
  dependencyGraphHash: string;
  frozenControlHashes: Record<string, string>;
  registryHash: string;
  createdAt: string;
}

export interface ConditionResult {
  parameterName: string;
  sourceField: string;
  actualValue: number | string | boolean | null;
  operator: string;
  threshold: number | string | boolean | null;
  passed: boolean;
  unit?: string;
  lookback?: number;
  formula?: string;
}

export interface SignalRecord {
  signalId: string;
  strategyId: string;
  securityId: string;
  pitSecurityId: string;
  decisionDate: string;
  signal: boolean;
  parameterValues: Record<string, number | string | boolean | null>;
  conditionResults: ConditionResult[];
  dataSnapshotHash: string;
  codeSha: string;
  datasetHash: string;
}

export interface ImmutableSignal {
  readonly signalId: string;
  readonly strategyId: string;
  readonly securityId: string;
  readonly decisionDate: string;
  readonly signal: boolean;
  readonly parameterValues: Readonly<Record<string, unknown>>;
  readonly conditionResults: readonly ConditionResult[];
}

export interface OutcomeRecord {
  signalId: string;
  strategyId: string;
  securityId: string;
  decisionDate: string;
  entryPrice: number | null;
  entryTimestamp?: string;
  forwardReturns: Record<string, number | null>;
  forwardPrices?: Record<string, number | null>;
  mfe: number | null;
  mae: number | null;
  timeToMfe: number | null;
  timeToMae: number | null;
  maxDrawdown: number | null;
  gapThroughStop: boolean | null;
  outcomeResolution?: string;
  mfeMaeQuality?: string;
  outcomeDataHash: string;
}

export interface DownstreamContext {
  signalId: string;
  fere?: unknown;
  qglp?: unknown;
  valuation?: unknown;
  smartMoney?: unknown;
  momentum?: unknown;
  sectorRotation?: unknown;
  regime?: unknown;
  liquidity?: unknown;
  pitValid: boolean;
  availabilityTimestamp: string | null;
  snapshotHash: string;
}

export interface ValidationArtifact {
  artifactId: string;
  status: ValidationStatus;
  datasetHash: string;
  createdAt: string;
  evidenceHash: string;
  limitations: string[];
}

export interface EvidenceEnvelope<T> {
  evidenceId: string;
  runId: string;
  producer: string;
  evidenceType: string;
  inputHashes: Record<string, string>;
  datasetHash: string;
  decisionDate?: string;
  securityId?: string;
  strategyId?: string;
  payload: Readonly<T>;
  pitValid: boolean;
  provenanceValid: boolean;
  createdAt: string;
  evidenceHash: string;
}

export function assertSignalImmutable(original: SignalRecord, enriched: SignalRecord): void {
  if (
    original.signal !== enriched.signal ||
    original.strategyId !== enriched.strategyId ||
    original.securityId !== enriched.securityId ||
    original.decisionDate !== enriched.decisionDate
  ) {
    throw new Error(`SIGNAL_IMMUTABILITY_VIOLATION:${original.signalId}`);
  }
}

export const AgentAuthorityMatrix: Record<string, {
  canRead: string[];
  canWrite: string[];
  canModifySignal: boolean;
  canModifyFrozenCode: boolean;
  canPromoteCapital: boolean;
  canExecuteOrders?: boolean;
  canAllocateCapital?: boolean;
}> = {
  "SignalOutcomeBuilder": {
    "canRead": ["SIGNAL_LEDGER", "PIT_MARKET_DATA"],
    "canWrite": ["OUTCOME_LEDGER"],
    "canModifySignal": false,
    "canModifyFrozenCode": false,
    "canPromoteCapital": false
  },
  "EconomicStatisticsAgent": {
    "canRead": ["SIGNAL_LEDGER", "OUTCOME_LEDGER"],
    "canWrite": ["ECONOMIC_ANALYSIS"],
    "canModifySignal": false,
    "canModifyFrozenCode": false,
    "canPromoteCapital": false
  },
  "IntegratedWealthOSAgent": {
    "canRead": [
      "SIGNAL_LEDGER",
      "OUTCOME_LEDGER",
      "FERE",
      "QGLP",
      "SMART_MONEY",
      "MOMENTUM",
      "SECTOR_ROTATION"
    ],
    "canWrite": ["INTEGRATED_REPLAY", "DOWNSTREAM_CONTEXT"],
    "canModifySignal": false,
    "canModifyFrozenCode": false,
    "canPromoteCapital": false
  },
  "ShadowTradingAgent": {
    "canRead": ["CURRENT_PIT_DATA", "SIGNAL_ENGINE", "DOWNSTREAM_CONTEXT"],
    "canWrite": ["SHADOW_LEDGER"],
    "canModifySignal": false,
    "canModifyFrozenCode": false,
    "canPromoteCapital": false,
    "canExecuteOrders": false,
    "canAllocateCapital": false
  },
  "GovernanceGateAgent": {
    "canRead": ["ALL_EVIDENCE"],
    "canWrite": ["FINAL_STATUS"],
    "canModifySignal": false,
    "canModifyFrozenCode": false,
    "canPromoteCapital": false,
    "canExecuteOrders": false
  }
};
