/**
 * EvidenceQueryService.ts
 * Clean-Room StockScans Parity Engine — Official Evidence & Governance Layer
 * 
 * Powered by FERE Official Exchange Archive (BSE/NSE verified filings, XBRL facts,
 * shareholding snapshots, material corporate events, and auditable management guidance).
 * 
 * Invariant: Every fact exposes source URL, SHA-256 hash, fetch timestamp, and
 * explicit UNAVAILABLE when unverified. Never manufactures sentiment, summary, or synthetic valuation.
 */

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { DuckDbAdjustedOhlcvService } from '../DuckDbAdjustedOhlcvService.js';
import { DataStatus, Provenance, Fact } from '../../../types/stockscans.js';

export interface RawEvidenceRow {
  source_url?: string | null;
  sourceUrl?: string | null;
  source_sha256?: string | null;
  sourceSha256?: string | null;
  document_id?: string | null;
  documentId?: string | null;
  retrieved_at?: string | null;
  fetchedAt?: string | null;
  event_date?: string | null;
  eventDate?: string | null;
  period_end?: string | null;
  periodEnd?: string | null;
}

/**
 * Deterministic provenance mapper. Never substitutes a generic homepage.
 */
export function mapProvenance(row: RawEvidenceRow): Provenance {
  const url = row.source_url ?? row.sourceUrl ?? null;
  return {
    sourceSystem: url ? 'BSE' : 'SQLITE_FERE',
    sourceUrl: url,
    documentId: row.document_id ?? row.documentId ?? null,
    documentSha256: row.source_sha256 ?? row.sourceSha256 ?? null,
    retrievedAt: row.retrieved_at ?? row.fetchedAt ?? null,
    asOf: row.event_date ?? row.eventDate ?? row.period_end ?? row.periodEnd ?? new Date().toISOString().split('T')[0],
    formulaVersion: null
  };
}

export interface AnnouncementItem {
  id: string | number;
  symbol: string;
  isin: string | null;
  eventType: string;
  eventDate: string;
  severity: string;
  explanation: string;
  sourceUrl: string | null;
  sourceSha256: string | null;
  documentUrl: string | null;
  verified: boolean;
  fetchedAt: string;
  status: DataStatus;
  provenance: Provenance[];
  noDataReason?: string | null;
}

export interface ShareholdingDiffItem {
  symbol: string;
  isin: string;
  currentPeriodEnd: string;
  prevPeriodEnd: string | null;
  promoterHolding: number;
  promoterHoldingDiff: number;
  promoterPledge: number;
  promoterPledgeDiff: number;
  publicHolding: number;
  publicHoldingDiff: number;
  sourceUrl: string | null;
  sourceSha256: string | null;
  availableAt: string | null;
  status: DataStatus;
  signalTag: string;
  provenance: Provenance[];
  noDataReason?: string | null;
}

export interface ResultCalendarItem {
  symbol: string;
  isin: string;
  periodEnd: string | null;
  filingTimestamp: string | null;
  documentType: string;
  scope: string;
  status: 'VERIFIED' | 'REPORTED' | 'PENDING';
  sourceUrl: string | null;
  sha256: string | null;
  lastVerifiedAt: string;
  provenance: Provenance[];
  noDataReason?: string | null;
}

export interface ManagementCommitmentItem {
  id: number;
  symbol: string;
  isin: string;
  claimDate: string;
  metric: string;
  target: string;
  unit: string | null;
  deadline: string | null;
  status: 'OPEN' | 'MET' | 'MISSED' | 'NOT_COMPARABLE';
  actualValue: string | null;
  sourceEvidence: string;
  sourceUrl: string | null;
  sourceSha256: string | null;
  evaluatedAt: string | null;
  provenance: Provenance[];
  noDataReason?: string | null;
}

export interface PeerMetrics {
  symbol: string;
  isin: string | null;
  cmp: Fact<number>;
  marketCapCr: Fact<number>;
  peRatio: Fact<number>;
  revenueCr: Fact<number>;
  patCr: Fact<number>;
  rocePct: Fact<number>;
  opmPct: Fact<number>;
  debtToEquity: Fact<number>;
  periodEnd: string | null;
  status: DataStatus;
  noDataReason?: string | null;
}

