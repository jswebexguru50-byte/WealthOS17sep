import { DatabaseManager } from '../../src/server/services/DatabaseManager';
async function test() {
   const db = DatabaseManager.getInstance();
   const res = await db.query("PRAGMA table_info(HistoricalPrices)");
   console.log("HistoricalPrices columns:", res.map(r => r.name).join(', '));

   const dqRes = await db.query("PRAGMA table_info(DataQualityAuditLedger)");
   console.log("DataQualityAuditLedger columns:", dqRes.map(r => r.name).join(', '));
   
   // Close the DB when done
   process.exit(0);
}
test().catch(console.error);
