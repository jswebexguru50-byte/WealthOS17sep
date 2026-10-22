import { S1101RStrategyLogicAuditor } from '../../src/server/services/s1101r/strategy/S1101RStrategyLogicAuditor';
import { S1101RDataTruthAuditor } from '../../src/server/services/s1101r/data/S1101RDataTruthAuditor';
import { S1101RDownstreamChainAuditor } from '../../src/server/services/s1101r/downstream/S1101RDownstreamChainAuditor';
import { S1101RCleanRoomRunner } from '../../src/server/services/s1101r/cleanroom/S1101RCleanRoomRunner';
import { S1101RDatabaseWriteAuditor } from '../../src/server/services/s1101r/governance/S1101RDatabaseWriteAuditor';
import { S1101REnvironmentFirewall } from '../../src/server/services/s1101r/governance/S1101REnvironmentFirewall';
import { S1101RAdversarialAttacker } from '../../src/server/services/s1101r/redteam/S1101RAdversarialAttacker';
import { S1101RMasterLedger } from '../../src/server/services/s1101r/S1101RMasterLedger';

async function main() {
  console.log('=== RUNNING POST-ENRICHMENT MANDATORY RE-AUDIT ===');
  const ledger = new S1101RMasterLedger();

  const dataAuditor = new S1101RDataTruthAuditor('reports/v674-s1101r', ledger);
  const dataRes = dataAuditor.runDataAudit();
  const v2DatasetHash = dataRes.datasetHash;

  console.log(`Re-auditing affected strategy logic under Dataset V2 (${v2DatasetHash})...`);
  const stratAuditor = new S1101RStrategyLogicAuditor(ledger);
  stratAuditor.auditAllStrategies();

  console.log(`Re-auditing downstream chain under Dataset V2 (${v2DatasetHash})...`);
  const downAuditor = new S1101RDownstreamChainAuditor('reports/v674-s1101r', ledger);
  downAuditor.auditDownstreamChain(v2DatasetHash);

  console.log(`Re-running clean-room replay under Dataset V2 (${v2DatasetHash})...`);
  const cleanRunner = new S1101RCleanRoomRunner('reports/v674-s1101r', ledger);
  cleanRunner.runCleanRoomReplay(v2DatasetHash);

  console.log(`Re-auditing DB writes & environment firewall under Dataset V2 (${v2DatasetHash})...`);
  const dbAuditor = new S1101RDatabaseWriteAuditor('reports/v674-s1101r', ledger);
  dbAuditor.auditDatabaseWrites(v2DatasetHash);

  const envAuditor = new S1101REnvironmentFirewall('reports/v674-s1101r', ledger);
  envAuditor.auditEnvironmentFirewall(v2DatasetHash);

  console.log(`Re-running red-team attacks under Dataset V2 (${v2DatasetHash})...`);
  const redAttacker = new S1101RAdversarialAttacker('reports/v674-s1101r', ledger);
  redAttacker.runAllAttacks(v2DatasetHash);

  console.log('=== POST-ENRICHMENT MANDATORY RE-AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Post-enrichment re-audit error:', err);
  process.exit(1);
});
