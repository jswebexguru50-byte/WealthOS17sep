import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const db = new Database('portfolio.db', { readonly: true });

// 1. Seven-alphanumeric strategy candidates
const reportDir = path.resolve('reports/readiness/vpa_three_leg');
const specs = [
  ['S1a', 'vpa_three_leg_full_universe_90_'],
  ['S1b', 's1b_full_universe_90_'],
  ['S2a', 's2a_full_universe_90_'],
  ['S3a', 's3a_full_universe_90_'],
  ['S4a', 's4a_full_universe_90_'],
  ['S4b', 's4b_full_universe_90_'],
  ['S5a', 's5a_full_universe_90_'],
];

function sanitizeJson(raw: string) {
  return raw
    .replace(/(^|[^A-Za-z0-9_])(-?Infinity|NaN)(?=\s*[,}\]])/g, '$1null')
    .replace(/:\s*,/g, ': null,')
    .replace(/:\s*}/g, ': null}');
}

const sevenStrategySyms = new Set<string>();
for (const [strat, prefix] of specs) {
  const files = fs.readdirSync(reportDir).filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort();
  const file = files.at(-1);
  if (file) {
    const raw = fs.readFileSync(path.join(reportDir, file), 'utf8');
    const matches = JSON.parse(sanitizeJson(raw)).matches || [];
    for (const m of matches) {
      const sym = String(m?.symbol ?? m?.Symbol ?? '').trim().toUpperCase();
      if (/^[A-Z0-9&.-]+$/.test(sym)) sevenStrategySyms.add(sym);
    }
  }
}
console.log(`Seven-strategy candidates found: ${sevenStrategySyms.size}`);

// 2. Invested / held companies
const holdings = db.prepare('SELECT DISTINCT symbol FROM Holdings').all().map((r: any) => r.symbol.toUpperCase());
console.log(`Holdings count: ${holdings.length}`);

// 3. Corporate actions / deals
const corpActionSyms = new Set(db.prepare('SELECT DISTINCT symbol FROM CorporateActions').all().map((r: any) => r.symbol.toUpperCase()));
const dealSyms = new Set(db.prepare('SELECT DISTINCT symbol FROM InstitutionalDeals').all().map((r: any) => r.symbol.toUpperCase()));
console.log(`Corp actions symbols: ${corpActionSyms.size}, Institutional deals symbols: ${dealSyms.size}`);

// 4. Recently listed (listing_date >= 2022 or 2023)
const recentListed = db.prepare("SELECT symbol, listing_date FROM MasterTickers WHERE listing_date >= '2022-01-01' ORDER BY listing_date DESC").all();
console.log(`Recently listed symbols (>= 2022): ${recentListed.length}`);

// 5. Thinly traded / low liquidity (low volume from MarketSnapshots or HistoricalPrices)
const lowVol = db.prepare(`
  SELECT symbol, AVG(volume) as avg_vol 
  FROM MarketSnapshots 
  GROUP BY symbol 
  HAVING avg_vol < 10000 AND avg_vol > 0 
  LIMIT 50
`).all();
console.log(`Low volume symbols (<10k avg vol): ${lowVol.length}`);

// 6. Pledged vs unpledged
const pledged = db.prepare('SELECT symbol, pledged_pct FROM FundamentalSnapshots WHERE pledged_pct > 0').all();
const unpledged = db.prepare('SELECT symbol, pledged_pct FROM FundamentalSnapshots WHERE pledged_pct = 0').all();
console.log(`Pledged symbols: ${pledged.length}, Unpledged: ${unpledged.length}`);

// 7. High vs low institutional ownership
const highInst = db.prepare('SELECT symbol, (fii_holding_pct + dii_holding_pct) as inst FROM FundamentalSnapshots WHERE inst > 30').all();
const lowInst = db.prepare('SELECT symbol, (fii_holding_pct + dii_holding_pct) as inst FROM FundamentalSnapshots WHERE inst < 5').all();
console.log(`High institutional (>30%): ${highInst.length}, Low institutional (<5%): ${lowInst.length}`);

// 8. High-debt vs net-cash
const highDebt = db.prepare('SELECT symbol, debt_to_equity FROM FundamentalSnapshots WHERE debt_to_equity > 1.5').all();
const lowDebt = db.prepare('SELECT symbol, debt_to_equity FROM FundamentalSnapshots WHERE debt_to_equity = 0').all();
console.log(`High debt (>1.5 D/E): ${highDebt.length}, Zero debt: ${lowDebt.length}`);
