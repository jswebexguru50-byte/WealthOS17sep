/**
 * CanonicalFactResolverService.ts
 *
 * Single read-point for canonical facts consumed by StrategyFundamentalFilterService,
 * OpportunityScannerEngine, and build_bundle.mjs. Resolves the best available fact for
 * a (symbol, metric, asOf) tuple across up to 9 underlying stores, using a
 * FIELD-SPECIFIC waterfall so each metric draws from its most authoritative source first.
 *
 * Source identifiers (used in METRIC_SOURCE_PRIORITY):
 *   'company_facts_primary'  – company_facts rows with VERIFIED + PRIMARY/STATUTORY/EXCHANGE filing
 *   'company_facts'          – all other company_facts rows
 *   'trendlyne'              – trendlyne_mirror_observations
 *   'canonical_fact_store'   – canonical_fact_store
 *   'historical_statements'  – HistoricalFinancialStatements
 *   'fundamental_snapshots'  – FundamentalSnapshots
 *   'bse_xbrl'               – BSE XBRL feed (stub – table not yet populated)
 *   'screener'               – screener.in scrape (stub – table not yet populated)
 *   'exchange_api'           – exchange live API (stub – not yet populated)
 *
 * Default waterfall (for unmapped metrics):
 *   company_facts_primary → company_facts → canonical_fact_store → trendlyne →
 *   historical_statements → fundamental_snapshots → bse_xbrl → screener → exchange_api
 */

import { getDB } from '../database.js';

// ── Public types ─────────────────────────────────────────────────────────────

export interface ResolvedFact {
  symbol: string;
  metric: string;
  value: number | string;
  unit?: string;
  periodType?: string;
  periodEnd?: string;
  scope?: string;
  provider: string;
  source: string;
  confidence: number;
  fetchedAt?: string;
  asOf?: string;
  fromStore:
    | 'canonical_fact_store'
    | 'trendlyne_mirror'
    | 'company_facts'
    | 'fundamental_snapshot'
    | 'historical_statements'
    | 'bse_xbrl'
    | 'screener'
    | 'exchange_api';
}

export interface ResolvedFactWithTrace extends ResolvedFact {
  /** Source identifiers tried, in the order they were consulted for this metric. */
  triedSources: string[];
}

// ── Field-specific source priority map ───────────────────────────────────────

/**
 * For each logical metric, the ordered list of source IDs to try (first match wins).
 * Any metric not listed here falls back to DEFAULT_SOURCE_ORDER.
 */
const METRIC_SOURCE_PRIORITY: Record<string, string[]> = {
  // ── Shareholding / ownership metrics ─────────────────────────────────────
  // Trendlyne is the authoritative real-time feed for these.
  promoter_holding_pct: [
    'trendlyne',
    'canonical_fact_store',
    'company_facts_primary',
    'company_facts',
    'screener',
    'fundamental_snapshots',
  ],
  promoter_pledge_pct: [
    'trendlyne',
    'canonical_fact_store',
    'company_facts_primary',
    'company_facts',
    'screener',
    'fundamental_snapshots',
  ],
  fii_holding_pct: [
    'trendlyne',
    'canonical_fact_store',
    'company_facts_primary',
    'company_facts',
    'screener',
    'fundamental_snapshots',
  ],
  dii_holding_pct: [
    'trendlyne',
    'canonical_fact_store',
    'company_facts_primary',
    'company_facts',
    'screener',
    'fundamental_snapshots',
  ],

  // ── P&L / revenue metrics ─────────────────────────────────────────────────
  // Primary statutory filings are the gold standard here.
  revenue_cr: [
    'company_facts_primary',
    'company_facts',
    'historical_statements',
    'trendlyne',
    'canonical_fact_store',
    'screener',
    'fundamental_snapshots',
  ],
  operating_profit_cr: [
    'company_facts_primary',
    'company_facts',
    'historical_statements',
    'trendlyne',
    'canonical_fact_store',
    'screener',
    'fundamental_snapshots',
  ],
  net_profit_pat_cr: [
    'company_facts_primary',
    'company_facts',
    'historical_statements',
    'trendlyne',
    'canonical_fact_store',
    'screener',
    'fundamental_snapshots',
  ],

  // ── Return ratios ─────────────────────────────────────────────────────────
  // Trendlyne TTM is best; fall back to primary filings then computed snapshots.
  roce_trailing_pct: [
    'trendlyne',
    'company_facts_primary',
    'company_facts',
    'canonical_fact_store',
    'fundamental_snapshots',
    'screener',
    'historical_statements',
  ],
  roe_trailing_pct: [
    'trendlyne',
    'company_facts_primary',
    'company_facts',
    'canonical_fact_store',
    'fundamental_snapshots',
    'screener',
    'historical_statements',
  ],

  // ── EPS TTM ───────────────────────────────────────────────────────────────
  // Trendlyne or BSE XBRL are the best real-time sources.
  eps_ttm: [
    'trendlyne',
    'bse_xbrl',
    'company_facts_primary',
    'company_facts',
    'exchange_api',
    'canonical_fact_store',
    'fundamental_snapshots',
  ],

  // ── Cash flow from operations ─────────────────────────────────────────────
  // Primary filings then historical statement tables.
  cfo_cr: [
    'company_facts_primary',
    'company_facts',
    'historical_statements',
    'trendlyne',
    'canonical_fact_store',
    'screener',
    'fundamental_snapshots',
  ],
};

