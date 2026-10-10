import type { Scope } from '../domain/types.js';

/** Priced-date input: statutory/provider market cap, or price with shares. No OHLCV series is used. */
export interface PricedInput {
  /** ISO date the price or market cap refers to. Must not be after the context asOf. */
  asOf: string;
  marketCapCr?: number;
  price?: number;
  sharesOutstanding?: number;
}

/** One dated observation of a valuation multiple. */
export interface DatedMultiple {
  date: string;
  value: number;
}

/** Provider-supplied dated multiple series used only for own-history percentiles. */
export interface MultipleHistory {
  pe?: DatedMultiple[];
  pb?: DatedMultiple[];
  evEbitda?: DatedMultiple[];
}

/** Explicit, stored assumptions for the illustrative reverse DCF. Never defaulted. */
export interface DcfAssumptions {
  /** Annual discount rate as a fraction, e.g. 0.12. */
  discountRate: number;
  /** Terminal growth as a fraction; must be below the discount rate. */
  terminalGrowth: number;
  horizonYears: number;
  /** Where the assumptions are stored/approved, for the audit trail. */
  assumptionsRef: string;
}

/** A parsed related-party-transactions table. */
export interface RptTable {
  documentId: string;
  /** Period end of the fiscal year the table covers. */
  periodEnd: string;
  totalAmountCr: number;
  parsed: boolean;
}

/** Inputs shared by every calculator. */
export interface CalcContext {
  isin?: string;
  symbol?: string;
  /** ISO instant; only facts available at this time are read. */
  asOf: string;
  /** Force a scope; otherwise consolidated is preferred and the choice is stated in every result. */
  scope?: Scope;
  /** Target fiscal-year end; defaults to the latest annual period present. */
  annualPeriodEnd?: string;
  /** Target discrete-quarter end; defaults to the latest discrete quarter present. */
  quarterPeriodEnd?: string;
  /** Include lease liabilities in debt and capital measures (default true; the basis is stated). */
  includeLeases?: boolean;
  /** Window for incremental ROIC, in years (default 3). */
  incrementalWindowYears?: number;
  priced?: PricedInput;
  multipleHistory?: MultipleHistory;
  dcf?: DcfAssumptions;
  rptTable?: RptTable;
}
