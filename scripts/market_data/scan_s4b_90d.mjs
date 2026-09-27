/** S4B: S4A variant without broad-market or pullback/volume gates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const args = process.argv.slice(2);
const arg = (key, fallback) => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : fallback; };
const asOfDate = arg('--as-of-date', '2026-09-25');
const signalStartDate = arg('--signal-start-date', '2026-05-19');
const python = arg('--python', 'python');
const reportDir = path.resolve(arg('--report-root', 'reports/readiness/vpa_three_leg'));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sma = (c, n) => c.length < n ? null : mean(c.slice(-n).map(x => x.close));
const rsi14 = c => {
  if (c.length < 15) return null;
  const d = c.slice(-15).slice(1).map((x, i) => x.close - c.slice(-15)[i].close);
  const gain = mean(d.map(x => Math.max(0, x))), loss = mean(d.map(x => Math.max(0, -x)));
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
};
const atr14 = c => c.length < 15 ? null : mean(c.slice(-14).map((x, i) => { const p = c[c.length - 15 + i].close; return Math.max(x.high-x.low, Math.abs(x.high-p), Math.abs(x.low-p)); }));
const pattern = (c, atr) => {
  const p = c.at(-2), x = c.at(-1), range = x.high - x.low, body = Math.abs(x.close-x.open);
  if (!p || range <= 0 || body / range <= .10 || x.close <= x.open) return null;
  const lower = Math.min(x.open,x.close)-x.low, upper=x.high-Math.max(x.open,x.close);
  if (body/range >= .9 && atr && body >= atr) return 'MARUBOZU';
  if (lower >= 2*body && upper <= .15*range) return 'HAMMER';
  if (p.close < p.open && x.open <= p.close && x.close >= p.open) return 'ENGULFING';
  if (p.close < p.open && x.open <= p.low && x.close >= p.close + .5*(p.open-p.close)) return 'PIERCING';
  if (p.close < p.open && x.open > p.close && x.close < p.open) return 'HARAMI';
  return null;
};
const child = spawn(python, ['scripts/market_data/stream_adjusted_for_s3a.py','--as-of-date',asOfDate,'--first-history-date','2024-01-01'], { cwd: process.cwd(), stdio:['ignore','pipe','pipe'] });
const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
const matches=[], gaps=[]; let requested=0, covered=0, withPeriod=0;
for await (const line of lines) {
  const {symbol,candles}=JSON.parse(line); requested++; if (!candles.length) { gaps.push(symbol); continue; } covered++;
  let inPeriod=false;
  for (let i=200;i<candles.length;i++) {
    const date=candles[i].date.slice(0,10); if(date<signalStartDate||date>asOfDate) continue; inPeriod=true;
    const d=candles.slice(0,i+1), x=d.at(-1), s50=sma(d,50),s200=sma(d,200),rsi=rsi14(d),atr=atr14(d),gap=((x.open/d.at(-2).close)-1)*100, candle=pattern(d,atr);
    const support=rsi!==null && [30,40,50].some(level=>Math.abs(rsi-level)<=3.5);
    if (!(x.close>=50 && x.close>s50 && x.close>s200 && gap>=2 && support && candle)) continue;
    matches.push({Signal_Date:date,Symbol:symbol,Signal_Price:x.close,Gap_Up_Pct:gap,RSI14:rsi,RSI_Support_Level:[30,40,50].find(level=>Math.abs(rsi-level)<=3.5),Candle_Pattern:candle,Stop_Loss:Math.min(...d.map(c=>c.low))*.99,Rule_Checks:[{id:'S4B_NO_DOJI_BULLISH_RSI',name:'Bullish non-doji candle at RSI support',passed:true,actualValue:`${candle}; RSI ${rsi.toFixed(2)}`,benchmarkRule:'RSI(14) within ±3.5 of 30, 40, or 50; permitted bullish pattern',explanation:'S4B removes S4A broad-market and pullback/volume gates.'}],Data_Last_Date:candles.at(-1).date.slice(0,10)});
  }
  if(inPeriod)withPeriod++;
}
await new Promise((resolve,reject)=>child.on('close',code=>code===0?resolve():reject(new Error(`Candle stream failed (${code})`))));
matches.sort((a,b)=>b.Signal_Date.localeCompare(a.Signal_Date)||a.Symbol.localeCompare(b.Symbol)); await fs.mkdir(reportDir,{recursive:true});
const output=path.join(reportDir,`s4b_full_universe_90_${asOfDate.replaceAll('-','')}_${new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'Z')}.json`);
await fs.writeFile(output,JSON.stringify({strategy:'S4B',generated_at_utc:new Date().toISOString(),source:'KITE_ADJUSTED_PARQUET',timeframe:'1D',scan_mode:'ROLLING_WALK_FORWARD',signal_start_date:signalStartDate,as_of_date_requested:asOfDate,config:{priceFloor:50,gapUpMinPct:2,rsiPeriod:14,rsiSupportLevels:[30,40,50],rsiTolerance:3.5,marubozuMinBodyRatio:.9,marubozuMinBodyAtrMultiple:1,excludeDoji:true},symbols_requested:requested,symbols_covered:covered,symbols_with_period_candles:withPeriod,coverage_gaps:gaps,matches,limitations:['S4B intentionally excludes S4A broad-market and pullback/volume gates.']},null,2));
console.log(JSON.stringify({output,requested,covered,withPeriod,matches:matches.length}));
