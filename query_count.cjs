const Database = require('better-sqlite3');
const db = new Database('portfolio.db');
console.log('Trade receivables rows:', db.prepare("SELECT count(*) as c FROM company_facts WHERE metric='trade_receivables_cr'").get().c);
console.log('Borrowings rows:', db.prepare("SELECT count(*) as c FROM company_facts WHERE metric='borrowings'").get().c);
console.log('Total debt rows:', db.prepare("SELECT count(*) as c FROM company_facts WHERE metric='total_debt'").get().c);
console.log('Debt to equity rows:', db.prepare("SELECT count(*) as c FROM company_facts WHERE metric='debt_to_equity'").get().c);
