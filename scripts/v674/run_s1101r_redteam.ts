import { S1101RAdversarialAttacker } from '../../src/server/services/s1101r/redteam/S1101RAdversarialAttacker';
import { S1101RMasterLedger } from '../../src/server/services/s1101r/S1101RMasterLedger';

async function main() {
  console.log('=== RUNNING AGENT 6: RED-TEAM ADVERSARIAL CONTAMINATION ATTACKS ===');
  const ledger = new S1101RMasterLedger();
  const attacker = new S1101RAdversarialAttacker('reports/v674-s1101r', ledger);
  const result = attacker.runAllAttacks('E95606FFA5D47B3CB56B9DBDDC1FADF02111B46C1A42E798A93DF34AFDC2840A');

  console.log(`Executed ${result.totalAttacks} adversarial attacks.`);
  console.log(`Passed: ${result.passedAttacks} / Failed: ${result.failedAttacks}`);
  console.log(`Red-team status: ${result.status}`);
  console.log('=== AGENT 6 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 6 Audit Error:', err);
  process.exit(1);
});
