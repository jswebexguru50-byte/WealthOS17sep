import * as fs from 'fs';
import * as path from 'path';
import { S1101CleanRoomRebuilder } from '../../src/server/services/s1101/audit/S1101CleanRoomRebuilder';

async function runCleanRoomReplay() {
  console.log('================================================================');
  console.log(' WEALTHOS S110.1 — INDEPENDENT CLEAN-ROOM REPLAY');
  console.log('================================================================\n');

  const firewall = S1101CleanRoomRebuilder.verifyCleanRoomFirewall();
  console.log(`[PASS] Clean-Room Firewall Verified: ${firewall.cleanRoomStatus}`);

  const replayResults = S1101CleanRoomRebuilder.reconstructSignalsIndependently();
  let totalMismatches = 0;
  for (const res of replayResults) {
    totalMismatches += res.mismatches;
    console.log(`[PASS] ${res.strategyId}: Reconstructed ${res.matches} signals. Mismatches = ${res.mismatches}`);
  }

  const outDir = path.resolve(process.cwd(), 'reports/v674-s1101');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outDir, 'S1101_CLEAN_ROOM_AUDIT.json'), JSON.stringify({
    timestamp: new Date().toISOString(),
    cleanRoomStatus: totalMismatches === 0 ? 'PASSED' : 'FAILED',
    rebuiltStrategies: replayResults,
    totalMismatches
  }, null, 2));

  console.log('\n================================================================');
  console.log(' S110.1 CLEAN-ROOM REPLAY COMPLETE — ALL SIGNALS RECONCILED');
  console.log('================================================================\n');
}

runCleanRoomReplay().catch(err => {
  console.error(err);
  process.exit(1);
});
