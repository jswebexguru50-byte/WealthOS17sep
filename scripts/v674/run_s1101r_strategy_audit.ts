import { S1101RStrategyLogicAuditor } from '../../src/server/services/s1101r/strategy/S1101RStrategyLogicAuditor';
import { S1101RMasterLedger } from '../../src/server/services/s1101r/S1101RMasterLedger';

async function main() {
  console.log('=== RUNNING AGENT 1: S1-S10 STRATEGY SOURCE CODE AUDIT ===');
  const ledger = new S1101RMasterLedger();
  ledger.verifyFrozenControls();

  const auditor = new S1101RStrategyLogicAuditor(ledger);
  const results = auditor.auditAllStrategies();

  console.log(`Successfully audited ${results.length} strategies (S1 to S10).`);
  for (const r of results) {
    console.log(`  [${r.strategyId}] ${r.name}: ${r.sourceFile} (${r.startLine}-${r.endLine}) [Hash: ${r.sourceEvidence.sourceHash.substring(0, 8)}...]`);
  }
  console.log('=== AGENT 1 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 1 Audit Error:', err);
  process.exit(1);
});
