import { QglpEngine } from '../../src/server/services/intelligence/engines/QglpEngine.js';
import { SecurityIdentity } from '../../src/server/services/intelligence/contracts/SecurityIdentity.js';
import { CanonicalFactRepository } from '../../src/server/services/intelligence/core/CanonicalFactRepository.js';
import { dbAll, getDB } from '../../src/server/database.js';

async function main() {
  const engine = QglpEngine.getInstance();
  const db = getDB();
  
  // Pilot with 10 interesting companies
  const rows = await dbAll(db, `SELECT symbol, name, isin FROM MasterTickers LIMIT 10`);
  
  for (const row of rows) {
    const identity: SecurityIdentity = { symbol: row.symbol, name: row.name, isin: row.isin };
    const score = await engine.evaluate(identity);
    console.log(`\n============================`);
    console.log(`SYMBOL: ${identity.symbol} | STATUS: ${score.status}`);
    console.log(`OVERALL SCORE: ${score.overallScore !== null ? score.overallScore : 'N/A'}`);
    console.log(`MISSING DATA: ${score.missingMetrics.join(', ') || 'None'}`);
    console.log(`PENDING QUALITATIVE: ${score.qualitativePending.join(', ') || 'None'}`);
  }
}

main().catch(console.error);
