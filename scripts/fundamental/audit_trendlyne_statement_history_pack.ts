/**
 * Read-only coverage audit for the Trendlyne statement-history parameter pack.
 *
 * This script does not call Trendlyne and does not write to the database. It
 * inspects stored raw provider snapshots and reports which statement/quality
 * fields are populated for each symbol.
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
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const jsonPath = path.join(dataDir, 'trendlyne_statement_history_coverage_230.json');
const mdPath = path.join(dataDir, 'trendlyne_statement_history_coverage_230.md');

const GROUPS: Record<string, string[]> = {
  quarterlyRevenue: ['Operating Revenue Qtr', 'Operating Rev.1Q Ago', 'Operating Revenue 2Qtrs ago', 'Operating Revenue 3Qtrs ago', 'Operating Rev. 4Q ago', 'Operating Rev. 5Q ago', 'Operating Rev. 6Q ago', 'Operating Rev. 7Q ago'],
  quarterlyOperatingProfit: ['Operating Profit Qtr', 'Operating Profit 1Qtr Ago', 'Operating Profit 2Qtr Ago', 'Operating Profit 3Q Ago', 'Operating Profit 4Q Ago', 'Operating Profit 5Qtr Ago', 'Operating Profit 6Qtr Ago', 'Operating Profit 7Qtr Ago'],
  quarterlyNetProfit: ['Net Profit Qtr', 'Net Profit 1Q Ago', 'Net Profit 2Q Ago', 'Net Profit 3Q Ago', 'Net Profit 4Q Ago', 'Net Profit 5Q Ago', 'Net Profit 6Q Ago', 'Net Profit 7Q Ago'],
  annualRevenue: ['Total Rev. Ann.', 'Total Rev. Ann. 1Y Ago', 'Rev. Ann. 2Y ago', 'Rev. Ann. 3Y ago'],
  annualOperatingProfit: ['Operating Profit Ann.', 'Operating Profit Ann. 1Y Ago', 'Operating Profit Ann. 2Y ago'],
  annualCashDebt: ['Cash from Operating Act. Ann.', 'Cash from Operating Act. Ann. 1Y Ago', 'Cash from Operating Act. Ann. 2Y Ago', 'Borrowings Ann.', 'Interest Ann.'],
  currentQualityValuation: ['Market Cap', 'LTP', 'PE TTM', 'BVSH Latest', 'Total Debt to Total Equity Ann.', 'ROE Ann. %', 'ROCE Ann. %', 'ROIC Ann. %'],
  ownership: ['Promoter holding latest %', 'FII holding current Qtr %', 'Institutional holding current Qtr %', 'MF holding current Qtr %'],
};

const all = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<Row[]>((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve((rows || []) as Row[])),
);
const close = (db: sqlite3.Database) => new Promise<void>(resolve => db.close(() => resolve()));

function readSymbols() {
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

function parseSnapshot(text: string) {
  const values = new Map<string, Map<string, string>>();
  const blocks = text.split(/\n---\n/g);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const label = lines[0];
    const entries = new Map<string, string>();
    for (const line of lines.slice(1)) {
      const match = line.match(/^([A-Z0-9&.-]+):(.+)$/);
      if (!match) continue;
      entries.set(match[1].toUpperCase(), match[2].trim());
    }
    if (entries.size) values.set(label, entries);
  }
  return values;
}

function isAvailable(value: string | undefined) {
  return Boolean(value) && !/^None$/i.test(String(value).trim()) && String(value).trim() !== '';
}

async function main() {
  const symbols = readSymbols();
  const placeholders = symbols.map(() => '?').join(',');
  const db = new sqlite3.Database(dbPath);
  try {
    const rows = await all(db, `SELECT symbol, status, fetched_at, response_json
      FROM fundamental_endpoint_snapshots
      WHERE provider='TRENDLYNE_MCP'
        AND endpoint='statement_history_parameters'
        AND upper(symbol) IN (${placeholders})`, symbols);
    const bySymbol = new Map(rows.map(row => [String(row.symbol).toUpperCase(), row]));
    const groupTotals: Record<string, { available: number; possible: number; completeSymbols: number }> = {};
    const symbolReports: Array<Record<string, unknown>> = [];

    for (const [group, labels] of Object.entries(GROUPS)) {
      groupTotals[group] = { available: 0, possible: labels.length * symbols.length, completeSymbols: 0 };
    }

    for (const symbol of symbols) {
      const row = bySymbol.get(symbol);
      if (!row || row.status !== 'SUCCESS') {
        symbolReports.push({ symbol, status: row?.status || 'MISSING_SNAPSHOT' });
        continue;
      }
      const parsed = parseSnapshot(textFromResponse(row.response_json));
      const groups: Record<string, { available: number; possible: number; complete: boolean }> = {};
      for (const [group, labels] of Object.entries(GROUPS)) {
        let available = 0;
        for (const label of labels) {
          if (isAvailable(parsed.get(label)?.get(symbol))) available++;
        }
        groups[group] = { available, possible: labels.length, complete: available === labels.length };
        groupTotals[group].available += available;
        if (available === labels.length) groupTotals[group].completeSymbols++;
      }
      symbolReports.push({ symbol, status: 'SUCCESS', fetchedAt: row.fetched_at, groups });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      dbPath,
      manifest: path.relative(root, manifestPath),
      requested: symbols.length,
      snapshots: rows.length,
      successfulSnapshots: rows.filter(row => row.status === 'SUCCESS').length,
      groups: groupTotals,
      symbols: symbolReports,
      note: 'Coverage is based on stored raw Trendlyne statement_history_parameters snapshots. Relative periods still require explicit period anchoring before promotion into dated company_facts.',
    };
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    const lines = [
      '# Trendlyne Statement History Coverage',
      '',
      `Generated: ${report.generatedAt}`,
      `Requested symbols: ${report.requested}`,
      `Successful snapshots: ${report.successfulSnapshots}`,
      '',
      '| Group | Available cells | Possible cells | Complete symbols |',
      '|---|---:|---:|---:|',
      ...Object.entries(groupTotals).map(([group, value]) => `| ${group} | ${value.available} | ${value.possible} | ${value.completeSymbols} |`),
      '',
      'Note: relative quarter/year fields are not treated as exact dated filing facts until anchored.',
      '',
    ];
    fs.writeFileSync(mdPath, lines.join('\n'));
    console.log(JSON.stringify({ jsonPath, mdPath, requested: report.requested, successfulSnapshots: report.successfulSnapshots, groups: groupTotals }, null, 2));
  } finally {
    await close(db);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
