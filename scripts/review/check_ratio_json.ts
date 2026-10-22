import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const ratioSnap = db.prepare("SELECT symbol, response_json FROM fundamental_endpoint_snapshots WHERE endpoint = 'key-ratios' LIMIT 1").get() as any;
const json = JSON.parse(ratioSnap.response_json);
console.log('key-ratios for', ratioSnap.symbol, ':', JSON.stringify(json.data.slice(0, 10), null, 2));
