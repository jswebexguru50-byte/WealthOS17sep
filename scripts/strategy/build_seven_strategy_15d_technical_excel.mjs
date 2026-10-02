import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

let Workbook, SpreadsheetFile;
try {
  ({ Workbook, SpreadsheetFile } = await import('@oai/artifact-tool'));
} catch (e) {
  const localTool = path.resolve('outputs/01a0c502-921f-7491-9a42-361d54d7bea0/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs');
  ({ Workbook, SpreadsheetFile } = await import('file:///' + localTool.replace(/\\/g, '/')));
}

const args = process.argv.slice(2);
const getArg = (key, fallback) => {
  const idx = args.indexOf(key);
  return idx >= 0 ? args[idx + 1] : fallback;
};

const repoRoot = process.cwd();
const reportDir = path.resolve(repoRoot, getArg('--report-root', 'reports/readiness/vpa_three_leg'));
const outDir = path.resolve(repoRoot, getArg('--out-dir', 'outputs/15d_technical'));
await fs.mkdir(outDir, { recursive: true });

const cutoff = getArg('--cutoff', '2026-09-28');
const periodStart = getArg('--period-start', '2026-09-14');
const dateStamp = cutoff.replaceAll('-', '');

const allNames = await fs.readdir(reportDir);
const find = (prefix) => {
  let name = allNames.filter(n => n.startsWith(prefix) && n.includes(dateStamp) && n.endsWith('.json')).sort().at(-1);
  if (!name) {
    name = allNames.filter(n => n.startsWith(prefix) && n.endsWith('.json')).sort().at(-1);
  }
  if (!name) throw new Error(`Missing completed ${prefix} report`);
  return path.join(reportDir, name);
};

const files = {
  S1a: find('vpa_three_leg_full_universe_90_'),
  S1b: find('s1b_full_universe_90_'),
  S2a: find('s2a_full_universe_90_'),
  S3a: find('s3a_full_universe_90_'),
  S4a: find('s4a_full_universe_90_'),
  S4b: find('s4b_full_universe_90_'),
  S5a: find('s5a_full_universe_90_'),
};

console.log('Using reports for 15-day technical workbook:', files);

function sanitizeJson(raw) {
  return raw
    .replace(/(^|[^A-Za-z0-9_])(-?Infinity|NaN)(?=\s*[,}\]])/g, '$1null')
    .replace(/:\s*,/g, ': null,')
    .replace(/:\s*}/g, ': null}');
}

const parse = async file => JSON.parse(sanitizeJson(await fs.readFile(file, 'utf8')));
const reports = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([id, file]) => [id, await parse(file)])));

