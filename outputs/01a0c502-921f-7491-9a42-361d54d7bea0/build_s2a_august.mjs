import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const reportDir = path.resolve('reports/readiness/vpa_three_leg');
const revised = (await fs.readdir(reportDir)).filter(name => /^s2a_s2a_august_2026_peak50_pinbar25_.*\.json$/.test(name)).sort().at(-1);
if (!revised) throw new Error('Revised August S2A scan report is not available yet.');
const input = path.join(reportDir,revised);
const outputDir = path.resolve('outputs/01a0c502-921f-7491-9a42-361d54d7bea0');
// The scanner's Python JSON may contain NaN for unavailable forward returns.
const sourceText = await fs.readFile(input, 'utf8');
const report = JSON.parse(sourceText.replace(/:\s*NaN(?=\s*[,}])/g, ': null'));
const wb = Workbook.create();
const signals = wb.worksheets.add('August signals');
const method = wb.worksheets.add('Method and coverage');
for (const sheet of [signals, method]) sheet.showGridLines = false;

signals.getRange('A1').values = [['S2A signals — August 2026']];
signals.getRange('A2').values = [[`${report.matches.length} historical signals · Kite-adjusted daily OHLCV · evaluation through 31 August 2026`]];
signals.getRange('A1').format.font = { name: 'Arial', size: 16, bold: true, color: '#13223B' };
signals.getRange('A2').format.font = { name: 'Arial', size: 10, color: '#59677C' };

