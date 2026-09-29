import {
  DataStatus,
  FreshnessStatus,
  FactEnvelope,
  EvidenceReference,
  TruthQuality,
} from './contracts/index.js';
import { evidenceSourceTypeForProvider } from './contracts/Provenance.js';
import { SecurityIdentityRegistry, SecurityIdentityRecord } from '../dataAcquisition/SecurityIdentityRegistry.js';
import { DuckDbAdjustedOhlcvService, AdjustedOhlcvBar } from '../DuckDbAdjustedOhlcvService.js';
import { readFereEvidence, FereEvidenceSummary } from '../FereEvidenceService.js';
import { classifySectorMomentum, SectorMomentumSnapshot } from '../SectorMomentumService.js';
import { SectorFlowService, SectorFlowSnapshot } from '../SectorFlowService.js';
import { getDB, dbAll, dbGet } from '../../database.js';

export interface FactQueryOptions {
  periodType?: string;
  periodEnd?: string;
  scope?: string;
  asOfDate?: string;
}

export class AnalysisEvidenceRepository {
  private static instance: AnalysisEvidenceRepository;
  private identityRegistry: SecurityIdentityRegistry;

  private constructor() {
    this.identityRegistry = SecurityIdentityRegistry.getInstance();
  }

  public static getInstance(): AnalysisEvidenceRepository {
    if (!AnalysisEvidenceRepository.instance) {
      AnalysisEvidenceRepository.instance = new AnalysisEvidenceRepository();
    }
    return AnalysisEvidenceRepository.instance;
  }

