import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

function hashFile(p: string): string {
  if (!fs.existsSync(p)) return 'MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

export function runDeterminismValidation() {
  console.log('====================================================');
  console.log('WEALTHOS v6.7.2-R3: DETERMINISM VALIDATION (RUN 1 vs RUN 2)');
  console.log('====================================================');

  const targetArtifacts = [
    'reports/v672-r3/final/R3_INDEPENDENT_AUDIT.json',
    'reports/v672-r3/final/R3_PIT_INDEPENDENT_AUDIT.json',
    'reports/v672-r3/final/R3_REGIME_RESULTS.json',
    'reports/v672-r3/final/R3_COST_ROBUSTNESS.json',
    'reports/v672-r3/final/R3_CAPACITY_RESULTS.json',
    'reports/v672-r3/final/R3_OPPORTUNITY_SUPPRESSION.json',
    'reports/v672-r3/final/R3_WFO_INDEPENDENT_AUDIT.json',
    'reports/v672-r3/final/R3_BOOTSTRAP_RESULTS.json',
    'reports/v672-r3/final/R3_HYPOTHESIS_TEST_RESULTS.json',
    'reports/v672-r3/final/R3_BH_FDR_RESULTS.json',
    'reports/v672-r3/final/R3_FINAL_ELIGIBILITY_MATRIX.json'
  ];

  // Helper to snapshot contents without evaluatedAt timestamp diffs
  function normalizeJsonWithoutTimestamp(filePath: string): string {
    const raw = fs.readFileSync(filePath, 'utf-8');
    try {
      const obj = JSON.parse(raw);
      // Delete non-deterministic timestamps for bit-for-bit math verification
      const clean = (item: any) => {
        if (!item || typeof item !== 'object') return;
        delete item.evaluatedAt;
        delete item.evaluatedDate;
        delete item.timestamp;
        for (const k of Object.keys(item)) {
          clean(item[k]);
        }
      };
      clean(obj);
      return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
    } catch {
      return crypto.createHash('sha256').update(raw).digest('hex');
    }
  }

  // PASS 1: Execute downstream pipeline
  console.log('\n--- Executing Downstream Run 1 ---');
  execSync('npx tsx scripts/v673/run_a6_audit.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a6_pit_source_audit.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a4_risk_robustness.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a5_statistics.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_wfo_and_contamination_audit.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_final_gate_and_eligibility.ts', { stdio: 'inherit' });

  const run1Hashes: Record<string, string> = {};
  for (const art of targetArtifacts) {
    run1Hashes[art] = normalizeJsonWithoutTimestamp(art);
  }

  // PASS 2: Re-execute downstream pipeline identically
  console.log('\n--- Executing Downstream Run 2 ---');
  execSync('npx tsx scripts/v673/run_a6_audit.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a6_pit_source_audit.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a4_risk_robustness.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a5_statistics.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_wfo_and_contamination_audit.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_final_gate_and_eligibility.ts', { stdio: 'inherit' });

  const run2Hashes: Record<string, string> = {};
  for (const art of targetArtifacts) {
    run2Hashes[art] = normalizeJsonWithoutTimestamp(art);
  }

  console.log('\n--- Downstream Determinism Hash Comparison ---');
  let determinismPassed = true;
  for (const art of targetArtifacts) {
    const h1 = run1Hashes[art];
    const h2 = run2Hashes[art];
    const match = h1 === h2;
    if (!match) determinismPassed = false;
    console.log(`${path.basename(art)}: ${match ? 'BIT_FOR_BIT_IDENTICAL' : 'MISMATCH'} (Hash: ${h1.substring(0, 16)}...)`);
  }

  if (!determinismPassed) {
    throw new Error('STOP_THE_LINE: Downstream determinism verification failed!');
  }
  console.log('\n✓ Downstream Determinism: ALL 11 ARTIFACTS BIT-FOR-BIT IDENTICAL across independent runs.');
}

runDeterminismValidation();
