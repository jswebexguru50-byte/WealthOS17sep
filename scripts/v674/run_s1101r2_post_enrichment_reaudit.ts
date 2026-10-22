import { S1101R2StrategyLogicAuditor } from '../../src/server/services/s1101r2/strategy/S1101R2StrategyLogicAuditor';
import { S1101R2DataTruthAuditor } from '../../src/server/services/s1101r2/data/S1101R2DataTruthAuditor';
import { S1101R2DownstreamChainAuditor } from '../../src/server/services/s1101r2/downstream/S1101R2DownstreamChainAuditor';
import { S1101R2CleanRoomRunner } from '../../src/server/services/s1101r2/cleanroom/S1101R2CleanRoomRunner';
import { S1101R2DatabaseWriteAuditor } from '../../src/server/services/s1101r2/governance/S1101R2DatabaseWriteAuditor';
import { S1101R2EnvironmentFirewall } from '../../src/server/services/s1101r2/governance/S1101R2EnvironmentFirewall';
import { S1101R2AdversarialAttacker } from '../../src/server/services/s1101r2/redteam/S1101R2AdversarialAttacker';
import { S1101R2MasterLedger } from '../../src/server/services/s1101r2/S1101R2MasterLedger';

async function main() {
  console.log('=== RUNNING S1101R2 MANDATORY DEPENDENCY-AWARE RE-AUDIT ===');
  const ledger = new S1101R2MasterLedger('reports/v674-s1101r2');

  const dataAuditor = new S1101R2DataTruthAuditor('reports/v674-s1101r2', ledger);
  const dataRes = dataAuditor.runDataAudit();
  const datasetHash = dataRes.datasetHash;

  console.log(`Re-auditing affected strategy logic under Dataset V2 (${datasetHash})...`);
  const stratAuditor = new S1101R2StrategyLogicAuditor('reports/v674-s1101r2', ledger);
  stratAuditor.auditAllStrategies();

  console.log(`Re-auditing downstream chain under Dataset V2 (${datasetHash})...`);
  const downAuditor = new S1101R2DownstreamChainAuditor('reports/v674-s1101r2', ledger);
  downAuditor.auditDownstreamChain(datasetHash);

  console.log(`Re-running clean-room replay under Dataset V2 (${datasetHash})...`);
  const cleanRunner = new S1101R2CleanRoomRunner('reports/v674-s1101r2', ledger);
  cleanRunner.runCleanRoomReplay(datasetHash);

  console.log(`Re-auditing DB write isolation under Dataset V2 (${datasetHash})...`);
  const dbAuditor = new S1101R2DatabaseWriteAuditor('reports/v674-s1101r2', ledger);
  dbAuditor.auditDatabaseWrites(datasetHash);

  const envAuditor = new S1101R2EnvironmentFirewall('reports/v674-s1101r2', ledger);
  envAuditor.auditEnvironmentFirewall(datasetHash);

  console.log(`Re-running red-team attacks under Dataset V2 (${datasetHash})...`);
  const redAttacker = new S1101R2AdversarialAttacker('reports/v674-s1101r2', ledger);
  redAttacker.runAllAttacks(datasetHash);

  console.log('=== S1101R2 MANDATORY RE-AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Re-audit error:', err);
  process.exit(1);
});
