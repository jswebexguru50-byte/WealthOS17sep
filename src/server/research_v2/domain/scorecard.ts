import type { Scope } from './types.js';

/** Comparator for a threshold. `info` = show the level, apply no threshold. */
export type ThresholdComparator = '>' | '>=' | '<=' | '==' | 'info';

/** One configurable threshold. `value` is null only with comparator `info`. */
export interface ThresholdConfig {
  value: number | null;
  comparator: ThresholdComparator;
  /** Absolute tolerance applied to the comparison (e.g. pledge 0 with 0.01). */
  tolerance?: number;
}

/** The seven-filter threshold set, overridable per run. */
export interface Thresholds {
  promoterPct: ThresholdConfig;
  profitableQuarters: ThresholdConfig;
  roce: ThresholdConfig;
  roe: ThresholdConfig;
  promoterPledge: ThresholdConfig;
  institutional: ThresholdConfig;
  cfoToEbitda: ThresholdConfig;
}

/** Owner-set defaults. Promoter 66.6 vs 66.67 and the institutional threshold are still open with the owner. */
export const DEFAULT_THRESHOLDS: Readonly<Thresholds> = {
  promoterPct: { value: 66.6, comparator: '>' },
  profitableQuarters: { value: 8, comparator: '>=' },
  roce: { value: 35, comparator: '>=' },
  roe: { value: 25, comparator: '>=' },
  promoterPledge: { value: 0, comparator: '<=', tolerance: 0.01 },
  institutional: { value: null, comparator: 'info' },
  cfoToEbitda: { value: 0.5, comparator: '>=' },
};

/**
 * Status of one filter. Descriptive only: there is no overall pass/fail.
 * ABOVE_THRESHOLD is for '<=' filters (pledge); NOT_APPLICABLE for filters that do not apply.
 */
export type ScorecardStatus =
  | 'MEETS_THRESHOLD'
  | 'BELOW_THRESHOLD'
  | 'ABOVE_THRESHOLD'
  | 'UNVERIFIABLE'
  | 'NOT_APPLICABLE';

/** One row of the seven-filter scorecard. Never carries a defaulted observation. */
export interface ScorecardRow {
  filterId: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  label: string;
  observed: number | null;
  unit: string;
  threshold: number | null;
  comparator: ThresholdComparator;
  /** observed - threshold; null when either side is unknown. */
  gap: number | null;
  status: ScorecardStatus;
  basis: 'OFFICIAL' | 'PROVIDER' | 'DERIVED' | 'UPPER_BOUND';
  asOf: string | null;
  period: string | null;
  scope: Scope | null;
  /** factIds / calcIds / sources that produced the observation. */
  sources: string[];
  formula: string;
  note?: string;
  reasonIfUnverifiable?: string;
}
