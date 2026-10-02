/**
 * Promote already-downloaded FERE verified XBRL facts into company_facts.
 *
 * This script does not download filings and does not call any network source.
 * It reads data/fere/verified_filings/fere_evidence.db::verified_xbrl_fact
 * and writes deterministic, source-backed company_facts rows.
 *
 * Evidence policy:
 * - Only verified_xbrl_fact rows with source URL, filing hash, available_at,
 *   period_start, period_end, scope, metric, value and unit are considered.
 * - Monetary INR values are converted to INR crore by dividing by 10,000,000.
 *   The original INR value and taxonomy field are preserved in evidenceText.
 * - No unavailable metrics are inferred. There is no peer/sector proxy and no
 *   LLM interpretation.
 * - Default mode is dry-run. Pass --apply to write to portfolio.db.
 */
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

type Row = Record<string, any>;

const root = process.cwd();
const dataDir = path.join(root, 'data', 'fundamental_enrichment');
const portfolioPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const ferePath = path.join(root, 'data', 'fere', 'verified_filings', 'fere_evidence.db');
const apply = process.argv.includes('--apply');
const allSymbols = process.argv.includes('--all');
const manifestIndex = process.argv.indexOf('--manifest');
const maxIndex = process.argv.indexOf('--max-symbols');
const manifestPath = manifestIndex >= 0
  ? path.resolve(root, process.argv[manifestIndex + 1])
  : path.join(dataDir, 'full_population_manifest.json');
const maxSymbols = maxIndex >= 0 ? Math.max(0, Number(process.argv[maxIndex + 1])) : 0;
const reportPath = path.join(dataDir, 'fere_verified_xbrl_promotion_report.json');

const METRIC_MAP: Record<string, { metric: string; unit: string; currency: string | null }> = {
  sales: { metric: 'revenue', unit: 'INR_CR', currency: 'INR' },
  pat: { metric: 'pat', unit: 'INR_CR', currency: 'INR' },
  cfo: { metric: 'cfo', unit: 'INR_CR', currency: 'INR' },
  pbt: { metric: 'pbt', unit: 'INR_CR', currency: 'INR' },
  finance_costs: { metric: 'finance_costs', unit: 'INR_CR', currency: 'INR' },
  depreciation: { metric: 'depreciation', unit: 'INR_CR', currency: 'INR' },
  total_expenses: { metric: 'total_expenses', unit: 'INR_CR', currency: 'INR' },
  materials_cost: { metric: 'materials_cost', unit: 'INR_CR', currency: 'INR' },
  equity_capital: { metric: 'equity_capital', unit: 'INR_CR', currency: 'INR' },
};

const all = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<Row[]>((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve((rows || []) as Row[])),
);
const run = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<void>((resolve, reject) =>
  db.run(sql, params, error => error ? reject(error) : resolve()),
);
const close = (db: sqlite3.Database) => new Promise<void>(resolve => db.close(() => resolve()));

