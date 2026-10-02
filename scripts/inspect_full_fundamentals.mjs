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

console.log('Tables:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
console.log(tables);

const sampleSym = 'SANSERA';
console.log(`\n--- FundamentalSnapshots for ${sampleSym} ---`);
console.log(db.prepare("SELECT * FROM FundamentalSnapshots WHERE symbol = ?").get(sampleSym));

console.log(`\n--- MasterTickers for ${sampleSym} ---`);
console.log(db.prepare("SELECT * FROM MasterTickers WHERE symbol = ?").get(sampleSym));

console.log(`\n--- company_facts for ${sampleSym} ---`);
const facts = db.prepare("SELECT metric, value, unit, periodType, scope FROM company_facts WHERE symbol = ?").all(sampleSym);
facts.forEach(f => console.log(`${f.metric}: ${f.value} ${f.unit || ''} (${f.periodType}, ${f.scope})`));