  /**
   * Retrieves a single canonical fact envelope for a given security and metric.
   * Reads from company_facts, fundamental snapshots, and primary evidence stores.
   * Never fabricates values or falls back to synthetic hardcoded constants.
   */
  public async getFact<T = any>(
    identifier: string,
    metric: string,
    options: FactQueryOptions = {}
  ): Promise<FactEnvelope<T>> {
    const emptyResult = (status: DataStatus, missingReason: string, securityId: string | null = null): FactEnvelope<T> => ({
      value: null,
      status,
      securityId,
      metric,
      periodType: options.periodType || null,
      periodEnd: options.periodEnd || null,
      scope: options.scope || null,
      provenance: [],
      freshness: 'UNKNOWN',
      missingReason,
    });

    if (!identifier) {
      return emptyResult('DATA_INSUFFICIENT', 'No identifier provided');
    }

    // 1. Resolve security identity
    const resolution = await this.identityRegistry.resolveSecurityIdAsync(identifier);
    if (resolution.status === 'IDENTITY_REVIEW') {
      return emptyResult('IDENTITY_REVIEW', `Security identity unmapped: ${resolution.reason}`);
    }

    const securityId = resolution.securityId;
    const record = resolution.record;
    const isin = record?.isin || (securityId.startsWith('INE') || securityId.startsWith('INF') ? securityId : null);
    const symbol = record?.nseSymbol || record?.currentSymbol || identifier.toUpperCase();

    const db = getDB();
    if (!db) {
      return emptyResult('SOURCE_UNAVAILABLE', 'Primary database connection unavailable', securityId);
    }

    try {
      // 2. Query canonical company_facts
      let sql = `
        SELECT factId, companyId, symbol, isin, metric, value, unit, currency,
               periodType, periodEnd, asOfDate, factType, sourceType, scope,
               provider, verificationStatus, fetchedAt, availabilityStatus,
               sourceDocumentId, providerToken, exactProviderLabel
        FROM company_facts
        WHERE (symbol = ? OR isin = ? OR companyId = ? OR companyId = ?)
          AND metric = ?
      `;
      const params: any[] = [symbol, isin || symbol, securityId, symbol, metric];

      if (options.periodType) {
        sql += ` AND periodType = ?`;
        params.push(options.periodType);
      }
      if (options.periodEnd) {
        sql += ` AND periodEnd = ?`;
        params.push(options.periodEnd);
      }
      if (options.scope) {
        sql += ` AND scope = ?`;
        params.push(options.scope);
      }
      if (options.asOfDate) {
        // Enforce Point-In-Time (PIT) boundary: availableAt / asOfDate must be <= requested asOfDate
        sql += ` AND (
          (asOfDate IS NOT NULL AND asOfDate <= ?) OR
          (asOfDate IS NULL AND (periodEnd <= ? OR fetchedAt <= ?))
        )`;
        params.push(options.asOfDate, options.asOfDate, options.asOfDate);
      }

      sql += ` ORDER BY COALESCE(asOfDate, fetchedAt) DESC, periodEnd DESC LIMIT 1`;

      const rows = await dbAll<any>(db, sql, params);

      if (rows && rows.length > 0) {
        const row = rows[0];

        // Check if provider returned explicit missing/unavailable status
        if (
          row.factType === 'MISSING' ||
          row.availabilityStatus === 'UNAVAILABLE_FROM_PROVIDER' ||
          row.availabilityStatus === 'REQUESTED_NOT_RETURNED' ||
          row.availabilityStatus === 'INSUFFICIENT_DATA'
        ) {
          return {
            value: null,
            status: 'SOURCE_UNAVAILABLE',
            securityId,
            metric,
            periodType: row.periodType,
            periodEnd: row.periodEnd,
            scope: row.scope,
            provenance: [{
              evidenceId: row.factId,
              sourceType: 'CANONICAL_FACT',
              sourceId: row.sourceDocumentId || row.factId,
              timestamp: row.fetchedAt || new Date().toISOString(),
              field: row.metric,
              asOfDate: row.asOfDate,
              notes: row.availabilityStatus,
            }],
            freshness: this.evaluateFreshness(row.fetchedAt),
            missingReason: `Metric marked ${row.availabilityStatus} in canonical facts repository`,
            truthQuality: 'RAW_PROVIDER',
            informationDate: row.asOfDate || row.periodEnd || null,
            availableAt: row.fetchedAt || row.asOfDate || null,
          };
        }

        const rawVal = row.value;
        let parsedVal: any = rawVal;
        if (typeof rawVal === 'string' && rawVal !== '') {
          const num = Number(rawVal);
          parsedVal = isNaN(num) ? rawVal : num;
        }

        const evidenceRef: EvidenceReference = {
          evidenceId: row.factId,
          sourceType: 'CANONICAL_FACT',
          sourceId: row.sourceDocumentId || row.factId,
          timestamp: row.fetchedAt || new Date().toISOString(),
          field: row.metric,
          asOfDate: row.asOfDate,
          confidence: row.verificationStatus === 'SECONDARY_VERIFIED' ? 0.95 : 0.8,
          notes: row.exactProviderLabel ? `Label: ${row.exactProviderLabel}` : undefined,
        };

        const status: DataStatus = row.verificationStatus === 'SECONDARY_VERIFIED' ? 'VERIFIED' : 'PARTIAL';
        const truthQuality: TruthQuality =
          row.verificationStatus === 'SECONDARY_VERIFIED' ? 'CROSS_SOURCE_VERIFIED'
          : row.verificationStatus === 'PRIMARY_VERIFIED' ? 'PRIMARY_SOURCE_VERIFIED'
          : row.verificationStatus === 'CANONICAL_INDEXED' ? 'CANONICAL_MAPPED'
          : 'PARSED';

        return {
          value: parsedVal as T,
          status,
          securityId,
          metric: row.metric,
          periodType: row.periodType,
          periodEnd: row.periodEnd,
          scope: row.scope,
          provenance: [evidenceRef],
          freshness: this.evaluateFreshness(row.fetchedAt),
          missingReason: null,
          truthQuality,
          informationDate: row.asOfDate || row.periodEnd || null,
          availableAt: row.fetchedAt || row.asOfDate || null,
        };
      }

      // 3. Fallback check: raw fundamental_endpoint_snapshots
      let snapSql = `
        SELECT symbol, isin, provider, endpoint, fetched_at, response_json
        FROM fundamental_endpoint_snapshots
        WHERE (symbol = ? OR isin = ?)
      `;
      const snapParams: any[] = [symbol, isin || symbol];
      if (options.asOfDate) {
        snapSql += ` AND fetched_at <= ?`;
        snapParams.push(options.asOfDate);
      }
      snapSql += ` ORDER BY fetched_at DESC LIMIT 1`;

      const snapRows = await dbAll<any>(db, snapSql, snapParams);
      if (snapRows && snapRows.length > 0) {
        const snap = snapRows[0];
        const snapId = `SNAP_${snap.provider || 'TRENDLYNE'}_${snap.symbol}_${snap.fetched_at}`;
        return {
          value: null,
          status: 'PARTIAL',
          securityId,
          metric,
          periodType: options.periodType || null,
          periodEnd: options.periodEnd || null,
          scope: options.scope || null,
          provenance: [{
            evidenceId: snapId,
            sourceType: evidenceSourceTypeForProvider(snap.provider),
            sourceId: `${snap.provider || 'TRENDLYNE'}:${snap.endpoint || 'parameters'}:${snap.symbol}`,
            timestamp: snap.fetched_at,
            field: metric,
            notes: 'Raw snapshot available but metric not yet indexed in canonical company_facts',
          }],
          freshness: this.evaluateFreshness(snap.fetched_at),
          missingReason: 'Metric exists in raw snapshot but awaiting canonical indexing',
          truthQuality: 'RAW_PROVIDER',
          informationDate: snap.fetched_at,
          availableAt: snap.fetched_at,
        };
      }

      return emptyResult('DATA_INSUFFICIENT', `No canonical fact or snapshot registered for metric '${metric}'`, securityId);
    } catch (err: any) {
      return emptyResult('ERROR', `Error querying canonical evidence repository: ${err.message}`, securityId);
    }
  }

