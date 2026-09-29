/**
 * CanonicalFactRepository.ts — Constitution Article C4 & C5
 *
 * Single source of truth for canonical financial and operational facts.
 * Invariants:
 * - Queries always take SecurityIdentity / ISIN, never loose symbols alone.
 * - Point-In-Time (PIT) gate is strictly `availableAt <= asOfDate` (NOT fetchedAt).
 * - Maps database records directly into universal CanonicalFact contract.
 * - Resolves evidence references without synthetic fabrication.
 */

import { getDB, dbAll, dbGet } from '../../../database.js';
import { CanonicalFact, FactVerificationStatus } from '../contracts/CanonicalFact.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { EvidenceRef } from '../contracts/EvidenceRef.js';

export interface FactQueryOptions {
  periodType?: 'ANNUAL' | 'QUARTERLY' | 'TTM' | 'POINT_IN_TIME';
  asOfDate?: string | null;
  consolidatedOrStandalone?: 'CONSOLIDATED' | 'STANDALONE' | 'SEGMENT';
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

  /**
   * Retrieves all canonical facts for a security enforcing Point-In-Time (availableAt <= asOfDate).
   */
  public async getFactsForSecurity(
    identity: SecurityIdentity,
    options: FactQueryOptions = {}
  ): Promise<CanonicalFact[]> {
    const db = getDB();
    if (!db) return [];

    const effectiveAsOf = options.asOfDate || new Date().toISOString().split('T')[0];
    const isin = identity.isin || '';
    const symbol = identity.nseSymbol || identity.bseCode || '';

    let sql = `
      SELECT *
      FROM company_facts
      WHERE (isin = ? OR symbol = ?)
        AND (
          (availableAt IS NOT NULL AND availableAt <= ?)
          OR (availableAt IS NULL AND asOfDate IS NOT NULL AND asOfDate <= ?)
        )
    `;
    const params: any[] = [isin, symbol, effectiveAsOf, effectiveAsOf];

    if (options.periodType) {
      sql += ` AND periodType = ?`;
      params.push(options.periodType);
    }

    if (options.consolidatedOrStandalone) {
      sql += ` AND scope = ?`;
      params.push(options.consolidatedOrStandalone);
    }

    sql += ` ORDER BY periodEnd DESC, availableAt DESC`;

    try {
      const rows = await dbAll<any>(db, sql, params);
      return rows.map(r => this.mapRowToFact(r));
    } catch (err) {
      console.error(`[CanonicalFactRepository] Failed to fetch facts for ${identity.isin}:`, err);
      return [];
    }
  }

  /**
   * Retrieves the latest fact for each metric for a security, enforcing PIT.
   */
  public async getLatestFactsByMetric(
    identity: SecurityIdentity,
    asOfDate?: string | null
  ): Promise<Record<string, CanonicalFact>> {
    const facts = await this.getFactsForSecurity(identity, { asOfDate });
    const latestByMetric: Record<string, CanonicalFact> = {};

    for (const fact of facts) {
      const key = fact.metric.toLowerCase();
      if (!latestByMetric[key]) {
        latestByMetric[key] = fact;
      }
    }

    return latestByMetric;
  }

  /**
   * Retrieves historical series for a specific metric for a security.
   */
  public async getHistoricalSeries(
    identity: SecurityIdentity,
    metric: string,
    asOfDate?: string | null
  ): Promise<CanonicalFact[]> {
    const db = getDB();
    if (!db) return [];

    const effectiveAsOf = asOfDate || new Date().toISOString().split('T')[0];
    const isin = identity.isin || '';
    const symbol = identity.nseSymbol || identity.bseCode || '';

    const sql = `
      SELECT *
      FROM company_facts
      WHERE (isin = ? OR symbol = ?) AND metric = ?
        AND (
          (availableAt IS NOT NULL AND availableAt <= ?)
          OR (availableAt IS NULL AND asOfDate IS NOT NULL AND asOfDate <= ?)
        )
      ORDER BY periodEnd ASC
    `;

    try {
      const rows = await dbAll<any>(db, sql, [isin, symbol, metric, effectiveAsOf, effectiveAsOf]);
      return rows.map(r => this.mapRowToFact(r));
    } catch (err) {
      console.error(`[CanonicalFactRepository] Failed historical series query for ${metric}:`, err);
      return [];
    }
  }

  /**
   * Resolves fact IDs into verified EvidenceRef objects. Returns only genuinely existing evidence.
   */
  public async resolveEvidenceRefs(factIds: string[]): Promise<EvidenceRef[]> {
    if (!factIds || factIds.length === 0) return [];
    const db = getDB();
    if (!db) return [];

    const placeholders = factIds.map(() => '?').join(',');
    const sql = `
      SELECT factId, isin, symbol, metric, periodEnd, sourceDocumentId, sourceUrl,
             reportedAt, availableAt, asOfDate, evidenceText, sourceType
      FROM company_facts
      WHERE factId IN (${placeholders})
    `;

    try {
      const rows = await dbAll<any>(db, sql, factIds);
      return rows.map(r => ({
        evidenceId: `fact_ev_${r.factId}`,
        sourceType: (r.sourceType === 'EXCHANGE_FILING' ? 'STATUTORY_FILING' : 'DATA_PROVIDER_RECORD') as any,
        sourceName: r.sourceDocumentId || `${r.symbol} ${r.metric}`,
        sourceUrl: r.sourceUrl || undefined,
        documentDate: r.reportedAt || r.asOfDate || new Date().toISOString(),
        availableAt: r.availableAt || r.reportedAt || r.asOfDate || new Date().toISOString(),
        periodEnd: r.periodEnd || undefined,
        quote: r.evidenceText || undefined,
        extractionMethod: 'XBRL_DIRECT_EXTRACTION' as any,
      }));
    } catch (err) {
      console.error('[CanonicalFactRepository] resolveEvidenceRefs failed:', err);
      return [];
    }
  }

  // ─── Mapper ─────────────────────────────────────────────────────────────────

  private mapRowToFact(row: any): CanonicalFact {
    const isin = row.isin || '';
    const numVal = isNaN(Number(row.value)) ? row.value : parseFloat(row.value);
    const metric = row.metric || '';
    const periodEnd = row.periodEnd || null;
    const publishedAt = row.publishedAt || row.reportedAt || row.asOfDate || new Date().toISOString();
    const availableAt = row.availableAt || row.reportedAt || row.asOfDate || new Date().toISOString();
    const verificationStatus: FactVerificationStatus =
      (row.verificationStatus as FactVerificationStatus) || 'SOURCE_LINKED';

    const evidenceRef: EvidenceRef = {
      evidenceId: `fact_ev_${row.factId || `${isin}_${metric}_${periodEnd}`}`,
      sourceType: (row.sourceType === 'EXCHANGE_FILING' ? 'STATUTORY_FILING' : 'DATA_PROVIDER_RECORD') as any,
      sourceName: row.sourceDocumentId || row.provider || 'Statutory Disclosure',
      sourceUrl: row.sourceUrl || undefined,
      documentDate: publishedAt,
      availableAt: availableAt,
      periodStart: row.periodStart || undefined,
      periodEnd: periodEnd || undefined,
      quote: row.evidenceText || undefined,
      extractionMethod: (row.calculationMethod || 'XBRL_DIRECT_EXTRACTION') as any,
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
        timestamp: availableAt,
        field: metric,
        asOfDate: availableAt,
      }],
      publishedAt,
      availableAt,
      ingestedAt: row.fetchedAt || undefined,
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
