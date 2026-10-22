import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const cfSnap = db.prepare("SELECT symbol, response_json FROM fundamental_endpoint_snapshots WHERE endpoint = 'cash-flow' LIMIT 1").get() as any;
const json = JSON.parse(cfSnap.response_json);
console.log('data.cash_flow:', JSON.stringify(json.data.cash_flow, null, 2));