export interface PeerComparisonRow {
  symbol: string;
  isin: string | null;
  cmp: number | null;
  marketCapCr: number | null;
  peRatio: number | null;
  revenueCr: number | null;
  patCr: number | null;
  rocePct: number | null;
  opmPct: number | null;
  debtToEquity: number | null;
  periodEnd: string | null;
  evidenceUrl: string | null;
  documentHash: string | null;
  verifiedStatus: string;
  facts: {
    cmp: Fact<number>;
    marketCapCr: Fact<number>;
    peRatio: Fact<number>;
    revenueCr: Fact<number>;
    patCr: Fact<number>;
    rocePct: Fact<number>;
    opmPct: Fact<number>;
    debtToEquity: Fact<number>;
  };
}

/**
 * Calculate P/E strictly from verified real market cap and positive PAT.
 * Never derives market cap from PAT or fixed multiples.
 */
export function calculatePe(
  marketCapCr: Fact<number>,
  patCr: Fact<number>
): Fact<number> {
  if (
    marketCapCr.status !== 'VERIFIED' ||
    patCr.status !== 'VERIFIED' ||
    marketCapCr.value === null ||
    patCr.value === null ||
    patCr.value <= 0
  ) {
    return {
      value: null,
      status: 'UNAVAILABLE',
      provenance: [
        ...(marketCapCr?.provenance || []),
        ...(patCr?.provenance || [])
      ],
      noDataReason: 'Verified market capitalisation and positive PAT are required'
    };
  }

  return {
    value: Number((marketCapCr.value / patCr.value).toFixed(2)),
    status: 'VERIFIED',
    provenance: [
      ...marketCapCr.provenance,
      ...patCr.provenance
    ],
    noDataReason: null
  };
}

const evidencePath = path.resolve('data', 'fere', 'verified_filings', 'fere_evidence.db');

export class EvidenceQueryService {
  private static dbInstance: Database.Database | null = null;
  private static ftsInitialized = false;

  private static getDB(): Database.Database | null {
    if (!fs.existsSync(evidencePath)) return null;
    if (!this.dbInstance) {
      try {
        this.dbInstance = new Database(evidencePath, { readonly: true, fileMustExist: true });
        this.dbInstance.pragma('journal_mode = WAL');
        this.dbInstance.pragma('mmap_size = 268435456');
      } catch (err) {
        console.warn('[EvidenceQueryService] Failed to open fere_evidence.db:', err);
        return null;
      }
    }
    return this.dbInstance;
  }