/**
 * Default waterfall used for any metric not listed in METRIC_SOURCE_PRIORITY.
 */
const DEFAULT_SOURCE_ORDER: string[] = [
  'company_facts_primary',
  'company_facts',
  'canonical_fact_store',
  'trendlyne',
  'historical_statements',
  'fundamental_snapshots',
  'bse_xbrl',
  'screener',
  'exchange_api',
];

// ── Metric alias normalisation ────────────────────────────────────────────────

const METRIC_ALIASES = new Map<string, string>([
  ['roce', 'roce_trailing_pct'],
  ['roce_pct', 'roce_trailing_pct'],
  ['roe', 'roe_trailing_pct'],
  ['roe_pct', 'roe_trailing_pct'],
  ['promoter_holding', 'promoter_holding_pct'],
  ['promoter_pct', 'promoter_holding_pct'],
  ['pledge', 'promoter_pledge_pct'],
  ['pledge_pct', 'promoter_pledge_pct'],
  ['fii', 'fii_holding_pct'],
  ['fii_pct', 'fii_holding_pct'],
  ['dii', 'dii_holding_pct'],
  ['dii_pct', 'dii_holding_pct'],
  ['pe', 'pe_ratio'],
  ['p_e', 'pe_ratio'],
  ['market_cap', 'market_cap_cr'],
  ['mcap', 'market_cap_cr'],
  ['debt_equity', 'debt_to_equity'],
  ['d_e', 'debt_to_equity'],
]);

// Canonical field names in canonical_fact_store → logical metric names used elsewhere
const CANONICAL_FACT_STORE_FIELD_MAP = new Map<string, string>([
  ['promoter_pct', 'promoter_holding_pct'],
  ['pledge_pct', 'promoter_pledge_pct'],
  ['fii_pct', 'fii_holding_pct'],
  ['dii_pct', 'dii_holding_pct'],
  ['roce_pct', 'roce_trailing_pct'],
  ['roe_pct', 'roe_trailing_pct'],
]);

// Reverse map: logical metric → stored field name in canonical_fact_store
const CANONICAL_FACT_STORE_REVERSE = new Map<string, string>();
for (const [field, metric] of CANONICAL_FACT_STORE_FIELD_MAP.entries()) {
  CANONICAL_FACT_STORE_REVERSE.set(metric, field);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normaliseMetric(metric: string): string {
  return METRIC_ALIASES.get(metric.toLowerCase()) ?? metric;
}

function parseNumeric(v: string | number | null | undefined): number | string | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
}

function isTableMissingError(e: unknown): boolean {
  return e instanceof Error && /no such table/i.test(e.message);
}

// ── Service ──────────────────────────────────────────────────────────────────

export class CanonicalFactResolverService {
  private static instance: CanonicalFactResolverService;

  static getInstance(): CanonicalFactResolverService {
    if (!this.instance) this.instance = new CanonicalFactResolverService();
    return this.instance;
  }

  private get db(): any {
    return getDB();
  }

  // ── Source resolvers ────────────────────────────────────────────────────────