const fields = [
  ['Signal Date','Signal_Date'],['Symbol','Symbol'],['Pattern','Candle_Pattern'],
  ['Close ₹','Signal_Price'],['CE ₹','CE_Level'],['Weekly Low ₹','Weekly_Swing_Low'],
  ['Peak Since Low ₹','Weekly_Peak_Since_Swing_Low'],
  ['Peak Above Weekly Low %','Weekly_Advance_From_Swing_Low_Pct'],
  ['Close Below Daily High %','Close_From_Daily_High_Range_Pct'],
  ['FVG Floor ₹','FVG_Low_Bound'],['FVG Ceiling ₹','FVG_High_Bound'],
  ['FVG Size %','FVG_Size_Pct'],['Pullback Bars','Pullback_Duration_Bars'],
  ['Trigger Vol / SMA','Trigger_Vol_Ratio'],['Displacement Vol / SMA','Displacement_Vol_Ratio'],
  ['Pullback / Displacement Vol','Pullback_Vol_Ratio'],
  ['Initial Move %','Initial_Move_Pct'],['FVG Displacement Date','FVG_Displacement_Date'],
  ['Forward 5B %','Fwd_Return_5B (%)'],['Forward 10B %','Fwd_Return_10B (%)'],
  ['Forward 20B %','Fwd_Return_20B (%)']
];
const dateKeys = new Set(['Signal_Date','FVG_Displacement_Date']);
const rows = report.matches.slice().sort((a,b) => a.Signal_Date.localeCompare(b.Signal_Date) || a.Symbol.localeCompare(b.Symbol));
const data = [fields.map(([label]) => label), ...rows.map(record => fields.map(([, key]) => {
  const value = record[key];
  if (dateKeys.has(key)) return value ? new Date(`${value}T00:00:00Z`) : null;
  return typeof value === 'number' && Number.isFinite(value) ? value : (value ?? null);
}))];
signals.getRangeByIndexes(3,0,data.length,fields.length).values = data;
const header = signals.getRangeByIndexes(3,0,1,fields.length);
header.format = { fill:'#17365D', font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'}, rowHeight:32, wrapText:true };
const body = signals.getRangeByIndexes(4,0,rows.length,fields.length);
body.format.font = { name:'Arial', size:10, color:'#1D2A3A' };
body.format.rowHeight = 22;
const lastRow = 4 + rows.length;
signals.getRange(`A5:A${lastRow}`).setNumberFormat('yyyy-mm-dd');
signals.getRange(`R5:R${lastRow}`).setNumberFormat('yyyy-mm-dd');
for (const col of ['D','E','F','G','J','K']) signals.getRange(`${col}5:${col}${lastRow}`).setNumberFormat('#,##0.00');
for (const col of ['H','I','L','Q','S','T','U']) signals.getRange(`${col}5:${col}${lastRow}`).setNumberFormat('0.00"%"');
for (const col of ['N','O','P']) signals.getRange(`${col}5:${col}${lastRow}`).setNumberFormat('0.00"x"');
signals.getRange(`M5:M${lastRow}`).setNumberFormat('0');
signals.getRange('A:A').format.columnWidth = 15;
signals.getRange('B:B').format.columnWidth = 19;
signals.getRange('C:C').format.columnWidth = 17;
signals.getRange('D:G').format.columnWidth = 14;
signals.getRange('H:I').format.columnWidth = 24;
signals.getRange('J:L').format.columnWidth = 17;
signals.getRange('M:M').format.columnWidth = 14;
signals.getRange('N:P').format.columnWidth = 22;
signals.getRange('Q:Q').format.columnWidth = 18;
signals.getRange('R:R').format.columnWidth = 21;
signals.getRange('S:U').format.columnWidth = 17;
signals.freezePanes.freezeRows(4);
signals.tables.add(`A4:U${lastRow}`, true, 'S2AAugustSignals');

method.getRange('A1').values = [['Method and coverage']];
method.getRange('A1').format.font = { name:'Arial', size:16, bold:true, color:'#13223B' };
const notes = [
  ['Requested period','2026-08-01 to 2026-08-31'],
  ['Evaluation cutoff',report.as_of_date_requested],
  ['Requested local symbols',report.symbols_requested],
  ['Symbols with August candles',report.symbols_with_period_candles],
  ['Symbols with any history by cutoff',report.symbols_covered],
  ['Historical matches',rows.length],
  ['Source','Kite-adjusted daily OHLCV stored locally as Parquet'],
  ['Weekly exclusion','Highest daily high from the weekly low through the signal must be no more than 50% above that low.'],
  ['Weekly lookback','52 completed weeks; at least 8 required. Current week excluded.'],
  ['Pin-bar exclusion','Signal close must be within the top 25% of its daily high-low range.'],
  ['Other implementation rule','A 20% initial move is required by this implementation; it is not in the original S2A prompt.'],
  ['Excluded source gap',report.coverage_gaps.join(', ') || 'None'],
  ['Interpretation','Historical setup matches, not current recommendations. Forward returns use later bars only for evaluation.'],
  ['Strategy specification','docs/strategies/S2A/S2A.original.txt'],
];
method.getRangeByIndexes(3,0,notes.length,2).values = notes;
method.getRange('A4:A17').format.font = { name:'Arial',size:10,bold:true,color:'#17365D' };
method.getRange('B4:B17').format.font = { name:'Arial',size:10,color:'#1D2A3A' };
method.getRange('A:A').format.columnWidth = 30;
method.getRange('B:B').format.columnWidth = 95;
method.getRange('B4:B17').format.wrapText = true;
method.getRange('A4:B17').format.rowHeight = 28;

const check = await wb.inspect({kind:'table',range:'August signals!A4:G8',include:'values,formulas',tableMaxRows:5,tableMaxCols:7});
console.log(check.ndjson);
const errors = await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30},summary:'final formula error scan'});
console.log(errors.ndjson);
for (const [sheetName,range,name] of [['August signals','A1:K10','signals-preview-revised.png'],['Method and coverage','A1:B17','method-preview-revised.png']]) {
  const preview = await wb.render({sheetName,range,scale:1.5,format:'png'});
  await fs.writeFile(path.join(outputDir,name),new Uint8Array(await preview.arrayBuffer()));
}
const xlsx = await SpreadsheetFile.exportXlsx(wb);
const output = path.join(outputDir,'S2A_August_2026_peak50_pinbar25.xlsx');
await xlsx.save(output);
console.log(JSON.stringify({output,rows:rows.length,symbolsWithPeriodCandles:report.symbols_with_period_candles}));