const specs = {
  S1a: { color: '#2563EB', name: 'VPA three-leg reclaim', date: 'signal_date', fields: [
    ['Signal date', 'signal_date', 'date'], ['Symbol', 'symbol', 'text'], ['Signal close ₹', 'cmp', 'price'],
    ['Entry ₹', 'entry', 'price'], ['Stop ₹', 'stop', 'price'], ['Target 1 ₹', 'target_1', 'price'],
    ['Target 2 ₹', 'target_2', 'price'], ['R:R', 'rr_target_1', 'ratio'], ['Bullish candle', 'candle_pattern', 'text'],
    ['RSI support', 'rsi_level', 'text'], ['RSI value', 'rsi_value', 'number'], ['Scenario', 'scenario', 'text'],
    ['Impulse %', 'displacement_pct', 'fraction'], ['Retracement %', 'retracement_ratio', 'fraction'],
    ['Reclaim %', 'reclaim_ratio', 'fraction'], ['ATH discount %', 'ath_discount_pct', 'fraction'],
    ['SMA200 distance %', 'sma_distance_pct', 'fraction'], ['L1 start', 'origin_date', 'date'],
    ['L1 high date', 'leg1_high_date', 'date'], ['L2 low date', 'leg2_low_date', 'date'],
    ['Forward 5B %', 'forward_return_5b_pct', 'percent'], ['Forward 10B %', 'forward_return_10b_pct', 'percent'],
    ['Forward 20B %', 'forward_return_20b_pct', 'percent'], ['Rule checks and measured values', 'rule_checks_and_measured_values', 'text'],
  ]},
  S1b: { color: '#7C3AED', name: 'VPA trough reversal', date: 'as_of_date', fields: [
    ['Signal date', 'as_of_date', 'date'], ['Symbol', 'symbol', 'text'], ['Signal close ₹', 'close', 'price'],
    ['Entry ₹', 'entry', 'price'], ['Stop ₹', 'stop', 'price'], ['Bullish candle', 'candle_pattern', 'text'],
    ['RSI support', 'rsi_level', 'text'], ['RSI value', 'rsi_value', 'number'],
    ['Impulse %', 'displacement_pct', 'fraction'], ['Retracement %', 'retracement_ratio', 'fraction'],
    ['Trigger vol / SMA', 'trigger_volume_multiple', 'ratio'], ['Pullback / L1 vol', 'leg2_to_leg1_volume_ratio', 'ratio'],
    ['ATH discount %', 'ath_discount_pct', 'fraction'], ['SMA200 distance %', 'sma_distance_pct', 'fraction'],
    ['L1 start', 'origin_date', 'date'], ['L1 peak', 'leg1_high_date', 'date'], ['Trough', 'trough_date', 'date'],
    ['Forward 5B %', 'forward_return_5b_pct', 'percent'], ['Forward 10B %', 'forward_return_10b_pct', 'percent'],
    ['Forward 20B %', 'forward_return_20b_pct', 'percent'],
  ]},
  S2a: { color: '#EA580C', name: 'Institutional FVG and CE', date: 'Signal_Date', fields: [
    ['Signal date', 'Signal_Date', 'date'], ['Symbol', 'Symbol', 'text'], ['Signal close ₹', 'Signal_Price', 'price'],
    ['Bullish candle', 'Candle_Pattern', 'text'], ['CE level ₹', 'CE_Level', 'price'],
    ['FVG floor ₹', 'FVG_Low_Bound', 'price'], ['FVG ceiling ₹', 'FVG_High_Bound', 'price'],
    ['FVG size %', 'FVG_Size_Pct', 'percent'], ['Initial move %', 'Initial_Move_Pct', 'percent'],
    ['Initial move bars', 'Initial_Move_Bars', 'integer'], ['Pullback bars', 'Pullback_Duration_Bars', 'integer'],
    ['Displacement vol / SMA', 'Displacement_Vol_Ratio', 'ratio'], ['Trigger vol / SMA', 'Trigger_Vol_Ratio', 'ratio'],
    ['Pullback / displacement vol', 'Pullback_Vol_Ratio', 'ratio'],
    ['Weekly swing low ₹', 'Weekly_Swing_Low', 'price'], ['Peak since low ₹', 'Weekly_Peak_Since_Swing_Low', 'price'],
    ['Peak rise from low %', 'Weekly_Advance_From_Swing_Low_Pct', 'percent'],
    ['Close below high %', 'Close_From_Daily_High_Range_Pct', 'percent'],
    ['Displacement date', 'FVG_Displacement_Date', 'date'],
    ['Forward 5B %', 'Fwd_Return_5B (%)', 'percent'], ['Forward 10B %', 'Fwd_Return_10B (%)', 'percent'],
    ['Forward 20B %', 'Fwd_Return_20B (%)', 'percent'],
  ]},
  S3a: { color: '#059669', name: 'HH/HL ATR compression', date: 'Signal_Date', fields: [
    ['Signal date', 'Signal_Date', 'date'], ['Symbol', 'Symbol', 'text'], ['Signal close ₹', 'Signal_Price', 'price'],
    ['Entry ₹', 'Entry', 'price'], ['Stop ₹', 'Stop', 'price'], ['Target 1 ₹', 'Target_1', 'price'],
    ['Target 2 ₹', 'Target_2', 'price'], ['R:R', 'RR_Target_1', 'ratio'],
    ['P0 low ₹', 'P0', 'price'], ['H1 high ₹', 'H1', 'price'], ['L1 low ₹', 'L1', 'price'],
    ['H2 high ₹', 'H2', 'price'], ['L2 low ₹', 'L2', 'price'],
    ['Prior 5-session move %', 'Preceding_Move_Pct', 'percent'],
    ['ATR compression ratio', 'ATR_Compression_Ratio', 'ratio'], ['Rising SMA50 ₹', 'SMA50_At_Signal', 'price'],
    ['Pivot candle patterns', 'Pivot_Patterns', 'patterns'],
    ['H1 date', 'Date_H1', 'date'], ['L1 date', 'Date_L1', 'date'],
    ['H2 date', 'Date_H2', 'date'], ['L2 date', 'Date_L2', 'date'],
    ['Measured rule checks', 'Rule_Checks', 'checks'],
  ]},
  S4a: { color: '#0E7490', name: 'Gap running breakouts', date: 'Signal_Date', fields: [
    ['Signal date', 'Signal_Date', 'date'], ['Symbol', 'Symbol', 'text'], ['Signal close ₹', 'Signal_Price', 'price'],
    ['Recommended entry ₹', 'Recommended_Entry_Price', 'price'], ['Stop loss ₹', 'Stop_Loss', 'price'],
    ['Entry trigger', 'Entry_Trigger', 'text'], ['Gap up %', 'Gap_Up_Pct', 'percent'],
    ['Weekly pivot date', 'Weekly_Pivot_Date', 'date'], ['Previous swing high ₹', 'Previous_Swing_High', 'price'],
    ['Pullback ATR ratio', 'Pullback_ATR_Ratio', 'ratio'], ['Supply dry-up ratio', 'Supply_Dry_Up_Ratio', 'ratio'],
    ['Market cap (Cr) ₹', 'Market_Cap_Cr', 'price'], ['Measured rule checks', 'Rule_Checks', 'checks'],
  ]},
  S4b: { color: '#0F766E', name: 'RSI-supported gap breakout', date: 'Signal_Date', fields: [
    ['Signal date', 'Signal_Date', 'date'], ['Symbol', 'Symbol', 'text'], ['Signal close ₹', 'Signal_Price', 'price'],
    ['Stop loss ₹', 'Stop_Loss', 'price'], ['Gap up %', 'Gap_Up_Pct', 'percent'],
    ['RSI(14)', 'RSI14', 'number'], ['RSI support level', 'RSI_Support_Level', 'number'],
    ['Bullish candle', 'Candle_Pattern', 'text'], ['Measured rule checks', 'Rule_Checks', 'checks'],
  ]},
  S5a: { color: '#9F1239', name: 'Minervini winning stocks', date: 'Signal_Date', fields: [
    ['Signal date', 'Signal_Date', 'date'], ['Symbol', 'Symbol', 'text'], ['Signal close ₹', 'Signal_Price', 'price'],
    ['Entry ₹', 'Entry_Price', 'price'], ['Stop loss ₹', 'Stop_Loss', 'price'], ['Stop loss %', 'Stop_Loss_Pct', 'percent'],
    ['52W high ₹', 'Weekly_52W_High', 'price'], ['Discount from 52W high %', 'Discount_From_52W_High_Pct', 'percent'],
    ['52W low ₹', 'Weekly_52W_Low', 'price'], ['Gain from 52W low %', 'Gain_From_52W_Low_Pct', 'percent'],
    ['SMA 50 ₹', 'SMA50', 'price'], ['SMA 200 ₹', 'SMA200', 'price'],
    ['High recurrence (weeks)', 'High_Recurrence_Weeks', 'integer'], ['VCP count', 'VCP_Count', 'integer'],
    ['Previous swing high ₹', 'Previous_Swing_High', 'price'], ['Supply dry-up ratio', 'Supply_Dry_Up_Ratio', 'ratio'],
    ['20-day ATR ₹', 'ATR20', 'price'], ['Measured rule checks', 'Rule_Checks', 'checks'],
  ]},
};

