/**
 * StockScans Parity Engine — Shared Types & Data Integrity Contract
 * 
 * Non-negotiable data integrity policy:
 * 1. Every returned fact must have one of: VERIFIED | PARTIAL | UNAVAILABLE | NOT_APPLICABLE | ERROR
 * 2. Never invent, infer, estimate, or substitute a missing financial value.
 * 3. Never use a default number (such as 0, 25) to represent missing data.
 * 4. Numeric facts carry source, source URL, hash, timestamps, and formula versions.
 * 5. If a value cannot be calculated, return null, not zero.
 */

export type DataStatus =
  | 'VERIFIED'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'NOT_APPLICABLE'
  | 'ERROR';

export type SourceSystem =
  | 'DUCKDB'
  | 'SQLITE_FERE'
  | 'UPSTOX'
  | 'NSE'
  | 'BSE';

export interface Provenance {
  sourceSystem: SourceSystem;
  sourceTable?: string;
  sourceUrl?: string | null;
  documentId?: string | null;
  documentSha256?: string | null;
  retrievedAt?: string | null;
  asOf: string;
  formulaVersion?: string | null;
}

export interface Fact<T> {
  value: T | null;
  status: DataStatus;
  provenance: Provenance[];
  noDataReason?: string | null;
  isDerived?: boolean;
}

export interface Coverage {
  requested: number;
  eligible: number;
  matched?: number;
  covered?: number;
  unavailable: number;
  gaps?: string[];
  missingSymbols?: string[];
  selectedRuns?: number;
  missingRuns?: string[];
}

export type UniverseId =
  | 'NIFTY_50'
  | 'NIFTY_100'
  | 'NIFTY_500'
  | 'NSE_ALL_ACTIVE'
  | 'BSE_ALL_ACTIVE'
  | 'INVESTED'
  | 'CUSTOM';

export interface UniverseSnapshot {
  universeId: UniverseId;
  revision: string;
  asOf: string;
  symbols: string[];
  source: Provenance;
}

export interface UniverseCoverageSummary {
  id: UniverseId;
  revision: string;
  requested: number;
  eligible: number;
  unavailable: number;
}

export interface ApiResult<T> {
  success: boolean;
  data: T | null;
  status: DataStatus;
  asOf: string | null;
  sourceSystem: string | null;
  coverage?: Coverage;
  universe?: UniverseCoverageSummary;
  noDataReason?: string | null;
  errors?: string[];
}

export type MissingConstituentPolicy =
  | 'FAIL_IF_ANY_MISSING'
  | 'USE_COVERED_ONLY'
  | 'REQUIRE_MINIMUM_COVERAGE';

export interface CustomIndexConstituent {
  symbol: string;
  weight?: number;
}

export interface CustomIndexResult {
  name: string;
  asOf: string;
  status: DataStatus;
  value: number | null;
  totalReturnPct: number | null;
  performance: {
    change1D: number | null;
    change1W: number | null;
    change1M: number | null;
    change1Y: number | null;
  } | null;
  series: Array<{ date: string; indexValue: number; returnPct: number }>;
  coverage: {
    total: number;
    covered: number;
    unavailable: number;
    missingSymbols: string[];
  };
  constituentsCoverage: Array<{ symbol: string; covered: boolean; weight: number }>;
  noDataReason?: string | null;
  formulaVersion: string;
  missingConstituentPolicy: MissingConstituentPolicy;
}

export interface ScanRunRecord {
  runId: string;
  scanId: string;
  scanName: string;
  category?: 'TECHNICAL' | 'MOMENTUM' | 'BREAKOUT' | 'VOLATILITY' | 'VOLUME' | 'STRUCTURE';
  asOf: string;
  sourceSystem: 'DUCKDB' | 'SQLITE_FERE';
  formulaVersion: string;
  dataRevision: string;
  universeRevision: string;
  parameterHash: string;
  parameters: Record<string, unknown>;
  coverage: {
    requested: number;
    eligible: number;
    matched: number;
    unavailable: number;
    gaps: string[];
  };
  status: DataStatus;
  resultsHash: string;
  executedAt: string;
  matches?: any[];
  noDataReason?: string | null;
}
