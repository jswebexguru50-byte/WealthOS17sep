import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const bsSnap = db.prepare("SELECT symbol, response_json FROM fundamental_endpoint_snapshots WHERE endpoint = 'balance-sheet' LIMIT 1").get() as any;
const json = JSON.parse(bsSnap.response_json);
console.log('balance-sheet keys:', Object.keys(json.data || {}));
console.log('balance-sheet sample:', json.data);
