import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const rows = db.prepare("SELECT provider, endpoint, response_json FROM fundamental_endpoint_snapshots WHERE UPPER(symbol) = 'RVTH'").all();

for (const r of rows as any[]) {
  const data = JSON.parse(r.response_json);
  if (r.endpoint === 'share-holdings' || r.endpoint === 'shareholding') {
    console.log(`=== ${r.provider} - ${r.endpoint} ===`);
    console.log(JSON.stringify(data, null, 2).slice(0, 1000));
  }
  if (r.endpoint === 'parameters') {
    console.log(`=== ${r.provider} - parameters ===`);
    console.log('Parameters keys count:', Object.keys(data).length);
    // Find cash flow or ROCE or debt parameters
    const interesting = Object.entries(data).filter(([k, v]) => /cash|debt|roce|roe|promoter|pledge/i.test(k));
    console.log('Interesting parameters:', interesting);
  }
}