const wb = Workbook.create();

const safeValue = (value, type) => {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  if (type === 'date') return new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (type === 'patterns') return Object.entries(value).map(([pivot, patterns]) => `${pivot}: ${patterns.join(', ')}`).join(' | ');
  if (type === 'checks') return value.map(x => `${x.name}: ${x.actualValue} (${x.benchmarkRule})`).join(' | ');
  return typeof value === 'number' && Number.isFinite(value) ? value : String(value);
};

const col = n => {
  let s = '';
  for (let v = n + 1; v; v = Math.floor((v - 1) / 26)) s = String.fromCharCode(65 + (v - 1) % 26) + s;
  return s;
};

const strategyIds = ['S1a', 'S1b', 'S2a', 'S3a', 'S4a', 'S4b', 'S5a'];
const counts = {};

for (const id of strategyIds) {
  const spec = specs[id], report = reports[id];
  const records = (report.matches || []).filter(r => {
    const d = String(r[spec.date] || '').slice(0, 10);
    return d >= periodStart && d <= cutoff;
  }).sort((a, b) => String(b[spec.date]).localeCompare(String(a[spec.date])) ||
    String(a.symbol || a.Symbol).localeCompare(String(b.symbol || b.Symbol)));

  counts[id] = records.length;
  const sheet = wb.worksheets.add(id);
  sheet.showGridLines = false;
  sheet.tabColor = spec.color;

  sheet.getRange('A1').values = [[`${id} | ${spec.name}`]];
  sheet.getRange('A1').format.font = { name: 'Arial', size: 17, bold: true, color: '#17233B' };
  sheet.getRange('A2').values = [[`Adjusted daily candles · ${periodStart} to ${cutoff} (Last 15 Days) · historical matches`]];
  sheet.getRange('A2').format.font = { name: 'Arial', size: 10, italic: true, color: '#64748B' };

  const summaries = [
    ['Signals (15D)', records.length],
    ['Symbols scanned', report.symbols_requested],
    ['With adjusted history', report.symbols_covered],
    ['Latest source date', cutoff]
  ];
  sheet.getRange('A4:H4').values = [[
    summaries[0][0], summaries[0][1], summaries[1][0], summaries[1][1],
    summaries[2][0], summaries[2][1], summaries[3][0], summaries[3][1]
  ]];
  sheet.getRange('A4:H4').format = { fill: '#EEF3F9', font: { name: 'Arial', size: 10, color: '#1D3557' }, rowHeight: 28 };
  for (const idx of [1, 3, 5, 7]) sheet.getCell(3, idx).format.font = { name: 'Arial', size: 12, bold: true, color: spec.color };

  const headers = spec.fields.map(f => f[0]);
  sheet.getRangeByIndexes(5, 0, 1, headers.length).values = [headers];
  const header = sheet.getRangeByIndexes(5, 0, 1, headers.length);
  header.format = { fill: '#17365D', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' }, rowHeight: 36, wrapText: true };

  if (records.length) {
    const matrix = records.map(r => spec.fields.map(([, key, type]) => safeValue(r[key], type)));
    sheet.getRangeByIndexes(6, 0, matrix.length, headers.length).values = matrix;
    const body = sheet.getRangeByIndexes(6, 0, matrix.length, headers.length);
    body.format.font = { name: 'Arial', size: 10, color: '#24354B' };
    body.format.rowHeight = id === 'S1b' ? 38 : 26;
    for (let j = 0; j < spec.fields.length; j++) {
      const type = spec.fields[j][2], letter = col(j), range = sheet.getRange(`${letter}7:${letter}${6 + records.length}`);
      if (type === 'date') range.setNumberFormat('yyyy-mm-dd');
      else if (type === 'price') range.setNumberFormat('#,##0.00');
      else if (type === 'fraction') range.setNumberFormat('0.0%');
      else if (type === 'percent') range.setNumberFormat('0.0"%"');
      else if (type === 'ratio') range.setNumberFormat('0.00"x"');
      else if (type === 'number') range.setNumberFormat('0.00');
      else if (type === 'integer') range.setNumberFormat('#,##0');
    }
    sheet.tables.add(`A6:${col(headers.length - 1)}${6 + records.length}`, true, `${id}Signals15D`);
  } else {
    sheet.getRange('A7').values = [['No qualifying signals in the requested period.']];
    sheet.getRange('A7').format.font = { name: 'Arial', size: 11, italic: true, color: '#64748B' };
  }

  sheet.getRange('A:A').format.columnWidth = 15;
  sheet.getRange('B:B').format.columnWidth = 18;
  sheet.getRange(`C:${col(headers.length - 1)}`).format.columnWidth = 16;
  for (let j = 0; j < spec.fields.length; j++) {
    if (['text', 'patterns', 'checks'].includes(spec.fields[j][2])) {
      const type = spec.fields[j][2], key = spec.fields[j][1], letter = col(j);
      sheet.getRange(`${letter}:${letter}`).format.columnWidth =
        type === 'checks' ? 95 : type === 'patterns' ? 65 : key === 'rule_checks_and_measured_values' ? 95 :
        key === 'candle_pattern' ? 42 : 30;
      if (records.length) sheet.getRange(`${letter}7:${letter}${6 + records.length}`).format.wrapText = true;
    }
  }
  sheet.freezePanes.freezeRows(6);
}

// Rules and Parameters Tab
const definitions = wb.worksheets.add('Rules and parameters');
definitions.showGridLines = false;
definitions.getRange('A1').values = [['Technical Strategy Specifications & Verification Rules']];
definitions.getRange('A1').format.font = { name: 'Arial', size: 17, bold: true, color: '#17233B' };
definitions.getRange('A2').values = [['Formal rules implemented in the WealthOS Strategy Engine across S1a to S5a']];
definitions.getRange('A2').format.font = { name: 'Arial', size: 10, italic: true, color: '#64748B' };

const ruleHeaders = ['Strategy', 'Parameter / Rule', 'Value Used', 'Plain-English Meaning', 'Basis'];
definitions.getRange('A4:E4').values = [ruleHeaders];
definitions.getRange('A4:E4').format = { fill: '#17365D', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' }, rowHeight: 28 };

// Copy rule rows from 90d report or existing parameters
const rows = [
  ['S1a', 'Core rule', '—', 'Three-leg rise, pullback and reclaim. Requires a bullish non-doji trigger, strong first-leg volume, quieter pullback, RSI support, at least 50% below available-history ATH, and proximity to SMA200.', 'Daily adjusted OHLCV'],
  ['S1a', 'Enforce Ath Discount', 'On', 'Whether the ath discount filter is active.', 'Implementation parameter'],
  ['S1a', 'Max Ath Discount', '0.5', 'Price must be at least 50% below available-history all-time high.', 'Rule threshold'],
  ['S1a', 'Max Pullback Volume Ratio', '0.7', 'Pullback volume must contract to <= 70% of initial impulse volume.', 'Volume threshold'],
  ['S1a', 'Min Impulse Vol Multiple', '1.5', 'First-leg volume must be >= 1.5x of the 20-day SMA volume.', 'Volume threshold'],
  ['S1a', 'Min Rr Target 1', '1.5', 'Target 1 must offer at least 1.5:1 reward-to-risk ratio.', 'Risk parameter'],
  ['S1b', 'Core rule', '—', 'VPA trough reversal. Identifies sharp volume decline at swing lows followed by expansion on trough reclaim.', 'Daily adjusted OHLCV'],
  ['S1b', 'Trigger Volume Multiple', '1.2x', 'Trigger volume must exceed 20-day SMA by at least 1.2x.', 'Volume threshold'],
  ['S2a', 'Core rule', '—', 'Institutional Fair Value Gap (FVG) with Consequent Encroachment (CE 50% reclaim) and weekly swing-low alignment.', 'Daily + Weekly adjusted OHLCV'],
  ['S2a', 'Min FVG Size', '1.0%', 'Imbalance gap between candle 1 high and candle 3 low must be >= 1.0%.', 'Price geometry'],
  ['S2a', 'CE Reclaim', '50.0%', 'Price must retest and hold the 50% midpoint of the institutional FVG.', 'ICT / CE principle'],
  ['S3a', 'Core rule', '—', 'Higher High / Higher Low structural swing with ATR volatility contraction below 0.7x before expansion.', 'Daily adjusted OHLCV'],
  ['S4a', 'Core rule', '—', 'Running breakaway gap from prior multi-week consolidation with volume dry-up before the launch.', 'Daily adjusted OHLCV'],
  ['S4b', 'Core rule', '—', 'Breakout gap supported by RSI(14) maintaining bull regime above 50/60 support zone.', 'Daily adjusted OHLCV'],
  ['S5a', 'Core rule', '—', 'Mark Minervini Trend Template Stage 2 winning stock with Volatility Contraction Pattern (VCP).', 'Daily + Weekly adjusted OHLCV'],
  ['S5a', 'Trend Template', 'SMA50 > SMA200', 'Current price > 50 SMA > 200 SMA, and 200 SMA trending up for >= 1 month.', 'Minervini Stage 2 criteria']
];

definitions.getRangeByIndexes(4, 0, rows.length, 5).values = rows;
definitions.getRangeByIndexes(4, 0, rows.length, 5).format.font = { name: 'Arial', size: 10, color: '#24354B' };
definitions.getRange('A:A').format.columnWidth = 12;
definitions.getRange('B:B').format.columnWidth = 25;
definitions.getRange('C:C').format.columnWidth = 15;
definitions.getRange('D:D').format.columnWidth = 70;
definitions.getRange('E:E').format.columnWidth = 25;
definitions.freezePanes.freezeRows(4);

console.log('Exporting 15-Day Technical XLSX workbook...');
const xlsx = await SpreadsheetFile.exportXlsx(wb);
const outputFileName = `Seven_Strategies_15_Days_Technical_${cutoff}.xlsx`;
const outputPath = path.join(outDir, outputFileName);
await xlsx.save(outputPath);

const rootOutputPath = path.resolve(repoRoot, 'outputs', outputFileName);
await fs.copyFile(outputPath, rootOutputPath);

console.log(JSON.stringify({
  output: outputPath,
  rootOutput: rootOutputPath,
  counts,
  periodStart,
  cutoff
}, null, 2));
