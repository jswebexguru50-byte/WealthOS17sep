/**
 * Promote stored Trendlyne relative quarterly profit history into company_facts.
 *
 * Important evidence policy:
 * - Trendlyne's quarterly-profit endpoint stores relative labels such as
 *   "Net Profit Qtr", "Net Profit 1Q Ago", etc.
 * - The endpoint payload contains a provider/extract as-of date, but not an
 *   explicit fiscal quarter-end label for each profit value.
 * - This script therefore promotes PAT only when the same symbol has an
 *   explicit Trendlyne quarter label already persisted from shareholding
 *   history. The latest explicit quarter label is used as the anchor for
 *   "Net Profit Qtr"; prior labels are derived by subtracting quarters.
 * - Facts are marked VERIFIED_PARTIAL and calculationMethod is
 *   TRENDLYNE_RELATIVE_QUARTER_HISTORY_ANCHORED so downstream code can
 *   distinguish them from primary filing-derived statement facts.
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
const reportPath = path.join(dataDir, 'trendlyne_quarterly_profit_promotion_report_230.json');

const PROFIT_LABEL_OFFSETS: Record<string, number> = {
  'Net Profit Qtr': 0,
  'Net Profit 1Q Ago': 1,
  'Net Profit 2Q Ago': 2,
  'Net Profit 3Q Ago': 3,
  'Net Profit 4Q Ago': 4,
  'Net Profit 5Q Ago': 5,
  'Net Profit 6Q Ago': 6,
  'Net Profit 7Q Ago': 7,
};

const PROVIDER_TOKENS: Record<string, string> = {
  'Net Profit Qtr': 'npq',
  'Net Profit 1Q Ago': 'npqmq1',
  'Net Profit 2Q Ago': 'npqmq2',
  'Net Profit 3Q Ago': 'npqmq3',
  'Net Profit 4Q Ago': 'npqmy1',
  'Net Profit 5Q Ago': 'npqmq5',
  'Net Profit 6Q Ago': 'npqmq6',
  'Net Profit 7Q Ago': 'npqmq7',
};

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
    .filter(Boolean))];
  return maxSymbols > 0 ? symbols.slice(0, maxSymbols) : symbols;
}

function textFromResponse(raw: unknown): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(String(raw));
    const nested = parsed.structuredContent?.result || parsed.content?.[0]?.text;
    if (typeof nested === 'string') {
      try {
        const inner = JSON.parse(nested);
        return typeof inner?.data === 'string' ? inner.data : nested;
      } catch {
        return nested;
      }
    }
    return String(raw);
  } catch {
    return String(raw);
  }
}

function parseNumber(value: string) {
  const clean = value.trim();
  if (!clean || /^None$/i.test(clean)) return null;
  const parsed = Number(clean.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseProviderHeaderDates(text: string) {
  const dates = new Set<string>();
  const pattern = /^\d+\|[^|]*\|[^|]+\|[^|]*\|(\d{4}-\d{2}-\d{2})$/gm;
  for (const match of text.matchAll(pattern)) dates.add(match[1]);
  return [...dates].sort();
}

function parseProfitValues(text: string, symbol: string) {
  const facts: Array<{ label: string; offset: number; value: number; providerToken: string }> = [];
  for (const [label, offset] of Object.entries(PROFIT_LABEL_OFFSETS)) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escapedLabel}\\s*\\n[\\s\\S]*?\\b${escapedSymbol}:([^\\r\\n]+)`, 'i');
    const match = text.match(regex);
    if (!match) continue;
    const value = parseNumber(match[1]);
    if (value === null) continue;
    facts.push({ label, offset, value, providerToken: PROVIDER_TOKENS[label] || label });
  }
  return facts;
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

function buildFactId(companyId: string, symbol: string, periodEnd: string) {
  return [
    'trendlyne_quarterly_profit',
    companyId || symbol,
    'pat',
    periodEnd,
    'QUARTERLY',
    'UNKNOWN',
  ].map(part => String(part).replace(/[^a-zA-Z0-9_]+/g, '_')).join('_');
}

async function main() {
  const symbols = readSymbols();
  const placeholders = symbols.map(() => '?').join(',');
  const db = new sqlite3.Database(dbPath);
  try {
    const snapshotRows = await all(db, `SELECT symbol, endpoint, fetched_at, response_json
      FROM fundamental_endpoint_snapshots
      WHERE provider='TRENDLYNE_MCP'
        AND endpoint='quarterly_profit_history'
        AND status='SUCCESS'
        AND upper(symbol) IN (${placeholders})`, symbols);
    const tickerRows = await all(db, `SELECT symbol, id, isin FROM MasterTickers WHERE upper(symbol) IN (${placeholders})`, symbols);
    const tickerBySymbol = new Map(tickerRows.map(row => [String(row.symbol).toUpperCase(), row]));
    const snapshotBySymbol = new Map(snapshotRows.map(row => [String(row.symbol).toUpperCase(), row]));

    let symbolsWithSnapshot = 0;
    let symbolsWithAnchor = 0;
    let factsPrepared = 0;
    let factsWritten = 0;
    let missingValues = 0;
    let skippedNoAnchor = 0;
    const providerHeaderDates = new Set<string>();
    const symbolSummaries: Array<Record<string, unknown>> = [];

    for (const symbol of symbols) {
      const snapshot = snapshotBySymbol.get(symbol);
      if (!snapshot) {
        symbolSummaries.push({ symbol, status: 'NO_QUARTERLY_PROFIT_SNAPSHOT', factsPrepared: 0 });
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
        symbolSummaries.push({ symbol, status: 'NO_EXPLICIT_QUARTER_ANCHOR', factsPrepared: 0 });
        continue;
      }
      symbolsWithAnchor++;
      const text = textFromResponse(snapshot.response_json);
      for (const date of parseProviderHeaderDates(text)) providerHeaderDates.add(date);
      const parsedFacts = parseProfitValues(text, symbol);
      missingValues += Math.max(0, Object.keys(PROFIT_LABEL_OFFSETS).length - parsedFacts.length);
      const ticker = tickerBySymbol.get(symbol);
      const companyId = String(ticker?.id || symbol);
      const isin = ticker?.isin ? String(ticker.isin) : null;
      let symbolFacts = 0;
      for (const fact of parsedFacts) {
        const periodEnd = subtractQuarters(anchorPeriodEnd, fact.offset);
        if (!periodEnd) continue;
        const factId = buildFactId(companyId, symbol, periodEnd);
        factsPrepared++;
        symbolFacts++;
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
              ?, ?, ?, ?, 'pat', ?, 'INR_CR', 'INR',
              'QUARTERLY', NULL, ?, ?, NULL,
              'REPORTED', 'STRUCTURED_SECONDARY', 'UNKNOWN', 'TRENDLYNE_MCP', ?,
              ?, ?, 'VERIFIED_PARTIAL',
              'AVAILABLE', ?, ?, 120,
              'TRENDLYNE_RELATIVE_QUARTER_HISTORY_ANCHORED'
            )
          `, [
            factId, companyId, symbol, isin, fact.value,
            periodEnd, periodEnd,
            `TRENDLYNE_MCP:quarterly_profit_history:${symbol}:${String(snapshot.fetched_at || '')}`,
            fact.providerToken,
            `${fact.label}; anchored from latest explicit Trendlyne quarter ${anchorPeriodEnd}`,
            String(snapshot.fetched_at || new Date().toISOString()),
            String(snapshot.fetched_at || new Date().toISOString()),
          ]);
          factsWritten++;
        }
      }
      symbolSummaries.push({
        symbol,
        status: symbolFacts ? 'PROMOTABLE' : 'NO_NUMERIC_PROFIT_VALUES',
        anchorPeriodEnd,
        factsPrepared: symbolFacts,
      });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: apply ? 'APPLIED' : 'DRY_RUN',
      dbPath,
      requested: symbols.length,
      symbolsWithSnapshot,
      symbolsWithAnchor,
      skippedNoAnchor,
      factsPrepared,
      factsWritten,
      missingValues,
      providerHeaderDates: [...providerHeaderDates].sort(),
      policy: 'Quarterly PAT values are from Trendlyne relative labels; periodEnd is anchored to the latest explicit Trendlyne shareholding quarter label for the same symbol. These are VERIFIED_PARTIAL, not filing-derived VERIFIED facts.',
      symbols: symbolSummaries,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      reportPath,
      mode: report.mode,
      requested: report.requested,
      symbolsWithSnapshot,
      symbolsWithAnchor,
      factsPrepared,
      factsWritten,
      providerHeaderDates: report.providerHeaderDates,
    }, null, 2));
  } finally {
    await close(db);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
