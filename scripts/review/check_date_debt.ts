import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

console.log('Sample MasterTickers listing_date:');
const sampleDates = db.prepare('SELECT symbol, listing_date FROM MasterTickers WHERE listing_date IS NOT NULL LIMIT 10').all();
console.log(sampleDates);

console.log('Sample FEREEnrichedLedger debt_to_equity:');
const sampleDebt = db.prepare('SELECT symbol, debt_to_equity, promoter_pledge_pct, market_cap_cr FROM FEREEnrichedLedger LIMIT 10').all();
console.log(sampleDebt);

const highDebtFere = db.prepare('SELECT count(*) as c FROM FEREEnrichedLedger WHERE debt_to_equity > 1.5').get();
const lowDebtFere = db.prepare('SELECT count(*) as c FROM FEREEnrichedLedger WHERE debt_to_equity = 0 OR debt_to_equity < 0.1').get();
console.log('FERE debt stats:', { highDebtFere, lowDebtFere });

console.log('Sample company_facts debt facts:');
const factDebt = db.prepare("SELECT symbol, canonicalMetric, valueNumeric FROM company_facts WHERE canonicalMetric LIKE '%debt%' LIMIT 10").all();
console.log(factDebt);
