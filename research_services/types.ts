export type Direction = "LONG" | "SHORT" | "EXIT" | "HEDGE";
export type ExperimentArm = "A_RAW" | "B_V62_OVERLAY" | "C_CHALLENGERS" | "D_RISK_ORACLE";
export type AblationLayer =
  | "RAW" | "SIGNAL_QUALITY" | "RISK_SIZING" | "GAP_RISK"
  | "CAPITAL_PROTECTION" | "EXIT_FRAMEWORK" | "ALL";

export interface ResearchBar {
  symbol: string;
  timestamp: string;
  open: number; high: number; low: number; close: number;
  volume: number;
  deliveryVolume?: number;
  tradable: boolean;
  upperCircuit?: number;
  lowerCircuit?: number;
  availableAt: string;
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
  entryTimestamp?: string;
  exitTimestamp?: string;
  direction: Direction;
  entrySignalPrice: number;
  actualEntryPrice?: number;
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
