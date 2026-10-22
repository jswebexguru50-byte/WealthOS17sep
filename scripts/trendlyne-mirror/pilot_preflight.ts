import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { TrendlyneMirrorService } from '../../src/server/services/trendlyne-mirror/TrendlyneMirrorService.js';

const root = process.cwd();
const manifestPath = path.join(root, 'outputs', 'dossier_runs', 'DR-20261001-7D-B0A8466C_manifest.json');
const reportDir = path.join(root, 'reports', 'trendlyne_mirror');
const reportPath = path.join(reportDir, 'PILOT_19_PREFLIGHT.json');
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');

function main() {
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing dossier manifest: ${manifestPath}`);
  const db = new Database(dbPath);
  try {
    const service = new TrendlyneMirrorService(db as any);
    service.installSchema();
    service.seedCatalog();
    service.seedPacks();
    const report = {
      ...service.buildPreflight('DR-20261001-7D-B0A8466C', 0),
      generatedAt: new Date().toISOString(),
      runId: 'DR-20261001-7D-B0A8466C',
    };

    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log('M4 PREFLIGHT');
    console.log(`19 symbols: ${report.symbols.join(', ')}`);
    console.log(`packs: ${report.packCount}`);
    console.log(`planned parameter calls: ${report.plannedParameterCalls}`);
    console.log(`planned requested cells: ${report.plannedRequestedCells}`);
    console.log(`network calls executed: ${report.networkCallsExecuted}`);
    console.log(`report: ${reportPath}`);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

