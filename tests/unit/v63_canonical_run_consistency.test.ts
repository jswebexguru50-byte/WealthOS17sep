import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe("v6.3 Canonical Run Consistency", () => {
  const dataDir = path.resolve(process.cwd(), 'data');
  const canonicalManifestPath = path.join(dataDir, 'v6.3_REAL_CANONICAL_RUN.json');

  it("verifies canonical run manifest exists and is schemaVersion 1.1", () => {
    expect(fs.existsSync(canonicalManifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(canonicalManifestPath, 'utf8'));
    expect(manifest.schemaVersion).toBe("1.1");
    expect(manifest.canonicalRunId).toBe("v6.3_REAL_T1_EXECUTION_REMEDIATED_1789650500000");
    expect(manifest.executionInvariantStatus).toBe("PASS");
    expect(manifest.promotionStatus).toBe("NOT_AUTHORIZED");
  });

  it("enforces canonical run ID matching across all active artifacts", () => {
    const canonicalManifest = JSON.parse(fs.readFileSync(canonicalManifestPath, 'utf8'));
    const canonicalRunId = canonicalManifest.canonicalRunId;

    const artifactsToCheck = [
      'v6.3_REAL_walk_forward_results.json',
      'v6.3_REAL_ablation_results.json',
      'v6.3_REAL_cost_sensitivity.json',
      'v6.3_REAL_regime_results.json',
      'v6.3_REAL_final_lockbox.json',
      'v6.3_REAL_ledger_audit_summary.json',
      'v6.3_REAL_research_run_manifest.json'
    ];

    for (const file of artifactsToCheck) {
      const filePath = path.join(dataDir, file);
      if (fs.existsSync(filePath)) {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const artifactRunId = content.canonicalRunId || content.runId;
        expect(artifactRunId, `Artifact ${file} runId mismatch`).toBe(canonicalRunId);
        expect(artifactRunId, `Artifact ${file} uses legacy run ID`).not.toBe("RUN-V63-REAL-1789627995643");
      }
    }
  });

  it("verifies ledger SHA-256 consistency across canonical manifest, audit summary, and lockbox", () => {
    const ledgerPath = fs.existsSync(path.join(dataDir, 'v6.3_REAL_trade_identity_ledger.jsonl'))
      ? path.join(dataDir, 'v6.3_REAL_trade_identity_ledger.jsonl')
      : path.join(dataDir, 'v6.3_trade_identity_ledger.jsonl');

    expect(fs.existsSync(ledgerPath)).toBe(true);
    const ledgerBytes = fs.readFileSync(ledgerPath);
    const actualLedgerSha = crypto.createHash('sha256').update(ledgerBytes).digest('hex');

    const canonicalManifest = JSON.parse(fs.readFileSync(canonicalManifestPath, 'utf8'));
    expect(canonicalManifest.ledgerSha256, "Canonical manifest ledgerSha256 mismatch").toBe(actualLedgerSha);

    const auditSummaryPath = path.join(dataDir, 'v6.3_REAL_ledger_audit_summary.json');
    if (fs.existsSync(auditSummaryPath)) {
      const auditSummary = JSON.parse(fs.readFileSync(auditSummaryPath, 'utf8'));
      expect(auditSummary.ledgerSha256, "Audit summary ledgerSha256 mismatch").toBe(actualLedgerSha);
    }

    const lockboxPath = path.join(dataDir, 'v6.3_REAL_final_lockbox.json');
    if (fs.existsSync(lockboxPath)) {
      const lockbox = JSON.parse(fs.readFileSync(lockboxPath, 'utf8'));
      expect(lockbox.ledgerSha256 || lockbox.ledgerHash, "Lockbox ledger SHA mismatch").toBe(actualLedgerSha);
    }
  });

  it("verifies lockbox SHA-256 file matches computed hash of lockbox JSON", () => {
    const lockboxPath = path.join(dataDir, 'v6.3_REAL_final_lockbox.json');
    const lockboxShaPath = path.join(dataDir, 'v6.3_REAL_final_lockbox.sha256');

    expect(fs.existsSync(lockboxPath)).toBe(true);
    expect(fs.existsSync(lockboxShaPath)).toBe(true);

    const lockboxContent = fs.readFileSync(lockboxPath, 'utf8');
    const expectedSha = crypto.createHash('sha256').update(lockboxContent).digest('hex');
    const actualSha = fs.readFileSync(lockboxShaPath, 'utf8').trim();

    expect(actualSha).toBe(expectedSha);
  });
});
