import { S1101R2AdversarialAttacker } from '../../src/server/services/s1101r2/redteam/S1101R2AdversarialAttacker';
import { S1101R2MasterLedger } from '../../src/server/services/s1101r2/S1101R2MasterLedger';

async function main() {
  console.log('=== RUNNING S1101R2 AGENT 6: RED-TEAM ADVERSARIAL CONTAMINATION ATTACKS ===');
  const ledger = new S1101R2MasterLedger();
  const attacker = new S1101R2AdversarialAttacker('reports/v674-s1101r2', ledger);
  const result = attacker.runAllAttacks('CE2DD63D97003FB232B483A99614D310313A13518CD7F02E36148EAF46A57C65');

  console.log(`Executed ${result.totalAttacks} adversarial attacks.`);
  console.log(`Passed: ${result.passedAttacks} / Failed: ${result.failedAttacks}`);
  console.log(`Red-team status: ${result.status}`);
  console.log('=== S1101R2 AGENT 6 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 6 Audit Error:', err);
  process.exit(1);
});
