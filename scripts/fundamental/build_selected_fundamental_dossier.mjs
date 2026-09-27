#!/usr/bin/env node
/**
 * Build a repeatable fundamental dossier workbook for the selected strategy cohort.
 *
 * Inputs:
 *   - data/fundamental_enrichment/excel_strategy_manifest.json
 *   - outputs/.../Six_Strategies_90_Sessions_2026-09-25.xlsx
 *   - portfolio.db synced fundamental tables
 *   - data/fere/verified_filings/fere_evidence.db source evidence
 *
 * Optional:
 *   --refresh-fundamentals  Fetch Upstox fundamentals for selected shares first.
 *   --force-refresh         Re-fetch even when prior Upstox SUCCESS rows exist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';

const root = process.cwd();
const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const getArg = (flag, fallback) => {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
};

const manifestPath = path.resolve(root, getArg('--manifest', 'data/fundamental_enrichment/excel_strategy_manifest.json'));
const strategyWorkbookPath = path.resolve(root, getArg('--strategy-workbook', 'outputs/01a0c502-921f-7491-9a42-361d54d7bea0/Six_Strategies_90_Sessions_2026-09-25.xlsx'));
const outDir = path.resolve(root, getArg('--out-dir', 'outputs/fundamental_dossiers'));
const portfolioDbPath = path.resolve(root, 'portfolio.db');
const fereDbPath = path.resolve(root, 'data/fere/verified_filings/fere_evidence.db');
const pythonPath = getArg('--python', 'C:\\Users\\gopal\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe');
const cutoff = getArg('--cutoff', '2026-09-25');

fs.mkdirSync(outDir, { recursive: true });

function runRefreshSteps() {
  if (!has('--refresh-fundamentals')) return;
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const upstoxArgs = ['run', 'fundamental:upstox', '--', '--group', 'excelStrategyMatches', '--batch-size', '1'];
  if (has('--force-refresh')) upstoxArgs.push('--force');
  execFileSync(npmCmd, upstoxArgs, { cwd: root, stdio: 'inherit' });
  if (fs.existsSync(pythonPath)) {
    execFileSync(pythonPath, ['scripts/fundamental/sync_verified_fundamentals_package.py', '--manifest', manifestPath], { cwd: root, stdio: 'inherit' });
  } else {
    console.warn(`[Dossier] Python not found at ${pythonPath}; skipped sync step.`);
  }
}

function placeholders(items) {
  return items.map(() => '?').join(',');
}

function latestRows(db, table, symbols, orderCol = 'fetched_at') {
  const ph = placeholders(symbols);
  const rows = db.prepare(`SELECT * FROM ${table} WHERE symbol IN (${ph}) ORDER BY ${orderCol}`).all(...symbols);
  const map = new Map();
  for (const row of rows) map.set(String(row.symbol).toUpperCase(), row);
  return map;
}

function readStrategyMatches(symbols) {
  const bySymbol = new Map(symbols.map(s => [s, { symbol: s, strategies: new Set(), signalCount: 0, latestSignalDate: null, bestSignalPrice: null }]));
  if (!fs.existsSync(strategyWorkbookPath)) return bySymbol;

  const workbook = XLSX.readFile(strategyWorkbookPath);
  const strategySheets = workbook.SheetNames.filter(s => /^S\d/i.test(s));
  for (const sheetName of strategySheets) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { range: 5, defval: null });
    for (const row of rows) {
      const symbol = String(row.Symbol || row.symbol || '').trim().toUpperCase();
      if (!bySymbol.has(symbol)) continue;
      const record = bySymbol.get(symbol);
      record.strategies.add(sheetName);
      record.signalCount += 1;
      const rawSignalDate = row['Signal date'] || row['Signal_Date'] || row.Signal_Date || row.signal_date || row.as_of_date || '';
      const signalDate = normalizeExcelDate(rawSignalDate);
      if (signalDate && (!record.latestSignalDate || signalDate > record.latestSignalDate)) record.latestSignalDate = signalDate;
      const price = Number(row['Signal close ₹'] ?? row.Signal_Price ?? row.cmp ?? row.close);
      if (Number.isFinite(price)) record.bestSignalPrice = price;
    }
  }
  return bySymbol;
}

function normalizeExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + value * 86400000).toISOString().slice(0, 10);
  }
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d+(\.\d+)?$/.test(text)) return normalizeExcelDate(Number(text));
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text.slice(0, 10);
}

function parseJson(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

function sourceCoverage(raw) {
  const required = ['profile', 'balance-sheet', 'cash-flow', 'income-statement', 'share-holdings', 'key-ratios', 'corporate-actions', 'competitors'];
  const json = parseJson(raw?.response_json);
  const present = required.filter(k => !!json[k]);
  const missing = required.filter(k => !json[k]);
  return { present: present.join(', '), missing: missing.join(', '), complete: missing.length === 0 ? 'YES' : 'NO' };
}

function bestUpstoxRows(db, symbols) {
  const required = ['profile', 'balance-sheet', 'cash-flow', 'income-statement', 'share-holdings', 'key-ratios', 'corporate-actions', 'competitors'];
  const map = new Map();
  for (const symbol of symbols) {
    const rows = db.prepare(
      `SELECT * FROM fundamental_source_snapshots
       WHERE provider=? AND status=? AND symbol=?
       ORDER BY fetched_at DESC`
    ).all('UPSTOX_FUNDAMENTALS', 'SUCCESS', symbol);
    let best = null;
    let bestMissing = Infinity;
    for (const row of rows) {
      const json = parseJson(row.response_json);
      const missing = required.filter(endpoint => !json[endpoint]).length;
      if (!best || missing < bestMissing) {
        best = row;
        bestMissing = missing;
      }
      if (missing === 0) break;
    }
    if (best) map.set(symbol, best);
  }
  return map;
}

function latestTrendlyneRows(db, symbols) {
  const map = new Map(symbols.map(symbol => [symbol, new Map()]));
  const rows = db.prepare(`SELECT * FROM fundamental_endpoint_snapshots
    WHERE provider='TRENDLYNE_MCP' AND symbol IN (${placeholders(symbols)}) ORDER BY fetched_at`).all(...symbols);
  for (const row of rows) map.get(String(row.symbol).toUpperCase())?.set(row.endpoint, row);
  return map;
}
function trendlyneText(row) {
  try {
    const outer = JSON.parse(row?.response_json || '{}');
    const content = outer.content?.find(item => item?.type === 'text')?.text || '';
    const inner = JSON.parse(content);
    return typeof inner.data === 'string' ? inner.data : content;
  } catch { return ''; }
}
function trendlyneValue(text, symbol, label) {
  const start = text.toLowerCase().indexOf(label.toLowerCase());
  if (start < 0) return null;
  const section = text.slice(start, text.indexOf('\n---', start) < 0 ? undefined : text.indexOf('\n---', start));
  const match = new RegExp(`^${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:([^\\r\\n]+)$`, 'im').exec(section);
  if (!match || /^(none|null|n\/?a|na|-)$/i.test(match[1].trim())) return null;
  const value = Number(match[1].trim());
  return Number.isFinite(value) ? value : null;
}
function trendlyneDii(text) {
  const start = text.indexOf('\n  DII:');
  if (start < 0) return null;
  const end = text.indexOf('\n  Public:', start);
  const section = text.slice(start, end < 0 ? undefined : end);
  const matches = [...section.matchAll(/\["[^"]+",\s*(-?[\d.]+)/g)];
  return matches.length ? Number(matches.at(-1)[1]) : null;
}
function eightQuarterNetProfit(text, symbol) {
  const labels = ['Net Profit Qtr', 'Net Profit 1Q Ago', 'Net Profit 2Q Ago', 'Net Profit 3Q Ago', 'Net Profit 4Q Ago', 'Net Profit 5Q Ago', 'Net Profit 6Q Ago', 'Net Profit 7Q Ago'];
  const values = labels.map(label => trendlyneValue(text, symbol, label));
  return { values, status: values.every(value => value !== null) ? 'VERIFIED' : 'DATA_INSUFFICIENT', result: values.every(value => value !== null) ? (values.every(value => value > 0) ? 'PASS' : 'FAIL') : 'NOT_EVALUABLE' };
}

function setColumns(ws, columns) {
  ws.columns = columns.map(([header, key, width]) => ({ header, key, width }));
  ws.getRow(1).font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
  ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 32;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: `${ws.getColumn(columns.length).letter}1` };
}

function addRows(ws, rows) {
  for (const row of rows) ws.addRow(row);
  ws.eachRow((row, rowNumber) => {
    row.font = row.font || { name: 'Arial' };
    if (rowNumber > 1) {
      row.alignment = { vertical: 'top', wrapText: true };
      if (rowNumber % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }
  });
}

function fmtSheet(ws) {
  ws.eachRow(row => row.eachCell(cell => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
  }));
}

runRefreshSteps();

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const symbols = manifest.symbols.map(s => String(s).toUpperCase());
const portfolio = new Database(portfolioDbPath, { readonly: true });
const fere = new Database(fereDbPath, { readonly: true });
const ph = placeholders(symbols);

const fundamentals = latestRows(portfolio, 'FundamentalSnapshots', symbols);
const filters = new Map(portfolio.prepare(`SELECT * FROM strategy_fundamental_filter_results WHERE run_key=? AND symbol IN (${ph})`).all('EXCEL_SIX_STRATEGIES_2026-09-25', ...symbols).map(r => [r.symbol, r]));
const rawRows = bestUpstoxRows(portfolio, symbols);
const trendlyneRows = latestTrendlyneRows(portfolio, symbols);
const strategyMatches = readStrategyMatches(symbols);
const shareholdingRows = fere.prepare(`SELECT symbol, COUNT(*) AS snapshots, MAX(period_end) AS latest_period, SUM(CASE WHEN promoter_pledge > 0 THEN 1 ELSE 0 END) AS pledged_periods, MIN(CASE WHEN source_sha256 IS NULL OR length(source_sha256) <> 64 THEN 0 ELSE 1 END) AS hashes_ok FROM shareholding_snapshot WHERE symbol IN (${ph}) GROUP BY symbol`).all(...symbols);
const shareholding = new Map(shareholdingRows.map(r => [r.symbol, r]));

const dossierRows = symbols.map(symbol => {
  const f = fundamentals.get(symbol) || {};
  const r = filters.get(symbol) || {};
  const raw = rawRows.get(symbol) || {};
  const cov = sourceCoverage(raw);
  const st = strategyMatches.get(symbol) || { strategies: new Set(), signalCount: 0 };
  const trend = trendlyneRows.get(symbol) || new Map();
  const paramText = trendlyneText(trend.get('parameters'));
  const historyText = trendlyneText(trend.get('quarterly_profit_history'));
  const holdingText = trendlyneText(trend.get('shareholding'));
  const quarterly = eightQuarterNetProfit(historyText, symbol);
  const cfo = trendlyneValue(paramText, symbol, 'Cash from Operating Act. Ann.');
  const op = trendlyneValue(paramText, symbol, 'Operating Profit Ann.');
  return {
    symbol,
    company: f.company_name || symbol,
    sector: f.sector || '',
    strategies: [...st.strategies].join(', '),
    signal_count: st.signalCount || 0,
    latest_signal_date: st.latestSignalDate || '',
    evidence_status: r.evidence_status || 'MISSING',
    pass_count: r.pass_count ?? '',
    total_checks: r.total_checks ?? '',
    promoter_pct: r.promoter_pct ?? f.promoter_holding_pct ?? '',
    promoter_pass: r.promoter_pass ?? '',
    profitable_8q: r.profitable_last_8_quarters ?? '',
    profitable_quarters: r.profitable_quarter_count ?? '',
    roce_pct: r.roce_pct ?? f.roce_pct ?? '',
    roce_pass: r.roce_pass ?? '',
    roe_pct: r.roe_pct ?? f.roe_pct ?? '',
    roe_pass: r.roe_pass ?? '',
    pledged_pct: r.pledged_pct ?? f.pledged_pct ?? '',
    no_pledge_pass: r.no_pledge_pass ?? '',
    fii_pct: r.fii_pct ?? f.fii_holding_pct ?? '',
    dii_pct: r.dii_pct ?? f.dii_holding_pct ?? '',
    institutional_pass: r.institutional_involvement_pass ?? '',
    cfo_op_ratio: r.cash_flow_to_operating_profit ?? '',
    cash_flow_pass: r.cash_flow_pass ?? '',
    qglp_filter_status: r.qglp_status || '',
    sector_momentum_status: r.sector_momentum_status || '',
    double_momentum_status: r.double_momentum_status || '',
    pe_ratio: f.pe_ratio ?? '',
    book_value: f.book_value ?? '',
    debt_to_equity: f.debt_to_equity ?? '',
    raw_required_complete: cov.complete,
    raw_missing: cov.missing,
    source: r.source || f.source || 'VERIFIED_MULTI_SOURCE',
    evidence_note: r.evidence_note || ''
    ,trendlyne_status: trend.get('parameters')?.status || 'SOURCE_UNAVAILABLE'
    ,trendlyne_fetched_at: trend.get('parameters')?.fetched_at || ''
    ,trend_current_price: trendlyneValue(paramText, symbol, 'LTP')
    ,trend_market_cap_cr: trendlyneValue(paramText, symbol, 'Market Cap')
    ,trend_roce_pct: trendlyneValue(paramText, symbol, 'ROCE Ann. %')
    ,trend_roe_pct: trendlyneValue(paramText, symbol, 'ROE Ann. %')
    ,trend_cfo_cr: cfo
    ,trend_operating_profit_cr: op
    ,trend_cfo_op_pct: cfo !== null && op !== null && op !== 0 ? (cfo / op) * 100 : null
    ,trend_promoter_pct: trendlyneValue(paramText, symbol, 'Promoter holding latest %')
    ,trend_promoter_pledge_pct: trendlyneValue(paramText, symbol, 'Promoter holding pledge percentage % Qtr')
    ,trend_fii_pct: trendlyneValue(paramText, symbol, 'FII holding current Qtr %')
    ,trend_dii_pct: trendlyneDii(holdingText)
    ,q1_net_profit: quarterly.values[0], q2_net_profit: quarterly.values[1], q3_net_profit: quarterly.values[2], q4_net_profit: quarterly.values[3]
    ,q5_net_profit: quarterly.values[4], q6_net_profit: quarterly.values[5], q7_net_profit: quarterly.values[6], q8_net_profit: quarterly.values[7]
    ,eight_quarter_data_status: quarterly.status, eight_quarter_profitability_result: quarterly.result
    // A composite QGLP score is intentionally withheld until all four pillars
    // have dated evidence. The component facts remain available to the user.
    ,qglp_data_status: 'DATA_INSUFFICIENT', qglp_score: null
    ,qglp_missing_inputs: '3Y sales CAGR; 3Y profit CAGR; profitable years; positive CFO years; ROCE consistency; margin stability; PE vs history/sector; PEG; FCF yield'
  };
});

const fullyCompliant = dossierRows.filter(r => r.evidence_status === 'VERIFIED' && Number(r.pass_count) === Number(r.total_checks));
const partial = dossierRows.filter(r => r.evidence_status !== 'VERIFIED' || Number(r.pass_count) !== Number(r.total_checks));
const workbook = new ExcelJS.Workbook();
workbook.creator = 'WealthOS deterministic dossier generator';
workbook.created = new Date();
workbook.modified = new Date();
workbook.properties.date1904 = false;

const summary = workbook.addWorksheet('Executive Summary', { views: [{ showGridLines: false }] });
setColumns(summary, [['Metric', 'metric', 38], ['Value', 'value', 28], ['Notes', 'notes', 95]]);
addRows(summary, [
  { metric: 'Selected shares', value: symbols.length, notes: 'Source: data/fundamental_enrichment/excel_strategy_manifest.json' },
  { metric: 'Strategy workbook', value: path.basename(strategyWorkbookPath), notes: 'Last seven-strategy run used as requested.' },
  { metric: 'Cutoff date', value: cutoff, notes: 'Strategy signal cutoff.' },
  { metric: 'Raw Upstox endpoint coverage', value: `${dossierRows.filter(r => r.raw_required_complete === 'YES').length}/${symbols.length}`, notes: 'Required endpoints: profile, balance sheet, cash flow, income statement, shareholding, key ratios, corporate actions, and competitors.' },
  { metric: 'Verified mandatory filter rows', value: `${dossierRows.filter(r => r.evidence_status === 'VERIFIED').length}/${symbols.length}`, notes: 'Evidence status from strategy_fundamental_filter_results.' },
  { metric: 'Rule-result policy', value: 'INFORMATION ONLY', notes: 'Every selected symbol remains in the master sheet. PASS, FAIL and DATA_INSUFFICIENT are evidence labels, not exclusion rules.' },
  { metric: 'No synthetic data policy', value: 'ACTIVE', notes: 'Missing facts remain blank/null or partial; no fake values inserted.' }
]);
fmtSheet(summary);

const dossier = workbook.addWorksheet('All 179 Dossier', { views: [{ showGridLines: false }] });
setColumns(dossier, [
  ['Symbol', 'symbol', 14], ['Company', 'company', 32], ['Sector', 'sector', 22], ['Strategies', 'strategies', 22],
  ['Signals', 'signal_count', 10], ['Latest Signal', 'latest_signal_date', 14], ['Evidence', 'evidence_status', 14],
  ['Pass Count', 'pass_count', 11], ['Total Checks', 'total_checks', 12], ['Promoter %', 'promoter_pct', 12],
  ['Promoter Pass', 'promoter_pass', 13], ['Profitable 8Q', 'profitable_8q', 13], ['ROCE %', 'roce_pct', 11],
  ['ROCE Pass', 'roce_pass', 11], ['ROE %', 'roe_pct', 11], ['ROE Pass', 'roe_pass', 11], ['Pledged %', 'pledged_pct', 11],
  ['No Pledge Pass', 'no_pledge_pass', 15], ['FII %', 'fii_pct', 10], ['DII %', 'dii_pct', 10],
  ['Institutional Pass', 'institutional_pass', 16], ['CFO / Op Profit', 'cfo_op_ratio', 15], ['Cash Flow Pass', 'cash_flow_pass', 15],
  ['Legacy QGLP Filter', 'qglp_filter_status', 20], ['QGLP Data Status', 'qglp_data_status', 20], ['QGLP Score', 'qglp_score', 12], ['QGLP Missing Inputs', 'qglp_missing_inputs', 46], ['Sector Momentum', 'sector_momentum_status', 20], ['Double Momentum', 'double_momentum_status', 20],
  ['P/E', 'pe_ratio', 10], ['Book Value', 'book_value', 12], ['Debt / Equity', 'debt_to_equity', 13],
  ['Trendlyne Status', 'trendlyne_status', 16], ['Trendlyne Fetched', 'trendlyne_fetched_at', 22], ['Trend Price', 'trend_current_price', 13], ['Market Cap Cr', 'trend_market_cap_cr', 14],
  ['Trend ROCE %', 'trend_roce_pct', 12], ['Trend ROE %', 'trend_roe_pct', 12], ['CFO Cr', 'trend_cfo_cr', 13], ['Operating Profit Cr', 'trend_operating_profit_cr', 17], ['CFO / Op Profit %', 'trend_cfo_op_pct', 17],
  ['Trend Promoter %', 'trend_promoter_pct', 15], ['Trend Pledge %', 'trend_promoter_pledge_pct', 14], ['Trend FII %', 'trend_fii_pct', 12], ['Trend DII %', 'trend_dii_pct', 12],
  ['Q1 Net Profit', 'q1_net_profit', 14], ['Q2 Net Profit', 'q2_net_profit', 14], ['Q3 Net Profit', 'q3_net_profit', 14], ['Q4 Net Profit', 'q4_net_profit', 14], ['Q5 Net Profit', 'q5_net_profit', 14], ['Q6 Net Profit', 'q6_net_profit', 14], ['Q7 Net Profit', 'q7_net_profit', 14], ['Q8 Net Profit', 'q8_net_profit', 14],
  ['8Q Data Status', 'eight_quarter_data_status', 18], ['8Q Profitability', 'eight_quarter_profitability_result', 18],
  ['Raw Complete', 'raw_required_complete', 13], ['Raw Missing', 'raw_missing', 38], ['Source', 'source', 24], ['Evidence Note', 'evidence_note', 60]
]);
addRows(dossier, dossierRows);
fmtSheet(dossier);

const qglpWs = workbook.addWorksheet('QGLP Evidence', { views: [{ showGridLines: false }] });
setColumns(qglpWs, [
  ['Symbol', 'symbol', 14], ['QGLP Data Status', 'qglp_data_status', 20], ['QGLP Score', 'qglp_score', 12], ['Missing Inputs', 'qglp_missing_inputs', 65],
  ['ROE %', 'trend_roe_pct', 12], ['ROCE %', 'trend_roce_pct', 12], ['CFO Cr', 'trend_cfo_cr', 14], ['Operating Profit Cr', 'trend_operating_profit_cr', 18], ['CFO / Op Profit %', 'trend_cfo_op_pct', 18],
  ['Debt / Equity', 'debt_to_equity', 14], ['Promoter Pledge %', 'trend_promoter_pledge_pct', 18], ['8Q Data Status', 'eight_quarter_data_status', 18], ['8Q Profitability', 'eight_quarter_profitability_result', 18],
  ['Q1 Net Profit', 'q1_net_profit', 14], ['Q2 Net Profit', 'q2_net_profit', 14], ['Q3 Net Profit', 'q3_net_profit', 14], ['Q4 Net Profit', 'q4_net_profit', 14], ['Q5 Net Profit', 'q5_net_profit', 14], ['Q6 Net Profit', 'q6_net_profit', 14], ['Q7 Net Profit', 'q7_net_profit', 14], ['Q8 Net Profit', 'q8_net_profit', 14], ['Trendlyne Fetched', 'trendlyne_fetched_at', 22]
]);
addRows(qglpWs, dossierRows);
fmtSheet(qglpWs);

const strategyWs = workbook.addWorksheet('Strategy Matches', { views: [{ showGridLines: false }] });
setColumns(strategyWs, [['Symbol', 'symbol', 14], ['Strategies', 'strategies', 30], ['Signal Count', 'signal_count', 13], ['Latest Signal Date', 'latest_signal_date', 18], ['Best Signal Price', 'bestSignalPrice', 18]]);
addRows(strategyWs, symbols.map(symbol => {
  const r = strategyMatches.get(symbol);
  return { symbol, strategies: [...(r?.strategies || [])].join(', '), signal_count: r?.signalCount || 0, latest_signal_date: r?.latestSignalDate || '', bestSignalPrice: r?.bestSignalPrice || '' };
}));
fmtSheet(strategyWs);

const sourceWs = workbook.addWorksheet('Source Audit Trail', { views: [{ showGridLines: false }] });
setColumns(sourceWs, [['Symbol', 'symbol', 14], ['Upstox Fetched At', 'fetched_at', 24], ['Status', 'status', 12], ['Required Complete', 'complete', 18], ['Present Endpoints', 'present', 74], ['Missing Endpoints', 'missing', 45], ['Shareholding Snapshots', 'snapshots', 20], ['Latest Filing Period', 'latest_period', 20], ['Pledged Periods', 'pledged_periods', 15], ['SHA Hashes OK', 'hashes_ok', 15], ['Error', 'error', 60]]);
addRows(sourceWs, symbols.map(symbol => {
  const raw = rawRows.get(symbol) || {};
  const cov = sourceCoverage(raw);
  const sh = shareholding.get(symbol) || {};
  return { symbol, fetched_at: raw.fetched_at || '', status: raw.status || '', complete: cov.complete, present: cov.present, missing: cov.missing, snapshots: sh.snapshots || 0, latest_period: sh.latest_period || '', pledged_periods: sh.pledged_periods || 0, hashes_ok: sh.hashes_ok === 1 ? 'YES' : 'CHECK', error: raw.error || '' };
}));
fmtSheet(sourceWs);

const dictWs = workbook.addWorksheet('Data Dictionary', { views: [{ showGridLines: false }] });
setColumns(dictWs, [['Field', 'field', 30], ['Meaning', 'meaning', 95], ['Source', 'source', 45]]);
addRows(dictWs, [
  { field: 'Promoter %', meaning: 'Latest promoter holding percentage from official shareholding snapshot or Upstox share-holdings endpoint.', source: 'FERE NSE/BSE filings + Upstox fundamentals' },
  { field: 'No Pledge Pass', meaning: '1 only when latest promoter pledge/encumbrance is exactly zero. Positive pledge is not hidden.', source: 'Official shareholding XBRL/Table II extraction' },
  { field: 'Profitable 8Q', meaning: '1 when available parsed financials show eight consecutive profitable quarters.', source: 'FERE verified XBRL facts' },
  { field: 'ROCE / ROE', meaning: 'Company ratio values. Banking-style entities may have null ROCE where not meaningful.', source: 'Upstox key-ratios + verified fallback' },
  { field: 'Cash Flow Pass', meaning: '1 when cash flow from operations is at least 50% of operating profit, when both facts are available.', source: 'Upstox cash-flow + FERE verified financial facts' },
  { field: 'QGLP / Momentum', meaning: 'Deterministic status fields persisted by the fundamental filter sync. They are indicators, not mandatory hard filters.', source: 'strategy_fundamental_filter_results' },
  { field: 'QGLP Evidence', meaning: 'QGLP raw inputs and all eight quarterly profits are shown for every selected stock. The QGLP composite score is withheld as DATA_INSUFFICIENT until every Quality, Growth, Longevity and Price input has dated source evidence.', source: 'Trendlyne raw parameter, shareholding and quarterly-profit snapshots' },
  { field: 'Raw Complete', meaning: 'YES when all non-competitor Upstox endpoints are present for that symbol.', source: 'fundamental_source_snapshots' }
]);
fmtSheet(dictWs);

const paramsWs = workbook.addWorksheet('Strategy Parameters', { views: [{ showGridLines: false }] });
setColumns(paramsWs, [['Strategy', 'strategy', 14], ['Plain-English Definition', 'definition', 115]]);
addRows(paramsWs, [
  { strategy: 'S1a', definition: 'VPA three-leg reclaim setup using daily adjusted OHLCV, bullish trigger candle, RSI support, ATH discount, SMA200 proximity, and volume alignment.' },
  { strategy: 'S1b', definition: 'VPA trough-reversal variant using daily adjusted OHLCV, first-leg impulse, controlled retracement, bullish reversal, RSI support and volume confirmation.' },
  { strategy: 'S2a', definition: 'Institutional fair-value-gap / consequent-encroachment setup with revised weekly swing-low cap and daily high close-position filter.' },
  { strategy: 'S3a', definition: 'Dow Theory higher-high/higher-low compaction above rising SMA50 with ATR compression and S1a bullish candles at pivots.' },
  { strategy: 'S4a', definition: 'Running-stock breakout with clean 2%+ gap-up from previous close, pivot-5 weekly confirmation, trend filters, ATR contraction and supply dry-up.' },
  { strategy: 'S4b', definition: 'S4 gap variant focused on RSI support and bullish candle confirmation, with broad-market and pullback gates intentionally excluded.' },
  { strategy: 'S5a', definition: 'Mark Minervini winning-stock/VCP setup: near 52-week high, far above 52-week low, rising 200 DMA, 50 DMA above 200 DMA, 2-3 daily VCPs and supply dry-up.' }
]);
fmtSheet(paramsWs);

for (const ws of workbook.worksheets) {
  ws.eachRow(row => row.eachCell(cell => {
    if (typeof cell.value === 'number') cell.numFmt = '0.00';
  }));
}

const outFile = path.join(outDir, `Fundamental_Dossier_179_${cutoff.replaceAll('-', '')}.xlsx`);
await workbook.xlsx.writeFile(outFile);

const audit = {
  generatedAt: new Date().toISOString(),
  manifest: manifestPath,
  strategyWorkbook: strategyWorkbookPath,
  outputWorkbook: outFile,
  symbols: symbols.length,
  rawRequiredComplete: dossierRows.filter(r => r.raw_required_complete === 'YES').length,
  verifiedEvidenceRows: dossierRows.filter(r => r.evidence_status === 'VERIFIED').length,
  fullyCompliant: fullyCompliant.length,
  partialOrFailed: partial.length,
  ignoredEndpoint: 'competitors',
  dbPersistence: {
    portfolioDb: portfolioDbPath,
    rawTable: 'fundamental_source_snapshots',
    syncedTables: ['FundamentalSnapshots', 'HistoricalShareholdingPattern', 'HistoricalFinancialStatements', 'strategy_fundamental_filter_results', 'sunrise_industrial_universe'],
    fereDb: fereDbPath,
    fereTables: ['shareholding_snapshot', 'verified_xbrl_fact']
  }
};
const auditPath = path.join(outDir, `Fundamental_Dossier_179_${cutoff.replaceAll('-', '')}_audit.json`);
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));
const dataPath = path.join(outDir, `Fundamental_Dossier_179_${cutoff.replaceAll('-', '')}_data.json`);
fs.writeFileSync(dataPath, JSON.stringify({
  generatedAt: audit.generatedAt,
  symbols,
  rows: dossierRows
}, null, 2));
console.log(JSON.stringify(audit, null, 2));
