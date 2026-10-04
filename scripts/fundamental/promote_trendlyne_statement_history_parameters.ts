/**
 * Promote stored Trendlyne statement-history parameter snapshots into
 * company_facts where period anchoring is safe.
 *
 * Evidence policy:
 * - Values come from Trendlyne's statement_history_parameters snapshot.
 * - Quarterly relative labels (Qtr, 1Q Ago, etc.) are promoted only when the
 *   same symbol has an explicit Trendlyne quarter label already persisted from
 *   shareholding history.
 * - The latest explicit quarter is used as the anchor for "Qtr"; previous
 *   quarters are derived mechanically.
 * - Facts are VERIFIED_PARTIAL and calculationMethod is
 *   TRENDLYNE_STATEMENT_HISTORY_QUARTER_ANCHORED.
 * - Annual relative fields are intentionally not promoted here; they require a
 *   separate annual-period anchor.
 *
 * Default mode is dry-run. Pass --apply to write company_facts.
 */
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

type Row = Record<string, unknown>;

const root = process.cwd();
const dataDir = path.join(root, 'data', 'fundamental_enrichment');
const manifestIndex = process.argv.indexOf('--manifest');
const maxIndex = process.argv.indexOf('--max-symbols');
const manifestPath = manifestIndex >= 0
  ? path.resolve(root, process.argv[manifestIndex + 1])
  : path.join(dataDir, 'full_population_manifest.json');
const maxSymbols = maxIndex >= 0 ? Math.max(0, Number(process.argv[maxIndex + 1])) : 230;
const apply = process.argv.includes('--apply');
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const manifestSlug = path.basename(manifestPath).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_json$/i, '');
const reportPath = path.join(dataDir, `trendlyne_statement_history_promotion_report_${manifestSlug}.json`);

type MetricMapping = {
  label: string;
  metric: string;
  offset: number;
  token: string;
};

const QUARTERLY_MAPPINGS: MetricMapping[] = [
  { label: 'Operating Rev. Qtr', metric: 'revenue', offset: 0, token: 'srq' },
  { label: 'Operating Rev.1Q Ago', metric: 'revenue', offset: 1, token: 'srqmq1' },
  { label: 'Operating Rev. 2Q ago', metric: 'revenue', offset: 2, token: 'srqmq2' },
  { label: 'Operating Rev. 3Q ago', metric: 'revenue', offset: 3, token: 'srqmq3' },
  { label: 'Operating Rev. 4Q ago', metric: 'revenue', offset: 4, token: 'srqmy1' },
  { label: 'Operating Rev. 5Q ago', metric: 'revenue', offset: 5, token: 'srqmq5' },
  { label: 'Operating Rev. 6Q ago', metric: 'revenue', offset: 6, token: 'srqmq6' },
  { label: 'Operating Rev. 7Q ago', metric: 'revenue', offset: 7, token: 'srqmq7' },

  { label: 'Operating Profit Qtr', metric: 'operating_profit', offset: 0, token: 'opq' },
  { label: 'Operating Profit 1Q Ago', metric: 'operating_profit', offset: 1, token: 'opqmq1' },
  { label: 'Operating Profit 2Q Ago', metric: 'operating_profit', offset: 2, token: 'opqmq2' },
  { label: 'Operating Profit 3Q Ago', metric: 'operating_profit', offset: 3, token: 'opqmq3' },
  { label: 'Operating Profit 4Q Ago', metric: 'operating_profit', offset: 4, token: 'opqmy1' },
  { label: 'Operating Profit 5Qtr Ago', metric: 'operating_profit', offset: 5, token: 'opqmq5' },
  { label: 'Operating Profit 6Qtr Ago', metric: 'operating_profit', offset: 6, token: 'opqmq6' },
  { label: 'Operating Profit 7Qtr Ago', metric: 'operating_profit', offset: 7, token: 'opqmq7' },

  { label: 'Net Profit Qtr', metric: 'pat', offset: 0, token: 'npq' },
  { label: 'Net Profit 1Q Ago', metric: 'pat', offset: 1, token: 'npqmq1' },
  { label: 'Net Profit 2Q Ago', metric: 'pat', offset: 2, token: 'npqmq2' },
  { label: 'Net Profit 3Q Ago', metric: 'pat', offset: 3, token: 'npqmq3' },
  { label: 'Net Profit 4Q Ago', metric: 'pat', offset: 4, token: 'npqmy1' },
  { label: 'Net Profit 5Q Ago', metric: 'pat', offset: 5, token: 'npqmq5' },
  { label: 'Net Profit 6Q Ago', metric: 'pat', offset: 6, token: 'npqmq6' },
  { label: 'Net Profit 7Q Ago', metric: 'pat', offset: 7, token: 'npqmq7' },
];

