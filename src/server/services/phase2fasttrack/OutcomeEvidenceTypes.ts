/**
 * src/server/services/phase2fasttrack/OutcomeEvidenceTypes.ts
 *
 * Explicit outcome and entry evidence types.
 */

export type EntryRule = 'DAILY_CLOSE_BOUND' | 'NEXT_OPEN' | 'INTRADAY_BREAKOUT';

export interface EntryObservation {
  strategyId: string;
  securityId: string;
  decisionTimestamp: string;
  entryRule: EntryRule;
  observationTimestamp: string;
  price: number;
  sourceArtifact: string;
  sourceHash: string;
  pitValid: boolean;
  corporateActionValid: boolean;
}

export interface OutcomeEvidence {
  strategyId: string;
  securityId: string;
  decisionTimestamp: string;
  entryObservation: EntryObservation;
  exitPrice?: number;
  returnPct?: number;
  holdingDays?: number;
  qualityLabel: string;
  outcomeEvidenceHash: string;
}

export interface OutcomeResolution {
  status: 'RESOLVED' | 'DATA_INSUFFICIENT' | 'PIT_REJECTED';
  observation?: EntryObservation;
  outcome?: OutcomeEvidence;
  reason?: string;
  evidenceHash?: string;
}

export type ExitRule = 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIME_EXPIRY' | 'END_OF_DATA' | 'STRUCTURAL' | 'TRAILING_STOP';

export type SameBarAmbiguityPolicy = 'CONSERVATIVE_STOP_FIRST' | 'RESOLVE_FROM_INTRADAY' | 'FAIL_CLOSED';

export interface ExitPolicy {
  hasDefinedExit: boolean;
  stopLossPct?: number;
  takeProfitPct?: number;
  trailingStopPct?: number;
  maxHoldingDays?: number;
  ambiguityPolicy: SameBarAmbiguityPolicy;
}

export interface ExitObservation {
  strategyId: string;
  securityId: string;
  entryTimestamp: string;
  exitRule: ExitRule;
  observationTimestamp: string;
  price: number;
  triggerPrice: number;     // The actual historical price that triggered the exit
  barId: string;            // identity of the physical bar
  sourceArtifact: string;
  sourceHash: string;
  pitValid: boolean;
  corporateActionValid: boolean;
}

export interface CostComponent {
  amount: number;
  rateApplied: number;
  effectiveFrom: string;
  effectiveTo?: string;
  provenance: string;
}

export interface CostBreakdown {
  tradeType: 'DELIVERY' | 'INTRADAY';
  turnover: number;
  brokerage: CostComponent;
  stt: CostComponent;
  exchangeTxnCharge: CostComponent;
  sebiFee: CostComponent;
  stampDuty: CostComponent;
  gst: CostComponent;
  totalCost: number;
}

export interface CanonicalTradeRecord {
  strategyId: string;
  securityId: string;
  decisionTimestamp: string;
  
  entryObservation: EntryObservation;
  exitObservation: ExitObservation;
  
  grossPnL: number;
  grossReturnPct: number;
  holdingDays: number;
  
  entryCost: CostBreakdown;
  exitCost: CostBreakdown;
  
  netPnL: number;
  netReturnPct: number;
  
  tradeLedgerHash: string;
}