  /**
   * Retrieves multiple facts in batch for efficiency.
   */
  public async getBatchFacts(
    identifier: string,
    metrics: string[],
    options: FactQueryOptions = {}
  ): Promise<Record<string, FactEnvelope<any>>> {
    const results: Record<string, FactEnvelope<any>> = {};
    for (const metric of metrics) {
      results[metric] = await this.getFact(identifier, metric, options);
    }
    return results;
  }

  /**
   * Retrieves verified FERE evidence (filings, XBRL facts, management commitments).
   */
  public async getFereEvidence(identifier: string): Promise<{
    summary: FereEvidenceSummary | null;
    status: DataStatus;
    provenance: EvidenceReference[];
  }> {
    const resolution = await this.identityRegistry.resolveSecurityIdAsync(identifier);
    if (resolution.status === 'IDENTITY_REVIEW') {
      return {
        summary: null,
        status: 'IDENTITY_REVIEW',
        provenance: [],
      };
    }

    const record = resolution.record;
    const isin = record?.isin || (resolution.securityId.startsWith('INE') ? resolution.securityId : null);
    const symbol = record?.nseSymbol || record?.currentSymbol || identifier.toUpperCase();

    const summary = await readFereEvidence(isin, symbol);
    if (!summary || summary.status === 'SOURCE_UNAVAILABLE') {
      return {
        summary: summary || null,
        status: 'SOURCE_UNAVAILABLE',
        provenance: [],
      };
    }

    const provenance: EvidenceReference[] = (summary.documents || []).map((doc, idx) => ({
      evidenceId: `FERE_DOC_${symbol}_${idx}`,
      sourceType: 'FERE_FILING',
      sourceId: doc.sha256 || doc.sourceUrl || `FERE_${symbol}_${idx}`,
      timestamp: doc.filingTimestamp || new Date().toISOString(),
      uri: doc.sourceUrl,
      notes: `Scope: ${doc.scope || 'N/A'}, Status: ${doc.status}`,
    }));

    const status: DataStatus = summary.verifiedFactCount > 0 ? 'VERIFIED' : 'DATA_INSUFFICIENT';

    return {
      summary,
      status,
      provenance,
    };
  }

