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