const ANNUAL_MAPPINGS: MetricMapping[] = [
  { label: 'Cash from Operating Act. Ann.', metric: 'cfo', offset: 0, token: 'cfoa' },
  { label: 'Cash from Operating Act. Ann. 1Y Ago', metric: 'cfo', offset: 1, token: 'cfoamy1' },
  { label: 'Cash from Operating Act. Ann. 2Y Ago', metric: 'cfo', offset: 2, token: 'cfoamy2' },
  { label: 'Capex Ann.', metric: 'capex_cash_outflow', offset: 0, token: 'capitalexpenditurea' },
];

const all = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<Row[]>((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve((rows || []) as Row[])),
);
const get = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<Row | undefined>((resolve, reject) =>
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row as Row | undefined)),
);
const run = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<void>((resolve, reject) =>
  db.run(sql, params, error => error ? reject(error) : resolve()),
);
const close = (db: sqlite3.Database) => new Promise<void>(resolve => db.close(() => resolve()));

function readSymbols() {
  if (!fs.existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const symbols = [...new Set((parsed.symbols || [])
    .map((value: unknown) => String(value).trim().toUpperCase())
    .filter((symbol: string) => /^[A-Z0-9&.-]+$/.test(symbol)))];
  return maxSymbols > 0 ? symbols.slice(0, maxSymbols) : symbols;
}

function textFromResponse(raw: unknown): string {
  try {
    const outer = JSON.parse(String(raw));
    const nested = outer?.content?.[0]?.text || outer?.structuredContent?.result || '';
    const inner = JSON.parse(nested);
    return typeof inner?.data === 'string' ? inner.data : nested;
  } catch {
    return String(raw || '');
  }
}

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const clean = value.trim();
  if (!clean || /^None$/i.test(clean)) return null;
  const parsed = Number(clean.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStatementBlocks(text: string) {
  const result = new Map<string, Map<string, string>>();
  const blocks = text.split(/\n---\n/g);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length < 2 || /^\d+\|/.test(lines[0])) continue;
    const entries = new Map<string, string>();
    for (const line of lines.slice(1)) {
      const match = line.match(/^([A-Z0-9&.-]+):(.+)$/);
      if (match) entries.set(match[1].toUpperCase(), match[2].trim());
    }
    if (entries.size) result.set(lines[0], entries);
  }
  return result;
}

