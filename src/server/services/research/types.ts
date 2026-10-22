export type Direction = "LONG" | "SHORT" | "EXIT" | "HEDGE";
export type ExperimentArm = "A_RAW" | "B_V62_OVERLAY" | "C_CAPITAL_PROTECTION" | "C_CHALLENGERS" | "D_RISK_ORACLE" | "D_UNEXPOSED";
export type AblationLayer =
  | "RAW" | "SIGNAL_QUALITY" | "RISK_SIZING" | "GAP_RISK"
  | "CAPITAL_PROTECTION" | "EXIT_FRAMEWORK" | "ALL";

export interface ResearchBar {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  deliveryVolume: number;
  tradable: boolean;
  upperCircuit?: number;
  lowerCircuit?: number;
  availableAt: string;

  // Compatibility aliases
  date?: string;
  turnover?: number;
  deliveryQty?: number;
}

export interface SignalProvenance {
  dataMode: "REAL_HISTORICAL";
  decisionTimestamp: string;
  availableAt: string;
  sourceTables: string[];
  sourceRecordIds: string[];
  parameterHash: string;
  productionBaselineHash: string;
}

export interface ResearchSignal {
  signalId: string;
  strategyId: string;
  symbol: string;
  timestamp: string;
  availableAt?: string;
  direction: Direction;
  entry: number;
  stop: number;
  target?: number;
  quantityHint?: number;
  qualityScore?: number;
  reasons: string[];
  rawPayload?: Record<string, unknown>;
  provenance?: SignalProvenance;
}

export interface ExecutionConfig {
  initialCapital: number;
  brokeragePerLeg: number;
  sttRate: number;
  stampDutyBuyRate: number;
  exchangeTxnRate: number;
  gstRate: number;
  slippageBps: number;
  impactBps: number;
  maxParticipationPct: number;
  allowShortCash: boolean;

  // Simulation & Integrity Control Flags
  intrabarPolicy?: "CONSERVATIVE_STOP_FIRST" | "AGGRESSIVE_TARGET_FIRST";
  enforcePitTimestamps?: boolean;
  calendar?: any;
  enforceCalendarSessions?: boolean;
}

export function getDefaultExecutionConfig(overrides?: Partial<ExecutionConfig>): ExecutionConfig {
  return {
    initialCapital: 10_000_000,
    brokeragePerLeg: 20,
    sttRate: 0.001,
    stampDutyBuyRate: 0.00015,
    exchangeTxnRate: 0.0000345,
    gstRate: 0.18,
    slippageBps: 10,
    impactBps: 5,
    maxParticipationPct: 0.015,
    allowShortCash: false,
    intrabarPolicy: "CONSERVATIVE_STOP_FIRST",
    enforcePitTimestamps: true,
    ...overrides
  };
}

export interface Fill {
  timestamp: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  requestedPrice: number;
  fillPrice: number;
  grossValue: number;
  estimatedCost: number;
  reason: string;
}

export interface TradeIdentityLedger {
  tradeId: string;
  signalId: string;
  strategyId: string;
  experimentArm: ExperimentArm;
  symbol: string;
  sector?: string;
  clusterId?: string;
  signalTimestamp: string;
  signalDate?: string;
  signalAvailableAt?: string;
  decisionDataCutoffAt?: string;
  nextTradableSession?: string;
  entryTimestamp?: string;
  entryDate?: string;
  exitTimestamp?: string;
  settlementDate?: string;
  direction: Direction;
  signalPrice?: number;
  entrySignalPrice: number;
  rawEntryPrice?: number;
  actualEntryPrice?: number;
  slippageBps?: number;
  impactBps?: number;
  initialStop?: number;
  finalExitPrice?: number;
  quantity: number;
  grossPnl?: number;
  estimatedAllInCosts?: number;
  netPnl?: number;
  netRMultiple?: number;
  mae?: number;
  mfe?: number;
  maePricePct?: number;
  mfePricePct?: number;
  maeR?: number;
  mfeR?: number;
  exitReason?: string;
  regime?: string;
  dataSnapshotHash?: string;
  runId: string;
  parameterHash: string;
  createdAt: string;
  provenance: string[];

  // Cost and Notional Breakdown (Revision 2 Reviewer Specification)
  entryNotional?: number;
  exitNotional?: number;
  entryBrokerage?: number;
  entrySTT?: number;
  entryExchangeTxn?: number;
  entryStampDuty?: number;
  entryGST?: number;
  exitBrokerage?: number;
  exitSTT?: number;
  exitExchangeTxn?: number;
  exitStampDuty?: number;
  exitGST?: number;
  slippageCost?: number;
  marketImpactCost?: number;
}

export interface ResearchMetrics {
  trades: number;
  netPnl: number;
  expectancyR: number;
  profitFactor: number;
  maxDrawdownPct: number;
  calmar: number;
  sortino: number;
  winRate: number;
  meanMAE: number;
  meanMFE: number;
}

export interface WalkForwardWindow {
  trainStart: string;
  trainEnd: string;
  oosStart: string;
  oosEnd: string;
}
