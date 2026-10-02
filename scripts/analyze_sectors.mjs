import fs from 'node:fs';
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
const tickers = db.prepare(`SELECT symbol, name, sector, industry FROM MasterTickers WHERE symbol IN (${ph})`).all(...symbols);
const facts = db.prepare(`SELECT symbol, metric, value FROM company_facts WHERE symbol IN (${ph})`).all(...symbols);
const snapshots = db.prepare(`SELECT * FROM FundamentalSnapshots WHERE symbol IN (${ph})`).all(...symbols);

const snapshotJson = JSON.parse(fs.readFileSync('data/fundamental_enrichment/sector_momentum_snapshot.json', 'utf8'));
const momentumMap = new Map((snapshotJson.rows || []).map(r => [r.symbol, r]));

const factsMap = new Map();
for (const f of facts) {
  if (!factsMap.has(f.symbol)) factsMap.set(f.symbol, {});
  if (f.value !== null && f.value !== undefined) {
    factsMap.get(f.symbol)[f.metric] = Number(f.value);
  }
}
const snapMap = new Map(snapshots.map(s => [s.symbol, s]));

const sectors = {};
for (const t of tickers) {
  const m = momentumMap.get(t.symbol) || {};
  const sec = t.sector || m.sector || 'Other';
  if (!sectors[sec]) {
    sectors[sec] = {
      sector: sec,
      indexSymbol: m.indexSymbol || 'N/A',
      indexClose: m.close,
      indexReturn20d: m.return20dPct,
      aboveEma20: m.aboveEma20,
      status: m.status,
      count: 0,
      symbols: [],
      totalMcap: 0,
      roces: [],
      roes: [],
      pes: [],
      des: []
    };
  }
  const f = factsMap.get(t.symbol) || {};
  const s = snapMap.get(t.symbol) || {};
  sectors[sec].count++;
  sectors[sec].symbols.push(t.symbol);
  if (f.market_cap) sectors[sec].totalMcap += f.market_cap;
  if (f.roce_reported || s.roce_pct) sectors[sec].roces.push(f.roce_reported || s.roce_pct);
  if (f.roe || s.roe_pct) sectors[sec].roes.push(f.roe || s.roe_pct);
  if (f.pe_ratio || s.pe_ratio) sectors[sec].pes.push(f.pe_ratio || s.pe_ratio);
  if (f.debt_to_equity_reported !== undefined) sectors[sec].des.push(f.debt_to_equity_reported);
}

const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 'N/A';

console.log('Sector Summary Table:');
const summaryTable = Object.values(sectors).map(s => ({
  Sector: s.sector,
  'Index Symbol': s.indexSymbol,
  'Index Ret 20D (%)': s.indexReturn20d ? s.indexReturn20d.toFixed(2) + '%' : 'N/A',
  'Trend Status': s.status,
  'Stock Count': s.count,
  Symbols: s.symbols.join(', '),
  'Total MCap (Cr)': '₹' + s.totalMcap.toFixed(0),
  'Avg P/E': avg(s.pes),
  'Avg ROCE (%)': avg(s.roces) + '%',
  'Avg ROE (%)': avg(s.roes) + '%',
  'Avg D/E': avg(s.des)
}));
console.table(summaryTable);
