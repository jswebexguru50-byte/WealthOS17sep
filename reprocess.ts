import sqlite3 from 'sqlite3';
import { CanonicalFactIngestionService } from './src/server/services/CanonicalFactIngestionService';

async function run() {
  const db = new sqlite3.Database('portfolio.db');
  const service = new CanonicalFactIngestionService(db);
  
  const rows = await new Promise<any[]>((resolve, reject) => {
    db.all("SELECT DISTINCT symbol FROM fundamental_endpoint_snapshots", [], (err, res) => err ? reject(err) : resolve(res));
  });
  
  console.log(`Found ${rows.length} symbols to reprocess.`);
  let total = 0;
  for (const row of rows) {
    const count = await service.ingestForSymbol(row.symbol);
    total += count;
  }
  
  console.log(`Reprocessed and inserted ${total} facts.`);
  db.close();
}

run().catch(console.error);
