import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
console.log('trendlyne_raw_response schema:');
console.log(db.prepare('PRAGMA table_info(trendlyne_raw_response)').all());

const trSyms = db.prepare("SELECT DISTINCT symbol FROM fundamental_endpoint_snapshots WHERE provider = 'TRENDLYNE_MCP'").all().map((r: any) => r.symbol);
console.log(`Symbols with TRENDLYNE_MCP endpoint snapshots (${trSyms.length}):`, trSyms.slice(0, 20));