  /**
   * Source 1 & 2: company_facts table.
   * Returns a candidate map keyed by metric.
   *   - Primary-filing verified rows (verificationStatus IN VERIFIED/SECONDARY_VERIFIED
   *     AND sourceType IN PRIMARY/STATUTORY/EXCHANGE_FILING) get confidence 1.0.
   *   - All other rows get confidence 0.7.
   *
   * The returned map holds the best row per metric (primary beats non-primary).
   * Callers that need to distinguish primary vs non-primary should check fact.confidence.
   */
  private resolveFromCompanyFacts(
    symbol: string,
    metrics: string[],
    asOf?: string
  ): Map<string, ResolvedFact> {
    const result = new Map<string, ResolvedFact>();
    if (metrics.length === 0) return result;

    try {
      const placeholders = metrics.map(() => '?').join(', ');
      const asOfCond = asOf ? 'AND (cf.asOfDate IS NULL OR cf.asOfDate <= ?)' : '';
      const params: unknown[] = [symbol, ...metrics];
      if (asOf) params.push(asOf);

      type CfRow = {
        metric: string;
        value: string | null;
        unit: string | null;
        periodType: string | null;
        periodEnd: string | null;
        scope: string | null;
        provider: string | null;
        fetchedAt: string | null;
        asOfDate: string | null;
        verificationStatus: string | null;
        sourceType: string | null;
      };

      const rows = this.db.all(
        `SELECT cf.metric, cf.value, cf.unit, cf.periodType, cf.periodEnd,
                cf.scope, cf.provider, cf.fetchedAt, cf.asOfDate,
                cf.verificationStatus, cf.sourceType
         FROM company_facts cf
         WHERE cf.symbol = ?
           AND cf.metric IN (${placeholders})
           AND cf.availabilityStatus = 'AVAILABLE'
           ${asOfCond}
         ORDER BY
           CASE WHEN cf.verificationStatus IN ('VERIFIED','SECONDARY_VERIFIED')
                     AND cf.sourceType IN ('PRIMARY_FILING','STATUTORY_FILING','EXCHANGE_FILING')
                THEN 0 ELSE 1 END ASC,
           cf.fetchedAt DESC`,
        params
      ) as CfRow[];

      for (const row of rows || []) {
        if (result.has(row.metric)) continue; // already have a higher-priority entry

        const parsed = parseNumeric(row.value);
        if (parsed == null) continue;

        const isPrimary =
          ['VERIFIED', 'SECONDARY_VERIFIED'].includes(row.verificationStatus ?? '') &&
          ['PRIMARY_FILING', 'STATUTORY_FILING', 'EXCHANGE_FILING'].includes(row.sourceType ?? '');

        result.set(row.metric, {
          symbol,
          metric: row.metric,
          value: parsed,
          unit: row.unit ?? undefined,
          periodType: row.periodType ?? undefined,
          periodEnd: row.periodEnd ?? undefined,
          scope: row.scope ?? undefined,
          provider: row.provider ?? 'company_facts',
          source: 'company_facts',
          confidence: isPrimary ? 1.0 : 0.7,
          fetchedAt: row.fetchedAt ?? undefined,
          asOf: row.asOfDate ?? asOf,
          fromStore: 'company_facts',
        });
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] company_facts query error:', e);
      }
    }

