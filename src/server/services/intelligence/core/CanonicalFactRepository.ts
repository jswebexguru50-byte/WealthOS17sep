/**
 * CanonicalFactRepository.ts — Constitution Article C4 & C5
 *
 * Single source of truth for canonical financial and operational facts.
 * Invariants:
 * - PIT gate:
 *   STRICT mode: availableAt IS NOT NULL AND availableAt <= asOfDate (historical replay).
 *   ALLOW_INFERRED mode: also admits rows with NULL availableAt when asOfDate IS NOT NULL (current analysis).
 * - No fabricated enum casts (no `as any` for EvidenceRef fields).
 * - No synthetic current-timestamp for unknown document/availability metadata.
 */

import { getDB, dbAll } from '../../../database.js';
import { CanonicalFact, FactVerificationStatus } from '../contracts/CanonicalFact.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import {
  EvidenceRef,
  EvidenceDocSourceType,
  EvidenceExtractionMethod,
  PitStatus,
} from '../contracts/EvidenceRef.js';

export type PitMode = 'STRICT' | 'ALLOW_INFERRED';

export interface FactQueryOptions {
  periodType?: 'ANNUAL' | 'QUARTERLY' | 'TTM' | 'POINT_IN_TIME';
  asOfDate?: string | null;
  consolidatedOrStandalone?: 'CONSOLIDATED' | 'STANDALONE' | 'SEGMENT';
  pitMode?: PitMode;
}

function mapEvidenceSourceType(raw: string | null | undefined): EvidenceDocSourceType {
  switch (raw) {
    case 'EXCHANGE_FILING':             return 'EXCHANGE_FILING';
    case 'ANNUAL_REPORT':               return 'ANNUAL_REPORT';
    case 'EARNINGS_TRANSCRIPT':         return 'EARNINGS_TRANSCRIPT';
    case 'INVESTOR_PRESENTATION':       return 'INVESTOR_PRESENTATION';
    case 'PRICE_RECORD':                return 'PRICE_RECORD';
    case 'REGULATORY_DISCLOSURE':       return 'REGULATORY_DISCLOSURE';
    case 'CORPORATE_ACTION':            return 'CORPORATE_ACTION';
    case 'AUDITED_FINANCIAL_STATEMENT': return 'AUDITED_FINANCIAL_STATEMENT';
    case 'CREDIT_RATING_REPORT':        return 'CREDIT_RATING_REPORT';
    case 'SHAREHOLDING_DISCLOSURE':     return 'SHAREHOLDING_DISCLOSURE';
    default:                            return 'OTHER';
  }
}

function mapExtractionMethod(raw: string | null | undefined): EvidenceExtractionMethod {
  switch (raw) {
    case 'MANUAL_AUDITED':           return 'MANUAL_AUDITED';
    case 'STRUCTURED_XBRL':         return 'STRUCTURED_XBRL';
    case 'PARSED_REGEX':             return 'PARSED_REGEX';
    case 'LLM_EXTRACTED_VERIFIED':  return 'LLM_EXTRACTED_VERIFIED';
    case 'DIRECT_EXCHANGE_FEED':    return 'DIRECT_EXCHANGE_FEED';
    default:                         return 'STRUCTURED_XBRL';
  }
}

export class CanonicalFactRepository {
  private static instance: CanonicalFactRepository;
  private constructor() {}

  public static getInstance(): CanonicalFactRepository {
    if (!CanonicalFactRepository.instance) {
      CanonicalFactRepository.instance = new CanonicalFactRepository();
    }
    return CanonicalFactRepository.instance;
  }