  /**
   * Retrieves adjusted OHLCV bars from DuckDB or fallback with full provenance.
   */
  public async getAdjustedOhlcv(
    identifier: string,
    limit: number = 250,
    asOfDate?: string
  ): Promise<{
    bars: AdjustedOhlcvBar[];
    status: DataStatus;
    provenance: EvidenceReference[];
  }> {
    const resolution = await this.identityRegistry.resolveSecurityIdAsync(identifier);
    if (resolution.status === 'IDENTITY_REVIEW') {
      return {
        bars: [],
        status: 'IDENTITY_REVIEW',
        provenance: [],
      };
    }

    const record = resolution.record;
    const symbol = record?.nseSymbol || record?.currentSymbol || identifier.toUpperCase();

    try {
      // If asOfDate is specified, fetch sufficient bars and filter by trade_date <= asOfDate
      const fetchCount = asOfDate ? Math.max(limit * 2, 500) : limit;
      let bars = await DuckDbAdjustedOhlcvService.getDailyBars(symbol, fetchCount);
      if (asOfDate && bars && bars.length > 0) {
        bars = bars.filter(b => b.trade_date <= asOfDate);
        if (bars.length > limit) {
          bars = bars.slice(bars.length - limit);
        }
      }

      if (!bars || bars.length === 0) {
        return {
          bars: [],
          status: 'DATA_INSUFFICIENT',
          provenance: [],
        };
      }

      const provenance: EvidenceReference[] = [{
        evidenceId: `OHLCV_${symbol}_${bars[bars.length - 1]?.trade_date}`,
        sourceType: 'DUCKDB_OHLCV',
        sourceId: 'DUCKDB_ADJUSTED',
        timestamp: new Date().toISOString(),
        asOfDate: bars[bars.length - 1]?.trade_date,
        notes: `Returned ${bars.length} adjusted bars from source: DUCKDB_ADJUSTED${asOfDate ? ` (asOfDate <= ${asOfDate})` : ''}`,
      }];

      return {
        bars,
        status: 'VERIFIED',
        provenance,
      };
    } catch (e: any) {
      return {
        bars: [],
        status: 'ERROR',
        provenance: [{
          evidenceId: `OHLCV_ERR_${symbol}`,
          sourceType: 'DUCKDB_OHLCV',
          sourceId: 'ERROR',
          timestamp: new Date().toISOString(),
          notes: e.message,
        }],
      };
    }
  }

  /**
   * Retrieves sector momentum with explicit methodology and non-forecast provenance.
   */
  public async getSectorMomentum(
    identifier: string,
    sectorOverride?: string
  ): Promise<{
    snapshot: SectorMomentumSnapshot | null;
    status: DataStatus;
    provenance: EvidenceReference[];
  }> {
    const resolution = await this.identityRegistry.resolveSecurityIdAsync(identifier);
    const record = resolution.status === 'VERIFIED' ? resolution.record : undefined;
    const symbol = record?.nseSymbol || record?.currentSymbol || identifier.toUpperCase();

    let sectorName = sectorOverride;
    if (!sectorName) {
      const db = getDB();
      if (db) {
        const row = await dbGet<any>(db, `SELECT sector FROM MasterTickers WHERE symbol = ? OR id = ?`, [symbol, identifier]);
        if (row && row.sector) sectorName = row.sector;
      }
    }

    if (!sectorName) {
      return {
        snapshot: null,
        status: 'DATA_INSUFFICIENT',
        provenance: [],
      };
    }

    try {
      // Fetch index bars for this sector
      const dummySnapshot = classifySectorMomentum(sectorName, null);
      const indexSymbol = dummySnapshot.indexSymbol;

      let bars: AdjustedOhlcvBar[] = [];
      if (indexSymbol) {
        const indexBars = await DuckDbAdjustedOhlcvService.getDailyBars(indexSymbol, 60);
        bars = indexBars || [];
      }

      const snapshot = classifySectorMomentum(sectorName, bars);

      const provenance: EvidenceReference[] = [{
        evidenceId: `SECTOR_MOMENTUM_${sectorName}`,
        sourceType: 'SECTOR_SERVICE',
        sourceId: snapshot.indexSymbol || 'SECTOR_PROXY',
        timestamp: new Date().toISOString(),
        asOfDate: snapshot.asOf || undefined,
        notes: 'Sector momentum classified via 20-day EMA/SMA and return on sector index',
      }];

      return {
        snapshot,
        status: snapshot.status === 'UNAVAILABLE' ? 'SOURCE_UNAVAILABLE' : 'VERIFIED',
        provenance,
      };
    } catch {
      return {
        snapshot: null,
        status: 'SOURCE_UNAVAILABLE',
        provenance: [],
      };
    }
  }

  /**
   * Evaluates timestamp freshness against standard TTL (30 days for fundamentals).
   */
  private evaluateFreshness(fetchedAt?: string | null): FreshnessStatus {
    if (!fetchedAt) return 'UNKNOWN';
    const fetchTime = new Date(fetchedAt).getTime();
    if (isNaN(fetchTime)) return 'UNKNOWN';
    const ageDays = (Date.now() - fetchTime) / (1000 * 60 * 60 * 24);
    return ageDays <= 45 ? 'FRESH' : 'STALE';
  }
}
