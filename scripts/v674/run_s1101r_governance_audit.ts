import { S1101RDatabaseWriteAuditor } from '../../src/server/services/s1101r/governance/S1101RDatabaseWriteAuditor';
import { S1101REnvironmentFirewall } from '../../src/server/services/s1101r/governance/S1101REnvironmentFirewall';
import { S1101RMasterLedger } from '../../src/server/services/s1101r/S1101RMasterLedger';

async function main() {
  console.log('=== RUNNING AGENT 5: DATABASE WRITE & ENVIRONMENT FIREWALL AUDIT ===');
  const ledger = new S1101RMasterLedger();
  const dbAuditor = new S1101RDatabaseWriteAuditor('reports/v674-s1101r', ledger);
  const dbResult = dbAuditor.auditDatabaseWrites('E95606FFA5D47B3CB56B9DBDDC1FADF02111B46C1A42E798A93DF34AFDC2840A');

  const envAuditor = new S1101REnvironmentFirewall('reports/v674-s1101r', ledger);
  const envResult = envAuditor.auditEnvironmentFirewall('E95606FFA5D47B3CB56B9DBDDC1FADF02111B46C1A42E798A93DF34AFDC2840A');

  console.log(`Unexpected Canonical DB Writes: ${dbResult.unexpectedCanonicalWrites}`);
  console.log(`Environment Not Live: ${envResult.environmentNotLive}`);
  console.log(`Production Promotion Authorization: ${envResult.productionPromotionAuthorization}`);
  console.log(`Live Trading Authorization: ${envResult.liveTradingAuthorization}`);
  console.log(`Capital Eligible: ${envResult.capitalEligible}`);
  console.log('=== AGENT 5 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 5 Audit Error:', err);
  process.exit(1);
});
