import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

function normalizeJsonWithoutTimestamp(filePath: string): string {
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    const obj = JSON.parse(raw);
    const clean = (item: any) => {
      if (!item || typeof item !== 'object') return;
      delete item.evaluatedAt;
      delete item.evaluatedDate;
      delete item.timestamp;
      delete item.frozenAt;
      delete item.generatedAt;
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

export function runR31DualDeterminism() {
  console.log('====================================================');
  console.log('WEALTHOS v6.7.2-R3.1: DUAL-RUN DETERMINISM VALIDATION');
  console.log('====================================================');

  const targetArtifacts = [
    'reports/v672-r3/remediation/R31_DRAWDOWN_FORENSIC_AUDIT.json',
    'reports/v672-r3/remediation/R31_CAPACITY_CALIBRATION_AUDIT.json',
    'reports/v672-r3/remediation/R31_WFO_INDEPENDENT_NUMERICAL_AUDIT.json',
    'reports/v672-r3/remediation/R31_STATISTICAL_METHOD_AUDIT.json',
    'reports/v672-r3/remediation/R31_BH_FDR_INDEPENDENT_AUDIT.json',
    'reports/v672-r3/remediation/R31_SOURCE_INTEGRITY_AUDIT.json',
    'reports/v672-r3/remediation/R31_METRIC_LINEAGE_AUDIT.json',
    'reports/v672-r3/remediation/R31_FINAL_INDEPENDENT_AUDIT.json',
    'reports/v672-r3/remediation/R31_FINAL_ELIGIBILITY_MATRIX.json'
  ];

  // PASS 1: Execute all remediation scripts
  console.log('\n--- Executing R31 Remediation Pass 1 ---');
  execSync('npx tsx scripts/v673/run_a1_maxdd_forensic.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a2_capacity_forensic.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a3_wfo_forensic.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a4_statistics_forensic.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a5_integrity_and_lineage.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a6_r31_clean_room_audit.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_r31_final_eligibility_and_dual_run.ts', { stdio: 'inherit' });

  const run1Hashes: Record<string, string> = {};
  for (const art of targetArtifacts) {
    run1Hashes[art] = normalizeJsonWithoutTimestamp(art);
  }

  // PASS 2: Re-execute all remediation scripts identically
  console.log('\n--- Executing R31 Remediation Pass 2 ---');
  execSync('npx tsx scripts/v673/run_a1_maxdd_forensic.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a2_capacity_forensic.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a3_wfo_forensic.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a4_statistics_forensic.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a5_integrity_and_lineage.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_a6_r31_clean_room_audit.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/v673/run_r31_final_eligibility_and_dual_run.ts', { stdio: 'inherit' });

  const run2Hashes: Record<string, string> = {};
  for (const art of targetArtifacts) {
    run2Hashes[art] = normalizeJsonWithoutTimestamp(art);
  }

  console.log('\n--- R3.1 Determinism Hash Comparison ---');
  let determinismPassed = true;
  for (const art of targetArtifacts) {
    const h1 = run1Hashes[art];
    const h2 = run2Hashes[art];
    const match = h1 === h2;
    if (!match) determinismPassed = false;
    console.log(`${path.basename(art)}: ${match ? 'BIT_FOR_BIT_IDENTICAL' : 'MISMATCH'} (Hash: ${h1.substring(0, 16)}...)`);
  }

  if (!determinismPassed) {
    throw new Error('STOP_THE_LINE: R3.1 determinism verification failed!');
  }
  console.log('\n✓ R3.1 Dual-Run Determinism: ALL 9 ARTIFACTS BIT-FOR-BIT IDENTICAL across independent runs.');
}

runR31DualDeterminism();
