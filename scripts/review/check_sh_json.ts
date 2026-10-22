import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const shSnap = db.prepare("SELECT symbol, response_json FROM fundamental_endpoint_snapshots WHERE endpoint = 'share-holdings' LIMIT 1").get() as any;
const json = JSON.parse(shSnap.response_json);
console.log('share-holdings for', shSnap.symbol, ':', JSON.stringify(json.data, null, 2));
