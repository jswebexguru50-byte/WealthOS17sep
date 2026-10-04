/**
 * Promote exact dated Trendlyne shareholding history into company_facts.
 *
 * Deterministic and idempotent. It only promotes values that carry an explicit
 * quarter label such as "Jun 2026" in stored Trendlyne MCP payloads. It does
 * not promote financial-history labels like "1Yr Ago" or "3Q Ago".
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
const reportPath = path.join(dataDir, `trendlyne_shareholding_promotion_report_${manifestSlug}.json`);

const monthNumber: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

const SHAREHOLDING_METRICS: Record<string, string> = {
  Promoter: 'promoter_holding',
  Institutional: 'inst_holding',
  FII: 'fii_holding',
  MF: 'mf_holding',
  DII: 'dii_holding',
  Public: 'public_holding',
  Others: 'other_holding',
};

const all = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<Row[]>((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve((rows || []) as Row[])),
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
    if (parsed.structuredContent?.result) return String(parsed.structuredContent.result);
    return Array.isArray(parsed.content)
      ? parsed.content.map((entry: any) => String(entry?.text || '')).join('\n')
      : String(raw);
  } catch {
    return String(raw);
  }
}

function quarterEnd(label: string) {
  const match = label.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i);
  if (!match) return null;
  const month = monthNumber[match[1].slice(0, 3).toUpperCase()];
  const year = Number(match[2]);
  if (!month || !year) return null;
  const lastDay = new Date(Date.UTC(year, Number(month), 0)).getUTCDate();
  return `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
}

function parseNumber(value: string) {
  const clean = value.trim();
  if (!clean || /^None$/i.test(clean)) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseChartSection(text: string, section: string): Array<{ label: string; holding: number | null; pledge?: number | null }> {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}:\\n([\\s\\S]*?)(?=\\n\\s*[A-Za-z][A-Za-z ]*:\\n|\\ninsights:|\\nstockHeaders:|$)`, 'i'));
  if (!match) return [];
  const rows: Array<{ label: string; holding: number | null; pledge?: number | null }> = [];
  const rowPattern = /\[\\"([A-Z][a-z]{2}\s+\d{4})\\",\s*(-?\d+(?:\.\d+)?|None)[\s\S]*?(?:,\s*(-?\d+(?:\.\d+)?|None),\s*\\"[^"]*%\\")?\]/g;
  for (const row of match[1].matchAll(rowPattern)) {
    rows.push({ label: row[1], holding: parseNumber(row[2]), pledge: row[3] === undefined ? undefined : parseNumber(row[3]) });
  }
  const plainRowPattern = /\["([A-Z][a-z]{2}\s+\d{4})",\s*(-?\d+(?:\.\d+)?|None)[\s\S]*?(?:,\s*(-?\d+(?:\.\d+)?|None),\s*"[^"]*%")?\]/g;
  for (const row of match[1].matchAll(plainRowPattern)) {
    rows.push({ label: row[1], holding: parseNumber(row[2]), pledge: row[3] === undefined ? undefined : parseNumber(row[3]) });
  }
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = `${row.label}:${row.holding}:${row.pledge}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFactId(companyId: string, metric: string, periodEnd: string, symbol: string) {
  return [
    'trendlyne_shareholding',
    companyId || symbol,
    metric,
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
        AND endpoint IN ('shareholding','overview')
        AND upper(symbol) IN (${placeholders})`, symbols);
    const tickerRows = await all(db, `SELECT symbol, id, isin FROM MasterTickers WHERE upper(symbol) IN (${placeholders})`, symbols);
    const tickerBySymbol = new Map(tickerRows.map(row => [String(row.symbol).toUpperCase(), row]));
    const rowsBySymbol = new Map<string, Row[]>();
    for (const row of snapshotRows) {
      const symbol = String(row.symbol).toUpperCase();
      rowsBySymbol.set(symbol, [...(rowsBySymbol.get(symbol) || []), row]);
    }

    let factsPrepared = 0;
    let factsWritten = 0;
    let symbolsWithEvidence = 0;
    const symbolSummaries: Array<Record<string, unknown>> = [];

    for (const symbol of symbols) {
      const rows = rowsBySymbol.get(symbol) || [];
      const shareholding = rows.find(row => row.endpoint === 'shareholding') || rows.find(row => row.endpoint === 'overview');
      const text = textFromResponse(shareholding?.response_json);
      const ticker = tickerBySymbol.get(symbol);
      const companyId = String(ticker?.id || symbol);
      const isin = ticker?.isin ? String(ticker.isin) : null;
      let symbolFacts = 0;

      for (const [section, metric] of Object.entries(SHAREHOLDING_METRICS)) {
        for (const point of parseChartSection(text, section)) {
          const periodEnd = quarterEnd(point.label);
          if (!periodEnd || point.holding === null) continue;
          const factId = buildFactId(companyId, metric, periodEnd, symbol);
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
                ?, ?, ?, ?, ?, ?, 'PERCENTAGE', NULL,
                'QUARTERLY', NULL, ?, ?, NULL,
                'REPORTED', 'STRUCTURED_SECONDARY', 'UNKNOWN', 'TRENDLYNE_MCP', ?,
                ?, ?, 'VERIFIED_PARTIAL',
                'AVAILABLE', ?, ?, 120,
                'TRENDLYNE_EXPLICIT_QUARTER_LABEL'
              )
            `, [
              factId, companyId, symbol, isin, metric, point.holding,
              periodEnd, periodEnd,
              `TRENDLYNE_MCP:${String(shareholding?.endpoint || 'shareholding')}:${symbol}:${String(shareholding?.fetched_at || '')}`,
              `${section}.holding`, `${section} ${point.label}`,
              String(shareholding?.fetched_at || new Date().toISOString()),
              String(shareholding?.fetched_at || new Date().toISOString()),
            ]);
            factsWritten++;
          }
          if (section === 'Promoter' && point.pledge !== undefined && point.pledge !== null) {
            const pledgeFactId = buildFactId(companyId, 'promoter_pledge', periodEnd, symbol);
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
                  ?, ?, ?, ?, 'promoter_pledge', ?, 'PERCENTAGE', NULL,
                  'QUARTERLY', NULL, ?, ?, NULL,
                  'REPORTED', 'STRUCTURED_SECONDARY', 'UNKNOWN', 'TRENDLYNE_MCP', ?,
                  'Promoter.pledge', ?, 'VERIFIED_PARTIAL',
                  'AVAILABLE', ?, ?, 120,
                  'TRENDLYNE_EXPLICIT_QUARTER_LABEL'
                )
              `, [
                pledgeFactId, companyId, symbol, isin, point.pledge,
                periodEnd, periodEnd,
                `TRENDLYNE_MCP:${String(shareholding?.endpoint || 'shareholding')}:${symbol}:${String(shareholding?.fetched_at || '')}`,
                `Promoter pledge ${point.label}`,
                String(shareholding?.fetched_at || new Date().toISOString()),
                String(shareholding?.fetched_at || new Date().toISOString()),
              ]);
              factsWritten++;
            }
          }
        }
      }
      if (symbolFacts) symbolsWithEvidence++;
      symbolSummaries.push({ symbol, endpoint: shareholding?.endpoint || null, factsPrepared: symbolFacts });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: apply ? 'APPLIED' : 'DRY_RUN',
      dbPath,
      requested: symbols.length,
      symbolsWithEvidence,
      factsPrepared,
      factsWritten,
      policy: 'Only explicit Trendlyne quarter-labelled shareholding data is promoted. Relative financial history is untouched.',
      symbols: symbolSummaries,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      reportPath,
      mode: report.mode,
      requested: report.requested,
      symbolsWithEvidence,
      factsPrepared,
      factsWritten,
    }, null, 2));
  } finally {
    await close(db);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
