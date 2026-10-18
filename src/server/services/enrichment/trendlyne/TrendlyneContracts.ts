/**
 * TrendlyneContracts.ts — Contracts and interfaces for Trendlyne MCP capacity utilization & daemon
 * WealthOS V2 Mandatory Amendment
 */

export interface TrendlyneMetricDefinition {
  providerMetricId: string;
  providerLabel: string;
  canonicalMetric: string | null;
  applicableArchetypes: string[]; // ['ALL'] or specific archetypes like ['BANK', 'NBFC']
  usefulFor: string[]; // e.g. ['valuation', 'solvency', 'profitability']
  importance: 'MANDATORY' | 'HIGH' | 'MEDIUM' | 'LOW';
  historical: boolean;
  periodType: string | null; // 'ANNUAL', 'QUARTERLY', 'TTM', 'LATEST'
  unit: string | null; // 'INR_CR', 'PERCENT', 'RATIO', 'COUNT', etc.
  mappingStatus: 'VERIFIED' | 'CANDIDATE' | 'AMBIGUOUS' | 'REJECTED' | 'UNMAPPED';
  expectedCoverage: number | null; // 0.0 to 1.0
}

export interface TrendlynePack {
  packId: string;
  packVersion: number;
  packHash: string; // sha256(sortedProviderMetricIds.join('|'))
  metricCount: number;
  metricIds: string[];
  createdAt: string;
  archetype?: string;
}

export interface TrendlyneScripBatch {
  batchId: string;
  scripBatchHash: string; // sha256(sortedSecurityIds.join('|'))
  securityIds: string[];
  symbols: string[];
}

export type PartialCallReason =
  | 'INSUFFICIENT_ELIGIBLE_SCRIPS'
  | 'INSUFFICIENT_USEFUL_METRICS'
  | 'PROVIDER_RESPONSE_LIMIT'
  | 'PRIORITY_OVERRIDE'
  | 'ACCEPTANCE_BLOCKER';

export interface TrendlyneCallEfficiency {
  callId: string;
  requestedScrips: number;
  maxScrips: number; // 10
  requestedMetrics: number;
  maxMetrics: number; // 50
  requestedCells: number; // requestedScrips * requestedMetrics
  maxCells: number; // 500
  newUsefulCells: number;
  duplicateCells: number;
  notApplicableCells: number;
  missingReturnedCells: number;
  requestUtilizationPct: number; // (requestedCells / maxCells) * 100
  usefulYieldPct: number; // (newUsefulCells / requestedCells) * 100
  partialCallReason?: PartialCallReason;
  timestamp: string;
}

export interface TrendlyneMetricApplicability {
  metricId: string;
  archetype: string;
  requests: number;
  successfulValues: number;
  nullValues: number;
  coveragePct: number;
  lastUpdated: string;
}

export interface TrendlyneCallEfficiencyReport {
  generatedAt: string;
  totalCalls: number;
  totalRequestedCells: number;
  totalAvailableCells: number;
  totalUsefulNewCells: number;
  requestUtilizationPct: number;
  usefulYieldPct: number;
  duplicateCellPct: number;
  nullReturnPct: number;
  callsAt100PctCapacity: number;
  partialCalls: number;
  reasonForEveryPartialCall: Record<string, PartialCallReason>;
  calls: TrendlyneCallEfficiency[];
}

export interface TrendlyneQuotaState {
  dailyUsed: number;
  monthlyUsed: number;
  dailyLimit: number;
  monthlyLimit: number;
  dailyReserve: number;
  monthlyReserve: number;
  lastResetAt: string;
}

export type TrendlyneJobState =
  | 'PENDING'
  | 'RUNNING'
  | 'RAW_STORED'
  | 'NORMALIZED'
  | 'CANONICALIZED'
  | 'VERIFIED'
  | 'COMPLETE'
  | 'RETRYABLE'
  | 'RATE_LIMITED'
  | 'BLOCKED_MAPPING'
  | 'SOURCE_UNAVAILABLE'
  | 'PERMANENT_FAILURE';

export interface TrendlyneJob {
  jobId: string;
  securityId: string;
  symbol?: string;
  jobType: 'STRUCTURED_DATA' | 'OWNERSHIP' | 'CORPORATE_EVENTS' | 'DOC_ANNUAL_REPORT' | 'DOC_QUARTERLY_RESULT' | 'DOC_INVESTOR_PRESENTATION' | 'DOC_EARNINGS_CALL';
  packId?: string;
  packVersion?: string;
  periodKey?: string;
  priority: number; // 1: PORTFOLIO, 2: WATCHLIST, 3: ACCEPTANCE, 4: DISCOVERY, 5: REMAINING
  state: TrendlyneJobState;
  attemptCount: number;
  requestHash: string;
  responseHash?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  nextAttemptAt?: string;
  errorCode?: string;
  errorMessage?: string;
}
