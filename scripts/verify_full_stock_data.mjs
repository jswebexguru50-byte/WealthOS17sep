import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const symbols = [
  'AERONEU', 'AETHER', 'ARHAM', 'BLISSGVS', 'CAPILLARY', 'DUCOL', 'GUJRAFFIA',
  'JAINIK', 'KAPSTON', 'KONSTELEC', 'LAMBODHARA', 'MACPOWER', 'MAHICKRA',
  'MAWANASUG', 'NGLFINE', 'PAISALO', 'PRECWIRE', 'RAMRAT', 'RPTECH',
  'SANSERA', 'SHEETAL', 'SHETHJI', 'SIGMAADV', 'SMARTEN', 'SMARTLINK',
  'SOFTTECH', 'SPECIALITY', 'SUDARCOLOR', 'TALBROAUTO', 'TATAINVEST',
  'UNIVPHOTO', 'WELINV', 'YATHARTH'
];

const ph = symbols.map(() => '?').join(',');

const snapshots = db.prepare(`SELECT * FROM FundamentalSnapshots WHERE symbol IN (${ph})`).all(...symbols);
const tickers = db.prepare(`SELECT * FROM MasterTickers WHERE symbol IN (${ph})`).all(...symbols);
const facts = db.prepare(`SELECT symbol, metric, value, unit, periodType, scope FROM company_facts WHERE symbol IN (${ph})`).all(...symbols);

console.log('Snapshots count:', snapshots.length);
console.log('Tickers count:', tickers.length);
console.log('Facts count:', facts.length);

const snapMap = new Map(snapshots.map(s => [s.symbol, s]));
const tickerMap = new Map(tickers.map(t => [t.symbol, t]));
const factsMap = new Map();
for (const f of facts) {
  if (!factsMap.has(f.symbol)) factsMap.set(f.symbol, {});
  const obj = factsMap.get(f.symbol);
  // Store metric value
  if (f.value !== null && f.value !== undefined) {
    obj[f.metric] = f.value;
  }
}

console.log('\nSample combined data for 3 stocks:');
for (const sym of ['AETHER', 'SANSERA', 'PRECWIRE']) {
  const t = tickerMap.get(sym) || {};
  const s = snapMap.get(sym) || {};
  const f = factsMap.get(sym) || {};
  console.log(`\n=== ${sym} (${t.name || sym}) ===`);
  console.log('Sector:', t.sector || s.sector);
  console.log('Market Cap Cr:', f.market_cap);
  console.log('P/E:', f.pe_ratio || s.pe_ratio);
  console.log('Book Value:', s.book_value || f.bvps);
  console.log('ROE%:', f.roe || s.roe_pct);
  console.log('ROCE%:', f.roce_reported || s.roce_pct);
  console.log('Debt/Equity:', f.debt_to_equity_reported ?? s.debt_to_equity);
  console.log('CFO Cr:', f.cfo);
  console.log('Operating Profit Cr:', f.operating_profit);
  console.log('Promoter%:', f.promoter_holding || s.promoter_holding_pct);
  console.log('Pledge%:', f.promoter_pledge ?? s.pledged_pct);
  console.log('FII%:', f.fii_holding || s.fii_holding_pct);
  console.log('DII%:', s.dii_holding_pct);
}
