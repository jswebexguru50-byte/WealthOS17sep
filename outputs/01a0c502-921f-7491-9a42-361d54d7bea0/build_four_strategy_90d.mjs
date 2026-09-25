import fs from 'node:fs/promises';
import path from 'node:path';

// Support running from outputs/01a0c502-921f-7491-9a42-361d54d7bea0 or from repo root
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

import fsSync from 'node:fs';

const findRepoRoot = () => {
  let cur = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fsSync.existsSync(path.join(cur, 'reports', 'readiness', 'vpa_three_leg'))) {
      return cur;
    }
    cur = path.dirname(cur);
  }
  return process.cwd();
};
const repoRoot = findRepoRoot();

const reportDir = path.resolve(repoRoot, getArg('--report-root', 'reports/readiness/vpa_three_leg'));
const outDir = path.resolve(repoRoot, getArg('--out-dir', 'outputs/01a0c502-921f-7491-9a42-361d54d7bea0'));
const cutoff = getArg('--cutoff', '2026-09-24');
const periodStart = getArg('--period-start', '2026-05-18');
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
  S5a: find('s5a_full_universe_90_'),
};

console.log('Using reports:', files);

const parse = async file => JSON.parse((await fs.readFile(file, 'utf8')).replace(/:\s*NaN(?=\s*[,}])/g, ': null'));
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
const monthLabels = ['May', 'Jun', 'Jul', 'Aug', 'Sep'];
const monthNums = ['05', '06', '07', '08', '09'];

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

const strategyIds = ['S1a', 'S1b', 'S2a', 'S3a', 'S4a', 'S5a'];

