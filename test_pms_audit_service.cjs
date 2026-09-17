const sqlite3 = require('sqlite3');
const { PmsReconciliationService } = require('./src/server/services/PmsReconciliationService.ts');

async function main() {
  const db = new sqlite3.Database('./portfolio.db');
  const report = await PmsReconciliationService.runAudit(db, 'cc9', 14000000, 2);
  console.log('=== PMS AUDIT SERVICE DIRECT EXECUTION ===');
  console.log('Overall Status:', report.overallStatus);
  console.log('Matched Count:', report.matchedCount, '/', report.stockRecon.length);
  console.log('Discrepancy Count:', report.discrepancyCount);
  console.log('Settlement Pending Count:', report.settlementPendingCount);
  console.log('\nCash Reconciliation:', report.cashRecon);
  
  if (report.discrepancyCount > 0) {
    console.log('\nDiscrepancies:');
    report.stockRecon.filter(s => s.status === 'DISCREPANCY').forEach(s => console.log(JSON.stringify(s)));
  }

  process.exit(0);
}

main().catch(console.error);