  public async getFactsForSecurity(
    identity: SecurityIdentity,
    options: FactQueryOptions = {}
  ): Promise<CanonicalFact[]> {
    const db = getDB();
    if (!db) return [];

    const effectiveAsOf = options.asOfDate || new Date().toISOString().split('T')[0];
    const isin = identity.isin || '';
    const symbol = identity.nseSymbol || identity.bseCode || '';
    const pitMode: PitMode = options.pitMode || 'ALLOW_INFERRED';

    const pitClause = pitMode === 'STRICT'
      ? `availableAt IS NOT NULL AND availableAt <= ?`
      : `(availableAt IS NOT NULL AND availableAt <= ?) OR (availableAt IS NULL AND asOfDate IS NOT NULL AND asOfDate <= ?)`;
    const pitParams: any[] = pitMode === 'STRICT' ? [effectiveAsOf] : [effectiveAsOf, effectiveAsOf];

    let sql = `SELECT * FROM company_facts WHERE (isin = ? OR symbol = ?) AND (${pitClause})`;
    const params: any[] = [isin, symbol, ...pitParams];

    if (options.periodType) { sql += ` AND periodType = ?`; params.push(options.periodType); }
    if (options.consolidatedOrStandalone) { sql += ` AND scope = ?`; params.push(options.consolidatedOrStandalone); }
    sql += ` ORDER BY periodEnd DESC, availableAt DESC`;

    try {
      const rows = await dbAll<any>(db, sql, params);
      return rows.map(r => this.mapRowToFact(r));
    } catch (err) {
      console.error(`[CanonicalFactRepository] Failed to fetch facts for ${identity.isin}:`, err);
      return [];
    }
  }

  public async getLatestFactsByMetric(
    identity: SecurityIdentity,
    asOfDate?: string | null,
    pitMode?: PitMode
  ): Promise<Record<string, CanonicalFact>> {
    const facts = await this.getFactsForSecurity(identity, { asOfDate, pitMode });
    const latestByMetric: Record<string, CanonicalFact> = {};
    for (const fact of facts) {
      const key = fact.metric.toLowerCase();
      if (!latestByMetric[key]) latestByMetric[key] = fact;
    }
    return latestByMetric;
  }

  public async getHistoricalSeries(
    identity: SecurityIdentity,
    metric: string,
    asOfDate?: string | null,
    pitMode: PitMode = 'STRICT'
  ): Promise<CanonicalFact[]> {
    const db = getDB();
    if (!db) return [];

    const effectiveAsOf = asOfDate || new Date().toISOString().split('T')[0];
    const isin = identity.isin || '';
    const symbol = identity.nseSymbol || identity.bseCode || '';

    const pitClause = pitMode === 'STRICT'
      ? `availableAt IS NOT NULL AND availableAt <= ?`
      : `(availableAt IS NOT NULL AND availableAt <= ?) OR (availableAt IS NULL AND asOfDate IS NOT NULL AND asOfDate <= ?)`;
    const pitParams: any[] = pitMode === 'STRICT' ? [effectiveAsOf] : [effectiveAsOf, effectiveAsOf];

    const sql = `SELECT * FROM company_facts WHERE (isin = ? OR symbol = ?) AND metric = ? AND (${pitClause}) ORDER BY periodEnd ASC`;

    try {
      const rows = await dbAll<any>(db, sql, [isin, symbol, metric, ...pitParams]);
      return rows.map(r => this.mapRowToFact(r));
    } catch (err) {
      console.error(`[CanonicalFactRepository] Failed historical series query for ${metric}:`, err);
      return [];
    }
  }

  public async resolveEvidenceRefs(factIds: string[]): Promise<EvidenceRef[]> {
    if (!factIds || factIds.length === 0) return [];
    const db = getDB();
    if (!db) return [];

    const placeholders = factIds.map(() => '?').join(',');
    const sql = `SELECT factId, isin, symbol, metric, periodEnd, sourceDocumentId, sourceUrl,
                        reportedAt, availableAt, asOfDate, evidenceText, sourceType, calculationMethod
                 FROM company_facts WHERE factId IN (${placeholders})`;

    try {
      const rows = await dbAll<any>(db, sql, factIds);
      return rows.map(r => {
        const rawAvailAt: string | null = r.availableAt || null;
        const rawDocDate: string | null = r.reportedAt || r.periodEnd || null;
        let availableAt: string | null;
        let pitStatus: PitStatus;
        if (rawAvailAt) { availableAt = rawAvailAt; pitStatus = 'PIT_VERIFIED'; }
        else if (rawDocDate) { availableAt = rawDocDate; pitStatus = 'PIT_INFERRED'; }
        else { availableAt = null; pitStatus = 'PIT_UNKNOWN'; }
        const ref: EvidenceRef = {
          evidenceId: `fact_ev_${r.factId}`,
          sourceType: mapEvidenceSourceType(r.sourceType),
          sourceName: r.sourceDocumentId || `${r.symbol} ${r.metric}`,
          sourceUrl: r.sourceUrl || null,
          documentDate: rawDocDate || null,   // null = genuinely unknown — do NOT fabricate today
          availableAt,
          pitStatus,
          periodEnd: r.periodEnd || null,
          quote: r.evidenceText || null,
          extractionMethod: mapExtractionMethod(r.calculationMethod),
        };
        return ref;
      });
    } catch (err) {
      console.error('[CanonicalFactRepository] resolveEvidenceRefs failed:', err);
      return [];
    }
  }