function subtractQuarters(anchorPeriodEnd: string, offset: number) {
  const [yearText, monthText] = anchorPeriodEnd.split('-');
  let year = Number(yearText);
  let month = Number(monthText);
  if (!year || !month) return null;
  month -= offset * 3;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function annualPeriodEndFromQuarterAnchor(anchorPeriodEnd: string, offset: number) {
  const [yearText, monthText] = anchorPeriodEnd.split('-');
  let year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return null;
  // Indian listed-company annual financials are normally year-ended March.
  // If the latest explicit quarter is before March, the latest complete FY is
  // the prior March; otherwise it is March of the same calendar year.
  if (month < 3) year -= 1;
  year -= offset;
  return `${year}-03-31`;
}

function factId(companyId: string, symbol: string, metric: string, periodEnd: string) {
  return ['trendlyne_statement_history', companyId || symbol, metric, periodEnd, 'QUARTERLY', 'UNKNOWN']
    .map(part => String(part).replace(/[^a-zA-Z0-9_]+/g, '_'))
    .join('_');
}

function aliasMetric(metric: string) {
  if (metric === 'cfo') return 'cfo_cr';
  if (metric === 'capex_cash_outflow') return 'capex_cr';
  return null;
}

async function main() {
  const symbols = readSymbols();
  const placeholders = symbols.map(() => '?').join(',');
  const db = new sqlite3.Database(dbPath);
  try {
    const snapshotRows = await all(db, `SELECT symbol, fetched_at, response_json
      FROM fundamental_endpoint_snapshots
      WHERE provider='TRENDLYNE_MCP'
        AND endpoint='statement_history_parameters'
        AND status='SUCCESS'
        AND upper(symbol) IN (${placeholders})`, symbols);
    const tickerRows = await all(db, `SELECT symbol, id, isin FROM MasterTickers WHERE upper(symbol) IN (${placeholders})`, symbols);
    const snapshotBySymbol = new Map(snapshotRows.map(row => [String(row.symbol).toUpperCase(), row]));
    const tickerBySymbol = new Map(tickerRows.map(row => [String(row.symbol).toUpperCase(), row]));

    const metricTotals: Record<string, number> = {};
    const aliasMetricTotals: Record<string, number> = {};
    let symbolsWithSnapshot = 0;
    let symbolsWithAnchor = 0;
    let skippedNoAnchor = 0;
    let factsPrepared = 0;
    let factsWritten = 0;
    let missingValues = 0;
    const symbolReports: Array<Record<string, unknown>> = [];

    for (const symbol of symbols) {
      const snapshot = snapshotBySymbol.get(symbol);
      if (!snapshot) {
        symbolReports.push({ symbol, status: 'NO_STATEMENT_HISTORY_SNAPSHOT', factsPrepared: 0 });
        continue;
      }
      symbolsWithSnapshot++;
      const anchor = await get(db, `SELECT max(periodEnd) AS periodEnd
        FROM company_facts
        WHERE upper(symbol)=?
          AND provider='TRENDLYNE_MCP'
          AND calculationMethod='TRENDLYNE_EXPLICIT_QUARTER_LABEL'
          AND metric='promoter_holding'
          AND periodType='QUARTERLY'
          AND periodEnd IS NOT NULL
          AND periodEnd != 'LATEST'`, [symbol]);
      const anchorPeriodEnd = anchor?.periodEnd ? String(anchor.periodEnd) : null;
      if (!anchorPeriodEnd) {
        skippedNoAnchor++;
        symbolReports.push({ symbol, status: 'NO_EXPLICIT_QUARTER_ANCHOR', factsPrepared: 0 });
        continue;
      }
      symbolsWithAnchor++;
      const blocks = parseStatementBlocks(textFromResponse(snapshot.response_json));
      const ticker = tickerBySymbol.get(symbol);
      const companyId = String(ticker?.id || symbol);
      const isin = ticker?.isin ? String(ticker.isin) : null;
      let symbolFacts = 0;

      for (const mapping of QUARTERLY_MAPPINGS) {
        const value = parseNumber(blocks.get(mapping.label)?.get(symbol));
        if (value === null) {
          missingValues++;
          continue;
        }
        const periodEnd = subtractQuarters(anchorPeriodEnd, mapping.offset);
        if (!periodEnd) continue;
        factsPrepared++;
        symbolFacts++;
        metricTotals[mapping.metric] = (metricTotals[mapping.metric] || 0) + 1;
        if (apply) {
          await run(db, `
            INSERT OR REPLACE INTO company_facts (
              factId, companyId, symbol, isin, metric, value, unit, currency,
              periodType, periodStart, periodEnd, asOfDate, reportedAt,
              factType, sourceType, scope, provider, sourceDocumentId,
              providerToken, exactProviderLabel, verificationStatus,
              availabilityStatus, fetchedAt, availableAt, freshnessTtlDays,
              calculationMethod
            ) VALUES (
              ?, ?, ?, ?, ?, ?, 'INR_CR', 'INR',
              'QUARTERLY', NULL, ?, ?, NULL,
              'REPORTED', 'STRUCTURED_SECONDARY', 'UNKNOWN', 'TRENDLYNE_MCP', ?,
              ?, ?, 'VERIFIED_PARTIAL',
              'AVAILABLE', ?, ?, 120,
              'TRENDLYNE_STATEMENT_HISTORY_QUARTER_ANCHORED'
            )
          `, [
            factId(companyId, symbol, mapping.metric, periodEnd),
            companyId,
            symbol,
            isin,
            mapping.metric,
            value,
            periodEnd,
            periodEnd,
            `TRENDLYNE_MCP:statement_history_parameters:${symbol}:${String(snapshot.fetched_at || '')}`,
            mapping.token,
            `${mapping.label}; anchored from latest explicit Trendlyne quarter ${anchorPeriodEnd}`,
            String(snapshot.fetched_at || new Date().toISOString()),
            String(snapshot.fetched_at || new Date().toISOString()),
          ]);
          factsWritten++;
        }
      }
      for (const mapping of ANNUAL_MAPPINGS) {
        const value = parseNumber(blocks.get(mapping.label)?.get(symbol));
        if (value === null) {
          missingValues++;
          continue;
        }
        const periodEnd = annualPeriodEndFromQuarterAnchor(anchorPeriodEnd, mapping.offset);
        if (!periodEnd) continue;
        const metricsToWrite = [mapping.metric, aliasMetric(mapping.metric)].filter((metric): metric is string => Boolean(metric));
        for (const metric of metricsToWrite) {
          factsPrepared++;
          symbolFacts++;
          if (metric === mapping.metric) {
            metricTotals[metric] = (metricTotals[metric] || 0) + 1;
          } else {
            aliasMetricTotals[metric] = (aliasMetricTotals[metric] || 0) + 1;
          }
          if (apply) {
            await run(db, `
              INSERT OR REPLACE INTO company_facts (
                factId, companyId, symbol, isin, metric, value, unit, currency,
                periodType, periodStart, periodEnd, asOfDate, reportedAt,
                factType, sourceType, scope, provider, sourceDocumentId,
                providerToken, exactProviderLabel, verificationStatus,
                availabilityStatus, fetchedAt, availableAt, freshnessTtlDays,
                calculationMethod
              ) VALUES (
                ?, ?, ?, ?, ?, ?, 'INR_CR', 'INR',
                'ANNUAL', NULL, ?, ?, NULL,
                'REPORTED', 'STRUCTURED_SECONDARY', 'UNKNOWN', 'TRENDLYNE_MCP', ?,
                ?, ?, 'VERIFIED_PARTIAL',
                'AVAILABLE', ?, ?, 365,
                'TRENDLYNE_STATEMENT_HISTORY_ANNUAL_FY_ANCHORED'
              )
            `, [
              factId(companyId, symbol, metric, periodEnd),
              companyId,
              symbol,
              isin,
              metric,
              value,
              periodEnd,
              periodEnd,
              `TRENDLYNE_MCP:statement_history_parameters:${symbol}:${String(snapshot.fetched_at || '')}`,
              mapping.token,
              `${mapping.label}; annual FY period anchored from latest explicit Trendlyne quarter ${anchorPeriodEnd}`,
              String(snapshot.fetched_at || new Date().toISOString()),
              String(snapshot.fetched_at || new Date().toISOString()),
            ]);
            factsWritten++;
          }
        }
      }
      symbolReports.push({ symbol, status: symbolFacts ? 'PROMOTABLE' : 'NO_NUMERIC_QUARTERLY_STATEMENT_VALUES', anchorPeriodEnd, factsPrepared: symbolFacts });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: apply ? 'APPLIED' : 'DRY_RUN',
      dbPath,
      manifest: path.relative(root, manifestPath),
      requested: symbols.length,
      symbolsWithSnapshot,
      symbolsWithAnchor,
      skippedNoAnchor,
      factsPrepared,
      factsWritten,
      missingValues,
      metricTotals,
      aliasMetricTotals,
      policy: 'Quarterly statement values and selected annual CFO/capex values are promoted only when same-symbol explicit Trendlyne quarter anchors exist. Annual FY period is anchored to March year-end from the latest explicit quarter label and remains VERIFIED_PARTIAL.',
      symbols: symbolReports,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ reportPath, mode: report.mode, requested: report.requested, symbolsWithSnapshot, symbolsWithAnchor, factsPrepared, factsWritten, missingValues, metricTotals }, null, 2));
  } finally {
    await close(db);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