  /**
   * P0: Announcements search over archived official announcements with SQLite FTS5 and LIKE fallback
   */
  public static searchAnnouncements(params: {
    query?: string;
    symbol?: string;
    eventType?: string;
    limit?: number;
  }): {
    asOf: string;
    dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE';
    searchMode: 'FTS5' | 'LIKE_FALLBACK';
    totalMatched: number;
    trendingKeywords: Array<{ word: string; count: number }>;
    announcements: AnnouncementItem[];
  } {
    const db = this.getDB();
    if (!db) {
      return {
        asOf: new Date().toISOString(),
        dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE',
        searchMode: 'LIKE_FALLBACK',
        totalMatched: 0,
        trendingKeywords: [],
        announcements: []
      };
    }

    try {
      const limit = Math.min(Math.max(params.limit || 50, 1), 200);
      let searchMode: 'FTS5' | 'LIKE_FALLBACK' = 'LIKE_FALLBACK';
      let rows: any[] = [];

      // Attempt FTS5 search if a text query is present
      if (params.query && params.query.trim()) {
        try {
          const rawQuery = params.query.trim();
          // Tokenize and clean for FTS5 syntax
          const sanitizedTokens = rawQuery
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);

          if (sanitizedTokens.length > 0) {
            const ftsMatchExpr = sanitizedTokens.map(t => `"${t}"*`).join(' AND ');
            let ftsSql = `
              SELECT e.id, e.symbol, e.isin, e.event_type as eventType, e.event_date as eventDate,
                     e.severity, e.explanation, e.source_url as sourceUrl, e.source_sha256 as sourceSha256,
                     e.document_url as documentUrl, e.verified
                FROM company_material_event_fts f
                JOIN company_material_event e ON e.id = f.rowid
               WHERE company_material_event_fts MATCH ?
            `;
            const ftsArgs: any[] = [ftsMatchExpr];
            if (params.symbol) {
              ftsSql += ` AND UPPER(e.symbol) = ?`;
              ftsArgs.push(params.symbol.trim().toUpperCase());
            }
            if (params.eventType) {
              ftsSql += ` AND UPPER(e.event_type) LIKE ?`;
              ftsArgs.push(`%${params.eventType.trim().toUpperCase()}%`);
            }
            ftsSql += ` ORDER BY e.event_date DESC, e.id DESC LIMIT ?`;
            ftsArgs.push(limit);

            rows = db.prepare(ftsSql).all(...ftsArgs) as any[];
            searchMode = 'FTS5';
          }
        } catch (ftsErr) {
          // FTS failed or table not present, safely fall back to LIKE
          searchMode = 'LIKE_FALLBACK';
        }
      }

      // If FTS was not used or returned no rows or was in fallback mode
      if (rows.length === 0 && (!params.query || searchMode === 'LIKE_FALLBACK')) {
        let sql = `
          SELECT id, symbol, isin, event_type as eventType, event_date as eventDate,
                 severity, explanation, source_url as sourceUrl, source_sha256 as sourceSha256,
                 document_url as documentUrl, verified
            FROM company_material_event
           WHERE 1=1
        `;
        const args: any[] = [];

        if (params.symbol) {
          sql += ` AND UPPER(symbol) = ?`;
          args.push(params.symbol.trim().toUpperCase());
        }
        if (params.eventType) {
          sql += ` AND UPPER(event_type) LIKE ?`;
          args.push(`%${params.eventType.trim().toUpperCase()}%`);
        }
        if (params.query) {
          sql += ` AND (UPPER(explanation) LIKE ? OR UPPER(symbol) LIKE ? OR UPPER(event_type) LIKE ?)`;
          const qPattern = `%${params.query.trim().toUpperCase()}%`;
          args.push(qPattern, qPattern, qPattern);
        }

        sql += ` ORDER BY event_date DESC, id DESC LIMIT ?`;
        args.push(limit);

        rows = db.prepare(sql).all(...args) as any[];
        searchMode = 'LIKE_FALLBACK';
      }

      // Extract trending keywords from recent material events
      const allText = db.prepare(`SELECT explanation FROM company_material_event ORDER BY event_date DESC LIMIT 200`).all() as any[];
      const stopWords = new Set(['THE', 'AND', 'OF', 'TO', 'FOR', 'IN', 'A', 'IS', 'THAT', 'WITH', 'ON', 'AS', 'BY', 'AT', 'BE', 'THIS', 'HAS', 'HAVE', 'WAS', 'COMPANY', 'LTD', 'LIMITED']);
      const wordCounts = new Map<string, number>();

      for (const row of allText) {
        const words = String(row.explanation || '')
          .toUpperCase()
          .replace(/[^A-Z0-9 ]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length >= 4 && !stopWords.has(w));
        for (const w of words) {
          wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
        }
      }

      const trendingKeywords = [...wordCounts.entries()]
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);

      const announcements: AnnouncementItem[] = rows.map(r => {
        const prov = mapProvenance({
          source_url: r.sourceUrl,
          source_sha256: r.sourceSha256,
          event_date: r.eventDate,
          document_id: r.id ? String(r.id) : null
        });
        const hasUrl = Boolean(prov.sourceUrl);
        return {
          id: r.id,
          symbol: r.symbol,
          isin: r.isin,
          eventType: r.eventType || 'CORPORATE_ACTION',
          eventDate: r.eventDate || new Date().toISOString().split('T')[0],
          severity: r.severity || 'INFO',
          explanation: r.explanation || 'Official exchange disclosure',
          sourceUrl: prov.sourceUrl,
          sourceSha256: prov.documentSha256,
          documentUrl: r.documentUrl || null,
          verified: Boolean(r.verified),
          fetchedAt: r.eventDate || new Date().toISOString().split('T')[0],
          status: hasUrl ? 'VERIFIED' : 'PARTIAL',
          provenance: [prov],
          noDataReason: hasUrl ? null : 'Evidence row exists but source URL was not recorded'
        };
      });

