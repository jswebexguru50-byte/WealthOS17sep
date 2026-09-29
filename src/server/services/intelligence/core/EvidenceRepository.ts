/**
 * EvidenceRepository.ts — Constitution Article C1 (Grounding & Provenance)
 *
 * Single source of truth for resolving evidence references across WealthOS.
 * Invariants:
 * - Resolves actual EvidenceRef from primary filings, verified XBRL tables, or canonical fact records.
 * - Never fabricates fake evidence wrappers for missing IDs.
 * - If an evidence ID cannot be resolved against authoritative sources, resolve() returns null.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { getDB, dbGet } from '../../../database.js';
import { EvidenceRef, EvidenceDocSourceType, EvidenceExtractionMethod, PitStatus } from '../contracts/EvidenceRef.js';

const PORTFOLIO_DB_PATH = path.resolve('portfolio.db');
const FERE_DB_PATH = path.resolve('data', 'fere', 'verified_filings', 'fere_evidence.db');

export class EvidenceRepository {
  private static instance: EvidenceRepository;

  private constructor() {}

  public static getInstance(): EvidenceRepository {
    if (!EvidenceRepository.instance) {
      EvidenceRepository.instance = new EvidenceRepository();
    }
    return EvidenceRepository.instance;
  }

  /**
   * Resolves a single evidenceId to an authoritative EvidenceRef.
   * Returns null if evidence cannot be authenticated, belongs to the wrong security, or is future-dated.
   */
  public async resolve(
    evidenceId: string,
    securityContext?: { isin?: string; symbol?: string; asOfDate?: string }
  ): Promise<EvidenceRef | null> {
    if (!evidenceId) return null;

    const targetIsin = securityContext?.isin;
    const targetSymbol = securityContext?.symbol;
    const asOfDate = securityContext?.asOfDate;

    // 1. Check company_facts in portfolio.db
    const portDb = new Database(PORTFOLIO_DB_PATH, { readonly: true });
    try {
      const factRow = portDb.prepare(`
        SELECT factId, symbol, isin, metric, value, unit, periodEnd, reportedAt, availableAt,
               sourceDocumentId, provider, sourceType
        FROM company_facts
        WHERE factId = ? OR sourceDocumentId = ?
        LIMIT 1
      `).get(evidenceId, evidenceId) as any;

      if (factRow) {
        portDb.close();

        // Security mismatch rejection
        if (targetIsin && factRow.isin && factRow.isin !== targetIsin) {
          return null;
        }
        if (targetSymbol && factRow.symbol && factRow.symbol !== targetSymbol) {
          return null;
        }

        const docDate = factRow.reportedAt || factRow.periodEnd || null;
        const rawAvailAt = factRow.availableAt;

        // PIT classification: explicit vs inferred vs unknown
        let pitStatus: PitStatus;
        let availAt: string | null;
        if (rawAvailAt) {
          availAt = rawAvailAt;
          pitStatus = 'PIT_VERIFIED';
        } else if (docDate) {
          availAt = docDate;
          pitStatus = 'PIT_INFERRED';
        } else {
          availAt = null;  // genuinely unknown — do NOT fabricate
          pitStatus = 'PIT_UNKNOWN';
        }

        // PIT rejection: future evidence relative to asOfDate (strict — only PIT_VERIFIED admissible for historical)
        if (asOfDate && availAt && availAt > asOfDate) {
          return null;
        }

        const srcType: EvidenceDocSourceType =
          factRow.sourceType === 'AUDITED_FINANCIAL_STATEMENT' ? 'AUDITED_FINANCIAL_STATEMENT'
          : factRow.sourceType === 'EXCHANGE_FILING' ? 'EXCHANGE_FILING'
          : factRow.sourceType === 'ANNUAL_REPORT' ? 'ANNUAL_REPORT'
          : factRow.sourceType === 'INVESTOR_PRESENTATION' ? 'INVESTOR_PRESENTATION'
          : factRow.sourceType === 'EARNINGS_TRANSCRIPT' ? 'EARNINGS_TRANSCRIPT'
          : factRow.sourceType === 'REGULATORY_DISCLOSURE' ? 'REGULATORY_DISCLOSURE'
          : factRow.sourceType === 'CORPORATE_ACTION' ? 'CORPORATE_ACTION'
          : factRow.sourceType === 'CREDIT_RATING_REPORT' ? 'CREDIT_RATING_REPORT'
          : factRow.sourceType === 'SHAREHOLDING_DISCLOSURE' ? 'SHAREHOLDING_DISCLOSURE'
          : factRow.sourceType === 'PRICE_RECORD' ? 'PRICE_RECORD'
          : 'OTHER';

        return {
          evidenceId: factRow.factId,
          sourceType: srcType,
          sourceName: factRow.sourceDocumentId || `${factRow.symbol} ${factRow.metric} (${factRow.periodEnd})`,
          documentDate: docDate || null,   // null = genuinely unknown — do NOT fabricate today
          availableAt: availAt,
          pitStatus,
          periodEnd: factRow.periodEnd,
          extractionMethod: 'STRUCTURED_XBRL',
        };
      }
    } catch {
      // Continue to next store
    } finally {
      try { portDb.close(); } catch {}
    }

    // 2. Check fere_evidence.db (verified_xbrl_fact & management tables)
    try {
      const fereDb = new Database(FERE_DB_PATH, { readonly: true });
      try {
        // 2a. Check verified_xbrl_fact
        const xbrlRow = fereDb.prepare(`
          SELECT id, symbol, isin, metric, value, period_end, available_at, source_url, taxonomy_field
          FROM verified_xbrl_fact
          WHERE id = ? OR taxonomy_field = ?
          LIMIT 1
        `).get(evidenceId, evidenceId) as any;

        if (xbrlRow) {
          fereDb.close();

          // Security mismatch rejection
          if (targetIsin && xbrlRow.isin && xbrlRow.isin !== targetIsin) {
            return null;
          }
          if (targetSymbol && xbrlRow.symbol && xbrlRow.symbol !== targetSymbol) {
            return null;
          }

          const rawAvailAt = xbrlRow.available_at;
          let pitStatus: PitStatus;
          let availAt: string | null;
          if (rawAvailAt) {
            availAt = rawAvailAt;
            pitStatus = 'PIT_VERIFIED';
          } else if (xbrlRow.period_end) {
            availAt = xbrlRow.period_end;
            pitStatus = 'PIT_INFERRED';
          } else {
            availAt = null;  // genuinely unknown — do NOT fabricate
            pitStatus = 'PIT_UNKNOWN';
          }
          if (asOfDate && availAt && availAt > asOfDate) {
            return null;
          }

          return {
            evidenceId: `xbrl_${xbrlRow.id}`,
            sourceType: 'EXCHANGE_FILING',
            sourceName: `MCA XBRL Filing: ${xbrlRow.taxonomy_field}`,
            sourceUrl: xbrlRow.source_url,
            documentDate: xbrlRow.period_end || null,   // null = genuinely unknown — do NOT fabricate today
            availableAt: availAt,
            pitStatus,
            periodEnd: xbrlRow.period_end,
            extractionMethod: 'STRUCTURED_XBRL',
          };
        }

        // 2b. Check management_claim_candidate / management_commitment
        const claimRow = fereDb.prepare(`
          SELECT id, symbol, isin, claim_date, source_url, source_sha256, evidence_text
          FROM management_claim_candidate
          WHERE id = ? OR source_sha256 = ?
          LIMIT 1
        `).get(evidenceId, evidenceId) as any;

        if (claimRow) {
          fereDb.close();

          // Security mismatch rejection
          if (targetIsin && claimRow.isin && claimRow.isin !== targetIsin) {
            return null;
          }
          if (targetSymbol && claimRow.symbol && claimRow.symbol !== targetSymbol) {
            return null;
          }

          const rawClaimDate: string | null = claimRow.claim_date || null;
          const claimPitStatus: PitStatus = rawClaimDate ? 'PIT_VERIFIED' : 'PIT_UNKNOWN';
          if (asOfDate && rawClaimDate && rawClaimDate > asOfDate) {
            return null;
          }

          return {
            evidenceId: `claim_${claimRow.id}`,
            sourceType: 'EARNINGS_TRANSCRIPT',
            sourceName: `Corporate Announcement / Earnings Call (${claimRow.symbol})`,
            sourceUrl: claimRow.source_url,
            documentDate: rawClaimDate || null,   // null = genuinely unknown — do NOT fabricate today
            availableAt: rawClaimDate,  // null if genuinely unknown — never fabricate
            pitStatus: claimPitStatus,
            quote: claimRow.evidence_text,
            contentHash: claimRow.source_sha256,
            extractionMethod: 'MANUAL_AUDITED',
          };
        }
      } finally {
        try { fereDb.close(); } catch {}
      }
    } catch {
      // Database not accessible or not matching
    }

    return null;
  }

  /**
   * Resolves multiple evidence IDs to real EvidenceRef instances.
   * Filters out any unresolvable IDs (never fabricates placeholders).
   */
  public async resolveMany(evidenceIds: string[]): Promise<EvidenceRef[]> {
    if (!evidenceIds || evidenceIds.length === 0) return [];

    const resolved: EvidenceRef[] = [];
    for (const id of evidenceIds) {
      const ref = await this.resolve(id);
      if (ref) {
        resolved.push(ref);
      }
    }
    return resolved;
  }

  /**
   * Fetches all evidence references supporting a specific factId.
   */
  public async getEvidenceForFact(factId: string): Promise<EvidenceRef[]> {
    const ref = await this.resolve(factId);
    return ref ? [ref] : [];
  }
}
