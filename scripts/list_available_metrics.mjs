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

const metrics = db.prepare(`
  SELECT metric, COUNT(DISTINCT symbol) as symbol_count, COUNT(*) as fact_count
  FROM company_facts
  WHERE symbol IN (${ph})
  GROUP BY metric
  ORDER BY symbol_count DESC
`).all(...symbols);

console.log('Metrics available for the 33 symbols:');
metrics.forEach(m => console.log(`${m.metric}: ${m.symbol_count}/33 symbols (${m.fact_count} facts)`));
