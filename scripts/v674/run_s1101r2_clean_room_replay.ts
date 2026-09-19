import { S1101R2CleanRoomRunner } from '../../src/server/services/s1101r2/cleanroom/S1101R2CleanRoomRunner';
import { S1101R2MasterLedger } from '../../src/server/services/s1101r2/S1101R2MasterLedger';

async function main() {
  console.log('=== RUNNING S1101R2 AGENT 4: INDEPENDENT CLEAN-ROOM REBUILD & AST FIREWALL ===');
  const ledger = new S1101R2MasterLedger();
  const runner = new S1101R2CleanRoomRunner('reports/v674-s1101r2', ledger);
  const result = runner.runCleanRoomReplay('CE2DD63D97003FB232B483A99614D310313A13518CD7F02E36148EAF46A57C65');

  console.log(`Forbidden Dependencies: ${result.forbiddenDependencyCount}`);
  console.log(`Reconstructed ${result.signalsReconstructedCount} signals (${result.matches} matches / ${result.mismatches} mismatches).`);
  console.log(`Clean-room status: ${result.status}`);
  console.log('=== S1101R2 AGENT 4 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 4 Audit Error:', err);
  process.exit(1);
});
