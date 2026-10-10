import type { FactSource, Scope, ScorecardRow, Thresholds } from '../domain/index.js';

/** One official promoter-holding observation (latest reported quarter). */
export interface PromoterPoint {
  /** Promoter holding in percent of total shares; null when the source row has no value. */
  value: number | null;
  /** Quarter-end date (YYYY-MM-DD) the holding is reported for. */
  quarterEnd: string;
  source: string;
}

/** One dated promoter-pledge observation (percent of promoter holding). */
export interface PledgePoint {
  quarterEnd: string;
  /** Null means the source does not know the pledge; it is never read as zero. */
  pledgePct: number | null;
  source: string;
  /**
   * Provenance of the point. When absent it is inferred: a source name containing 'official' is OFFICIAL,
   * anything else PROVIDER (spec 6.3(5): official promoter_pledge first, provider series as fallback).
   */
  basis?: 'OFFICIAL' | 'PROVIDER';
}

/** One institutional-ownership observation; components are percent of total shares. */
export interface InstitutionalPoint {
  /** Must be a calendar quarter-end (Mar/Jun/Sep/Dec month-end); other dates are ignored. */
  quarterEnd: string;
  fii: number | null;
  diiOther: number | null;
  mutualFunds: number | null;
  basis: 'OFFICIAL' | 'PROVIDER';
  source: string;
}

/** Ownership read port. Implementations are point-in-time: nothing known only after `asOf`. */
export interface OwnershipSource {
  promoterOfficial(asOf: string): PromoterPoint | null;
  pledgeSeries(asOf: string): PledgePoint[];
  institutionalAtQuarterEnds(asOf: string): InstitutionalPoint[];
}

/** Provider ROCE: a labelled cross-check, or the value of last resort when nothing is derivable. */
export interface ProviderRoce {
  value: number;
  asOf: string;
  source: string;
}

/** Everything the scorecard needs for one scrip and one scope. */
export interface ScorecardInput {
  isin: string;
  symbol: string;
  /** ISO UTC instant; only facts available at this instant are used. */
  asOf: string;
  /** The single scope used by every financial filter. */
  scope: Scope;
  facts: FactSource;
  ownership: OwnershipSource;
  /** Banks and NBFCs: ROCE and CFO/EBITDA are NOT_APPLICABLE. */
  isFinancial?: boolean;
  /** Annual (FY) or trailing-twelve-month basis for ROCE, ROE and CFO/EBITDA. Default FY. */
  basis?: 'FY' | 'TTM';
  /** Period end for the annual/TTM filters; default is the latest end of the numerator facts. */
  periodEnd?: string;
  /** Add lease liabilities to capital employed (Ind AS 116 basis). */
  includeLeaseInCapitalEmployed?: boolean;
  providerRoce?: ProviderRoce;
}

/** Optional extra detail carried by rows (the base ScorecardRow contract has no such fields). */
export interface ScorecardRowDetail {
  quarterPats: Array<{ quarterEnd: string; pat: number | null; metric: string | null; flags: string[] }>;
  quartersAvailable: number;
  qoqChange: number | null;
  components: { fii: number | null; diiOther: number | null; mutualFunds: number | null };
  flags: string[];
  leaseAdjustedRatio: number | null;
  crossCheck: { basis: 'PROVIDER'; value: number; asOf: string; source: string };
}

/** A scorecard row plus optional detail. Assignable to ScorecardRow. */
export type ScorecardRowX = ScorecardRow & Partial<ScorecardRowDetail>;

/** Thresholds accepted by buildScorecard: per-run overrides of the defaults. */
export type ThresholdOverrides = Partial<Thresholds>;
