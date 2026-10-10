export type Scope = 'CONSOLIDATED' | 'STANDALONE';
export type PeriodType = 'DISCRETE_Q' | 'YTD_6M' | 'YTD_9M' | 'YTD_12M' | 'ANNUAL' | 'TTM' | 'POINT_IN_TIME';
export type FactUnit = 'INR_CR' | 'PCT' | 'RATIO' | 'SHARES' | 'INR' | 'DAYS' | 'X';
export type SourceTier = 'STATUTORY' | 'PROVIDER_VERIFIED' | 'PROVIDER_LATEST' | 'SECONDARY_LEAD' | 'SIMULATED';

export interface Fact {
  factId: string;
  isin: string;
  symbol: string;
  scope: Scope;
  metric: string;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  valueCr: number | null;
  unit: FactUnit;
  sourceTier: SourceTier;
  source: string;
  sourceRef: string;
  availableAt: string;
  vintage: number;
  supersedesId?: string;
  derivation?: { formula: string; inputs: string[] };
  qualityFlags: string[];
  quarantined: boolean;
}

export interface RawXbrlFact {
  factId: string; isin: string; symbol: string; scope: Scope; metric: string;
  value: number; unit: string; contextRef: string; periodStart: string; periodEnd: string;
  source: string; sourceRef: string; availableAt: string; vintage?: number;
}
