/** Historical S3a scan using the same evaluator as the application. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { evaluateS3a, S3A_DEFAULTS } from '../../src/server/services/S3aStrategy.ts';

const args = process.argv.slice(2);
const arg = (key, fallback) => {
  const at = args.indexOf(key);
  return at >= 0 ? args[at + 1] : fallback;
};
const asOfDate = arg('--as-of-date', '2026-09-23');
const signalStartDate = arg('--signal-start-date', '2026-05-18');
const python = arg('--python', 'python');
const reportDir = path.resolve(arg('--report-root', 'reports/readiness/vpa_three_leg'));
const child = spawn(python, ['scripts/market_data/stream_adjusted_for_s3a.py',
  '--as-of-date', asOfDate, '--first-history-date', '2025-01-01'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', chunk => { stderr += chunk; });
const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
const matches = [];
const recordedSetups = new Set();
let requested = 0, covered = 0, withPeriod = 0;
const gaps = [];
for await (const line of lines) {
  const { symbol, candles } = JSON.parse(line);
  requested++;
  if (!candles.length) { gaps.push(symbol); continue; }
  covered++;
  let inPeriod = false;
  for (let i = 0; i < candles.length; i++) {
    const date = candles[i].date.slice(0, 10);
    if (date < signalStartDate || date > asOfDate) continue;
    inPeriod = true;
    const result = evaluateS3a(candles.slice(0, i + 1), symbol);
    if (!result.qualified) continue;
    const setupKey = [symbol, result.h1Date, result.l1Date, result.h2Date, result.l2Date].join('|');
    if (recordedSetups.has(setupKey)) continue;
    recordedSetups.add(setupKey);
    matches.push({ Signal_Date: date, Symbol: symbol, Signal_Price: result.cmp,
      Date_P0: result.p0Date, Date_H1: result.h1Date, Date_L1: result.l1Date,
      Date_H2: result.h2Date, Date_L2: result.l2Date,
      P0: result.p0, H1: result.h1, L1: result.l1, H2: result.h2, L2: result.l2,
      Preceding_Move_Pct: result.precedingMovePct, ATR_Compression_Ratio: result.atrCompressionRatio,
      SMA50_At_Signal: result.sma50AtSignal, Pivot_Patterns: result.pivotPatterns,
      Entry: result.recommendedEntryPrice, Stop: result.stopLoss,
      Target_1: result.target1, Target_2: result.target2,
      RR_Target_1: result.riskRewardRatio, Rule_Checks: result.ruleChecks,
      Data_Last_Date: candles.at(-1).date.slice(0, 10) });
  }
  if (inPeriod) withPeriod++;
  if (requested % 250 === 0) process.stderr.write(`S3a ${requested} symbols, ${matches.length} signals\n`);
}
const code = await new Promise(resolve => child.on('close', resolve));
if (code !== 0) throw new Error(`Candle stream failed (${code}): ${stderr.slice(-1200)}`);
matches.sort((a, b) => b.Signal_Date.localeCompare(a.Signal_Date) || a.Symbol.localeCompare(b.Symbol));
await fs.mkdir(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
const output = path.join(reportDir, `s3a_full_universe_90_${asOfDate.replaceAll('-', '')}_${stamp}.json`);
const report = { strategy: 'S3A', generated_at_utc: new Date().toISOString(),
  source: 'KITE_ADJUSTED_PARQUET', timeframe: '1D', scan_mode: 'ROLLING_WALK_FORWARD',
  signal_start_date: signalStartDate, as_of_date_requested: asOfDate, config: S3A_DEFAULTS,
  symbols_requested: requested, symbols_covered: covered, symbols_with_period_candles: withPeriod,
  coverage_gaps: gaps, matches,
  limitations: ['The same local adjusted Parquet store used by S1a/S1b/S2a is scanned.',
    'S3a requires S1a bullish candles at all four pivots; this is a strict interpretation.',
    'Pivot confirmation uses only candles available by each signal date.',
    'A repeated daily match with identical H1/L1/H2/L2 pivots is counted once, on its first eligible date.'] };
await fs.writeFile(output, JSON.stringify(report));
console.log(JSON.stringify({ output, requested, covered, withPeriod, matches: matches.length }));
