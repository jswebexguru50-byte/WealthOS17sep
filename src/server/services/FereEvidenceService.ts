import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
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
  if (!fs.existsSync(evidencePath)) return null;
  const db = openDb(sqlite3.OPEN_READONLY);
  try {
    const row = await get<any>(db, `SELECT id,symbol,status,stage,detail,created_at AS createdAt,
      updated_at AS updatedAt,completed_at AS completedAt FROM company_refresh_job WHERE id=?`, [id]);
    return row || null;
  } catch { return null; } finally { db.close(); }
}

export async function listFereClaimCandidates(isin: string): Promise<Array<Record<string, unknown>>> {
  const db = openDb(sqlite3.OPEN_READONLY);
  try {
    return await new Promise((resolve, reject) => db.all(`SELECT id,claim_date AS claimDate,source_url AS sourceUrl,
      source_sha256 AS sourceSha256,evidence_text AS evidenceText,detected_metric AS metric,
      detected_target AS target,detected_unit AS unit,detected_deadline AS deadline,decision
      FROM management_claim_candidate WHERE isin=? AND decision='PENDING' ORDER BY claim_date DESC`, [isin],
      (error, rows) => error ? reject(error) : resolve(rows as Array<Record<string, unknown>>)));
  } catch { return []; } finally { db.close(); }
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
  if (!isin || !fs.existsSync(evidencePath)) return empty;
  const db = new sqlite3.Database(evidencePath, sqlite3.OPEN_READONLY);
  const all = <T>(sql: string, params: unknown[]): Promise<T[]> => new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows as T[]));
  });
  try {
    const documents = await all<any>(`
      SELECT source_url AS sourceUrl, filing_timestamp AS filingTimestamp,
             period_end AS periodEnd, statement_scope AS scope, sha256, status
        FROM filing_document WHERE isin = ? AND sha256 IS NOT NULL
       ORDER BY period_end DESC, filing_timestamp DESC LIMIT 30`, [isin]);
    const facts = await all<{ count: number }>(
      'SELECT COUNT(*) AS count FROM verified_xbrl_fact WHERE isin = ?', [isin]);
    const metrics = await all<{ count: number }>(
      "SELECT COUNT(*) AS count FROM verified_metric WHERE isin = ? AND status = 'VERIFIED'", [isin]);
    const reviews = await all<{ count: number }>(
      "SELECT COUNT(*) AS count FROM filing_document WHERE symbol = ? AND isin = ? AND status = 'IDENTITY_REVIEW'", [symbol, isin]);
    const coverageRows = await all<any>(
      'SELECT metric,period_end AS periodEnd,status,missing_fields AS missingFields,reason FROM metric_coverage WHERE isin=? ORDER BY metric', [isin]);
    const companyChecks = await all<{ resultJson: string }>(
      'SELECT result_json AS resultJson FROM company_check_result WHERE isin=? LIMIT 1', [isin]).catch(() => []);
    const metricCoverage = coverageRows.map(row => ({
      metric: row.metric, periodEnd: row.periodEnd, status: row.status,
      missingFields: JSON.parse(row.missingFields || '[]') as string[], reason: row.reason
    }));
    const verifiedFactCount = facts[0]?.count || 0;
    const verifiedMetricCount = metrics[0]?.count || 0;
    return {
      status: verifiedFactCount ? 'VERIFIED_PARTIAL' : documents.length ? 'DATA_INSUFFICIENT' : 'SOURCE_UNAVAILABLE',
      isin, verifiedFactCount, verifiedMetricCount, identityReviewCount: reviews[0]?.count || 0,
      documents, metricCoverage,
      missingFields: verifiedMetricCount ? [] : [...new Set(metricCoverage.flatMap(row => row.missingFields))],
      companyCheck: companyChecks[0]?.resultJson ? JSON.parse(companyChecks[0].resultJson) : null
    };
  } catch {
    return empty;
  } finally {
    db.close();
  }
}
