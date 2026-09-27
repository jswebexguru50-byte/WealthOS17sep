import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface FereEvidenceSummary {
  status: 'VERIFIED_PARTIAL' | 'DATA_INSUFFICIENT' | 'SOURCE_UNAVAILABLE';
  isin: string | null;
  verifiedFactCount: number;
  verifiedMetricCount: number;
  identityReviewCount: number;
  documents: Array<{
    sourceUrl: string; filingTimestamp: string | null; periodEnd: string | null;
    scope: string | null; sha256: string | null; status: string;
  }>;
  metricCoverage: Array<{ metric: string; periodEnd: string | null; status: string; missingFields: string[]; reason: string | null }>;
  missingFields: string[];
  companyCheck: Record<string, unknown> | null;
}

const evidencePath = path.resolve('data', 'fere', 'verified_filings', 'fere_evidence.db');

// Persistent read-only Better-SQLite3 instance for ultra-fast (sub-millisecond) card queries
let readDbInstance: Database.Database | null = null;
function getReadDb(): Database.Database | null {
  if (!fs.existsSync(evidencePath)) return null;
  if (!readDbInstance) {
    try {
      readDbInstance = new Database(evidencePath, { readonly: true, fileMustExist: true });
      readDbInstance.pragma('query_only = ON');
      readDbInstance.pragma('mmap_size = 268435456');
    } catch (e) {
      console.warn('[FereEvidenceService] Failed to open better-sqlite3 instance:', e);
      return null;
    }
  }
  return readDbInstance;
}

const openDb = (mode = sqlite3.OPEN_READWRITE): sqlite3.Database => new sqlite3.Database(evidencePath, mode);
const run = (db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> => new Promise((resolve, reject) => {
  db.run(sql, params, error => error ? reject(error) : resolve());
});
const get = <T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row as T | undefined));
});

export async function createFereRefreshJob(symbol: string): Promise<string> {
  const id = randomUUID(); const db = openDb(); const timestamp = new Date().toISOString();
  try {
    await run(db, `CREATE TABLE IF NOT EXISTS company_refresh_job (
      id TEXT PRIMARY KEY, symbol TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL,
      detail TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT)`);
    await run(db, `INSERT INTO company_refresh_job(id,symbol,status,stage,created_at,updated_at)
      VALUES(?,?,'QUEUED','QUEUED',?,?)`, [id, symbol, timestamp, timestamp]);
    return id;
  } finally { db.close(); }
}

export async function readFereRefreshJob(id: string): Promise<Record<string, unknown> | null> {
  const db = getReadDb();
  if (!db) return null;
  try {
    const row = db.prepare(`SELECT id,symbol,status,stage,detail,created_at AS createdAt,
      updated_at AS updatedAt,completed_at AS completedAt FROM company_refresh_job WHERE id=?`).get(id);
    return (row as Record<string, unknown>) || null;
  } catch { return null; }
}

export async function listFereClaimCandidates(isinOrSymbol: string): Promise<Array<Record<string, unknown>>> {
  const db = getReadDb();
  if (!db) return [];
  try {
    const rows = db.prepare(`SELECT id,claim_date AS claimDate,source_url AS sourceUrl,
      source_sha256 AS sourceSha256,evidence_text AS evidenceText,detected_metric AS metric,
      detected_target AS target,detected_unit AS unit,detected_deadline AS deadline,decision
      FROM management_claim_candidate WHERE (isin=? OR symbol=?) AND decision='PENDING' ORDER BY claim_date DESC`).all(isinOrSymbol, isinOrSymbol);
    return rows as Array<Record<string, unknown>>;
  } catch { return []; }
}

export async function decideFereClaim(candidateId: number, decision: 'ACCEPT'|'EDIT'|'IGNORE', edits: any = {}): Promise<void> {
  const db = openDb();
  try {
    const row = await get<any>(db, 'SELECT * FROM management_claim_candidate WHERE id=?', [candidateId]);
    if (!row) throw new Error('Claim candidate not found');
    if (decision === 'IGNORE') { await run(db, "UPDATE management_claim_candidate SET decision='IGNORE' WHERE id=?", [candidateId]); return; }
    const metric = String(edits.metric ?? row.detected_metric ?? '').trim();
    if (!metric) throw new Error('Accepted commitment requires a metric');
    await run(db, `INSERT INTO management_commitment
      (isin,symbol,claim_date,source_url,source_sha256,source_evidence,metric,target,unit,deadline,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,'OPEN') ON CONFLICT(isin,source_sha256,source_evidence) DO UPDATE SET
      metric=excluded.metric,target=excluded.target,unit=excluded.unit,deadline=excluded.deadline,status='OPEN'`,
      [row.isin,row.symbol,row.claim_date,row.source_url,row.source_sha256,row.evidence_text,metric,
       edits.target ?? row.detected_target,edits.unit ?? row.detected_unit,edits.deadline ?? row.detected_deadline]);
    await run(db, 'UPDATE management_claim_candidate SET decision=? WHERE id=?', [decision, candidateId]);
  } finally { db.close(); }
}

