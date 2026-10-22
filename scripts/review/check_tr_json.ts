import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const trSnap = db.prepare("SELECT symbol, endpoint, response_json FROM fundamental_endpoint_snapshots WHERE provider = 'TRENDLYNE_MCP' LIMIT 2").all() as any[];
for (const s of trSnap) {
  console.log('---', s.symbol, s.endpoint, '---');
  console.log(JSON.parse(s.response_json));
}
