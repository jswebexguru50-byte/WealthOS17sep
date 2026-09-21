import fs from 'fs';
import path from 'path';
import { ResearchSnapshotBuilder } from './src/server/services/phase2fasttrack/ResearchSnapshotBuilder.js';

const EXPECTED_CANONICAL_BYTE_HASH = 'f8d8541a2b186d42d72c077395f90a88f6f234b16bfdb83ca683eb2232064681';
const IMMUTABLE_FROZEN_CONTROLS_BASELINE = {
  'src/server/services/puretechnical/PureTechnicalStrategiesEngine.ts': '52e9f65805fc4fbde931e5f8cc02081d6cd20ad41164c84542475ab5ecb9165d',
  'src/server/services/puretechnical/StrategyParameterConfig.ts': 'd3a37b3b448a319454157d0799f2a9d82136a8eb33a921d3f23a9d2ad58e0a29',
  'src/server/services/puretechnical/SignalQualityOverlay.ts': 'b5b828fc8c21a11db9ed517454afb4b9b3cf2ed1ab0edc128ce23ab4988d8b67',
  'src/server/services/puretechnical/CapitalProtectionEngine.ts': 'd9be55d64843b4f63c8daec3ce4a44b82d02c91834927ed14b0b13dc0f032120',
  'src/server/services/puretechnical/NewTechnicalStrategiesEngine.ts': '8a9cc2d137df72bb3a9b139fcb905f03d58309c5b4e393b48227b4010be432df',
  'src/server/services/intraday/UpstoxIntradayIngestor.ts': 'f29729ffae3a826027a08fb0de008ecb2f281e7d23a4b08d4b2dcd9dcd750c00',
  'data/v6.3_REAL_trade_identity_ledger.jsonl': '9620ed76a5960ebbe6cc17a80b1c0b325adbe1ed243ce348a213e4b0c793ffce'
};

async function main() {
  const builder = new ResearchSnapshotBuilder();
  const snap = await builder.buildSnapshot(
    'run-snap-test',
    '7871a0b',
    EXPECTED_CANONICAL_BYTE_HASH,
    IMMUTABLE_FROZEN_CONTROLS_BASELINE,
    'db33005a5a13'
  );
  const reportsDir = path.join(process.cwd(), 'reports', 'v674-fasttrack');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  const snapshotPath = path.join(reportsDir, '02_RESEARCH_SNAPSHOT.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(snap, null, 2));
  console.log('Snapshot generated.');
}
main().catch(console.error);
