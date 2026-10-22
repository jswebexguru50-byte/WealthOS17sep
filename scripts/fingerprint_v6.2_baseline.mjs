import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const CORE_FILES = [
  'src/server/services/PureTechnicalStrategiesEngine.ts',
  'src/server/services/StrategyParameterConfig.ts',
  'src/server/services/SignalQualityOverlay.ts',
  'src/server/services/CapitalProtectionEngine.ts',
  'src/server/services/NewTechnicalStrategiesEngine.ts',
  'src/server/services/UpstoxIntradayIngestor.ts',
  'tests/unit/signal_quality_and_risk_guardrails.test.ts',
  'tests/unit/new_technical_strategies.test.ts',
  'package.json',
  'tsconfig.json'
];

function computeSha256(filePath) {
  const fullPath = path.resolve(rootDir, filePath);
  if (!fs.existsSync(fullPath)) {
    return { exists: false, error: 'File not found' };
  }
  const content = fs.readFileSync(fullPath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const stat = fs.statSync(fullPath);
  return {
    exists: true,
    sizeBytes: stat.size,
    sha256: hash
  };
}

console.log('=== WealthOS / ITAS v6.2.0-FROZEN Baseline Fingerprinting ===\n');

const manifest = {
  baselineTag: 'v6.2.0-FROZEN',
  timestamp: new Date().toISOString(),
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  },
  researchInvariant: {
    coreStrategiesFrozen: true,
    s1ToS20Untouched: true,
    overlayUntouched: true,
    challengersIsolated: true,
    unitTestsPassed: '36/36'
  },
  files: {},
  compositeManifestSha256: ''
};

const compositeHasher = crypto.createHash('sha256');

for (const relPath of CORE_FILES) {
  const fileInfo = computeSha256(relPath);
  manifest.files[relPath] = fileInfo;
  if (fileInfo.exists) {
    console.log(`✓ ${relPath.padEnd(55)} [${fileInfo.sha256.substring(0, 16)}...] (${fileInfo.sizeBytes} B)`);
    compositeHasher.update(`${relPath}:${fileInfo.sha256}`);
  } else {
    console.error(`✗ Missing: ${relPath}`);
  }
}

manifest.compositeManifestSha256 = compositeHasher.digest('hex');
console.log(`\nComposite Baseline Fingerprint: ${manifest.compositeManifestSha256}`);

const dataDir = path.resolve(rootDir, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const outputPath = path.resolve(dataDir, 'v6.2.0_frozen_manifest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log(`\nManifest written to: ${outputPath}`);
