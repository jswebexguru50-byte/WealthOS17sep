import { S1101R2DatabaseWriteAuditor } from '../../src/server/services/s1101r2/governance/S1101R2DatabaseWriteAuditor';
import { S1101R2EnvironmentFirewall } from '../../src/server/services/s1101r2/governance/S1101R2EnvironmentFirewall';
import { S1101R2MasterLedger } from '../../src/server/services/s1101r2/S1101R2MasterLedger';

async function main() {
  console.log('=== RUNNING S1101R2 AGENT 5: DATABASE WRITE ISOLATION & ENVIRONMENT FIREWALL AUDIT ===');
  const ledger = new S1101R2MasterLedger();
  const dbAuditor = new S1101R2DatabaseWriteAuditor('reports/v674-s1101r2', ledger);
  const dbResult = dbAuditor.auditDatabaseWrites('CE2DD63D97003FB232B483A99614D310313A13518CD7F02E36148EAF46A57C65');

  const envAuditor = new S1101R2EnvironmentFirewall('reports/v674-s1101r2', ledger);
  const envResult = envAuditor.auditEnvironmentFirewall('CE2DD63D97003FB232B483A99614D310313A13518CD7F02E36148EAF46A57C65');

  console.log(`Unexpected Canonical DB Writes: ${dbResult.unexpectedCanonicalWrites}`);
  console.log(`Environment Not Live: ${envResult.environmentNotLive}`);
  console.log(`Production Promotion Authorization: ${envResult.productionPromotionAuthorization}`);
  console.log(`Live Trading Authorization: ${envResult.liveTradingAuthorization}`);
  console.log(`Capital Eligible: ${envResult.capitalEligible}`);
  console.log('=== S1101R2 AGENT 5 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 5 Audit Error:', err);
  process.exit(1);
});
