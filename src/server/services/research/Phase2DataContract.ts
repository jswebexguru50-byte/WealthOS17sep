/**
 * Phase2DataContract.ts
 *
 * Authoritative Point-in-Time Data Contracts for WealthOS / ITAS v6.3 Phase 2.
 * Strictly enforces point-in-time constraints, provenance tracking, and zero synthetic fallbacks.
 */

export interface PITProvenanceFields {
  source: string;
  sourceRecordId: string;
  economicTimestamp: string;
  publicationTimestamp: string;
  availableAt: string;
}

export type UniverseEligibilityStatus = "ACTIVE" | "SUSPENDED" | "DELISTED";

export type UniverseTransitionReason =
  | "INITIAL_INCLUSION"
  | "REBALANCE_ADDITION"
  | "REBALANCE_REMOVAL"
  | "DELISTING"
  | "CORPORATE_MERGER"
  | "SYMBOL_CHANGE";

export interface HistoricalUniverseRecord {
  id?: number;
  symbol: string;
  universe: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // YYYY-MM-DD or null if currently active
  eligibilityStatus: UniverseEligibilityStatus;
  transitionReason: UniverseTransitionReason;
  source: string;
  sourceRecordId: string;
  availableAt: string; // ISO-8601 with offset e.g. 2025-08-31T18:00:00+05:30
}

export type MarketSessionType =
  | "REGULAR"
  | "MUHURAT"
  | "SPECIAL"
  | "CLOSED"
  | "WEEKEND"
  | "HOLIDAY";

export interface TradingCalendarSession {
  date: string; // YYYY-MM-DD
  marketOpen: string; // e.g. "09:15:00+05:30"
  marketClose: string; // e.g. "15:30:00+05:30"
  tradable: boolean;
  sessionType: MarketSessionType;
  sessionIdentifier: string; // e.g. "NSE_EQ_20251001_REG"
  holidayReason: string | null;
  source: string;
  availableAt: string;
}

export type CorporateActionType =
  | "SPLIT"
  | "BONUS"
  | "DIVIDEND"
  | "RIGHTS"
  | "MERGER"
  | "SYMBOL_CHANGE";

export type AdjustmentConvention = "RAW" | "ADJUSTED" | "RECONSTRUCTED";

export interface CorporateActionReconciliation {
  id?: number;
  symbol: string;
  actionType: CorporateActionType;
  exDate: string; // YYYY-MM-DD
  recordDate: string | null; // YYYY-MM-DD
  ratioNumerator: number | null;
  ratioDenominator: number | null;
  amount: number | null;
  adjustmentConvention: AdjustmentConvention;
  economicTimestamp: string;
  availableAt: string;
  source: string;
  sourceRecordId: string;
}

export type PITDisclosureKind = "FINANCIAL_STATEMENT" | "SHAREHOLDING_PATTERN";

export interface PITDisclosureRecord {
  id?: number;
  symbol: string;
  disclosureKind: PITDisclosureKind;
  periodLabel: string; // e.g. "Q2_FY26" or "Sep 2025"
  periodEndDate: string; // YYYY-MM-DD
  publicationTimestamp: string; // ISO-8601
  availableAt: string; // ISO-8601, MUST be > periodEndDate
  source: string;
  sourceRecordId: string;
  dataPayload: Record<string, any>;
}

export interface Phase2PilotManifest {
  version: string;
  datasetName: string;
  databasePath: string;
  databaseSha256: string;
  symbolCount: number;
  symbols: string[];
  dateRange: {
    startDate: string;
    endDate: string;
    tradingDays: number;
  };
  tableRowCounts: {
    DailyOHLCV: number;
    authoritative_trading_calendar: number;
    historical_investable_universe: number;
    corporate_actions_reconciled: number;
    pit_disclosure_registry: number;
  };
  invariants: {
    zeroNullDelivery: boolean;
    zeroNullTurnover: boolean;
    zeroSyntheticProxies: boolean;
    strictPitTimestamps: boolean;
    calendarSynchronized: boolean;
    survivorshipDocumented: boolean;
  };
  generatedAt: string;
}

/**
 * Validates that an input record obeys strict PIT access constraints:
 * Record availableAt MUST be <= decisionTimestamp.
 */
export function assertRecordPIT(record: { availableAt: string }, decisionTimestamp: string, fieldName: string) {
  if (!record.availableAt) {
    throw new Error(`DATA_INSUFFICIENT: Missing availableAt on ${fieldName}`);
  }
  if (record.availableAt > decisionTimestamp) {
    throw new Error(
      `PIT_LEAKAGE_VIOLATION: ${fieldName} availableAt (${record.availableAt}) is later than decisionTimestamp (${decisionTimestamp})`
    );
  }
}