    return result;
  }

  /**
   * Source 3: canonical_fact_store.
   * Fields are stored under legacy names (promoter_pct, pledge_pct, …).
   */
  private resolveFromCanonicalFactStore(
    symbol: string,
    metrics: string[],
    asOf?: string
  ): Map<string, ResolvedFact> {
    const result = new Map<string, ResolvedFact>();
    if (metrics.length === 0) return result;

    // Build the set of field names to query
    const fieldSet = new Set<string>();
    const fieldToMetric = new Map<string, string>();

    for (const metric of metrics) {
      // Direct field name match
      fieldSet.add(metric);
      fieldToMetric.set(metric, metric);
      // Reverse alias
      const stored = CANONICAL_FACT_STORE_REVERSE.get(metric);
      if (stored) {
        fieldSet.add(stored);
        fieldToMetric.set(stored, metric);
      }
    }

    const fields = Array.from(fieldSet);
    if (fields.length === 0) return result;

    try {
      const placeholders = fields.map(() => '?').join(', ');
      const asOfCond = asOf ? 'AND (fetched_at IS NULL OR fetched_at <= ?)' : '';
      const params: unknown[] = [symbol, ...fields];
      if (asOf) params.push(asOf);

      type CfsRow = {
        field: string;
        value: string | null;
        source: string | null;
        confidence: number | null;
        fetched_at: string | null;
        ttl_seconds: number | null;
      };

      const rows = this.db.all(
        `SELECT field, value, source, confidence, fetched_at, ttl_seconds
         FROM canonical_fact_store
         WHERE symbol = ? AND field IN (${placeholders})
           ${asOfCond}
         ORDER BY confidence DESC, fetched_at DESC`,
        params
      ) as CfsRow[];

      for (const row of rows || []) {
        const logicalMetric = fieldToMetric.get(row.field) ?? row.field;
        if (result.has(logicalMetric)) continue;

        const parsed = parseNumeric(row.value);
        if (parsed == null) continue;

        // Check TTL expiry
        if (row.fetched_at && row.ttl_seconds) {
          const fetchedMs = new Date(row.fetched_at).getTime();
          if (!Number.isNaN(fetchedMs) && Date.now() > fetchedMs + row.ttl_seconds * 1000) {
            continue; // expired
          }
        }

        result.set(logicalMetric, {
          symbol,
          metric: logicalMetric,
          value: parsed,
          provider: row.source ?? 'canonical_fact_store',
          source: 'canonical_fact_store',
          confidence: row.confidence ?? 0.5,
          fetchedAt: row.fetched_at ?? undefined,
          asOf,
          fromStore: 'canonical_fact_store',
        });
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] canonical_fact_store query error:', e);
      }
    }

    return result;
  }

  /**
   * Source 4: trendlyne_mirror_observations.
   * canonicalMetric field holds the logical metric name.
   */
  private resolveFromTrendlyneMirror(
    symbol: string,
    metrics: string[],
    asOf?: string
  ): Map<string, ResolvedFact> {
    const result = new Map<string, ResolvedFact>();
    if (metrics.length === 0) return result;

    try {
      const placeholders = metrics.map(() => '?').join(', ');
      const asOfCond = asOf ? 'AND (providerAsOf IS NULL OR providerAsOf <= ?)' : '';
      const params: unknown[] = [symbol, ...metrics];
      if (asOf) params.push(asOf);

      type TmRow = {
        canonicalMetric: string | null;
        rawValue: string | null;
        rawUnit: string | null;
        periodType: string | null;
        relativePeriod: string | null;
        scope: string | null;
        providerAsOf: string | null;
        firstSeenAt: string | null;
      };

      const rows = this.db.all(
        `SELECT canonicalMetric, rawValue, rawUnit, periodType, relativePeriod,
                scope, providerAsOf, firstSeenAt
         FROM trendlyne_mirror_observations
         WHERE symbol = ?
           AND canonicalMetric IN (${placeholders})
           AND status = 'AVAILABLE'
           ${asOfCond}
         ORDER BY lastSeenAt DESC`,
        params
      ) as TmRow[];

      for (const row of rows || []) {
        const metric = row.canonicalMetric;
        if (!metric || result.has(metric)) continue;

        const parsed = parseNumeric(row.rawValue);
        if (parsed == null) continue;

        result.set(metric, {
          symbol,
          metric,
          value: parsed,
          unit: row.rawUnit ?? undefined,
          periodType: row.periodType ?? undefined,
          periodEnd: row.relativePeriod ?? undefined,
          scope: row.scope ?? undefined,
          provider: 'TRENDLYNE',
          source: 'trendlyne_mirror_observations',
          confidence: 0.6,
          fetchedAt: row.firstSeenAt ?? undefined,
          asOf: row.providerAsOf ?? asOf,
          fromStore: 'trendlyne_mirror',
        });
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] trendlyne_mirror_observations query error:', e);
      }
    }

    return result;
  }

  /**
   * Source 5: HistoricalFinancialStatements.
   * Columns expected: symbol, period_end, metric, value, unit, source.
   * Returns an empty map gracefully when the table does not yet exist.
   */
  private resolveFromHistoricalStatements(
    symbol: string,
    metrics: string[],
    asOf?: string
  ): Map<string, ResolvedFact> {
    const result = new Map<string, ResolvedFact>();
    if (metrics.length === 0) return result;

    try {
      const placeholders = metrics.map(() => '?').join(', ');
      const asOfCond = asOf ? 'AND (period_end IS NULL OR period_end <= ?)' : '';
      const params: unknown[] = [symbol, ...metrics];
      if (asOf) params.push(asOf);

      type HfsRow = {
        metric: string;
        value: string | null;
        unit: string | null;
        period_end: string | null;
        source: string | null;
      };

      const rows = this.db.all(
        `SELECT metric, value, unit, period_end, source
         FROM HistoricalFinancialStatements
         WHERE symbol = ?
           AND metric IN (${placeholders})
           ${asOfCond}
         ORDER BY period_end DESC`,
        params
      ) as HfsRow[];

      for (const row of rows || []) {
        if (result.has(row.metric)) continue;
        const parsed = parseNumeric(row.value);
        if (parsed == null) continue;

        result.set(row.metric, {
          symbol,
          metric: row.metric,
          value: parsed,
          unit: row.unit ?? undefined,
          periodEnd: row.period_end ?? undefined,
          provider: row.source ?? 'HistoricalFinancialStatements',
          source: 'HistoricalFinancialStatements',
          confidence: 0.75,
          asOf: row.period_end ?? asOf,
          fromStore: 'historical_statements',
        });
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] HistoricalFinancialStatements query error:', e);
      }
    }

    return result;
  }

  /**
   * Source 6: FundamentalSnapshots.
   * Columns: symbol, snapshot_date, pe_ratio, roce_pct, debt_to_equity,
   *          operating_margin_pct, market_cap_cr, source
   */
  private resolveFromFundamentalSnapshots(
    symbol: string,
    metrics: string[],
    asOf?: string
  ): Map<string, ResolvedFact> {
    const result = new Map<string, ResolvedFact>();
    if (metrics.length === 0) return result;

    // Map of column name → logical metric
    const SNAPSHOT_COLS = new Map<string, string>([
      ['pe_ratio', 'pe_ratio'],
      ['roce_pct', 'roce_trailing_pct'],
      ['debt_to_equity', 'debt_to_equity'],
      ['operating_margin_pct', 'operating_margin_pct'],
      ['market_cap_cr', 'market_cap_cr'],
    ]);

    // Reverse: logical metric → column name
    const wantedCols: string[] = [];
    const colToMetric = new Map<string, string>();

    for (const [col, logicalMetric] of SNAPSHOT_COLS.entries()) {
      if (metrics.includes(logicalMetric) || metrics.includes(col)) {
        wantedCols.push(col);
        colToMetric.set(col, logicalMetric);
      }
    }

    if (wantedCols.length === 0) return result;

    try {
      const asOfCond = asOf ? 'AND snapshot_date <= ?' : '';
      const params: unknown[] = [symbol];
      if (asOf) params.push(asOf);

      type FsRow = {
        snapshot_date: string;
        pe_ratio: number | null;
        roce_pct: number | null;
        debt_to_equity: number | null;
        operating_margin_pct: number | null;
        market_cap_cr: number | null;
        source: string | null;
      };

      const row = this.db.get(
        `SELECT snapshot_date, pe_ratio, roce_pct, debt_to_equity,
                operating_margin_pct, market_cap_cr, source
         FROM FundamentalSnapshots
         WHERE symbol = ? ${asOfCond}
         ORDER BY snapshot_date DESC
         LIMIT 1`,
        params
      ) as FsRow | undefined;

      if (!row) return result;

      for (const col of wantedCols) {
        const logicalMetric = colToMetric.get(col)!;
        const val = (row as any)[col];
        const parsed = parseNumeric(val);
        if (parsed == null) continue;

        result.set(logicalMetric, {
          symbol,
          metric: logicalMetric,
          value: parsed,
          provider: row.source ?? 'FundamentalSnapshots',
          source: 'FundamentalSnapshots',
          confidence: 0.4,
          asOf: row.snapshot_date,
          fromStore: 'fundamental_snapshot',
        });
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] FundamentalSnapshots query error:', e);
      }
    }

    return result;
  }

  /**
   * Source 7: BSE XBRL feed.
   * Stub — returns empty map until the bse_xbrl_facts table is populated.
   * Expected columns: symbol, metric, value, unit, period_end, filing_date.
   */
  private resolveFromBseXbrl(
    symbol: string,
    metrics: string[],
    asOf?: string
  ): Map<string, ResolvedFact> {
    const result = new Map<string, ResolvedFact>();
    if (metrics.length === 0) return result;

    try {
      const placeholders = metrics.map(() => '?').join(', ');
      const asOfCond = asOf ? 'AND (period_end IS NULL OR period_end <= ?)' : '';
      const params: unknown[] = [symbol, ...metrics];
      if (asOf) params.push(asOf);

      type XbrlRow = {
        metric: string;
        value: string | null;
        unit: string | null;
        period_end: string | null;
        filing_date: string | null;
      };

      const rows = this.db.all(
        `SELECT metric, value, unit, period_end, filing_date
         FROM bse_xbrl_facts
         WHERE symbol = ?
           AND metric IN (${placeholders})
           ${asOfCond}
         ORDER BY period_end DESC`,
        params
      ) as XbrlRow[];

      for (const row of rows || []) {
        if (result.has(row.metric)) continue;
        const parsed = parseNumeric(row.value);
        if (parsed == null) continue;

        result.set(row.metric, {
          symbol,
          metric: row.metric,
          value: parsed,
          unit: row.unit ?? undefined,
          periodEnd: row.period_end ?? undefined,
          provider: 'BSE_XBRL',
          source: 'bse_xbrl_facts',
          confidence: 0.9,
          fetchedAt: row.filing_date ?? undefined,
          asOf: row.period_end ?? asOf,
          fromStore: 'bse_xbrl',
        });
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] bse_xbrl_facts query error:', e);
      }
    }

    return result;
  }

  /**
   * Source 8: screener.in scrape.
   * Stub — returns empty map until the screener_scrape_facts table is populated.
   * Expected columns: symbol, metric, value, unit, scraped_at.
   */
  private resolveFromScreener(
    symbol: string,
    metrics: string[],
    asOf?: string
  ): Map<string, ResolvedFact> {
    const result = new Map<string, ResolvedFact>();
    if (metrics.length === 0) return result;

    try {
      const placeholders = metrics.map(() => '?').join(', ');
      const asOfCond = asOf ? 'AND (scraped_at IS NULL OR scraped_at <= ?)' : '';
      const params: unknown[] = [symbol, ...metrics];
      if (asOf) params.push(asOf);

      type ScreenerRow = {
        metric: string;
        value: string | null;
        unit: string | null;
        scraped_at: string | null;
      };

      const rows = this.db.all(
        `SELECT metric, value, unit, scraped_at
         FROM screener_scrape_facts
         WHERE symbol = ?
           AND metric IN (${placeholders})
           ${asOfCond}
         ORDER BY scraped_at DESC`,
        params
      ) as ScreenerRow[];

      for (const row of rows || []) {
        if (result.has(row.metric)) continue;
        const parsed = parseNumeric(row.value);
        if (parsed == null) continue;

        result.set(row.metric, {
          symbol,
          metric: row.metric,
          value: parsed,
          unit: row.unit ?? undefined,
          provider: 'SCREENER_IN',
          source: 'screener_scrape_facts',
          confidence: 0.55,
          fetchedAt: row.scraped_at ?? undefined,
          asOf,
          fromStore: 'screener',
        });
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] screener_scrape_facts query error:', e);
      }
    }

    return result;
  }

  /**
   * Source 9: Exchange live API cache.
   * Stub — returns empty map until the exchange_api_facts table is populated.
   * Expected columns: symbol, metric, value, unit, fetched_at.
   */
  private resolveFromExchangeApi(
    symbol: string,
    metrics: string[],
    asOf?: string
  ): Map<string, ResolvedFact> {
    const result = new Map<string, ResolvedFact>();
    if (metrics.length === 0) return result;

    try {
      const placeholders = metrics.map(() => '?').join(', ');
      const asOfCond = asOf ? 'AND (fetched_at IS NULL OR fetched_at <= ?)' : '';
      const params: unknown[] = [symbol, ...metrics];
      if (asOf) params.push(asOf);

      type ExRow = {
        metric: string;
        value: string | null;
        unit: string | null;
        fetched_at: string | null;
      };

      const rows = this.db.all(
        `SELECT metric, value, unit, fetched_at
         FROM exchange_api_facts
         WHERE symbol = ?
           AND metric IN (${placeholders})
           ${asOfCond}
         ORDER BY fetched_at DESC`,
        params
      ) as ExRow[];

      for (const row of rows || []) {
        if (result.has(row.metric)) continue;
        const parsed = parseNumeric(row.value);
        if (parsed == null) continue;

        result.set(row.metric, {
          symbol,
          metric: row.metric,
          value: parsed,
          unit: row.unit ?? undefined,
          provider: 'EXCHANGE_API',
          source: 'exchange_api_facts',
          confidence: 0.65,
          fetchedAt: row.fetched_at ?? undefined,
          asOf,
          fromStore: 'exchange_api',
        });
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] exchange_api_facts query error:', e);
      }
    }

    return result;
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Queries all 9 sources for the given metrics and returns a snapshot map:
   *   sourceId → (metric → ResolvedFact)
   *
   * company_facts rows are split by confidence so that 'company_facts_primary'
   * (confidence 1.0) and 'company_facts' (all rows, including 0.7) are
   * independently addressable in the per-metric waterfall.
   */
  private queryAllSources(
    symbol: string,
    metrics: string[],
    asOf?: string
  ): Map<string, Map<string, ResolvedFact>> {
    const all = new Map<string, Map<string, ResolvedFact>>();

    const cfAll = this.resolveFromCompanyFacts(symbol, metrics, asOf);

    // Split into primary-only and all-company-facts views
    const cfPrimary = new Map<string, ResolvedFact>();
    for (const [m, fact] of cfAll) {
      if (fact.confidence >= 1.0) cfPrimary.set(m, fact);
    }

    all.set('company_facts_primary', cfPrimary);
    all.set('company_facts', cfAll);
    all.set('trendlyne', this.resolveFromTrendlyneMirror(symbol, metrics, asOf));
    all.set('canonical_fact_store', this.resolveFromCanonicalFactStore(symbol, metrics, asOf));
    all.set('historical_statements', this.resolveFromHistoricalStatements(symbol, metrics, asOf));
    all.set('fundamental_snapshots', this.resolveFromFundamentalSnapshots(symbol, metrics, asOf));
    all.set('bse_xbrl', this.resolveFromBseXbrl(symbol, metrics, asOf));
    all.set('screener', this.resolveFromScreener(symbol, metrics, asOf));
    all.set('exchange_api', this.resolveFromExchangeApi(symbol, metrics, asOf));

    return all;
  }

  private merge(
    base: Map<string, ResolvedFact>,
    overlay: Map<string, ResolvedFact>
  ): Map<string, ResolvedFact> {
    // base already holds the highest-priority entries; only fill gaps
    for (const [metric, fact] of overlay.entries()) {
      if (!base.has(metric)) {
        base.set(metric, fact);
      }
    }
    return base;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Resolve a single metric for a symbol using the field-specific waterfall.
   * The source order is determined by METRIC_SOURCE_PRIORITY[metric], falling
   * back to DEFAULT_SOURCE_ORDER for unmapped metrics.
   *
   * Backward-compatible: same signature and return type as before.
   */
  resolve(symbol: string, metric: string, asOf?: string): ResolvedFact | null {
    const canonical = normaliseMetric(metric);
    const result = this.resolveMany(symbol, [canonical], asOf);
    return result.get(canonical) ?? null;
  }

  /**
   * Resolve multiple metrics at once with field-specific waterfall ordering.
   * Each metric is resolved using its own preferred source order from
   * METRIC_SOURCE_PRIORITY, or DEFAULT_SOURCE_ORDER if not mapped.
   *
   * Backward-compatible: same signature and return type as before.
   */
  resolveMany(symbol: string, metrics: string[], asOf?: string): Map<string, ResolvedFact> {
    const canonical = metrics.map(normaliseMetric);
    const allSources = this.queryAllSources(symbol, canonical, asOf);
    const result = new Map<string, ResolvedFact>();

    for (const metric of canonical) {
      const order = METRIC_SOURCE_PRIORITY[metric] ?? DEFAULT_SOURCE_ORDER;
      for (const sourceId of order) {
        const fact = allSources.get(sourceId)?.get(metric);
        if (fact != null) {
          result.set(metric, fact);
          break;
        }
      }
    }

    return result;
  }

  /**
   * Like resolve(), but also returns which sources were tried and which
   * source actually supplied the value.
   *
   * @returns ResolvedFactWithTrace including triedSources (all source IDs
   *          consulted for this metric, in priority order), or null if no
   *          source has the value.
   */
  resolveWithTrace(
    symbol: string,
    metric: string,
    asOf?: string
  ): ResolvedFactWithTrace | null {
    const canonical = normaliseMetric(metric);
    const allSources = this.queryAllSources(symbol, [canonical], asOf);
    const order = METRIC_SOURCE_PRIORITY[canonical] ?? DEFAULT_SOURCE_ORDER;

    const triedSources: string[] = [];
    for (const sourceId of order) {
      triedSources.push(sourceId);
      const fact = allSources.get(sourceId)?.get(canonical);
      if (fact != null) {
        return { ...fact, triedSources };
      }
    }

    return null;
  }

  /**
   * Resolve all available metrics for a symbol across all stores,
   * returning a map of metric → best fact.
   *
   * Uses default source ordering (company_facts first) since no specific
   * metric list is known upfront.
   */
  resolveAll(symbol: string, asOf?: string): Map<string, ResolvedFact> {
    const accumulated = new Map<string, ResolvedFact>();

    // Fetch all metrics for each store with a wildcard query
    // company_facts — all rows for symbol
    try {
      type CfAllRow = {
        metric: string;
        value: string | null;
        unit: string | null;
        periodType: string | null;
        periodEnd: string | null;
        scope: string | null;
        provider: string | null;
        fetchedAt: string | null;
        asOfDate: string | null;
        verificationStatus: string | null;
        sourceType: string | null;
      };

      const asOfCond = asOf ? 'AND (cf.asOfDate IS NULL OR cf.asOfDate <= ?)' : '';
      const params: unknown[] = [symbol];
      if (asOf) params.push(asOf);

      const rows = this.db.all(
        `SELECT cf.metric, cf.value, cf.unit, cf.periodType, cf.periodEnd,
                cf.scope, cf.provider, cf.fetchedAt, cf.asOfDate,
                cf.verificationStatus, cf.sourceType
         FROM company_facts cf
         WHERE cf.symbol = ?
           AND cf.availabilityStatus = 'AVAILABLE'
           ${asOfCond}
         ORDER BY
           CASE WHEN cf.verificationStatus IN ('VERIFIED','SECONDARY_VERIFIED')
                     AND cf.sourceType IN ('PRIMARY_FILING','STATUTORY_FILING','EXCHANGE_FILING')
                THEN 0 ELSE 1 END ASC,
           cf.fetchedAt DESC`,
        params
      ) as CfAllRow[];

      for (const row of rows || []) {
        if (accumulated.has(row.metric)) continue;
        const parsed = parseNumeric(row.value);
        if (parsed == null) continue;

        const isPrimary =
          ['VERIFIED', 'SECONDARY_VERIFIED'].includes(row.verificationStatus ?? '') &&
          ['PRIMARY_FILING', 'STATUTORY_FILING', 'EXCHANGE_FILING'].includes(row.sourceType ?? '');

        accumulated.set(row.metric, {
          symbol,
          metric: row.metric,
          value: parsed,
          unit: row.unit ?? undefined,
          periodType: row.periodType ?? undefined,
          periodEnd: row.periodEnd ?? undefined,
          scope: row.scope ?? undefined,
          provider: row.provider ?? 'company_facts',
          source: 'company_facts',
          confidence: isPrimary ? 1.0 : 0.7,
          fetchedAt: row.fetchedAt ?? undefined,
          asOf: row.asOfDate ?? asOf,
          fromStore: 'company_facts',
        });
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] resolveAll company_facts error:', e);
      }
    }

    // canonical_fact_store — all rows for symbol
    try {
      type CfsAllRow = {
        field: string;
        value: string | null;
        source: string | null;
        confidence: number | null;
        fetched_at: string | null;
        ttl_seconds: number | null;
      };

      const asOfCond = asOf ? 'AND (fetched_at IS NULL OR fetched_at <= ?)' : '';
      const params: unknown[] = [symbol];
      if (asOf) params.push(asOf);

      const rows = this.db.all(
        `SELECT field, value, source, confidence, fetched_at, ttl_seconds
         FROM canonical_fact_store
         WHERE symbol = ? ${asOfCond}
         ORDER BY confidence DESC, fetched_at DESC`,
        params
      ) as CfsAllRow[];

      for (const row of rows || []) {
        // Map stored field names to logical metric names
        const logicalMetric = CANONICAL_FACT_STORE_FIELD_MAP.get(row.field) ?? row.field;
        if (accumulated.has(logicalMetric)) continue;

        const parsed = parseNumeric(row.value);
        if (parsed == null) continue;

        if (row.fetched_at && row.ttl_seconds) {
          const fetchedMs = new Date(row.fetched_at).getTime();
          if (!Number.isNaN(fetchedMs) && Date.now() > fetchedMs + row.ttl_seconds * 1000) continue;
        }

        accumulated.set(logicalMetric, {
          symbol,
          metric: logicalMetric,
          value: parsed,
          provider: row.source ?? 'canonical_fact_store',
          source: 'canonical_fact_store',
          confidence: row.confidence ?? 0.5,
          fetchedAt: row.fetched_at ?? undefined,
          asOf,
          fromStore: 'canonical_fact_store',
        });
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] resolveAll canonical_fact_store error:', e);
      }
    }

    // trendlyne_mirror — all AVAILABLE rows for symbol
    try {
      type TmAllRow = {
        canonicalMetric: string | null;
        rawValue: string | null;
        rawUnit: string | null;
        periodType: string | null;
        relativePeriod: string | null;
        scope: string | null;
        providerAsOf: string | null;
        firstSeenAt: string | null;
      };

      const asOfCond = asOf ? 'AND (providerAsOf IS NULL OR providerAsOf <= ?)' : '';
      const params: unknown[] = [symbol];
      if (asOf) params.push(asOf);

      const rows = this.db.all(
        `SELECT canonicalMetric, rawValue, rawUnit, periodType, relativePeriod,
                scope, providerAsOf, firstSeenAt
         FROM trendlyne_mirror_observations
         WHERE symbol = ? AND status = 'AVAILABLE' ${asOfCond}
         ORDER BY lastSeenAt DESC`,
        params
      ) as TmAllRow[];

      for (const row of rows || []) {
        const metric = row.canonicalMetric;
        if (!metric || accumulated.has(metric)) continue;

        const parsed = parseNumeric(row.rawValue);
        if (parsed == null) continue;

        accumulated.set(metric, {
          symbol,
          metric,
          value: parsed,
          unit: row.rawUnit ?? undefined,
          periodType: row.periodType ?? undefined,
          periodEnd: row.relativePeriod ?? undefined,
          scope: row.scope ?? undefined,
          provider: 'TRENDLYNE',
          source: 'trendlyne_mirror_observations',
          confidence: 0.6,
          fetchedAt: row.firstSeenAt ?? undefined,
          asOf: row.providerAsOf ?? asOf,
          fromStore: 'trendlyne_mirror',
        });
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] resolveAll trendlyne_mirror error:', e);
      }
    }

    // FundamentalSnapshots — latest snapshot for symbol
    try {
      type FsAllRow = {
        snapshot_date: string;
        pe_ratio: number | null;
        roce_pct: number | null;
        debt_to_equity: number | null;
        operating_margin_pct: number | null;
        market_cap_cr: number | null;
        source: string | null;
      };

      const asOfCond = asOf ? 'AND snapshot_date <= ?' : '';
      const params: unknown[] = [symbol];
      if (asOf) params.push(asOf);

      const row = this.db.get(
        `SELECT snapshot_date, pe_ratio, roce_pct, debt_to_equity,
                operating_margin_pct, market_cap_cr, source
         FROM FundamentalSnapshots
         WHERE symbol = ? ${asOfCond}
         ORDER BY snapshot_date DESC LIMIT 1`,
        params
      ) as FsAllRow | undefined;

      if (row) {
        const SNAPSHOT_METRICS: Array<[string, string]> = [
          ['pe_ratio', 'pe_ratio'],
          ['roce_pct', 'roce_trailing_pct'],
          ['debt_to_equity', 'debt_to_equity'],
          ['operating_margin_pct', 'operating_margin_pct'],
          ['market_cap_cr', 'market_cap_cr'],
        ];

        for (const [col, logicalMetric] of SNAPSHOT_METRICS) {
          if (accumulated.has(logicalMetric)) continue;
          const val = (row as any)[col];
          const parsed = parseNumeric(val);
          if (parsed == null) continue;

          accumulated.set(logicalMetric, {
            symbol,
            metric: logicalMetric,
            value: parsed,
            provider: row.source ?? 'FundamentalSnapshots',
            source: 'FundamentalSnapshots',
            confidence: 0.4,
            asOf: row.snapshot_date,
            fromStore: 'fundamental_snapshot',
          });
        }
      }
    } catch (e) {
      if (!isTableMissingError(e)) {
        console.warn('[CanonicalFactResolver] resolveAll FundamentalSnapshots error:', e);
      }
    }

    return accumulated;
  }
}