  private mapRowToFact(row: any): CanonicalFact {
    const isin = row.isin || '';
    const numVal = isNaN(Number(row.value)) ? row.value : parseFloat(row.value);
    const metric = row.metric || '';
    const periodEnd: string | null = row.periodEnd || null;

    const rawAvailAt: string | null = row.availableAt || null;
    const rawDocDate: string | null = row.publishedAt || row.reportedAt || row.asOfDate || null;
    let availableAt: string | null;
    let pitStatus: PitStatus;
    if (rawAvailAt) { availableAt = rawAvailAt; pitStatus = 'PIT_VERIFIED'; }
    else if (rawDocDate) { availableAt = rawDocDate; pitStatus = 'PIT_INFERRED'; }
    else { availableAt = null; pitStatus = 'PIT_UNKNOWN'; }

    const verificationStatus: FactVerificationStatus =
      (row.verificationStatus as FactVerificationStatus) || 'SOURCE_LINKED';

    const evidenceRef: EvidenceRef = {
      evidenceId: `fact_ev_${row.factId || `${isin}_${metric}_${periodEnd}`}`,
      sourceType: mapEvidenceSourceType(row.sourceType),
      sourceName: row.sourceDocumentId || row.provider || 'Statutory Disclosure',
      sourceUrl: row.sourceUrl || null,
      documentDate: rawDocDate || null,   // null = genuinely unknown — do NOT fabricate today
      availableAt,
      pitStatus,
      periodStart: row.periodStart || null,
      periodEnd: periodEnd || null,
      quote: row.evidenceText || null,
      extractionMethod: mapExtractionMethod(row.calculationMethod),
    };

    return {
      factId: row.factId || `${isin}_${metric}_${periodEnd}`,
      securityId: row.companyId || isin,
      isin,
      metric,
      metricKey: metric,
      value: numVal,
      unit: row.unit || null,
      currency: row.currency || 'INR',
      scale: row.scope === 'CONSOLIDATED' ? 'CRORE' : 'UNIT',
      periodType: (row.periodType as any) || 'ANNUAL',
      periodStart: row.periodStart || null,
      periodEnd,
      period: periodEnd || 'LATEST',
      fiscalYear: periodEnd ? parseInt(periodEnd.substring(0, 4), 10) : null,
      fiscalQuarter: row.periodType === 'QUARTERLY' && periodEnd ? this.getQuarterFromDate(periodEnd) : null,
      consolidatedOrStandalone: (row.scope as any) || 'CONSOLIDATED',
      sourceId: row.sourceDocumentId || row.provider || 'company_facts',
      source: row.provider || 'company_facts',
      evidenceRef,
      evidence: [{
        evidenceId: evidenceRef.evidenceId,
        sourceType: 'CANONICAL_FACT' as const,
        sourceId: row.sourceDocumentId || row.factId || `${isin}_${metric}`,
        timestamp: availableAt || rawDocDate || null,   // null = unknown — do NOT fabricate
        field: metric,
        asOfDate: availableAt || rawDocDate || null,
      }],
      publishedAt: rawDocDate || null,
      availableAt: availableAt || null,
      ingestedAt: row.fetchedAt || null,
      verificationStatus,
      derivationFormula: row.derivationFormula || null,
      inputFactIds: row.inputFactIds ? JSON.parse(row.inputFactIds) : undefined,
    };
  }

  private getQuarterFromDate(dateStr: string): number {
    const month = parseInt(dateStr.substring(5, 7), 10);
    if (month >= 4 && month <= 6) return 1;
    if (month >= 7 && month <= 9) return 2;
    if (month >= 10 && month <= 12) return 3;
    return 4;
  }
}