for (const id of strategyIds) {
  const spec = specs[id], report = reports[id];
  const records = (report.matches || []).filter(r => {
    const d = String(r[spec.date] || '').slice(0, 10);
    return d >= periodStart && d <= cutoff;
  }).sort((a, b) => String(b[spec.date]).localeCompare(String(a[spec.date])) ||
    String(a.symbol || a.Symbol).localeCompare(String(b.symbol || b.Symbol)));

  const sheet = wb.worksheets.add(id);
  sheet.showGridLines = false;
  sheet.tabColor = spec.color;

  sheet.getRange('A1').values = [[`${id} | ${spec.name}`]];
  sheet.getRange('A1').format.font = { name: 'Arial', size: 17, bold: true, color: '#17233B' };
  sheet.getRange('A2').values = [[`Adjusted daily candles · 18 May–${cutoff.slice(8, 10)} Sep 2026 · historical matches, not current trade recommendations`]];
  sheet.getRange('A2').format.font = { name: 'Arial', size: 10, italic: true, color: '#64748B' };

  const summaries = [
    ['Signals', records.length],
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
    sheet.tables.add(`A6:${col(headers.length - 1)}${6 + records.length}`, true, `${id}Signals90`);
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

  // Range-backed monthly signal bar chart
  const chartCol = headers.length + 2, first = col(chartCol), second = col(chartCol + 1);
  sheet.getRangeByIndexes(20, chartCol, 1, 2).values = [['Month', 'Signals']];
  const series = monthNums.map((m, i) => [`${monthLabels[i]} 2026`, records.filter(r => String(r[spec.date]).slice(5, 7) === m).length]);
  sheet.getRangeByIndexes(21, chartCol, series.length, 2).values = series;
  const chart = sheet.charts.add('bar', sheet.getRange(`${first}21:${second}26`));
  chart.title = 'Signals by month';
  chart.titleTextStyle.typeface = 'Arial';
  chart.titleTextStyle.fontSize = 11;
  chart.yAxis = { numberFormatCode: '0.0', numberFormatSourceLinked: false, textStyle: { typeface: 'Arial', fontSize: 9 } };
  chart.hasLegend = false;
  chart.setPosition(`${first}4`, `${col(chartCol + 7)}17`);
  chart.series.items[0].fill = spec.color;
  sheet.getRange(`${first}:${col(chartCol + 7)}`).format.columnWidth = 13;
}

// 7th Tab: Detailed Strategy Rules and Parameters
const definitions = wb.worksheets.add('Rules and parameters');
definitions.showGridLines = false;
definitions.tabColor = '#B45309';
definitions.getRange('A1').values = [['Strategy rules and parameter values']];
definitions.getRange('A1').format.font = { name: 'Arial', size: 17, bold: true, color: '#17233B' };
definitions.getRange('A2').values = [[`Current implemented defaults used in this 90-session scan · adjusted daily candles · cutoff ${cutoff}`]];
definitions.getRange('A2').format.font = { name: 'Arial', size: 10, italic: true, color: '#64748B' };

const core = {
  S1a: 'Three-leg rise, pullback and reclaim. Requires a bullish non-doji trigger, strong first-leg volume, quieter pullback, RSI support, at least 50% below available-history ATH, and proximity to SMA200.',
  S1b: 'First-leg rise followed by a 10–90% retracement and a bullish reversal near the trough. No leg-three reclaim. Requires volume, RSI support, ATH discount and SMA200 proximity.',
  S2a: 'At least 20% initial advance, institutional-volume bullish fair-value gap, return to its 50% midpoint on quieter volume, and a bullish non-doji trigger. Excludes >50% weekly-low-to-peak advances and closes >25% below daily high.',
  S3a: 'Strict H2>H1 and L2>L1 pivots. P0-to-H1 rises at least 20% within five preceding sessions. Every bar from H1 to signal stays above a rising SMA50. Second-pullback ATR contracts. H1, L1, H2 and L2 each have an S1a bullish candle.',
  S4a: 'Breakouts with gaps in high-market-cap running stocks. Weekly pivot-5, price above 200 and 50 SMA, broad market indices above 20 EMA, 2%+ gap-up open, >=50% contraction pullback on volume dry-up, entry on swing-high break, stop 1% below daily lowest low.',
  S5a: 'Mark Minervini winning-stocks setup. Within 25% of 52-week high, >=100% above 52-week low, 200 DMA rising >=3 months, 50 DMA > 200 DMA, 52-week high recurrence every 4–6 months, 2–3 VCP contractions (3–5 candles), final 5 sessions supply dry-up <=0.85x, entry on previous swing-high break, 2x ATR(20) stop (max 10%).',
};

const overrides = {
  ath_min_discount_pct: 'Minimum discount from the highest adjusted close in available history.',
  sma_proximity_tolerance: 'Maximum percentage gap from the SMA benchmark.',
  l1_min_displacement_pct: 'Minimum rise from first-leg origin low to first-leg high.',
  l2_max_retrace_ratio: 'Largest permitted pullback as a share of the first rise.',
  l2_standard_max_retrace: 'Maximum standard-branch pullback share.',
  vol_thrust_min_mult: 'Minimum first-leg average volume relative to its volume average.',
  vol_pullback_max_ratio: 'Maximum average pullback volume relative to first-leg average volume.',
  inflow_vol_mult: 'Minimum displacement-bar volume relative to 20-day average.',
  fvg_min_size_pct: 'Minimum fair-value-gap size as a share of price.',
  ce_touch_tolerance: 'Maximum distance of trigger-bar low from the gap midpoint.',
  weekly_swing_max_advance_pct: 'Reject when the highest traded price since the completed-week swing low rises more than this share.',
  max_close_from_high_range_ratio: 'Reject when the signal close sits farther than this share below its daily high.',
  initial_move_min_pct: 'Minimum initial low-to-high advance before the FVG.',
  precedingMoveLookbackBars: 'Maximum trading sessions from P0 low to H1 high.',
  precedingMoveMinPct: 'Minimum P0-low to H1-high advance within that many sessions.',
  atrCompressionMaxRatio: 'Second-pullback average ATR must be below this multiple of first-pullback average ATR.',
  requireBullishPivotCandles: 'Require an S1a bullish, non-doji candle at H1, L1, H2 and L2.',
  smaRiseBars: 'SMA50 must rise compared with this many sessions earlier on every structure bar.',
  smaPeriod: 'Moving-average period for the rising price floor.',
  priceFloor: 'Minimum stock close price to eliminate penny stocks.',
  minMarketCapCr: 'Minimum company market capitalization in ₹ Crores (institutional liquidity floor).',
  weeklyPivotLookback: 'Lookback bars required on weekly chart to confirm weekly pivot-5.',
  gapUpMinPct: 'Minimum opening gap-up percentage relative to previous close.',
  pullbackMinPct: 'Minimum retracement percentage during contraction consolidation.',
  stopLossDiscountPct: 'Percentage buffer below the lowest daily swing low for placing stop loss.',
  broadMarketMaPeriod: 'Moving average period for benchmark indices (NIFTY 500, Midcap, Smallcap).',
  weeksInYear: 'Number of weekly bars used to determine 52-week high and low extremes.',
  near52WeekHighMaxDiscountPct: 'Maximum allowed discount from the 52-week high (within 25%).',
  above52WeekLowMinPct: 'Minimum percentage gain above the 52-week low (at least 100%).',
  dma200RisingBars: 'Minimum trading sessions over which the 200-day moving average must strictly rise (3 months / 65 bars).',
  highRecurrenceMinWeeks: 'Minimum elapsed weeks between successive 52-week high prints (4 months / 16 weeks).',
  highRecurrenceMaxWeeks: 'Maximum elapsed weeks between successive 52-week high prints (6 months / 26 weeks).',
  minVcpCandles: 'Minimum daily candles allowed per VCP contraction wave.',
  maxVcpCandles: 'Maximum daily candles allowed per VCP contraction wave.',
  minVcpCount: 'Minimum number of progressive VCP contractions required.',
  maxVcpCount: 'Maximum number of progressive VCP contractions evaluated.',
  secondVcpMinContractionPct: 'Minimum required contraction on the 2nd wave if only 2 VCP waves are present.',
  supplyDryUpMaxRatio: 'Maximum volume ratio of final 5 base days relative to 20-day volume moving average.',
  atrPeriod: 'Lookback period for Daily Average True Range (ATR).',
  atrMultiple: 'Multiplier of Daily ATR applied below entry to set protective stop.',
  maxStopLossPct: 'Hard ceiling on maximum allowable stop loss risk percentage (10%).',
};

const nice = k => k.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const explain = (k, v) => overrides[k] || (
  k.startsWith('allow_') ? `Whether ${nice(k.slice(6)).toLowerCase()} can confirm a bullish candle.` :
  k.startsWith('enforce_') ? `Whether the ${nice(k.slice(8)).toLowerCase()} filter is active.` :
  k.startsWith('exclude_') ? `Whether ${nice(k.slice(8)).toLowerCase()} is rejected.` :
  k.endsWith('_bars') || k.endsWith('Bars') ? `Number of trading candles used for ${nice(k).toLowerCase()}.` :
  k.endsWith('_period') || k.endsWith('Period') ? `Number of candles in the ${nice(k).toLowerCase()} calculation.` :
  `Implemented setting for ${nice(k).toLowerCase()}.`
);

const display = (k, v) => {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (typeof v === 'number' && (/Pct|pct|discount|retrace|penetration/.test(k) ||
      ['sma_proximity_tolerance', 'ce_touch_tolerance', 'max_close_from_high_range_ratio'].includes(k)))
    return Math.abs(v) <= 1 ? `${Number((v * 100).toFixed(2))}% (raw ${v})` : `${v}%`;
  return v;
};

const rows = [];
for (const id of strategyIds) {
  const report = reports[id];
  rows.push([id, 'Core rule', '—', core[id], 'Daily adjusted OHLCV']);
  for (const [key, value] of Object.entries(report.config || {})) {
    rows.push([id, nice(key), display(key, value), explain(key, value), 'Implemented scanner default']);
  }
  if (id === 'S1a') {
    for (const [key, value] of Object.entries(report.trade_plan_config || {})) {
      rows.push([id, nice(key), display(key, value), explain(key, value), 'Presentation-only trade plan']);
    }
  }
  rows.push([id, 'Coverage', `${report.symbols_covered}/${report.symbols_requested}`,
    'Symbols with an adjusted daily candle history by the cutoff. Some last candles are older than the cutoff.', 'Scan report']);
}

rows.push(['All', 'Source', 'Kite-adjusted Parquet', 'Local corporate-action-adjusted daily OHLCV, not a live Upstox quote.', 'Local market data']);
rows.push(['All', 'Signal window', `${periodStart} to ${cutoff}`, 'Last 90 distinct exchange trading sessions represented in the local adjusted store.', 'Local market data']);
rows.push(['All', 'Forward returns', '5, 10, 20 bars', 'Shown only when later candles exist by the cutoff; blank means not yet observable.', 'Post-signal evaluation']);
rows.push(['S1a', 'Implementation note', '90% Marubozu body + 1.0 ATR', 'Saved implementation is stricter than the original 80% body wording.', 'Code implementation']);
rows.push(['S1b', 'Implementation note', '1.25x trigger volume', 'Saved implementation is stricter than the original 1.0x trigger-volume wording.', 'Code implementation']);
rows.push(['S2a', 'Additional implementation gates', '20% initial move, 50% weekly cap, 25% close position', 'These were added after the original S2a prompt and are active in this scan.', 'Code implementation']);
rows.push(['S4a', 'Prerequisites & Rules', 'Weekly pivot-5, 20K Cr mcap, 2%+ gap', 'Evaluated against broad market (Nifty 500, Midcap, Smallcap > 20 EMA) and 50% volume pullback.', 'Code implementation']);
rows.push(['S5a', 'Prerequisites & Rules', 'Within 25% of 52W high, 100%+ above 52W low, rising 200 DMA, 2-3 VCPs', 'Strict Minervini criteria with supply dry-up <= 0.85 and 2x ATR stop (max 10%).', 'Code implementation']);

definitions.getRange('A5:E5').values = [['Strategy', 'Parameter / rule', 'Value used', 'Plain-English meaning', 'Basis']];
definitions.getRange('A5:E5').format = { fill: '#17365D', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' }, rowHeight: 31 };
definitions.getRangeByIndexes(5, 0, rows.length, 5).values = rows;
definitions.getRangeByIndexes(5, 0, rows.length, 5).format.font = { name: 'Arial', size: 10, color: '#24354B' };
definitions.getRangeByIndexes(5, 0, rows.length, 5).format.rowHeight = 29;
definitions.getRange(`D6:D${5 + rows.length}`).format.wrapText = true;
definitions.getRange('A:A').format.columnWidth = 13;
definitions.getRange('B:B').format.columnWidth = 35;
definitions.getRange('C:C').format.columnWidth = 27;
definitions.getRange('D:D').format.columnWidth = 90;
definitions.getRange('E:E').format.columnWidth = 30;
definitions.tables.add(`A5:E${5 + rows.length}`, true, 'StrategyParameters90');
definitions.freezePanes.freezeRows(5);

console.log('Inspecting sheets...');
for (const id of strategyIds) {
  const check = await wb.inspect({ kind: 'table', range: `${id}!A6:D9`, include: 'values,formulas', tableMaxRows: 4, tableMaxCols: 4, maxChars: 1800 });
  console.log(id, check.ndjson.slice(0, 500));
}
const ruleCheck = await wb.inspect({ kind: 'table', range: 'Rules and parameters!A5:E10', include: 'values,formulas', tableMaxRows: 6, tableMaxCols: 5, maxChars: 2600 });
console.log('Rules check:', ruleCheck.ndjson.slice(0, 500));

const errors = await wb.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 50 },
  summary: 'final formula error scan'
});
console.log('Formula error check:', errors.ndjson.slice(0, 500));

