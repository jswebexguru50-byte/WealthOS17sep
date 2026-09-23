import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

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
