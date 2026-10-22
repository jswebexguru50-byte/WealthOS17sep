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

const facts = db.prepare(`
  SELECT * FROM company_facts WHERE symbol = 'AETHER' AND metric = 'bvps'
`).all();
console.log('bvps facts for AETHER:', facts);

const snapshotCounts = db.prepare(`
  SELECT symbol, COUNT(*) as count 
  FROM FundamentalSnapshots 
  WHERE symbol IN (${ph}) 
  GROUP BY symbol
`).all(...symbols);

console.log('company_facts covered symbols:', factCounts.length, 'out of', symbols.length);
console.log('FundamentalSnapshots covered symbols:', snapshotCounts.length, 'out of', symbols.length);

const factsCovered = new Set(factCounts.map(r => r.symbol));
const missingFacts = symbols.filter(s => !factsCovered.has(s));
console.log('Missing in company_facts:', missingFacts);

const snapshotsCovered = new Set(snapshotCounts.map(r => r.symbol));
const missingSnapshots = symbols.filter(s => !snapshotsCovered.has(s));
console.log('Missing in FundamentalSnapshots:', missingSnapshots);
