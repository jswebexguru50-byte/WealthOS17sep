import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

console.log('Packaging WealthOS / ITAS v6.3 End-To-End Master Bundle...');

const targetDir = 'C:\\Users\\gopal\\Downloads\\WealthOS_ITAS_v6.3_End_To_End_Complete_Code';
const zipPath = 'C:\\Users\\gopal\\Downloads\\WealthOS_ITAS_v6.3_End_To_End_Complete_Code.zip';

if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

const filesToCopy = [
  // Core Research Services
  { src: 'src/server/services/research/types.ts', dest: 'src/server/services/research/types.ts' },
  { src: 'src/server/services/research/TradingCalendarService.ts', dest: 'src/server/services/research/TradingCalendarService.ts' },
  { src: 'src/server/services/research/ResearchManifestEngine.ts', dest: 'src/server/services/research/ResearchManifestEngine.ts' },
  { src: 'src/server/services/research/PointInTimeDataEngine.ts', dest: 'src/server/services/research/PointInTimeDataEngine.ts' },
  { src: 'src/server/services/research/ExecutionSimulator.ts', dest: 'src/server/services/research/ExecutionSimulator.ts' },
  { src: 'src/server/services/research/TransactionCostEngine.ts', dest: 'src/server/services/research/TransactionCostEngine.ts' },
  { src: 'src/server/services/research/IdealizedRiskOracle.ts', dest: 'src/server/services/research/IdealizedRiskOracle.ts' },
  { src: 'src/server/services/research/AblationEngine.ts', dest: 'src/server/services/research/AblationEngine.ts' },
  { src: 'src/server/services/research/StatisticsEngine.ts', dest: 'src/server/services/research/StatisticsEngine.ts' },
  { src: 'src/server/services/research/PromotionGate.ts', dest: 'src/server/services/research/PromotionGate.ts' },
  { src: 'src/server/services/research/WalkForwardResearchEngine.ts', dest: 'src/server/services/research/WalkForwardResearchEngine.ts' },
  { src: 'src/server/services/research/FrozenSignalAdapter.ts', dest: 'src/server/services/research/FrozenSignalAdapter.ts' },

  // Tests
  { src: 'tests/unit/point_in_time_data_integrity.test.ts', dest: 'tests/unit/point_in_time_data_integrity.test.ts' },
  { src: 'tests/integration/r1_integrated_fixture.test.ts', dest: 'tests/integration/r1_integrated_fixture.test.ts' },

  // Execution & Gate Scripts
  { src: 'scripts/run_r1_gate.mjs', dest: 'scripts/run_r1_gate.mjs' },
  { src: 'scripts/create_r1_run_manifest.mjs', dest: 'scripts/create_r1_run_manifest.mjs' },
  { src: 'scripts/run_v6.3_e2e.mjs', dest: 'scripts/run_v6.3_e2e.mjs' },
  { src: 'scripts/execute_full_v6.3_research_pipeline.mjs', dest: 'scripts/execute_full_v6.3_research_pipeline.mjs' },

  // Data Manifests & Outputs
  { src: 'data/v6.2.0_frozen_manifest.json', dest: 'data/v6.2.0_frozen_manifest.json' },
  { src: 'data/R1_LOCKBOX_POLICY.json', dest: 'data/R1_LOCKBOX_POLICY.json' },
  { src: 'data/v6.3_e2e_research_results.json', dest: 'data/v6.3_e2e_research_results.json' }
];

for (const item of filesToCopy) {
  const fullSrc = path.resolve(item.src);
  const fullDest = path.join(targetDir, item.dest);
  fs.mkdirSync(path.dirname(fullDest), { recursive: true });
  fs.copyFileSync(fullSrc, fullDest);
  console.log(`Copied: ${item.src} -> ${item.dest}`);
}

// Write README_E2E_RESEARCH.md
const readmeContent = `# WealthOS / ITAS v6.3: Complete End-To-End Empirical Research & PIT Pipeline

## Operational Status: R1 & R2 Passed, R3 Walk-Forward Executed
- **R1 PIT Engine**: 11/11 tests passing, 0 lookahead contamination, fail-closed data semantics.
- **R2 Execution Simulator**: Multi-bar execution, 25+ field Trade Identity Ledger, Indian delivery cost model.
- **R3 Empirical Research**: Arm A (Raw), Arm B (v6.2 Overlay), Arm C (Challengers), Arm D (Risk Oracle), Cumulative & Leave-One-Out Ablation, Rolling 36m/12m Walk-Forward OOS, 1000-iteration Bootstrap Expectancy, 5-tier Cost Sensitivity (0.75x to 2.00x), and Precommitted Promotion Gates.

## Quick Execution Commands
\`\`\`bash
# 1. Run R1 Gate Tests
node scripts/run_r1_gate.mjs

# 2. Run Full End-To-End Empirical Research Pipeline
npx tsx scripts/execute_full_v6.3_research_pipeline.mjs

# 3. Create R1 Research Run Manifest
node scripts/create_r1_run_manifest.mjs
\`\`\`

## Architecture Invariants
- \`v6.2.0-FROZEN\` production baseline remains strictly read-only.
- All research infrastructure resides in \`src/server/services/research/\`.
`;

fs.writeFileSync(path.join(targetDir, 'README_E2E_RESEARCH.md'), readmeContent, 'utf8');

// Copy DEVELOPER_APP_MASTER_TASK.md if exists in bundle
const masterTaskSrc = 'C:\\Users\\gopal\\Downloads\\WealthOS_ITAS_v6.3_END_TO_END_DEVELOPER_BUNDLE_EXTRACTED\\DEVELOPER_APP_MASTER_TASK.md';
if (fs.existsSync(masterTaskSrc)) {
  fs.copyFileSync(masterTaskSrc, path.join(targetDir, 'DEVELOPER_APP_MASTER_TASK.md'));
}

// Create ZIP archive
const zip = new AdmZip();
zip.addLocalFolder(targetDir);
zip.writeZip(zipPath);
console.log(`\nSuccessfully created complete export bundle:`);
console.log(`Folder: ${targetDir}`);
console.log(`Zip:    ${zipPath}`);
