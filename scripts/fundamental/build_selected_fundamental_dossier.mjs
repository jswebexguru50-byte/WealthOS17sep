#!/usr/bin/env node
/**
 * Build a repeatable fundamental dossier workbook for the selected strategy cohort.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
const cutoff = getArg('--cutoff', '2026-09-25');
const APPROVED_STRATEGIES = ['S1a', 'S1b', 'S2a', 'S3a', 'S4a', 'S4b', 'S5a'];
const sectorSnapshotPath = path.resolve(root, getArg('--sector-snapshot', 'data/fundamental_enrichment/sector_momentum_snapshot.json'));

fs.mkdirSync(outDir, { recursive: true });

function placeholders(items) {
  return items.map(() => '?').join(',');
}

function readStrategyMatches(symbols) {
  const bySymbol = new Map(symbols.map(s => [s, { symbol: s, strategies: new Set(), signalKeys: new Set(), latestSignalDate: null, bestSignalPrice: null }]));
  if (!fs.existsSync(strategyWorkbookPath)) return bySymbol;

  const workbook = XLSX.readFile(strategyWorkbookPath);
  const strategySheets = workbook.SheetNames.filter(s => APPROVED_STRATEGIES.includes(s));
  const missingStrategies = APPROVED_STRATEGIES.filter(s => !strategySheets.includes(s));
  if (missingStrategies.length) {
    throw new Error(`Technical workbook is missing approved strategy sheets: ${missingStrategies.join(', ')}`);
  }
  for (const sheetName of strategySheets) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { range: 5, defval: null });
    for (const [rowIndex, row] of rows.entries()) {
      const symbol = String(row.Symbol || row.symbol || '').trim().toUpperCase();
      if (!bySymbol.has(symbol)) continue;
      const record = bySymbol.get(symbol);
      record.strategies.add(sheetName);
      const rawSignalDate = row['Signal date'] || row['Signal_Date'] || row.Signal_Date || row.signal_date || row.as_of_date || '';
      const signalDate = normalizeExcelDate(rawSignalDate);
      // One signal per symbol, strategy, and date. The source has no intraday
      // timestamp, so duplicate same-day records are intentionally collapsed.
      record.signalKeys.add(`${sheetName}|${signalDate || `UNDATED:${rowIndex}`}`);
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

if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest missing at ${manifestPath}`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const symbols = manifest.symbols.map(s => String(s).toUpperCase());
if (symbols.length === 0) {
  console.error('Manifest must contain at least one symbol.');
  process.exit(1);
}
const uniqueSymbols = new Set(symbols);
if (uniqueSymbols.size !== symbols.length) {
  console.error(`Manifest must contain unique symbols. Found ${symbols.length} entries but ${uniqueSymbols.size} unique symbols.`);
  process.exit(1);
}
const cohortCount = symbols.length;

const portfolio = new Database(portfolioDbPath, { readonly: true });
const ph = placeholders(symbols);

const strategyMatches = readStrategyMatches(symbols);
const sectorMomentumBySymbol = loadSectorMomentum(symbols);

const DOSSIER_METRIC_MAP = {
  market_cap_cr: { metric: 'market_cap', periodType: 'INSTANT', scope: 'UNKNOWN' },
  roce_pct: { metric: 'roce_reported', periodType: 'ANNUAL', scope: 'UNKNOWN' },
  roe_pct: { metric: 'roe', periodType: 'ANNUAL', scope: 'UNKNOWN' },
  cfo_cr: { metric: 'cfo', periodType: 'ANNUAL', scope: 'UNKNOWN' },
  operating_profit_cr: { metric: 'operating_profit', periodType: 'ANNUAL', scope: 'UNKNOWN' },
  promoter_pct: { metric: 'promoter_holding', periodType: 'INSTANT', scope: 'UNKNOWN' },
  promoter_pledge_pct: { metric: 'promoter_pledge', periodType: 'QUARTER', scope: 'UNKNOWN' },
  fii_pct: { metric: 'fii_holding', periodType: 'QUARTER', scope: 'UNKNOWN' },
  pe_ratio: { metric: 'pe_ratio', periodType: 'TTM', scope: 'UNKNOWN' },
  book_value: { metric: 'bvps', periodType: 'ANNUAL', scope: 'UNKNOWN' },
  debt_to_equity: { metric: 'debt_to_equity_reported', periodType: 'ANNUAL', scope: 'UNKNOWN' },
};

// company_facts preserves the provider's raw value.  The master dossier, however,
// must expose financial measures as true Excel numbers (or null), never as
// numeric-looking strings.  This conversion is deliberately narrow: it applies
// only to the numerical fields selected by DOSSIER_METRIC_MAP and never invents a
// value when the provider returned an unparseable value.
function numericFact(fact) {
  if (!fact || fact.value === null || fact.value === undefined || fact.value === '') {
    return { value: null, availabilityStatus: fact?.availabilityStatus || 'NOT_YET_REQUESTED' };
  }
  const normalized = typeof fact.value === 'string' ? fact.value.replace(/,/g, '').trim() : fact.value;
  const numeric = typeof normalized === 'number' ? normalized : Number(normalized);
  if (Number.isFinite(numeric)) return { ...fact, value: numeric };
  return {
    ...fact,
    value: null,
    availabilityStatus: fact.availabilityStatus === 'AVAILABLE' ? 'INSUFFICIENT_DATA' : fact.availabilityStatus
  };
}

function loadSectorMomentum(symbols) {
  const scriptPath = path.resolve(root, 'scripts/fundamental/build_sector_momentum_snapshot.py');
  const indexRoot = path.resolve(root, 'data/market_data/tejhq_hf_10y/kite_index_backfill/candles');
  const proxyMapPath = path.resolve(root, 'data/fundamental_enrichment/trendlyne_sector_to_nse_index_proxy_map.json');
  const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wealthos-sector-'));
  const inputPath = path.join(inputDir, 'symbols.json');
  fs.writeFileSync(inputPath, JSON.stringify(symbols));
  const pythonCandidates = [
    process.env.PYTHON_BIN,
    'C:\\Users\\gopal\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
  ].filter(Boolean);
  let failure = null;
  try {
    for (const python of pythonCandidates) {
      const result = spawnSync(python, [scriptPath, '--db', portfolioDbPath, '--symbols-json', inputPath, '--index-root', indexRoot, '--output', sectorSnapshotPath, '--provider-proxy-map', proxyMapPath], {
        cwd: root,
        encoding: 'utf8',
        timeout: 120000,
      });
      if (result.status === 0 && fs.existsSync(sectorSnapshotPath)) {
        const parsed = JSON.parse(fs.readFileSync(sectorSnapshotPath, 'utf8'));
        return new Map((parsed.rows || []).map(row => [String(row.symbol).toUpperCase(), row]));
      }
      failure = (result.error?.message || result.stderr || `exit ${result.status}`).trim();
    }
  } finally {
    fs.rmSync(inputDir, { recursive: true, force: true });
  }
  console.warn(`[sector-momentum] persisted sector-index snapshot unavailable: ${failure || 'unknown error'}`);
  return new Map();
}

const allTraceableFacts = portfolio.prepare(`
  SELECT * FROM company_facts
  WHERE symbol IN (${ph})
    AND provider = 'TRENDLYNE_MCP'
    AND providerToken IS NOT NULL
    AND exactProviderLabel IS NOT NULL
    AND sourceDocumentId IS NOT NULL
    AND fetchedAt IS NOT NULL
    AND factType IN ('REPORTED', 'MISSING')
`).all(...symbols);

// Process latest facts, handling conflicts
const factsBySymbol = new Map(symbols.map(s => [s, []]));
const grouped = new Map(); // key = full identity

for (const fact of allTraceableFacts) {
  const sym = String(fact.symbol).toUpperCase();
  const met = String(fact.metric);
  const key = [
    sym,
    met,
    fact.periodType,
    fact.periodEnd,
    fact.scope,
    fact.factType
  ].join('|');
  
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(fact);
}

for (const [key, facts] of grouped.entries()) {
  const sym = key.split('|')[0];
  if (!facts.length) continue;
  
  facts.sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime());
  
  const latestFetchedAt = facts[0].fetchedAt;
  const sameTimeFacts = facts.filter(f => f.fetchedAt === latestFetchedAt);
  
  let chosenFact;
  if (sameTimeFacts.length > 1) {
    const val = sameTimeFacts[0].value;
    // Check materially different non-null values
    const isConflict = sameTimeFacts.some(f => f.value !== null && val !== null && f.value !== val);
    if (isConflict) {
      chosenFact = { ...sameTimeFacts[0], value: null, availabilityStatus: 'CONFLICTING' };
    } else {
      chosenFact = sameTimeFacts[0];
    }
  } else {
    chosenFact = sameTimeFacts[0];
  }
  
  // Apply 15-day staleness
  if (chosenFact.fetchedAt) {
    const fetched = new Date(chosenFact.fetchedAt).getTime();
    const diffDays = (Date.now() - fetched) / (1000 * 60 * 60 * 24);
    if (diffDays > 15 && chosenFact.availabilityStatus === 'AVAILABLE') {
      chosenFact.availabilityStatus = 'STALE';
    }
  }

  factsBySymbol.get(sym).push(chosenFact);
}

function getFact(symbol, canonicalMetricKey) {
  const req = DOSSIER_METRIC_MAP[canonicalMetricKey];
  if (!req) {
    return { value: null, availabilityStatus: 'NOT_YET_REQUESTED' };
  }
  const facts = factsBySymbol.get(symbol) || [];
  
  // Scope selection rule:
  // 1. Prefer the declared scope when present.
  // 2. If the declared scope is UNKNOWN, accept only UNKNOWN.
  // 3. Do not silently select a legacy CONSOLIDATED or STANDALONE fact merely because it is present.
  
  let candidates = facts.filter(x => x.metric === req.metric && x.periodType === req.periodType);
  let best = candidates.find(x => x.scope === req.scope);
  
  if (!best) {
    return { value: null, availabilityStatus: 'NOT_YET_REQUESTED' };
  }
  return best;
}

const evidenceRows = [];
let eligibleSnapshotCount = 0;
let eligiblePeriodicCount = 0;

const dossierRows = symbols.map(symbol => {
  const st = strategyMatches.get(symbol) || { strategies: new Set(), signalCount: 0 };
  
  const facts = factsBySymbol.get(symbol) || [];
  for (const f of facts) {
    evidenceRows.push({
      symbol,
      canonical_metric: f.metric,
      value: f.value,
      availability_status: f.availabilityStatus,
      provider: f.provider,
      provider_token: f.providerToken,
      exact_provider_label: f.exactProviderLabel,
      source_document_id: f.sourceDocumentId,
      fetched_at: f.fetchedAt,
      scope: f.scope,
      period_type: f.periodType,
      period_end: f.periodEnd,
      unit: f.unit,
      currency: f.currency
    });
  }
  
  let eligibleSnapshot = false;
  let eligiblePeriodic = false;
  for (const f of facts) {
    if (f.periodEnd === 'LATEST' && f.availabilityStatus === 'AVAILABLE') eligibleSnapshot = true;
    if (f.periodEnd !== 'LATEST' && f.availabilityStatus === 'AVAILABLE' && ['ANNUAL', 'QUARTER', 'TTM'].includes(f.periodType)) eligiblePeriodic = true;
  }
  if (eligibleSnapshot) eligibleSnapshotCount++;
  if (eligiblePeriodic) eligiblePeriodicCount++;

  const roce = numericFact(getFact(symbol, 'roce_pct'));
  const roe = numericFact(getFact(symbol, 'roe_pct'));
  const cfo = numericFact(getFact(symbol, 'cfo_cr'));
  const op = numericFact(getFact(symbol, 'operating_profit_cr'));
  const promoter = numericFact(getFact(symbol, 'promoter_pct'));
  const pledge = numericFact(getFact(symbol, 'promoter_pledge_pct'));
  const fii = numericFact(getFact(symbol, 'fii_pct'));
  const dii = numericFact(getFact(symbol, 'dii_holding_pct')); // unmapped
  const pe = numericFact(getFact(symbol, 'pe_ratio'));
  const bv = numericFact(getFact(symbol, 'book_value'));
  const de = numericFact(getFact(symbol, 'debt_to_equity'));
  const price = numericFact(getFact(symbol, 'current_price')); // unmapped
  const mcap = numericFact(getFact(symbol, 'market_cap_cr'));
  const sectorMomentum = sectorMomentumBySymbol.get(symbol) || {
    sector: null, indexSymbol: null, asOf: null, close: null, ema20: null, sma20: null,
    return20dPct: null, aboveEma20: null, aboveSma20: null, status: 'SOURCE_UNAVAILABLE',
    availabilityReason: 'Sector-momentum snapshot could not be built from saved sector-index OHLCV.',
    source: 'KITE_INDEX_PARQUET'
  };

  let cfo_op_val = null;
  let cfo_op_status = 'INSUFFICIENT_DATA';
  if (cfo.availabilityStatus === 'AVAILABLE' && op.availabilityStatus === 'AVAILABLE' && op.value !== null && Number(op.value) !== 0) {
    cfo_op_val = (Number(cfo.value) / Number(op.value)) * 100;
    cfo_op_status = 'AVAILABLE';
  }

  const parseDate = (d) => {
    if (!d) return null;
    const pd = new Date(d);
    return isNaN(pd.getTime()) ? null : pd;
  };
  const signalDateObj = parseDate(st.latestSignalDate);

  return {
    symbol,
    strategies: [...st.strategies].join(', '),
    signal_count: st.signalKeys?.size || 0,
    latest_signal_date: signalDateObj,
    latest_signal_date_status: signalDateObj ? 'AVAILABLE' : 'NOT_YET_REQUESTED',

    trend_current_price: price.value,
    trend_current_price_status: price.availabilityStatus,
    trend_market_cap_cr: mcap.value,
    trend_market_cap_cr_status: mcap.availabilityStatus,
    
    trend_roce_pct: roce.value,
    trend_roce_pct_status: roce.availabilityStatus,
    trend_roe_pct: roe.value,
    trend_roe_pct_status: roe.availabilityStatus,
    trend_cfo_cr: cfo.value,
    trend_cfo_cr_status: cfo.availabilityStatus,
    trend_operating_profit_cr: op.value,
    trend_operating_profit_cr_status: op.availabilityStatus,
    trend_cfo_op_pct: cfo_op_val,
    trend_cfo_op_pct_status: cfo_op_status,
    
    trend_promoter_pct: promoter.value,
    trend_promoter_pct_status: promoter.availabilityStatus,
    trend_promoter_pledge_pct: pledge.value,
    trend_promoter_pledge_pct_status: pledge.availabilityStatus,
    trend_fii_pct: fii.value,
    trend_fii_pct_status: fii.availabilityStatus,
    trend_dii_pct: dii.value,
    trend_dii_pct_status: dii.availabilityStatus,
    
    pe_ratio: pe.value,
    pe_ratio_status: pe.availabilityStatus,
    book_value: bv.value,
    book_value_status: bv.availabilityStatus,
    debt_to_equity: de.value,
    debt_to_equity_status: de.availabilityStatus,

    eight_quarter_data_status: 'INSUFFICIENT_DATA',
    eight_quarter_data_reason: 'Dated multi-period history is not yet available.',
    qglp_data_status: 'INSUFFICIENT_DATA',
    qglp_data_reason: 'Dated multi-period history is not yet available.',
    fcf_dcf_status: 'INSUFFICIENT_DATA',
    fcf_dcf_reason: 'Dated cash-flow history and verified Capex sign convention are unavailable.',
    sector: sectorMomentum.sector,
    sector_index: sectorMomentum.indexSymbol,
    sector_as_of: sectorMomentum.asOf,
    sector_close: sectorMomentum.close,
    sector_ema20: sectorMomentum.ema20,
    sector_sma20: sectorMomentum.sma20,
    sector_return_20d_pct: sectorMomentum.return20dPct,
    sector_above_ema20: sectorMomentum.aboveEma20,
    sector_above_sma20: sectorMomentum.aboveSma20,
    sector_momentum_status: sectorMomentum.status,
    sector_momentum_reason: sectorMomentum.availabilityReason,
    sector_momentum_source: sectorMomentum.source,
    sector_index_mapping_method: sectorMomentum.indexMappingMethod || 'SOURCE_UNAVAILABLE',
    double_momentum_status: 'NOT_YET_REQUESTED',
    double_momentum_reason: 'Stock 20-day return has not been calculated in this snapshot export.',
  };
});

const workbook = new ExcelJS.Workbook();
workbook.creator = 'WealthOS deterministic dossier generator';
workbook.created = new Date();
workbook.modified = new Date();
workbook.properties.date1904 = false;

const summary = workbook.addWorksheet('Coverage Summary', { views: [{ showGridLines: false }] });
setColumns(summary, [['Metric', 'metric', 38], ['Value', 'value', 28], ['Notes', 'notes', 95]]);
addRows(summary, [
  { metric: 'Selected shares', value: symbols.length, notes: 'Source: data/fundamental_enrichment/excel_strategy_manifest.json' },
  { metric: 'Strategy universe', value: APPROVED_STRATEGIES.join(', '), notes: 'Exactly seven approved alphanumeric strategies.' },
  { metric: 'Technical workbook', value: path.basename(strategyWorkbookPath), notes: 'Filename is legacy; workbook content is validated against all seven approved strategy sheets.' },
  { metric: 'Cutoff date', value: cutoff, notes: 'Strategy signal cutoff.' },
  { metric: 'Traceable Snapshot Eligible', value: eligibleSnapshotCount, notes: 'Count of symbols with verifiable canonical LATEST facts.' },
  { metric: 'Periodic History Eligible', value: eligiblePeriodicCount, notes: 'Count of symbols with dated traceable annual, quarterly, or TTM facts; LATEST snapshots do not qualify.' },
  { metric: 'LATEST snapshot data', value: 'Point-in-Time', notes: 'LATEST snapshot data is not historical analysis and cannot be used for trends.' },
  { metric: 'Rule-result policy', value: 'INFORMATION ONLY', notes: 'Every selected symbol remains in the master sheet. Availability statuses indicate evidence completeness.' },
  { metric: 'No synthetic data policy', value: 'ACTIVE', notes: 'Missing facts display their explicit availability status; no fake values inserted.' }
]);
fmtSheet(summary);

const dossier = workbook.addWorksheet(`All ${cohortCount} Dossier`, { views: [{ showGridLines: false }] });
setColumns(dossier, [
  ['Symbol', 'symbol', 14], 
  ['Strategies', 'strategies', 22],
  ['Signals', 'signal_count', 10], 
  ['Latest Signal Date', 'latest_signal_date', 14],
  ['Latest Signal Status', 'latest_signal_date_status', 22],
  
  ['Market Cap Value', 'trend_market_cap_cr', 18], 
  ['Market Cap Status', 'trend_market_cap_cr_status', 25],
  
  ['Trend Price Value', 'trend_current_price', 18], 
  ['Trend Price Status', 'trend_current_price_status', 25], 
  
  ['ROCE Value', 'trend_roce_pct', 18], 
  ['ROCE Status', 'trend_roce_pct_status', 25], 
  ['ROE Value', 'trend_roe_pct', 18], 
  ['ROE Status', 'trend_roe_pct_status', 25], 
  
  ['CFO Value', 'trend_cfo_cr', 18], 
  ['CFO Status', 'trend_cfo_cr_status', 25], 
  ['Operating Profit Value', 'trend_operating_profit_cr', 22], 
  ['Operating Profit Status', 'trend_operating_profit_cr_status', 25], 
  ['CFO / Operating Profit Value', 'trend_cfo_op_pct', 25],
  ['CFO / Operating Profit Status', 'trend_cfo_op_pct_status', 28],
  
  ['Promoter Holding Value', 'trend_promoter_pct', 22], 
  ['Promoter Holding Status', 'trend_promoter_pct_status', 25], 
  ['Promoter Pledge Value', 'trend_promoter_pledge_pct', 22], 
  ['Promoter Pledge Status', 'trend_promoter_pledge_pct_status', 25], 
  ['FII Holding Value', 'trend_fii_pct', 18], 
  ['FII Holding Status', 'trend_fii_pct_status', 25], 
  ['DII Holding Value', 'trend_dii_pct', 18],
  ['DII Holding Status', 'trend_dii_pct_status', 25],
  
  ['P/E Value', 'pe_ratio', 18], 
  ['P/E Status', 'pe_ratio_status', 25], 
  ['Book Value Value', 'book_value', 18], 
  ['Book Value Status', 'book_value_status', 25], 
  ['Debt / Equity Value', 'debt_to_equity', 18],
  ['Debt / Equity Status', 'debt_to_equity_status', 25],

  ['8Q Data Status', 'eight_quarter_data_status', 25],
  ['8Q Data Availability Reason', 'eight_quarter_data_reason', 60],
  ['QGLP Data Status', 'qglp_data_status', 25],
  ['QGLP Availability Reason', 'qglp_data_reason', 60],
  ['FCF / DCF Status', 'fcf_dcf_status', 25],
  ['FCF / DCF Availability Reason', 'fcf_dcf_reason', 60],
  ['Sector', 'sector', 25],
  ['Sector Index', 'sector_index', 25],
  ['Sector As Of', 'sector_as_of', 16],
  ['Sector Close', 'sector_close', 18],
  ['Sector EMA 20', 'sector_ema20', 18],
  ['Sector SMA 20', 'sector_sma20', 18],
  ['Sector Return 20D %', 'sector_return_20d_pct', 22],
  ['Sector Above EMA 20', 'sector_above_ema20', 21],
  ['Sector Above SMA 20', 'sector_above_sma20', 21],
  ['Sector Momentum Status', 'sector_momentum_status', 25], 
  ['Sector Momentum Availability Reason', 'sector_momentum_reason', 60], 
  ['Sector Momentum Source', 'sector_momentum_source', 25],
  ['Sector Index Mapping Method', 'sector_index_mapping_method', 35],
  ['Double Momentum Status', 'double_momentum_status', 25],
  ['Double Momentum Availability Reason', 'double_momentum_reason', 60],
]);
addRows(dossier, dossierRows);
fmtSheet(dossier);

dossier.getColumn('latest_signal_date').numFmt = 'yyyy-mm-dd';

const evidenceSheet = workbook.addWorksheet('Fundamental Evidence', { views: [{ showGridLines: false }] });
setColumns(evidenceSheet, [
  ['Symbol', 'symbol', 14],
  ['Canonical Metric', 'canonical_metric', 25],
  ['Value', 'value', 15],
  ['Availability Status', 'availability_status', 25],
  ['Provider', 'provider', 20],
  ['Provider Token', 'provider_token', 35],
  ['Exact Provider Label', 'exact_provider_label', 35],
  ['Source Document ID', 'source_document_id', 35],
  ['Fetched At', 'fetched_at', 25],
  ['Scope', 'scope', 15],
  ['Period Type', 'period_type', 15],
  ['Period End', 'period_end', 15],
  ['Unit', 'unit', 10],
  ['Currency', 'currency', 10]
]);
addRows(evidenceSheet, evidenceRows);
fmtSheet(evidenceSheet);

const dictWs = workbook.addWorksheet('Data Dictionary', { views: [{ showGridLines: false }] });
setColumns(dictWs, [['Field', 'field', 30], ['Meaning', 'meaning', 95], ['Source', 'source', 45]]);
addRows(dictWs, [
  { field: 'AVAILABLE', meaning: 'The fact has been verified and extracted with full provenance.', source: 'company_facts' },
  { field: 'NOT_YET_REQUESTED', meaning: 'Fact has not been explicitly requested from the provider.', source: 'company_facts' },
  { field: 'REQUESTED_NOT_RETURNED', meaning: 'Provider did not return this field in the response payload.', source: 'company_facts' },
  { field: 'UNAVAILABLE_FROM_PROVIDER', meaning: 'Provider explicitly states the data is missing/unavailable.', source: 'company_facts' },
  { field: 'STALE', meaning: 'Data is present but older than acceptable threshold.', source: 'company_facts' },
  { field: 'INSUFFICIENT_DATA', meaning: 'Underlying components are missing or zero.', source: 'Calculated' },
  { field: 'CONFLICTING', meaning: 'Conflicting values returned by provider for the exact same point in time.', source: 'company_facts' },
  { field: 'NOT_APPLICABLE', meaning: 'Metric does not apply to this symbol.', source: 'company_facts' },
  { field: 'Snapshot Values', meaning: 'Point-in-time provider values directly extracted from the canonical fact pipeline.', source: 'company_facts' },
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

const outFile = path.join(outDir, `Fundamental_Dossier_${cohortCount}_${cutoff.replaceAll('-', '')}.xlsx`);
await workbook.xlsx.writeFile(outFile);

const audit = {
  generatedAt: new Date().toISOString(),
  manifest: manifestPath,
  strategyWorkbook: strategyWorkbookPath,
  outputWorkbook: outFile,
  symbols: symbols.length,
  rawRequiredComplete: 0,
  verifiedEvidenceRows: evidenceRows.length,
  fullyCompliant: 0,
  partialOrFailed: symbols.length,
  ignoredEndpoint: 'competitors',
  dbPersistence: {
    portfolioDb: portfolioDbPath,
    rawTable: 'fundamental_source_snapshots',
    syncedTables: ['company_facts'],
    fereDb: 'N/A',
    fereTables: []
  }
};
const auditPath = path.join(outDir, `Fundamental_Dossier_${cohortCount}_${cutoff.replaceAll('-', '')}_audit.json`);
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));
const dataPath = path.join(outDir, `Fundamental_Dossier_${cohortCount}_${cutoff.replaceAll('-', '')}_data.json`);
fs.writeFileSync(dataPath, JSON.stringify({
  generatedAt: audit.generatedAt,
  symbols,
  rows: dossierRows
}, null, 2));
console.log(JSON.stringify(audit, null, 2));
