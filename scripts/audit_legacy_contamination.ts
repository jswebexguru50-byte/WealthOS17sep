/**
 * scripts/audit_legacy_contamination.ts
 *
 * WEALTHOS v6.3 — LEGACY CONTAMINATION AUDIT ENGINE
 * Scans active artifact set for legacy run IDs, legacy PFs, and un-remediated trade counts.
 * Asserts unlabeledLegacyReferences === 0.
 */

import fs from 'node:fs';
import path from 'node:path';

const CANONICAL_RUN_ID = "v6.3_REAL_T1_EXECUTION_REMEDIATED_1789650500000";
const WORKSPACE_ROOT = process.cwd();
const DATA_DIR = path.join(WORKSPACE_ROOT, 'data');
const DOCS_DIR = path.join(WORKSPACE_ROOT, 'docs');

interface ContaminationFinding {
  filePath: string;
  term: string;
  lineNumber: number;
  lineSnippet: string;
  classification: "CANONICAL" | "LEGACY_INVALID_EXECUTION_MODEL" | "SUPERSEDED" | "DOCUMENTARY_REFERENCE" | "UNLABELED_CONTAMINATION";
}

async function runContaminationAudit() {
  console.log('================================================================');
  console.log('   WEALTHOS v6.3 LEGACY CONTAMINATION AUDIT RUN                 ');
  console.log('================================================================\n');

  const activeFiles: string[] = [];

  function collectFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && (e.name.endsWith('.json') || e.name.endsWith('.md'))) {
        activeFiles.push(path.join(dir, e.name));
      }
    }
  }

  collectFiles(DATA_DIR);
  collectFiles(DOCS_DIR);

  const findings: ContaminationFinding[] = [];
  let unlabeledLegacyReferences = 0;
  let totalLegacyReferences = 0;

  for (const filePath of activeFiles) {
    const fileName = path.basename(filePath);
    // Ignore legacy contamination audit itself and raw database dumps
    if (fileName.includes('legacy_contamination_audit') || fileName.includes('dataset_dump')) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      const termsToTest: string[] = [];

      if (line.includes('RUN-V63-REAL-1789627995643')) termsToTest.push('RUN-V63-REAL-1789627995643');
      if (line.includes('1.209')) termsToTest.push('1.209');
      if (line.includes('15426')) termsToTest.push('15426');
      if (/\b1128\b/.test(line) && !line.includes('20251128') && !line.includes('20241128') && !lower.includes('volume') && !lower.includes('turnover')) {
        termsToTest.push('1128');
      }

      for (const term of termsToTest) {
        totalLegacyReferences++;
        let classification: ContaminationFinding["classification"] = "UNLABELED_CONTAMINATION";

        if (
          line.includes("LEGACY_INVALID_EXECUTION_MODEL") ||
          lower.includes("quarantined") ||
          lower.includes("legacy") ||
          lower.includes("discarded") ||
          lower.includes("historical") ||
          lower.includes("previous result")
        ) {
          classification = "LEGACY_INVALID_EXECUTION_MODEL";
        } else if (lower.includes("reference") || lower.includes("baseline") || lower.includes("doc")) {
          classification = "DOCUMENTARY_REFERENCE";
        } else if (lower.includes("superseded")) {
          classification = "SUPERSEDED";
        }

        if (classification === "UNLABELED_CONTAMINATION") {
          unlabeledLegacyReferences++;
        }

        findings.push({
          filePath: path.relative(WORKSPACE_ROOT, filePath),
          term,
          lineNumber: idx + 1,
          lineSnippet: line.trim(),
          classification
        });
      }
    });
  }

  const auditResult = {
    canonicalRunId: CANONICAL_RUN_ID,
    runId: CANONICAL_RUN_ID,
    dataMode: "REAL_HISTORICAL",
    totalFilesScanned: activeFiles.length,
    legacyReferencesFound: totalLegacyReferences,
    unlabeledLegacyReferences,
    findings,
    status: unlabeledLegacyReferences === 0 ? "PASS" : "FAIL",
    auditedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(DATA_DIR, 'v6.3_REAL_legacy_contamination_audit.json'),
    JSON.stringify(auditResult, null, 2),
    'utf8'
  );

  console.log(`Scanned ${activeFiles.length} files. Total legacy references found: ${totalLegacyReferences}`);
  console.log(`Unlabeled legacy references: ${unlabeledLegacyReferences}`);
  console.log(`Contamination Audit Status: ${auditResult.status}`);
  console.log(`✓ Generated data/v6.3_REAL_legacy_contamination_audit.json\n`);

  if (unlabeledLegacyReferences > 0) {
    console.error('FAIL: Found unlabeled legacy references in active artifacts!');
    process.exit(1);
  }
}

runContaminationAudit().catch(err => {
  console.error('Fatal Contamination Audit Error:', err);
  process.exit(1);
});