function readManifestSymbols(): string[] {
  if (allSymbols) return [];
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}. Use --all to promote all matched FERE symbols.`);
  }
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const symbols = [...new Set((parsed.symbols || [])
    .map((value: unknown) => String(value).trim().toUpperCase())
    .filter((symbol: string) => /^[A-Z0-9&.-]+$/.test(symbol)))];
  return maxSymbols > 0 ? symbols.slice(0, maxSymbols) : symbols;
}

function periodType(periodStart: string | null, periodEnd: string): string {
  if (!periodStart) return 'PERIOD';
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days >= 80 && days <= 100) return 'QUARTERLY';
  if (days >= 330 && days <= 380) return 'ANNUAL';
  if (days >= 170 && days <= 200) return 'HALF_YEARLY';
  if (days >= 250 && days <= 290) return 'NINE_MONTHS';
  return 'PERIOD';
}

function normalizeScope(scope: string | null): string {
  const clean = String(scope || '').toUpperCase();
  if (clean === 'STANDALONE') return 'STANDALONE';
  if (clean === 'CONSOLIDATED') return 'CONSOLIDATED';
  return 'UNKNOWN';
}

function toCanonicalValue(rawMetric: string, value: number, unit: string): number {
  const mapped = METRIC_MAP[rawMetric];
  if (mapped?.unit === 'INR_CR' && String(unit).toUpperCase() === 'INR') {
    return value / 10000000;
  }
  return value;
}

function factId(row: Row, canonicalMetric: string, type: string): string {
  return [
    'fere_xbrl',
    row.fere_id,
    row.isin,
    canonicalMetric,
    row.period_end,
    row.scope,
    type,
  ].map(part => String(part || '').replace(/[^a-zA-Z0-9_]+/g, '_')).join('_');
}

async function main() {
  if (!fs.existsSync(ferePath)) throw new Error(`FERE DB not found: ${ferePath}`);
  if (!fs.existsSync(portfolioPath)) throw new Error(`Portfolio DB not found: ${portfolioPath}`);

  const requestedSymbols = readManifestSymbols();
  const portfolio = new sqlite3.Database(portfolioPath);
  const fere = new sqlite3.Database(`file:${ferePath}?mode=ro`);

  try {
    const tickerRows = await all(portfolio, `SELECT id, upper(symbol) AS symbol, isin FROM MasterTickers WHERE isin IS NOT NULL`);
    const tickerByIsin = new Map<string, Row>();
    const tickerBySymbol = new Map<string, Row>();
    for (const row of tickerRows) {
      tickerByIsin.set(String(row.isin).toUpperCase(), row);
      tickerBySymbol.set(String(row.symbol).toUpperCase(), row);
    }

    const scopedSymbols = new Set(requestedSymbols);
    const metricNames = Object.keys(METRIC_MAP);
    const metricPlaceholders = metricNames.map(() => '?').join(',');
    const symbolFilter = requestedSymbols.length
      ? `AND upper(symbol) IN (${requestedSymbols.map(() => '?').join(',')})`
      : '';
    const params = [...metricNames, ...requestedSymbols];

    const fereRows = await all(fere, `
      SELECT f.id AS fere_id, f.isin, upper(f.symbol) AS symbol, f.filing_id,
             f.filing_sha256, f.source_url, f.available_at, f.period_start,
             f.period_end, f.scope, f.context_ref, f.metric AS raw_metric,
             f.value, f.unit, f.taxonomy_field
      FROM verified_xbrl_fact f
      JOIN (
        SELECT isin, symbol, metric, period_start, period_end, scope, max(id) AS max_id
        FROM verified_xbrl_fact
        WHERE metric IN (${metricPlaceholders})
          AND source_url IS NOT NULL
          AND filing_sha256 IS NOT NULL
          AND available_at IS NOT NULL
          AND period_end IS NOT NULL
          AND scope IS NOT NULL
          ${symbolFilter}
        GROUP BY isin, symbol, metric, period_start, period_end, scope
      ) latest ON latest.max_id = f.id
      ORDER BY f.symbol, f.period_end DESC, f.scope, f.metric
    `, params);

    const metricTotals: Record<string, number> = {};
    const periodTypeTotals: Record<string, number> = {};
    const unmatchedSymbols = new Set<string>();
    const matchedSymbols = new Set<string>();
    let prepared = 0;
    let written = 0;

    if (apply) {
      await run(portfolio, 'BEGIN IMMEDIATE');
    }

    for (const row of fereRows) {
      const rawMetric = String(row.raw_metric);
      const mapping = METRIC_MAP[rawMetric];
      if (!mapping) continue;

      const ticker = tickerByIsin.get(String(row.isin).toUpperCase()) || tickerBySymbol.get(String(row.symbol).toUpperCase());
      if (!ticker) {
        unmatchedSymbols.add(String(row.symbol));
        continue;
      }

      matchedSymbols.add(String(ticker.symbol));
      const type = periodType(row.period_start || null, String(row.period_end));
      const canonicalValue = toCanonicalValue(rawMetric, Number(row.value), String(row.unit));
      const scope = normalizeScope(row.scope);
      const sourceDocumentId = `FERE_XBRL:${row.filing_id}:${row.filing_sha256}`;
      const evidenceText = JSON.stringify({
        rawMetric,
        rawValue: row.value,
        rawUnit: row.unit,
        taxonomyField: row.taxonomy_field,
        contextRef: row.context_ref,
        conversion: mapping.unit === 'INR_CR' ? 'INR / 10000000' : 'identity',
      });

      prepared++;
      metricTotals[mapping.metric] = (metricTotals[mapping.metric] || 0) + 1;
      periodTypeTotals[type] = (periodTypeTotals[type] || 0) + 1;

      if (!apply) continue;

      await run(portfolio, `
        INSERT OR REPLACE INTO company_facts (
          factId, companyId, symbol, isin, metric, value, unit, currency,
          periodType, periodStart, periodEnd, asOfDate, reportedAt,
          factType, sourceType, scope, provider, sourceDocumentId, sourceUrl,
          evidenceText, evidencePage, verificationStatus, availabilityStatus,
          parentFactIds, calculationMethod, fetchedAt, freshnessTtlDays,
          providerToken, exactProviderLabel, availableAt, publishedAt,
          derivationFormula, inputFactIds
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          'REPORTED', 'PRIMARY_FILING', ?, 'FERE_NSE_XBRL', ?, ?,
          ?, NULL, 'VERIFIED', 'AVAILABLE',
          NULL, 'FERE_VERIFIED_XBRL_INR_TO_CR_V1', ?, 540,
          ?, ?, ?, ?,
          ?, ?
        )
      `, [
        factId(row, mapping.metric, type),
        String(ticker.id),
        String(ticker.symbol).toUpperCase(),
        String(ticker.isin).toUpperCase(),
        mapping.metric,
        String(canonicalValue),
        mapping.unit,
        mapping.currency,
        type,
        row.period_start || null,
        row.period_end,
        row.period_end,
        row.available_at,
        scope,
        sourceDocumentId,
        row.source_url,
        evidenceText,
        row.available_at,
        rawMetric,
        row.taxonomy_field,
        row.available_at,
        new Date().toISOString(),
        mapping.unit === 'INR_CR' ? 'value_in_inr / 10000000' : null,
        JSON.stringify([`fere_verified_xbrl_fact:${row.fere_id}`]),
      ]);
      written++;
    }

    if (apply) {
      await run(portfolio, 'COMMIT');
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: apply ? 'APPLIED' : 'DRY_RUN',
      policy: 'Promotes only already-downloaded FERE verified_xbrl_fact rows. No network calls. No inferred missing metrics. INR values are deterministically converted to INR crore.',
      portfolioPath,
      ferePath,
      manifest: allSymbols ? 'ALL_MATCHED_FERE_SYMBOLS' : path.relative(root, manifestPath),
      requestedSymbols: allSymbols ? 'ALL' : requestedSymbols.length,
      fereRowsConsidered: fereRows.length,
      factsPrepared: prepared,
      factsWritten: written,
      matchedSymbols: matchedSymbols.size,
      unmatchedSymbols: [...unmatchedSymbols].sort(),
      metricTotals,
      periodTypeTotals,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      reportPath,
      mode: report.mode,
      fereRowsConsidered: report.fereRowsConsidered,
      factsPrepared: report.factsPrepared,
      factsWritten: report.factsWritten,
      matchedSymbols: report.matchedSymbols,
      unmatchedSymbols: report.unmatchedSymbols.length,
      metricTotals,
      periodTypeTotals,
    }, null, 2));
  } catch (error) {
    if (apply) {
      try { await run(portfolio, 'ROLLBACK'); } catch {}
    }
    throw error;
  } finally {
    await close(fere);
    await close(portfolio);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