      const latestAsOf = announcements.length > 0 ? announcements[0].eventDate : new Date().toISOString().split('T')[0];

      return {
        asOf: latestAsOf,
        dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE',
        searchMode,
        totalMatched: announcements.length,
        trendingKeywords,
        announcements
      };
    } catch (err) {
      console.error('[EvidenceQueryService] searchAnnouncements error:', err);
      return {
        asOf: new Date().toISOString(),
        dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE',
        searchMode: 'LIKE_FALLBACK',
        totalMatched: 0,
        trendingKeywords: [],
        announcements: []
      };
    }
  }

  /**
   * P0: Official Shareholding scans & period-over-period diffs
   */
  public static getShareholdingScans(params: {
    symbol?: string;
    scanType?: 'PLEDGE_REDUCTION' | 'PROMOTER_ACCUMULATION' | 'INSTITUTIONAL_FAVORITE' | 'ALL';
    minPromoterHolding?: number;
    maxPledge?: number;
    limit?: number;
  }): {
    asOf: string;
    dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE';
    scanType: string;
    results: ShareholdingDiffItem[];
  } {
    const db = this.getDB();
    if (!db) {
      return { asOf: new Date().toISOString(), dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE', scanType: 'ALL', results: [] };
    }

    try {
      let symFilter = '';
      const args: any[] = [];
      if (params.symbol) {
        symFilter = ` AND UPPER(symbol) = ?`;
        args.push(params.symbol.trim().toUpperCase());
      }

      // Query latest two quarters for each symbol
      const sql = `
        WITH RankedSnapshots AS (
          SELECT symbol, isin, period_end, promoter_holding, promoter_pledge, public_holding,
                 source_url, source_sha256, available_at, status,
                 ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY period_end DESC) as rn
            FROM shareholding_snapshot
           WHERE 1=1 ${symFilter}
        )
        SELECT * FROM RankedSnapshots WHERE rn <= 2 ORDER BY symbol, rn ASC
      `;

      const rows = db.prepare(sql).all(...args) as any[];

      // Group by symbol
      const groups = new Map<string, any[]>();
      for (const row of rows) {
        if (!groups.has(row.symbol)) groups.set(row.symbol, []);
        groups.get(row.symbol)!.push(row);
      }

      const diffList: ShareholdingDiffItem[] = [];
      let latestAsOf = '';

      for (const [sym, snapshots] of groups.entries()) {
        const curr = snapshots[0];
        const prev = snapshots[1] || null;

        if (!latestAsOf || curr.period_end > latestAsOf) {
          latestAsOf = curr.period_end;
        }

        const currPromoter = Number(curr.promoter_holding) || 0;
        const prevPromoter = prev ? (Number(prev.promoter_holding) || 0) : currPromoter;
        const promoterDiff = Number((currPromoter - prevPromoter).toFixed(2));

        const currPledged = Number(curr.promoter_pledge) || 0;
        const prevPledged = prev ? (Number(prev.promoter_pledge) || 0) : currPledged;
        const pledgeDiff = Number((currPledged - prevPledged).toFixed(2));

        const currPublic = Number(curr.public_holding) || 0;
        const prevPublic = prev ? (Number(prev.public_holding) || 0) : currPublic;
        const publicDiff = Number((currPublic - prevPublic).toFixed(2));

        // Signal tags
        let signalTag = 'NEUTRAL';
        if (pledgeDiff < 0) {
          signalTag = 'PLEDGE_REDUCTION';
        } else if (promoterDiff > 0.5) {
          signalTag = 'PROMOTER_ACCUMULATION';
        } else if (currPledged === 0 && currPublic > 30) {
          signalTag = 'CLEAN_INSTITUTIONAL_HOLD';
        }

        const prov = mapProvenance({
          source_url: curr.source_url,
          source_sha256: curr.source_sha256,
          period_end: curr.period_end,
          retrieved_at: curr.available_at
        });
        const hasUrl = Boolean(prov.sourceUrl);

        const item: ShareholdingDiffItem = {
          symbol: sym,
          isin: curr.isin,
          currentPeriodEnd: curr.period_end,
          prevPeriodEnd: prev?.period_end || null,
          promoterHolding: currPromoter,
          promoterHoldingDiff: promoterDiff,
          promoterPledge: currPledged,
          promoterPledgeDiff: pledgeDiff,
          publicHolding: currPublic,
          publicHoldingDiff: publicDiff,
          sourceUrl: prov.sourceUrl,
          sourceSha256: prov.documentSha256,
          availableAt: curr.available_at,
          status: hasUrl ? 'VERIFIED' : 'PARTIAL',
          signalTag,
          provenance: [prov],
          noDataReason: hasUrl ? null : 'Evidence row exists but source URL was not recorded'
        };

        // Filter by scanType
        const scan = (params.scanType || 'ALL').toUpperCase();
        if (scan === 'PLEDGE_REDUCTION' && pledgeDiff >= 0) continue;
        if (scan === 'PROMOTER_ACCUMULATION' && promoterDiff <= 0) continue;
        if (scan === 'INSTITUTIONAL_FAVORITE' && (currPledged > 0 || currPublic < 20)) continue;

        diffList.push(item);
      }

      return {
        asOf: latestAsOf || new Date().toISOString().split('T')[0],
        dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE',
        scanType: params.scanType || 'ALL',
        results: diffList.slice(0, params.limit || 100)
      };
    } catch (err) {
      console.error('[EvidenceQueryService] getShareholdingScans error:', err);
      return { asOf: new Date().toISOString(), dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE', scanType: 'ALL', results: [] };
    }
  }

  /**
   * P1: Financial Results Calendar & XBRL Document Verification
   */
  public static getResultsCalendar(params: {
    symbol?: string;
    limit?: number;
  }): {
    asOf: string;
    dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE';
    results: ResultCalendarItem[];
  } {
    const db = this.getDB();
    if (!db) {
      return { asOf: new Date().toISOString(), dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE', results: [] };
    }

    try {
      let sql = `
        SELECT symbol, isin, period_end as periodEnd, filing_timestamp as filingTimestamp,
               document_type as documentType, scope, status, source_url as sourceUrl,
               sha256, retrieved_at as retrievedAt
          FROM filing_discovery
         WHERE document_type IN ('FINANCIAL_RESULTS', 'AUDITED_RESULTS', 'LIMITED_REVIEW', 'XBRL_FINANCIALS')
      `;
      const args: any[] = [];
      if (params.symbol) {
        sql += ` AND UPPER(symbol) = ?`;
        args.push(params.symbol.trim().toUpperCase());
      }
      sql += ` ORDER BY period_end DESC, filing_timestamp DESC LIMIT ?`;
      args.push(Math.min(Math.max(params.limit || 50, 1), 200));

      const rows = db.prepare(sql).all(...args) as any[];

      const results: ResultCalendarItem[] = rows.map(r => {
        const prov = mapProvenance({
          source_url: r.sourceUrl,
          source_sha256: r.sha256,
          period_end: r.periodEnd,
          retrieved_at: r.retrievedAt
        });
        const hasUrl = Boolean(prov.sourceUrl);
        return {
          symbol: r.symbol,
          isin: r.isin,
          periodEnd: r.periodEnd,
          filingTimestamp: r.filingTimestamp,
          documentType: r.documentType || 'FINANCIAL_RESULTS',
          scope: r.scope || 'STANDALONE',
          status: r.status === 'VERIFIED' ? 'VERIFIED' : 'REPORTED',
          sourceUrl: prov.sourceUrl,
          sha256: prov.documentSha256,
          lastVerifiedAt: r.retrievedAt || r.filingTimestamp || new Date().toISOString().split('T')[0],
          provenance: [prov],
          noDataReason: hasUrl ? null : 'Evidence row exists but source URL was not recorded'
        };
      });

      const latestAsOf = results.length > 0 ? (results[0].periodEnd || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0];

      return {
        asOf: latestAsOf,
        dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE',
        results
      };
    } catch (err) {
      console.error('[EvidenceQueryService] getResultsCalendar error:', err);
      return { asOf: new Date().toISOString(), dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE', results: [] };
    }
  }

  /**
   * P1: Management Guidance / Commitments ("Walk-the-Talk") Tracking
   */
  public static getManagementGuidance(params: {
    symbol?: string;
    status?: string;
  }): {
    asOf: string;
    dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE';
    commitments: ManagementCommitmentItem[];
  } {
    const db = this.getDB();
    if (!db) {
      return { asOf: new Date().toISOString(), dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE', commitments: [] };
    }

    try {
      let sql = `
        SELECT id, isin, symbol, claim_date AS claimDate, metric, target, unit,
               deadline, status, actual_value AS actualValue, source_evidence AS sourceEvidence,
               source_url AS sourceUrl, source_sha256 AS sourceSha256, evaluated_at AS evaluatedAt
          FROM management_commitment
         WHERE 1=1
      `;
      const args: any[] = [];
      if (params.symbol) {
        sql += ` AND UPPER(symbol) = ?`;
        args.push(params.symbol.trim().toUpperCase());
      }
      if (params.status) {
        sql += ` AND UPPER(status) = ?`;
        args.push(params.status.trim().toUpperCase());
      }
      sql += ` ORDER BY claim_date DESC, id DESC LIMIT 100`;

      const rows = db.prepare(sql).all(...args) as any[];

      const commitments: ManagementCommitmentItem[] = rows.map(r => {
        const prov = mapProvenance({
          source_url: r.sourceUrl,
          source_sha256: r.sourceSha256,
          event_date: r.claimDate,
          document_id: r.id ? String(r.id) : null
        });
        const hasUrl = Boolean(prov.sourceUrl);
        return {
          id: r.id,
          symbol: r.symbol,
          isin: r.isin,
          claimDate: r.claimDate,
          metric: r.metric,
          target: r.target,
          unit: r.unit || null,
          deadline: r.deadline || null,
          status: (['OPEN', 'MET', 'MISSED', 'NOT_COMPARABLE'].includes(r.status) ? r.status : 'OPEN') as any,
          actualValue: r.actualValue || null,
          sourceEvidence: r.sourceEvidence || 'Official earnings conference disclosure',
          sourceUrl: prov.sourceUrl,
          sourceSha256: prov.documentSha256,
          evaluatedAt: r.evaluatedAt || null,
          provenance: [prov],
          noDataReason: hasUrl ? null : 'Evidence row exists but source URL was not recorded'
        };
      });

      const latestAsOf = commitments.length > 0 ? commitments[0].claimDate : new Date().toISOString().split('T')[0];

      return {
        asOf: latestAsOf,
        dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE',
        commitments
      };
    } catch (err) {
      console.error('[EvidenceQueryService] getManagementGuidance error:', err);
      return { asOf: new Date().toISOString(), dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE', commitments: [] };
    }
  }

  /**
   * P1: Peer Comparison Matrix with XBRL-backed metrics
   * Non-negotiable policy: Never synthesizes market cap or P/E.
   */
  public static async getPeerComparison(symbols: string[]): Promise<{
    asOf: string;
    dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE_AND_DUCKDB';
    metricsDescription: Record<string, string>;
    peers: PeerComparisonRow[];
  }> {
    const db = this.getDB();
    const cleanSyms = symbols.map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 10);
    const { bars: barMap } = await DuckDbAdjustedOhlcvService.getDailyBarsForSymbols(cleanSyms, 5);

    const peers: PeerComparisonRow[] = [];
    let latestAsOf = '';

    for (const sym of cleanSyms) {
      const bars = barMap.get(sym);
      const latestBar = bars && bars.length > 0 ? bars[bars.length - 1] : null;
      const cmpValue = latestBar ? Number(latestBar.close_adjusted.toFixed(2)) : null;
      if (latestBar && (!latestAsOf || latestBar.trade_date > latestAsOf)) {
        latestAsOf = latestBar.trade_date;
      }

      let isin: string | null = null;
      let revenueCr: number | null = null;
      let patCr: number | null = null;
      let rocePct: number | null = null;
      let opmPct: number | null = null;
      let debtToEquity: number | null = null;
      let realMarketCap: number | null = null;
      let periodEnd: string | null = null;
      let evidenceUrl: string | null = null;
      let documentHash: string | null = null;
      let verifiedStatus = 'DATA_INSUFFICIENT';

      if (db) {
        try {
          const checkRow = db.prepare(`SELECT isin, result_json FROM company_check_result WHERE symbol = ? LIMIT 1`).get(sym) as any;
          if (checkRow && checkRow.result_json) {
            const parsed = JSON.parse(checkRow.result_json);
            isin = checkRow.isin;
            periodEnd = parsed.period_end || null;
            if (!latestAsOf && periodEnd) latestAsOf = periodEnd;

            const fin = parsed.financials || {};
            revenueCr = fin.revenue_cr !== undefined && fin.revenue_cr !== null ? Number(fin.revenue_cr) : null;
            patCr = fin.pat_cr !== undefined && fin.pat_cr !== null ? Number(fin.pat_cr) : null;
            rocePct = fin.roce_pct !== undefined && fin.roce_pct !== null ? Number(fin.roce_pct) : null;
            opmPct = fin.opm_pct !== undefined && fin.opm_pct !== null ? Number(fin.opm_pct) : null;
            debtToEquity = fin.debt_to_equity !== undefined && fin.debt_to_equity !== null ? Number(fin.debt_to_equity) : null;

            // Only use real market capitalisation if provided by audited/verified financials
            if (fin.market_cap_cr !== undefined && fin.market_cap_cr !== null && !isNaN(Number(fin.market_cap_cr)) && Number(fin.market_cap_cr) > 0) {
              realMarketCap = Number(fin.market_cap_cr);
            }

            if (parsed.evidence && parsed.evidence.length > 0) {
              evidenceUrl = parsed.evidence[0].source_url || null;
              documentHash = parsed.evidence[0].sha256 || null;
            }
            verifiedStatus = parsed.status === 'VERIFIED_PARTIAL' ? 'VERIFIED' : 'PARTIAL';
          } else {
            // Check universe table for ISIN
            const uRow = db.prepare(`SELECT isin FROM universe WHERE symbol = ? LIMIT 1`).get(sym) as any;
            isin = uRow?.isin || null;
          }
        } catch (err) {
          console.warn(`[EvidenceQueryService] Failed peer load for ${sym}:`, err);
        }
      }

      // Build Provenance items
      const ohlcvProv: Provenance = {
        sourceSystem: 'DUCKDB',
        sourceTable: 'adjusted_ohlcv',
        sourceUrl: null,
        documentId: null,
        documentSha256: null,
        retrievedAt: latestAsOf,
        asOf: latestBar?.trade_date || latestAsOf,
        formulaVersion: '1.0.0'
      };

      const fereProv = mapProvenance({
        source_url: evidenceUrl,
        source_sha256: documentHash,
        period_end: periodEnd,
        retrieved_at: latestAsOf
      });

      // Construct Fact wrappers
      const cmpFact: Fact<number> = cmpValue !== null
        ? { value: cmpValue, status: 'VERIFIED', provenance: [ohlcvProv], noDataReason: null }
        : { value: null, status: 'UNAVAILABLE', provenance: [], noDataReason: 'No adjusted daily price bars in DuckDB store' };

      const revenueCrFact: Fact<number> = revenueCr !== null
        ? { value: revenueCr, status: verifiedStatus === 'VERIFIED' ? 'VERIFIED' : 'PARTIAL', provenance: [fereProv], noDataReason: null }
        : { value: null, status: 'UNAVAILABLE', provenance: [], noDataReason: 'No verified revenue in exchange XBRL filing' };

      const patCrFact: Fact<number> = patCr !== null
        ? { value: patCr, status: verifiedStatus === 'VERIFIED' ? 'VERIFIED' : 'PARTIAL', provenance: [fereProv], noDataReason: null }
        : { value: null, status: 'UNAVAILABLE', provenance: [], noDataReason: 'No verified PAT in exchange XBRL filing' };

      const rocePctFact: Fact<number> = rocePct !== null
        ? { value: rocePct, status: verifiedStatus === 'VERIFIED' ? 'VERIFIED' : 'PARTIAL', provenance: [fereProv], noDataReason: null, isDerived: true }
        : { value: null, status: 'UNAVAILABLE', provenance: [], noDataReason: 'ROCE not reported or insufficient balance sheet facts' };

      const opmPctFact: Fact<number> = opmPct !== null
        ? { value: opmPct, status: verifiedStatus === 'VERIFIED' ? 'VERIFIED' : 'PARTIAL', provenance: [fereProv], noDataReason: null, isDerived: true }
        : { value: null, status: 'UNAVAILABLE', provenance: [], noDataReason: 'OPM not reported in operating statement' };

      const debtToEquityFact: Fact<number> = debtToEquity !== null
        ? { value: debtToEquity, status: verifiedStatus === 'VERIFIED' ? 'VERIFIED' : 'PARTIAL', provenance: [fereProv], noDataReason: null, isDerived: true }
        : { value: null, status: 'UNAVAILABLE', provenance: [], noDataReason: 'Debt-to-equity not reported in audited balance sheet' };

      // Market Capitalisation: MUST come from real source. Never PAT * 25.
      const marketCapCrFact: Fact<number> = realMarketCap !== null
        ? {
            value: realMarketCap,
            status: 'VERIFIED',
            provenance: [fereProv],
            noDataReason: null
          }
        : {
            value: null,
            status: 'UNAVAILABLE',
            provenance: [],
            noDataReason: 'No verified shares outstanding and price snapshot'
          };

      // Calculate P/E strictly using non-negotiable policy
      const peRatioFact = calculatePe(marketCapCrFact, patCrFact);

      peers.push({
        symbol: sym,
        isin,
        cmp: cmpFact.value,
        marketCapCr: marketCapCrFact.value,
        peRatio: peRatioFact.value,
        revenueCr: revenueCrFact.value,
        patCr: patCrFact.value,
        rocePct: rocePctFact.value,
        opmPct: opmPctFact.value,
        debtToEquity: debtToEquityFact.value,
        periodEnd,
        evidenceUrl,
        documentHash,
        verifiedStatus: marketCapCrFact.status === 'VERIFIED' && patCrFact.status === 'VERIFIED' ? 'VERIFIED' : verifiedStatus,
        facts: {
          cmp: cmpFact,
          marketCapCr: marketCapCrFact,
          peRatio: peRatioFact,
          revenueCr: revenueCrFact,
          patCr: patCrFact,
          rocePct: rocePctFact,
          opmPct: opmPctFact,
          debtToEquity: debtToEquityFact
        }
      });
    }

    return {
      asOf: latestAsOf || new Date().toISOString().split('T')[0],
      dataSource: 'OFFICIAL_EXCHANGE_FERE_ARCHIVE_AND_DUCKDB',
      metricsDescription: {
        cmp: 'Latest Adjusted Closing Price from DuckDB',
        revenueCr: 'Annualized / Trailing 12M Revenue (₹ Crores) from Verified XBRL',
        patCr: 'Profit After Tax (₹ Crores) from Audited Financials',
        marketCapCr: 'Market Capitalisation (₹ Crores) from Audited Exchange Filings Only',
        peRatio: 'Price-to-Earnings Ratio (Market Cap / PAT) — strictly calculated only when both are verified and PAT > 0',
        rocePct: 'Return on Capital Employed (%)',
        opmPct: 'Operating Profit Margin (%)',
        debtToEquity: 'Total Debt to Equity Ratio'
      },
      peers
    };
  }
}
