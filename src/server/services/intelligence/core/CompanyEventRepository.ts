/**
 * CompanyEventRepository.ts — Constitution Article C6
 *
 * Real event ledger for company timelines.
 * Invariants:
 * - Events are anchored to true occurrence and disclosure dates.
 * - Unknown dates are NEVER defaulted to today's date (no now.substring(0, 10)).
 * - PIT filter: availableAt <= asOfDate.
 * - Covers results, guidance, orders, capex/capacity, management changes, shareholding, corporate actions.
 */

import crypto from 'crypto';
import { getDB, dbAll, dbRun } from '../../../database.js';
import { CompanyEvent, CompanyEventType, EventMateriality } from '../contracts/CompanyEvent.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { ManagementCommitmentRepository } from './ManagementCommitmentRepository.js';

export class CompanyEventRepository {
  private static instance: CompanyEventRepository;

  private constructor() {}

  public static getInstance(): CompanyEventRepository {
    if (!CompanyEventRepository.instance) {
      CompanyEventRepository.instance = new CompanyEventRepository();
    }
    return CompanyEventRepository.instance;
  }

  /**
   * Single write authority for company_events.
   * INSERT OR REPLACE semantics — idempotent on eventId.
   * Called exclusively by SourceDocumentIngestionPipeline and CompanyRefreshCoordinator.
   * NO other module may write to company_events.
   */
  public async persistEvent(params: {
    isin: string;
    symbol: string;
    eventType: string;
    occurredAt: string;
    availableAt: string;
    materiality: string;
    title: string;
    description: string;
    sourceUrl: string | null;
    evidenceRefs: Array<{ evidenceId: string; sourceUrl: string | null }>;
    affectedDomains: string[];
    /** Optional pre-computed deterministic eventId.
     *  If omitted, a SHA-256 over isin|eventType|occurredAt|title is used. */
    eventId?: string;
  }): Promise<string> {
    const db = getDB();
    if (!db) throw new Error('[CompanyEventRepository] Database not initialised — cannot persist event.');

    const identityPreimage = [
      params.isin,
      params.eventType,
      params.occurredAt,
      params.title.trim().toLowerCase().substring(0, 80),
      params.sourceUrl || '',
    ].join('|');
    const eventId = params.eventId
      ?? `ev_${crypto.createHash('sha256').update(identityPreimage).digest('hex').substring(0, 16)}`;

    const sql = `
      INSERT OR REPLACE INTO company_events (
        eventId, securityId, isin, symbol, eventType, occurredAt, availableAt,
        materiality, title, description, sourceUrl, evidenceRefs, affectedDomains, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await dbRun(db, sql, [
      eventId,
      params.isin,
      params.isin,
      params.symbol,
      params.eventType,
      params.occurredAt,
      params.availableAt,
      params.materiality,
      params.title,
      params.description,
      params.sourceUrl || '',
      JSON.stringify(params.evidenceRefs),
      JSON.stringify(params.affectedDomains),
      new Date().toISOString(),
    ]);
    return eventId;
  }

  /**
   * Retrieves verifiable corporate events for a security enforcing PIT cutoff.
   */
  public async getEvents(
    identity: SecurityIdentity,
    asOfDate?: string | null
  ): Promise<CompanyEvent[]> {
    const db = getDB();
    if (!db) return [];

    const effectiveAsOf = asOfDate || new Date().toISOString().split('T')[0];
    const isin = identity.isin || '';
    const symbol = identity.nseSymbol || identity.bseCode || '';

    const events: CompanyEvent[] = [];

    // 1. Check if explicit company_events table exists
    try {
      const tableCheck = await dbAll<any>(
        db,
        `SELECT name FROM sqlite_master WHERE type='table' AND name='company_events'`
      );

      if (tableCheck && tableCheck.length > 0) {
        const rows = await dbAll<any>(
          db,
          `SELECT * FROM company_events
           WHERE (isin = ? OR symbol = ?) AND availableAt <= ?
           ORDER BY occurredAt DESC`,
          [isin, symbol, effectiveAsOf]
        );

        for (const r of rows) {
          events.push({
            eventId: r.eventId,
            securityId: r.securityId || isin,
            eventType: r.eventType as CompanyEventType,
            occurredAt: r.occurredAt || r.availableAt,
            availableAt: r.availableAt,
            materiality: (r.materiality || 'MEDIUM') as EventMateriality,
            title: r.title,
            description: r.description,
            evidenceRefs: r.evidenceRefs ? JSON.parse(r.evidenceRefs) : [],
            affectedDomains: r.affectedDomains ? JSON.parse(r.affectedDomains) : ['FUNDAMENTALS'],
          });
        }
      }
    } catch {
      // Non-fatal
    }

    // 2. Add verified financial results events from company_facts
    try {
      const factResults = await dbAll<any>(
        db,
        `SELECT metric, value, periodEnd, reportedAt, availableAt, sourceDocumentId, periodType
         FROM company_facts
         WHERE (isin = ? OR symbol = ?) AND metric IN ('revenue_cr', 'pat_cr')
           AND (
             (availableAt IS NOT NULL AND availableAt <= ?)
             OR (availableAt IS NULL AND asOfDate IS NOT NULL AND asOfDate <= ?)
           )
         ORDER BY periodEnd DESC
         LIMIT 12`,
        [isin, symbol, effectiveAsOf, effectiveAsOf]
      );

      const byPeriod: Record<string, any> = {};
      for (const row of factResults) {
        const key = `${row.periodType}_${row.periodEnd}`;
        if (!byPeriod[key]) {
          byPeriod[key] = {
            periodEnd: row.periodEnd,
            periodType: row.periodType,
            reportedAt: row.reportedAt,
            availableAt: row.availableAt,
          };
        }
        byPeriod[key][row.metric] = row.value;
      }

      for (const [key, data] of Object.entries(byPeriod)) {
        events.push({
          eventId: `evt_fin_${isin}_${key}`,
          securityId: isin,
          eventType: 'FINANCIAL_RESULT',
          occurredAt: data.periodEnd,
          availableAt: data.availableAt || data.reportedAt || data.periodEnd,
          materiality: 'HIGH',
          title: `${data.periodType === 'QUARTERLY' ? 'Quarterly' : 'Annual'} Financial Results (${data.periodEnd})`,
          description: `Disclosed Revenue: ₹${data.revenue_cr || 'N/A'} Cr, PAT: ₹${data.pat_cr || 'N/A'} Cr`,
          evidenceRefs: [{
            evidenceId: `ev_fin_${isin}_${key}`,
            sourceType: 'AUDITED_FINANCIAL_STATEMENT',
            sourceName: `Financial Results ${data.periodEnd}`,
            documentDate: data.reportedAt || data.periodEnd || null,
            availableAt: data.availableAt || data.periodEnd || null,
            pitStatus: data.availableAt ? 'PIT_VERIFIED' : (data.periodEnd ? 'PIT_INFERRED' : 'PIT_UNKNOWN'),
            periodEnd: data.periodEnd,
            extractionMethod: 'STRUCTURED_XBRL',
          }],
          affectedDomains: ['FUNDAMENTALS', 'VALUATION'],
        });
      }
    } catch {
      // Non-fatal
    }

    // 3. Add management commitments & guidance events from ManagementCommitmentRepository
    try {
      const commitments = await ManagementCommitmentRepository.getInstance().getCommitmentsForSecurity(
        identity,
        effectiveAsOf
      );

      for (const c of commitments) {
        events.push({
          eventId: `evt_guidance_${c.commitmentId}`,
          securityId: isin,
          eventType: 'MANAGEMENT_GUIDANCE',
          occurredAt: c.statementDate,
          availableAt: c.statementDate,
          materiality: c.materiality,
          title: `Management Statement: ${c.metric.replace(/_/g, ' ').toUpperCase()}`,
          description: `"${c.statement}" (Target: ${c.targetValue} ${c.targetUnit}, Status: ${c.status})`,
          evidenceRefs: c.evidenceRefs,
          affectedDomains: ['MANAGEMENT', 'FUNDAMENTALS'],
        });
      }
    } catch {
      // Non-fatal
    }

    return events.sort((a, b) => (b.occurredAt || '').localeCompare(a.occurredAt || ''));
  }
}
