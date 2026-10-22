import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const profile = db.prepare("SELECT symbol, response_json FROM fundamental_endpoint_snapshots WHERE endpoint = 'profile' LIMIT 3").all() as any[];
for (const p of profile) {
  console.log(`--- Profile for ${p.symbol} ---`);
  try {
    const parsed = JSON.parse(p.response_json);
    console.log(parsed);
  } catch (err: any) {
    console.log('Error parsing:', err.message);
  }
}
