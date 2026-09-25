/** Historical S5a scan using the canonical implementation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { evaluateS5a, S5A_DEFAULTS } from '../../src/server/services/S5aMinerviniStrategy.ts';

const args = process.argv.slice(2);
const arg = (key, fallback) => {
  const at = args.indexOf(key);
  return at >= 0 ? args[at + 1] : fallback;
};
const asOfDate = arg('--as-of-date', '2026-09-24');
const signalStartDate = arg('--signal-start-date', '2026-05-18');
const python = arg('--python', 'python');
const reportDir = path.resolve(arg('--report-root', 'reports/readiness/vpa_three_leg'));

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

function findVcpStructures(candles) {
  // Look back over the last 30 bars for 2-3 contractions
  if (candles.length < 25) return { vcps: [], previousSwingHigh: null };
  const n = candles.length;
  const radius = 1;
  const peaks = [], troughs = [];

  for (let i = Math.max(radius, n - 35); i < n - 1; i++) {
    const c = candles[i];
    if (c.high >= candles[i - 1].high && c.high >= candles[i + 1].high) peaks.push(i);
    if (c.low <= candles[i - 1].low && c.low <= candles[i + 1].low) troughs.push(i);
  }

  // Build candidate contraction waves
  const waveList = [];
  for (const p of peaks) {
    const matchingTroughs = troughs.filter(t => t > p && (t - p + 1) >= 3 && (t - p + 1) <= 6);
    if (matchingTroughs.length) {
      const t = matchingTroughs[0];
      const sH = candles[p].high, sL = candles[t].low;
      if (sH > sL && sH > 0) {
        waveList.push({
          peakIdx: p,
          troughIdx: t,
          endDate: candles[t].date,
          candleCount: t - p + 1,
          swingHigh: sH,
          swingLow: sL,
          contractionPct: (1 - sL / sH) * 100
        });
      }
    }
  }

  // Find 2 or 3 non-overlapping, chronologically ordered waves with decreasing contraction
  let bestVcps = [];
  for (let i = 0; i < waveList.length; i++) {
    for (let j = i + 1; j < waveList.length; j++) {
      if (waveList[j].peakIdx > waveList[i].troughIdx && waveList[j].contractionPct < waveList[i].contractionPct) {
        // Check for 3rd wave
        let found3 = false;
        for (let k = j + 1; k < waveList.length; k++) {
          if (waveList[k].peakIdx > waveList[j].troughIdx && waveList[k].contractionPct < waveList[j].contractionPct) {
            bestVcps = [waveList[i], waveList[j], waveList[k]];
            found3 = true;
            break;
          }
        }
        if (!found3 && waveList[j].contractionPct >= 70) {
          bestVcps = [waveList[i], waveList[j]];
        }
      }
    }
  }

  const previousSwingHigh = peaks.length ? Math.max(...peaks.slice(-3).map(idx => candles[idx].high)) : null;
  return {
    vcps: bestVcps.map(v => ({
      endDate: v.endDate,
      candleCount: Math.min(5, Math.max(3, v.candleCount)),
      swingHigh: v.swingHigh,
      swingLow: v.swingLow
    })),
    previousSwingHigh
  };
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

  const weekly = aggregateWeekly(candles);

  for (let i = 250; i < candles.length; i++) {
    const date = candles[i].date.slice(0, 10);
    if (date < signalStartDate || date > asOfDate) continue;
    inPeriod = true;

    const subDaily = candles.slice(0, i + 1);
    const subWeekly = weekly.filter(w => w.date <= date);

    const { vcps, previousSwingHigh } = findVcpStructures(subDaily);

    const result = evaluateS5a(subDaily, symbol, symbol, {
      weeklyCandles: subWeekly,
      previousDailySwingHigh: previousSwingHigh,
      vcpContractions: vcps
    });

    if (!result.qualified) continue;
    const setupKey = `${symbol}|${date}`;
    if (recordedSetups.has(setupKey)) continue;
    recordedSetups.add(setupKey);

    matches.push({
      Signal_Date: date,
      Symbol: symbol,
      Signal_Price: result.cmp,
      Weekly_52W_High: result.weekly52High,
      Weekly_52W_Low: result.weekly52Low,
      Discount_From_52W_High_Pct: result.discountFrom52HighPct,
      Gain_From_52W_Low_Pct: result.gainFrom52LowPct,
      SMA50: result.sma50,
      SMA200: result.sma200,
      High_Recurrence_Weeks: result.highRecurrenceWeeks,
      VCP_Count: result.vcpCount,
      Previous_Swing_High: result.previousSwingHigh,
      Supply_Dry_Up_Ratio: result.supplyDryUpRatio,
      Entry_Price: result.entryPrice,
      ATR20: result.atr20,
      Stop_Loss: result.stopLoss,
      Stop_Loss_Pct: result.stopLossPct,
      Rule_Checks: result.ruleChecks,
      Data_Last_Date: candles.at(-1).date.slice(0, 10)
    });
  }

  if (inPeriod) withPeriod++;
  if (requested % 250 === 0) process.stderr.write(`S5a ${requested} symbols, ${matches.length} signals\n`);
}

const code = await new Promise(resolve => child.on('close', resolve));
if (code !== 0) throw new Error(`Candle stream failed (${code}): ${stderr.slice(-1200)}`);

matches.sort((a, b) => b.Signal_Date.localeCompare(a.Signal_Date) || a.Symbol.localeCompare(b.Symbol));
await fs.mkdir(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
const output = path.join(reportDir, `s5a_full_universe_90_${asOfDate.replaceAll('-', '')}_${stamp}.json`);

const report = {
  strategy: 'S5A',
  generated_at_utc: new Date().toISOString(),
  source: 'KITE_ADJUSTED_PARQUET',
  timeframe: '1D',
  scan_mode: 'ROLLING_WALK_FORWARD',
  signal_start_date: signalStartDate,
  as_of_date_requested: asOfDate,
  config: S5A_DEFAULTS,
  symbols_requested: requested,
  symbols_covered: covered,
  symbols_with_period_candles: withPeriod,
  coverage_gaps: gaps,
  matches,
  limitations: [
    'Evaluated using local adjusted Parquet store and weekly resampled candles.',
    '52-week high/low requires 52 completed weekly candles.',
    'VCP contractions and previous swing high are extracted algorithmically from daily swing pivots.'
  ]
};

await fs.writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, requested, covered, withPeriod, matches: matches.length }));
