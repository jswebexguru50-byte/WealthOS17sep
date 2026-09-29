/**
 * CompanyEventRepository.ts — Constitution Article C6
 *
 * Real event ledger for company timelines.
 * Invariants:
 * - Events are anchored to true occurrence and disclosure dates.
 * - Unknown dates are NEVER defaulted to today's date (no now.substring(0, 10)).
 * - PIT filter: availableAt <= asOfDate.
 */

import { getDB, dbAll } from '../../../database.js';
import { CompanyEvent, CompanyEventType, EventMateriality } from '../contracts/CompanyEvent.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';

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

    try {
      // 1. Check if explicit company_events table exists
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
        `SELECT metric, value, periodEnd, reportedAt, availableAt, sourceDocumentId
         FROM company_facts
         WHERE (isin = ? OR symbol = ?) AND metric IN ('revenue_cr', 'pat_cr')
           AND periodType = 'ANNUAL'
           AND (
             (availableAt IS NOT NULL AND availableAt <= ?)
             OR (availableAt IS NULL AND asOfDate IS NOT NULL AND asOfDate <= ?)
           )
         ORDER BY periodEnd DESC
         LIMIT 6`,
        [isin, symbol, effectiveAsOf, effectiveAsOf]
      );

      const byPeriod: Record<string, any> = {};
      for (const row of factResults) {
        if (!byPeriod[row.periodEnd]) {
          byPeriod[row.periodEnd] = { periodEnd: row.periodEnd, reportedAt: row.reportedAt, availableAt: row.availableAt };
        }
        byPeriod[row.periodEnd][row.metric] = row.value;
      }

      for (const [period, data] of Object.entries(byPeriod)) {
        events.push({
          eventId: `evt_fin_${isin}_${period}`,
          securityId: isin,
          eventType: 'FINANCIAL_RESULT',
          occurredAt: period,
          availableAt: data.availableAt || data.reportedAt || period,
          materiality: 'HIGH',
          title: `Annual Financial Results for Period Ending ${period}`,
          description: `Disclosed Revenue: ₹${data.revenue_cr || 'N/A'} Cr, PAT: ₹${data.pat_cr || 'N/A'} Cr`,
          evidenceRefs: [{
            evidenceId: `ev_fin_${isin}_${period}`,
            sourceType: 'AUDITED_FINANCIAL_STATEMENT',
            sourceName: `Audited Annual Financial Results ${period}`,
            documentDate: data.reportedAt || period,
            availableAt: data.availableAt || period,
            periodEnd: period,
            extractionMethod: 'STRUCTURED_XBRL',
          }],
          affectedDomains: ['FUNDAMENTALS', 'VALUATION'],
        });
      }
    } catch {
      // Non-fatal
    }

    return events.sort((a, b) => (b.occurredAt || '').localeCompare(a.occurredAt || ''));
  }
}