console.log('Rendering visual previews...');
for (const name of [...strategyIds, 'Rules and parameters']) {
  const preview = await wb.render({ sheetName: name, range: name === 'Rules and parameters' ? 'A1:E11' : 'A1:H10', scale: 1.3, format: 'png' });
  await fs.writeFile(path.join(outDir, `six-strategy-${name.replaceAll(' ', '-')}.png`), new Uint8Array(await preview.arrayBuffer()));
}

for (const id of strategyIds) {
  const chartCol = specs[id].fields.length + 2;
  const preview = await wb.render({ sheetName: id, range: `${col(chartCol)}4:${col(chartCol + 7)}18`, scale: 1.1, format: 'png' });
  await fs.writeFile(path.join(outDir, `six-strategy-${id}-chart.png`), new Uint8Array(await preview.arrayBuffer()));
}

console.log('Exporting XLSX workbook...');
const xlsx = await SpreadsheetFile.exportXlsx(wb);
const outputFileName = `Six_Strategies_90_Sessions_${cutoff}.xlsx`;
const outputPath = path.join(outDir, outputFileName);
await xlsx.save(outputPath);

// Also copy to root outputs directory
const rootOutputPath = path.resolve(repoRoot, 'outputs', outputFileName);
if (rootOutputPath !== outputPath) {
  await fs.copyFile(outputPath, rootOutputPath);
}

const summaryCounts = Object.fromEntries(strategyIds.map(id => [id, reports[id]?.matches?.length || 0]));
console.log(JSON.stringify({
  output: outputPath,
  rootOutput: rootOutputPath,
  counts: summaryCounts,
  parameterRows: rows.length
}, null, 2));
