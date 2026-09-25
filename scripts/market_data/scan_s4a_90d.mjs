/** Historical S4a scan using the canonical implementation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import Database from 'better-sqlite3';
import { evaluateS4a, S4A_DEFAULTS } from '../../src/server/services/S4aGapRunningStrategy.ts';

const args = process.argv.slice(2);
const arg = (key, fallback) => {
  const at = args.indexOf(key);
  return at >= 0 ? args[at + 1] : fallback;
};
const asOfDate = arg('--as-of-date', '2026-09-24');
const signalStartDate = arg('--signal-start-date', '2026-05-18');
const python = arg('--python', 'python');
const reportDir = path.resolve(arg('--report-root', 'reports/readiness/vpa_three_leg'));

// 1. Load market caps from portfolio.db
const db = new Database('portfolio.db', { readonly: true });
const capRows = db.prepare('SELECT UPPER(symbol) as symbol, market_cap_cr FROM SecurityDossierSnapshots WHERE market_cap_cr IS NOT NULL').all();
const marketCaps = Object.fromEntries(capRows.map(r => [r.symbol, r.market_cap_cr]));

// 2. Load broad market benchmark candles
const benchmarksFile = path.resolve('scratch/benchmarks.json');
let broadMarketCandles = {};
try {
  broadMarketCandles = JSON.parse(await fs.readFile(benchmarksFile, 'utf8'));
} catch (e) {
  console.warn('Benchmarks file not found, running export_benchmarks.py...');
}

function aggregateWeekly(daily) {
  const weeks = {};
  for (const c of daily) {
    const d = new Date(c.date);
    const day = d.getDay();
    const diff = 5 - day;
    const fri = new Date(d);
    fri.setDate(d.getDate() + diff);
    const wKey = fri.toISOString().slice(0, 10);
    if (!weeks[wKey]) weeks[wKey] = [];
    weeks[wKey].push(c);
  }
  const weekly = [];
  for (const [wKey, list] of Object.entries(weeks).sort()) {
    weekly.push({
      date: list[list.length - 1].date,
      open: list[0].open,
      high: Math.max(...list.map(x => x.high)),
      low: Math.min(...list.map(x => x.low)),
      close: list[list.length - 1].close,
      volume: list.reduce((sum, x) => sum + x.volume, 0)
    });
  }
  return weekly;
}

const child = spawn(python, ['scripts/market_data/stream_adjusted_for_s3a.py',
  '--as-of-date', asOfDate, '--first-history-date', '2024-01-01'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });

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

  const mcap = marketCaps[symbol.toUpperCase()];
  const weekly = aggregateWeekly(candles);

  for (let i = 200; i < candles.length; i++) {
    const date = candles[i].date.slice(0, 10);
    if (date < signalStartDate || date > asOfDate) continue;
    inPeriod = true;

    const subDaily = candles.slice(0, i + 1);
    const subWeekly = weekly.filter(w => w.date <= date);

    // Filter broad market candles to <= date
    const subBroadMarket = {
      NIFTY_500: (broadMarketCandles.NIFTY_500 || []).filter(c => c.date <= date),
      NIFTY_MIDCAP: (broadMarketCandles.NIFTY_MIDCAP || []).filter(c => c.date <= date),
      NIFTY_SMALLCAP: (broadMarketCandles.NIFTY_SMALLCAP || []).filter(c => c.date <= date),
    };

    const result = evaluateS4a(subDaily, symbol, symbol, {
      marketCapCr: mcap,
      weeklyCandles: subWeekly,
      broadMarketCandles: subBroadMarket
    });

    if (!result.qualified) continue;
    const setupKey = `${symbol}|${date}`;
    if (recordedSetups.has(setupKey)) continue;
    recordedSetups.add(setupKey);

    matches.push({
      Signal_Date: date,
      Symbol: symbol,
      Signal_Price: result.cmp,
      Weekly_Pivot_Date: result.weeklyPivotDate,
      Gap_Up_Pct: result.gapUpPct,
      Pullback_ATR_Ratio: result.pullbackAtrRatio,
      Supply_Dry_Up_Ratio: result.supplyDryUpRatio,
      Previous_Swing_High: result.previousSwingHigh,
      Entry_Trigger: result.entryTrigger,
      Recommended_Entry_Price: result.recommendedEntryPrice,
      Stop_Loss: result.stopLoss,
      Rule_Checks: result.ruleChecks,
      Market_Cap_Cr: mcap,
      Data_Last_Date: candles.at(-1).date.slice(0, 10)
    });
  }

  if (inPeriod) withPeriod++;
  if (requested % 250 === 0) process.stderr.write(`S4a ${requested} symbols, ${matches.length} signals\n`);
}

const code = await new Promise(resolve => child.on('close', resolve));
if (code !== 0) throw new Error(`Candle stream failed (${code}): ${stderr.slice(-1200)}`);

matches.sort((a, b) => b.Signal_Date.localeCompare(a.Signal_Date) || a.Symbol.localeCompare(b.Symbol));
await fs.mkdir(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
const output = path.join(reportDir, `s4a_full_universe_90_${asOfDate.replaceAll('-', '')}_${stamp}.json`);

const report = {
  strategy: 'S4A',
  generated_at_utc: new Date().toISOString(),
  source: 'KITE_ADJUSTED_PARQUET',
  timeframe: '1D',
  scan_mode: 'ROLLING_WALK_FORWARD',
  signal_start_date: signalStartDate,
  as_of_date_requested: asOfDate,
  config: S4A_DEFAULTS,
  symbols_requested: requested,
  symbols_covered: covered,
  symbols_with_period_candles: withPeriod,
  coverage_gaps: gaps,
  matches,
  limitations: [
    'Evaluated using local adjusted Parquet store and benchmark index data.',
    'Market cap is sourced from local SecurityDossierSnapshots in portfolio.db.',
    'Weekly pivot-5 is confirmed with strict 2-week lead and 2-week follow bars.'
  ]
};

await fs.writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, requested, covered, withPeriod, matches: matches.length }));
