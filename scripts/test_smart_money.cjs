const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

const sectorMapping = {
  'Banking & Financials': ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'BAJFINANCE', 'BAJAJFINSV'],
  'Information Technology': ['TCS', 'INFY', 'HCLTECH', 'WIPRO', 'TECHM', 'LTIM', 'PERSISTENT', 'COFORGE'],
  'Automobiles & Auto Ancillaries': ['TATAMOTORS', 'M&M', 'MARUTI', 'BAJAJ-AUTO', 'HEROMOTOCO', 'EICHERMOT', 'SONACOMS'],
  'Pharmaceuticals & Healthcare': ['SUNPHARMA', 'CIPLA', 'DRREDDY', 'DIVISLAB', 'APOLLOHOSP', 'MANKIND', 'ZYDUSLIFE'],
  'Energy / Oil & Gas': ['RELIANCE', 'ONGC', 'NTPC', 'POWERGRID', 'COALINDIA', 'BPCL', 'IOC'],
  'Metals & Mining': ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL', 'JINDALSTEL', 'NATIONALUM'],
  'Fast Moving Consumer Goods': ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'TATACONSUM', 'DABUR', 'MARICO'],
  'Capital Goods & Infrastructure': ['LT', 'SIEMENS', 'ABB', 'HAL', 'BEL', 'HAVELLS', 'CUMMINSIND'],
  'Defense & Aerospace': ['HAL', 'BEL', 'BDL', 'MAZDOCK', 'COCHINSHIP', 'DATAPATTNS'],
  'Realty & Real Estate': ['DLF', 'GODREJPROP', 'MACROTECH', 'OBERREALTY', 'PRESTIGE'],
  'Telecom & Digital': ['BHARTIARTL', 'TATACOMM', 'INDUSTOWER', 'IDEA'],
  'Chemicals & Specialty': ['PIIND', 'SRF', 'DEEPAKNTR', 'NAVINFLUOR', 'TATACHEM']
};

const allSymbols = new Set();
for (const list of Object.values(sectorMapping)) {
  for (const s of list) {
    allSymbols.add(s);
    allSymbols.add(s + '.NS');
  }
}

const symList = Array.from(allSymbols);
const placeholders = symList.map(() => '?').join(',');

const t0 = Date.now();
db.all(`SELECT symbol, date, close_price as close FROM HistoricalPrices WHERE symbol IN (${placeholders}) AND date >= date('now', '-365 days') ORDER BY date ASC`, symList, (err, rows) => {
  console.log(`Query took ${Date.now() - t0}ms, returned ${rows ? rows.length : 0} rows`);
  const grouped = {};
  for (const r of rows) {
    const clean = r.symbol.replace(/\.NS$/, '');
    if (!grouped[clean]) grouped[clean] = [];
    grouped[clean].push(r);
  }

  const sectors = [];
  for (const [sector, tickers] of Object.entries(sectorMapping)) {
    let sectorFlow = 0;
    let smasSum = 0;
    let count = 0;
    for (const t of tickers) {
      const c = grouped[t];
      if (c && c.length >= 5) {
        const latest = c[c.length - 1].close;
        const prev = c[c.length - 5].close;
        const chg = ((latest - prev) / prev) * 100;
        const estFlow = (chg * 25.5);
        sectorFlow += estFlow;
        smasSum += Math.min(95, Math.max(15, Math.round(50 + chg * 5)));
        count++;
      }
    }
    sectors.push({ sector, netFlowCr: Math.round(sectorFlow), avgSmas: count > 0 ? Math.round(smasSum / count) : 50, tickers: count });
  }

  console.log(`Processed ${sectors.length} sectors in ${Date.now() - t0}ms:`);
  console.log(sectors.slice(0, 4));
  db.close();
});
