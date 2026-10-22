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

export function createR311BaselineCheckpoint() {
  console.log('====================================================');
  console.log('WEALTHOS v6.7.2-R3.1.1: PHASE 0 BASELINE CHECKPOINT');
  console.log('====================================================');

  const canonicalLedger = 'data/v6.5/runs/REPLAY_V65_ED18F3B9A403/v65_economic_replay_ledger.jsonl';
  const frozenManifestPath = 'config/v67/FROZEN_V63_CONTROL_MANIFEST.json';

  // 1. Verify canonical ledger
  const ledgerHash = hashFile(canonicalLedger);
  const expectedLedgerSha = 'f2177c218c0fee5e139d563fff3f43f2b9a2ad75cdae4c96ff9228cb71a1fec3';
  if (ledgerHash.sha256 !== expectedLedgerSha) {
    throw new Error(`STOP_THE_LINE: Canonical ledger hash mismatch! ${ledgerHash.sha256}`);
  }
  console.log('✓ Canonical ledger SHA-256 verified bit-for-bit.');

  // 2. Verify all 7 frozen v6.3 controls
  const frozenManifest = JSON.parse(fs.readFileSync(frozenManifestPath, 'utf-8'));
  const verifiedFrozenControls: Record<string, any> = {};
  for (const art of frozenManifest.artifacts) {
    const h = hashFile(art.path);
    if (h.sha256 !== art.sha256) {
      throw new Error(`STOP_THE_LINE: Frozen v6.3 control mismatch at ${art.path}`);
    }
    verifiedFrozenControls[art.path] = { expected: art.sha256, actual: h.sha256, verified: true };
  }
  console.log('✓ All 7 frozen v6.3 control components verified bit-for-bit.');

  // 3. Hash existing R3.1 remediation artifacts
  const r31RemediationDir = 'reports/v672-r3/remediation';
  const r31Files = fs.readdirSync(r31RemediationDir).filter(f => f.startsWith('R31_') && f.endsWith('.json'));
  const hashedR31Artifacts: Record<string, any> = {};
  for (const file of r31Files) {
    const fullPath = path.join(r31RemediationDir, file).replace(/\\/g, '/');
    hashedR31Artifacts[file] = { path: fullPath, ...hashFile(fullPath) };
  }

  // 4. Hash all R3 final artifacts
  const r3FinalDir = 'reports/v672-r3/final';
  const r3FinalFiles = fs.readdirSync(r3FinalDir).filter(f => f.endsWith('.json') || f.endsWith('.md'));
  const hashedR3FinalArtifacts: Record<string, any> = {};
  for (const file of r3FinalFiles) {
    const fullPath = path.join(r3FinalDir, file).replace(/\\/g, '/');
    hashedR3FinalArtifacts[file] = { path: fullPath, ...hashFile(fullPath) };
  }

  // Registries IDs
  const expRegistry = JSON.parse(fs.readFileSync('reports/v672-r3/final/R3_EXPERIMENT_REGISTRY.json', 'utf-8'));
  const cfgRegistry = JSON.parse(fs.readFileSync('reports/v672-r3/final/R3_CONFIGURATION_REGISTRY.json', 'utf-8'));
  const experimentIds = (expRegistry.experiments || expRegistry || []).map((e: any) => e.experimentId || e);
  const configurationIds = (cfgRegistry.configurations || cfgRegistry || []).map((c: any) => c.configurationId || c);

  const checkpoint = {
    checkpointId: 'CHK-R311-BASELINE-FREEZE',
    frozenAt: new Date().toISOString(),
    status: 'PASS',
    gitCommit: 'PORTABLE_RELEASE_GIT_HEAD',
    runId: 'R311_FORENSIC_ORCHESTRATION_MASTER',
    canonicalLedger: {
      path: canonicalLedger,
      sha256: expectedLedgerSha,
      verified: true
    },
    frozenV63Controls: verifiedFrozenControls,
    experimentIds,
    configurationIds,
    r31RemediationArtifacts: hashedR31Artifacts,
    r3FinalArtifacts: hashedR3FinalArtifacts
  };

  fs.writeFileSync('reports/v672-r3/remediation/R311_BASELINE_CHECKPOINT.json', JSON.stringify(checkpoint, null, 2));
  console.log(`R311_BASELINE_CHECKPOINT.json created successfully (${r31Files.length} R3.1 artifacts, ${r3FinalFiles.length} R3 final artifacts frozen).`);
}

createR311BaselineCheckpoint();
