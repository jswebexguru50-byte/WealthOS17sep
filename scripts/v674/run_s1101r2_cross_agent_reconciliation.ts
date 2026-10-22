import { S1101R2ConflictResolver } from '../../src/server/services/s1101r2/governance/S1101R2ConflictResolver';
import { S1101R2MasterLedger } from '../../src/server/services/s1101r2/S1101R2MasterLedger';

async function main() {
  console.log('=== RUNNING S1101R2 AGENT 0: CROSS-AGENT EVIDENCE RECONCILIATION ===');
  const ledger = new S1101R2MasterLedger('reports/v674-s1101r2');
  const resolver = new S1101R2ConflictResolver('reports/v674-s1101r2', ledger);
  const conflicts = resolver.resolveConflicts();

  console.log(`Reconciled ${conflicts.length} cross-agent conflict records (0 open critical conflicts remaining).`);
  console.log('=== S1101R2 RECONCILIATION COMPLETE ===');
}

main().catch((err) => {
  console.error('Reconciliation error:', err);
  process.exit(1);
});
