import Database from 'better-sqlite3';
import path from 'node:path';

const db = new Database(path.join(process.cwd(), 'portfolio.db'), { readonly: true });

const revFacts = db.prepare("SELECT periodEnd, value, provider FROM company_facts WHERE symbol = 'TCS' AND metric = 'revenue' AND periodType = 'ANNUAL' ORDER BY periodEnd DESC").all();
console.log('TCS Annual Revenue facts count:', revFacts.length);
console.log('TCS Annual Revenue facts:', JSON.stringify(revFacts, null, 2));

const patFacts = db.prepare("SELECT periodEnd, value, provider FROM company_facts WHERE symbol = 'TCS' AND metric = 'pat' AND periodType = 'ANNUAL' ORDER BY periodEnd DESC").all();
console.log('TCS Annual PAT facts count:', patFacts.length);
console.log('TCS Annual PAT facts:', JSON.stringify(patFacts, null, 2));

const master = db.prepare("SELECT * FROM DataQualityAuditLedger WHERE symbol = 'TCS'").get();
console.log('DataQualityAuditLedger for TCS:', JSON.stringify(master, null, 2));

db.close();
