import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const row = db.prepare("SELECT response_json FROM fundamental_endpoint_snapshots WHERE UPPER(symbol) = 'RVTH' AND endpoint = 'parameters'").get() as any;
if (row) {
  console.log(row.response_json.slice(0, 2000));
}
