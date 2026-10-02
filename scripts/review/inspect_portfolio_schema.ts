import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

function getCols(table: string) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  console.log(`Columns in ${table}:`, info.map(c => `${c.name} (${c.type})`).join(', '));
}

getCols('MasterTickers');
getCols('FundamentalSnapshots');
getCols('company_facts');

// Check distinct metrics in company_facts
const metrics = db.prepare("SELECT metric, COUNT(*) as c FROM company_facts GROUP BY metric ORDER BY c DESC").all() as any[];
console.log('Top metrics in company_facts:', metrics.slice(0, 25));

// Check verification statuses
const vs = db.prepare("SELECT verificationStatus, COUNT(*) as c FROM company_facts GROUP BY verificationStatus").all() as any[];
console.log('Verification statuses in company_facts:', vs);
