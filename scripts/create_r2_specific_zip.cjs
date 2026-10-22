const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const tempDir = path.join(rootDir, 'temp_r2_bundle');
const zipFile = path.join(rootDir, 'WealthOS_v6.7.2_R2_Evidence_Package.zip');

const targetFiles = [
  // 1. Files changed for R2 Research Validation & Audit
  'scripts/v672/run_v672_r2_master_verification.ts',
  'src/server/services/research/EligibilityEngine.ts',
  'src/server/services/research/ResearchArtifactGenerator.ts',
  'src/server/services/research/ProductionBypassAuditor.ts',
  'src/server/services/research/DecisionGraphValidator.ts',
  'src/server/services/research/OpportunitySuppressionAnalyzer.ts',
  'src/server/services/research/BlockBootstrapEngine.ts',
  'src/server/services/research/BHFDRValidator.ts',
  'src/server/services/research/ResearchContaminationDetector.ts',
  'src/server/services/research/TrueWalkForwardEngine.ts',
  'src/server/services/research/OrderLevelCapacityEngine.ts',
  'src/server/services/research/EconomicCostRobustnessEngine.ts',
  'src/server/services/research/TrueRegimeClassifier.ts',
  'config/v67/REGIME_DEFINITION.json',
  'src/server/services/audit/PITDecisionEvidenceValidator.ts',
  'src/server/services/research/ReplayReconciliationEngine.ts',
  'src/server/services/research/CleanRoomIndependentAuditor.ts',
  'src/server/services/research/ProducerTradePnlCalculator.ts',
  'src/server/services/research/CleanRoomEconomicReplay.ts',
  'src/server/services/research/ResearchRun.ts',
  'src/server/services/research/StopTheLineRegistry.ts',
  'src/server/services/research/CanonicalTradeLedger.ts',
  'src/server/services/research/CanonicalResearchInput.ts',
  'src/server/services/research/ResearchHashVerifier.ts',
  'src/server/services/research/DeterministicRunContext.ts',
  'package.json',

  // 2. Frozen control path files
  'src/server/services/PureTechnicalStrategiesEngine.ts',
  'src/server/services/StrategyParameterConfig.ts',
  'src/server/services/SignalQualityOverlay.ts',
  'src/server/services/CapitalProtectionEngine.ts',
  'src/server/services/NewTechnicalStrategiesEngine.ts',
  'src/server/services/UpstoxIntradayIngestor.ts',
  'data/v6.3_REAL_trade_identity_ledger.jsonl'
];

console.log('[R2 Bundle] Preparing bundle for specified R2 and frozen files...');

if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
if (fs.existsSync(zipFile)) {
  fs.rmSync(zipFile, { force: true });
}
fs.mkdirSync(tempDir, { recursive: true });

let copiedCount = 0;
let missingCount = 0;

for (const relPath of targetFiles) {
  const srcPath = path.join(rootDir, relPath);
  const dstPath = path.join(tempDir, relPath);
  
  if (fs.existsSync(srcPath)) {
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    fs.copyFileSync(srcPath, dstPath);
    console.log(`[R2 Bundle] Copied: ${relPath}`);
    copiedCount++;
  } else {
    console.warn(`[R2 Bundle] WARNING: Missing file: ${relPath}`);
    missingCount++;
  }
}

// Add a manifest file describing the archive
const manifest = {
  packageName: 'WealthOS v6.7.2-R2 Evidence & Frozen Controls Package',
  generatedAt: new Date().toISOString(),
  copiedFiles: copiedCount,
  missingFiles: missingCount,
  fileList: targetFiles
};
fs.writeFileSync(path.join(tempDir, 'R2_BUNDLE_MANIFEST.json'), JSON.stringify(manifest, null, 2));

console.log(`[R2 Bundle] Packaging ${copiedCount} files into ${zipFile}...`);
const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipFile}' -CompressionLevel Optimal -Force"`;
execSync(psCmd, { stdio: 'inherit' });

fs.rmSync(tempDir, { recursive: true, force: true });

const stats = fs.statSync(zipFile);
const sizeKB = (stats.size / 1024).toFixed(2);
console.log(`[R2 Bundle] SUCCESS: Created ${zipFile} (${sizeKB} KB)`);
