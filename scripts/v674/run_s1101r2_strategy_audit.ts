import { S1101R2StrategyLogicAuditor } from '../../src/server/services/s1101r2/strategy/S1101R2StrategyLogicAuditor';
import { S1101R2MasterLedger } from '../../src/server/services/s1101r2/S1101R2MasterLedger';

async function main() {
  console.log('=== RUNNING S1101R2 AGENT 1: S1-S10 EXECUTABLE STRATEGY AUDIT ===');
  const ledger = new S1101R2MasterLedger();
  ledger.verifyFrozenControls();

  const auditor = new S1101R2StrategyLogicAuditor('reports/v674-s1101r2', ledger);
  const result = auditor.auditAllStrategies();

  console.log(`Successfully mapped ${result.sourceMap.length} strategy source files.`);
  console.log('Dependency matrix keys:', Object.keys(result.dependencyMatrix).join(', '));
  console.log('=== S1101R2 AGENT 1 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 1 Audit Error:', err);
  process.exit(1);
});
