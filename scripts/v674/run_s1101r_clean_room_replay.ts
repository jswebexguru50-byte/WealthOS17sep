import { S1101RCleanRoomRunner } from '../../src/server/services/s1101r/cleanroom/S1101RCleanRoomRunner';
import { S1101RMasterLedger } from '../../src/server/services/s1101r/S1101RMasterLedger';

async function main() {
  console.log('=== RUNNING AGENT 4: INDEPENDENT CLEAN-ROOM REBUILD & REPLAY ===');
  const ledger = new S1101RMasterLedger();
  const runner = new S1101RCleanRoomRunner('reports/v674-s1101r', ledger);
  const result = runner.runCleanRoomReplay('E95606FFA5D47B3CB56B9DBDDC1FADF02111B46C1A42E798A93DF34AFDC2840A');

  console.log(`AST Firewall Violations: ${result.firewallViolations.length}`);
  console.log(`Reconstructed ${result.signalsReconstructed} signals (${result.matches} matches / ${result.mismatches} mismatches).`);
  console.log(`Clean-room result: ${result.status}`);
  console.log('=== AGENT 4 AUDIT COMPLETE ===');
}

main().catch((err) => {
  console.error('Agent 4 Audit Error:', err);
  process.exit(1);
});