export async function readFereEvidence(isin: string | null, symbol: string): Promise<FereEvidenceSummary> {
  const empty: FereEvidenceSummary = {
    status: 'SOURCE_UNAVAILABLE', isin, verifiedFactCount: 0,
    verifiedMetricCount: 0, identityReviewCount: 0, documents: [], metricCoverage: [],
    missingFields: ['filing_evidence', 'complete_formula_inputs'], companyCheck: null
  };
  const db = getReadDb();
  if (!db) return empty;

  try {
    let resolvedIsin = isin;
    let checkRow: any = null;

    // Fast Path 1: Check pre-computed company_check_result by symbol directly
    if (symbol) {
      checkRow = db.prepare('SELECT isin, result_json FROM company_check_result WHERE symbol = ? LIMIT 1').get(symbol);
    }
    // Fast Path 2: Check by ISIN if symbol didn't match
    if (!checkRow && resolvedIsin) {
      checkRow = db.prepare('SELECT isin, result_json FROM company_check_result WHERE isin = ? LIMIT 1').get(resolvedIsin);
    }
    if (checkRow && !resolvedIsin) {
      resolvedIsin = checkRow.isin;
    }
    if (!resolvedIsin && symbol) {
      const uRow = db.prepare('SELECT isin FROM universe WHERE symbol = ? LIMIT 1').get(symbol) as any;
      resolvedIsin = uRow?.isin || null;
    }

    if (checkRow?.result_json) {
      const companyCheck = JSON.parse(checkRow.result_json);
      return {
        status: companyCheck.status === 'VERIFIED_PARTIAL' ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        isin: resolvedIsin,
        verifiedFactCount: Array.isArray(companyCheck.evidence) ? companyCheck.evidence.length : 0,
        verifiedMetricCount: Object.keys(companyCheck.financials || {}).length,
        identityReviewCount: 0,
        documents: (companyCheck.evidence || []).map((e: any) => ({
          sourceUrl: e.source_url || '',
          filingTimestamp: null,
          periodEnd: companyCheck.period_end || null,
          scope: 'STANDALONE',
          sha256: e.sha256 || null,
          status: 'VERIFIED'
        })),
        metricCoverage: [],
        missingFields: companyCheck.missing_information || [],
        companyCheck
      };
    }

    // Path 3: Fallback query if no card has been pre-computed yet
    if (!resolvedIsin) return empty;

    const documents = db.prepare(`
      SELECT source_url AS sourceUrl, filing_timestamp AS filingTimestamp,
             period_end AS periodEnd, statement_scope AS scope, sha256, status
        FROM filing_document WHERE isin = ? AND sha256 IS NOT NULL
       ORDER BY period_end DESC, filing_timestamp DESC LIMIT 30`).all(resolvedIsin) as any[];

    const factCountRow = db.prepare('SELECT COUNT(*) AS count FROM verified_xbrl_fact WHERE isin = ?').get(resolvedIsin) as any;
    const metricCountRow = db.prepare("SELECT COUNT(*) AS count FROM verified_metric WHERE isin = ? AND status = 'VERIFIED'").get(resolvedIsin) as any;
    const reviewCountRow = db.prepare("SELECT COUNT(*) AS count FROM filing_document WHERE (symbol = ? OR isin = ?) AND status = 'IDENTITY_REVIEW'").get(symbol, resolvedIsin) as any;

    const coverageRows = db.prepare('SELECT metric,period_end AS periodEnd,status,missing_fields AS missingFields,reason FROM metric_coverage WHERE isin=? ORDER BY metric').all(resolvedIsin) as any[];

    const metricCoverage = coverageRows.map(row => ({
      metric: row.metric, periodEnd: row.periodEnd, status: row.status,
      missingFields: JSON.parse(row.missingFields || '[]') as string[], reason: row.reason
    }));
    const verifiedFactCount = factCountRow?.count || 0;
    const verifiedMetricCount = metricCountRow?.count || 0;

    return {
      status: verifiedFactCount ? 'VERIFIED_PARTIAL' : documents.length ? 'DATA_INSUFFICIENT' : 'SOURCE_UNAVAILABLE',
      isin: resolvedIsin,
      verifiedFactCount,
      verifiedMetricCount,
      identityReviewCount: reviewCountRow?.count || 0,
      documents,
      metricCoverage,
      missingFields: verifiedMetricCount ? [] : [...new Set(metricCoverage.flatMap(row => row.missingFields))],
      companyCheck: null
    };
  } catch (err) {
    console.error(`[FereEvidenceService] Error in readFereEvidence for ${symbol}:`, err);
    return empty;
  }
}
