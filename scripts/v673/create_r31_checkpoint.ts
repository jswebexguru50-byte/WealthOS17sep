import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

function hashFile(filePath: string): { exists: boolean; size: number; sha256: string } {
  if (!fs.existsSync(filePath)) {
    return { exists: false, size: 0, sha256: 'NOT_FOUND' };
  }
  const bytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  return { exists: true, size: bytes.length, sha256 };
}

export function createR31BaselineCheckpoint() {
  console.log('====================================================');
  console.log('WEALTHOS v6.7.2-R3.1: PHASE R31-0 BASELINE CHECKPOINT');
  console.log('====================================================');

  // 1. Target files to freeze
  const canonicalLedger = 'data/v6.5/runs/REPLAY_V65_ED18F3B9A403/v65_economic_replay_ledger.jsonl';
  const frozenV63Manifest = 'config/v67/FROZEN_V63_CONTROL_MANIFEST.json';

  const r3SourceFiles = [
    'src/server/services/research/r3/BaselineControlManager.ts',
    'src/server/services/research/r3/ResearchSnapshotManager.ts',
    'src/server/services/research/r3/ResearchDataBinding.ts',
    'src/server/services/research/r3/ResearchHypothesisRegistry.ts',
    'src/server/services/research/r3/ResearchExperimentRegistry.ts',
    'src/server/services/research/r3/ResearchConfigurationRegistry.ts',
    'src/server/services/research/r3/CandidateFilterEngine.ts',
    'src/server/services/research/r3/CandidateStrategyAdapter.ts',
    'src/server/services/research/r3/CandidateFilterImplementations.ts',
    'src/server/services/research/r3/ResearchBacktestEngine.ts',
    'src/server/services/research/r3/ResearchWalkForwardEngine.ts',
    'src/server/services/research/r3/ResearchContaminationDetector.ts',
    'src/server/services/research/r3/ResearchLeakageDetector.ts',
    'src/server/services/research/r3/ResearchOpportunitySuppressionAnalyzer.ts',
    'src/server/services/research/r3/IndependentCleanRoomAuditor.ts'
  ];

  const frozenV63CodeFiles = [
    'src/server/services/trading/PureTechnicalStrategiesEngine.ts',
    'src/server/services/trading/StrategyParameterConfig.ts',
    'src/server/services/trading/SignalQualityOverlay.ts',
    'src/server/services/trading/CapitalProtectionEngine.ts',
    'src/server/services/trading/NewTechnicalStrategiesEngine.ts',
    'src/server/services/trading/UpstoxIntradayIngestor.ts',
    'data/v6.3_REAL_trade_identity_ledger.jsonl'
  ];

  const finalArtifactsDir = 'reports/v672-r3/final';
  const finalArtifactNames = fs.readdirSync(finalArtifactsDir);

  const hashedFinalArtifacts: Record<string, any> = {};
  for (const name of finalArtifactNames) {
    const fullPath = path.join(finalArtifactsDir, name).replace(/\\/g, '/');
    hashedFinalArtifacts[name] = { path: fullPath, ...hashFile(fullPath) };
  }

  const hashedSourceFiles: Record<string, any> = {};
  for (const file of r3SourceFiles) {
    hashedSourceFiles[path.basename(file)] = { path: file, ...hashFile(file) };
  }

  const hashedFrozenControls: Record<string, any> = {};
  for (const file of frozenV63CodeFiles) {
    hashedFrozenControls[path.basename(file)] = { path: file, ...hashFile(file) };
  }

  // Registries content inspections
  const hypRegistry = JSON.parse(fs.readFileSync('reports/v672-r3/final/R3_HYPOTHESIS_REGISTRY.json', 'utf-8'));
  const expRegistry = JSON.parse(fs.readFileSync('reports/v672-r3/final/R3_EXPERIMENT_REGISTRY.json', 'utf-8'));
  const cfgRegistry = JSON.parse(fs.readFileSync('reports/v672-r3/final/R3_CONFIGURATION_REGISTRY.json', 'utf-8'));

  const experimentIds = (expRegistry.experiments || expRegistry || []).map((e: any) => e.experimentId || e);
  const configurationIds = (cfgRegistry.configurations || cfgRegistry || []).map((c: any) => c.configurationId || c);

  const checkpoint = {
    checkpointId: 'CHK-R31-BASELINE-FREEZE',
    frozenAt: new Date().toISOString(),
    status: 'PASS',
    gitCommit: 'PORTABLE_RELEASE_GIT_HEAD',
    runId: 'R3_RESEARCH_ORCHESTRATION_MASTER',
    canonicalLedger: {
      path: canonicalLedger,
      expectedSha256: 'f2177c218c0fee5e139d563fff3f43f2b9a2ad75cdae4c96ff9228cb71a1fec3',
      ...hashFile(canonicalLedger)
    },
    frozenV63Manifest: {
      path: frozenV63Manifest,
      ...hashFile(frozenV63Manifest)
    },
    experimentIds,
    configurationIds,
    finalArtifactsCount: finalArtifactNames.length,
    finalArtifacts: hashedFinalArtifacts,
    r3SourceFiles: hashedSourceFiles,
    frozenV63Controls: hashedFrozenControls
  };

  const isLedgerValid = checkpoint.canonicalLedger.sha256 === checkpoint.canonicalLedger.expectedSha256;
  if (!isLedgerValid) {
    throw new Error('STOP_THE_LINE: Canonical ledger SHA-256 mismatch during checkpoint freeze!');
  }

  fs.writeFileSync('reports/v672-r3/remediation/R31_BASELINE_CHECKPOINT.json', JSON.stringify(checkpoint, null, 2));
  console.log(`R31_BASELINE_CHECKPOINT.json written successfully (${finalArtifactNames.length} final artifacts, ${r3SourceFiles.length} source files, 7 frozen v6.3 controls).`);
}

createR31BaselineCheckpoint();
