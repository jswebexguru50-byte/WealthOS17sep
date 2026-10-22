import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { ContradictionEngine } from '../../src/server/intelligence/services/ContradictionEngine.js';
import { ManagementClaim } from '../../src/server/intelligence/types/ManagementClaim.js';

describe('Phase 1B: Contradiction Engine Invariants', () => {
  let db: sqlite3.Database;
  let engine: ContradictionEngine;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    engine = new ContradictionEngine(db);

    await new Promise<void>((resolve, reject) => {
      db.run(`
        CREATE TABLE Contradictions (
          contradiction_id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          issuer_bse_code TEXT,
          severity TEXT NOT NULL,
          contradiction_type TEXT NOT NULL,
          claim_id TEXT,
          event_id TEXT,
          description TEXT NOT NULL,
          divergence_json TEXT,
          supporting_evidence_ids TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN',
          materiality TEXT NOT NULL DEFAULT 'THESIS_RELEVANT',
          left_evidence_id TEXT,
          right_evidence_id TEXT,
          detected_at TEXT,
          resolved_at TEXT,
          resolution_note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('detects a CLAIM_VS_RESULT contradiction when management guidance is missed', () => {
    const claim: ManagementClaim = {
      claimId: 'CLM_GUIDANCE_01',
      issuerNseSymbol: 'SOLARINDS',
      period: 'FY24',
      category: 'MARGIN',
      statement: 'EBITDA margin expected to remain resilient above 24%.',
      targetMetric: 'EBITDA_MARGIN',
      expectedValue: 24.0,
      expectedOutcome: 'Margin >= 24%',
      evidenceId: 'EV_CONCALL_Q3',
      status: 'MISSED',
      actualOutcomeMetric: 18.2,
      actualOutcomeDescription: 'Audited EBITDA margin dropped to 18.2%',
      resolutionEvidenceId: 'EV_AUDITED_FY24',
      createdAt: new Date().toISOString()
    };

    const contradiction = engine.evaluateClaimContradiction(claim);

    expect(contradiction).not.toBeNull();
    expect(contradiction?.type).toBe('CLAIM_VS_RESULT');
    expect(contradiction?.severity).toBe('HIGH');
    expect(contradiction?.materiality).toBe('HIGH');
    expect(contradiction?.leftEvidenceId).toBe('EV_CONCALL_Q3');
    expect(contradiction?.rightEvidenceId).toBe('EV_AUDITED_FY24');
    expect(contradiction?.supportingEvidenceIds).toContain('EV_CONCALL_Q3');
    expect(contradiction?.supportingEvidenceIds).toContain('EV_AUDITED_FY24');
  });

  it('[Legacy ContradictionEngine] marks governance missed contradiction with default MEDIUM severity', () => {
    const claim: ManagementClaim = {
      claimId: 'CLM_GOV_01',
      issuerNseSymbol: 'TESTCORP',
      period: 'FY24',
      category: 'GOVERNANCE',
      statement: 'Zero promoter share pledge and clean auditor signoff guaranteed.',
      evidenceId: 'EV_AR_01',
      status: 'MISSED',
      actualOutcomeDescription: 'Promoter pledged 35% of holding; auditor resigned citing disclosure gaps',
      resolutionEvidenceId: 'EV_BSE_FILING_01',
      createdAt: new Date().toISOString()
    };

    const contradiction = engine.evaluateClaimContradiction(claim);

    expect(contradiction).not.toBeNull();
    expect(contradiction?.severity).toBe('MEDIUM');
    expect(contradiction?.leftEvidenceId).toBe('EV_AR_01');
    expect(contradiction?.rightEvidenceId).toBe('EV_BSE_FILING_01');
  });

  it('does NOT create a contradiction for ACHIEVED claims', () => {
    const claim: ManagementClaim = {
      claimId: 'CLM_ACHIEVED_01',
      issuerNseSymbol: 'SOLARINDS',
      period: 'FY24',
      category: 'GROWTH',
      statement: 'Revenue to cross ₹6,000 Cr.',
      evidenceId: 'EV_01',
      status: 'ACHIEVED',
      actualOutcomeDescription: 'Revenue recorded at ₹6,450 Cr',
      createdAt: new Date().toISOString()
    };

    const contradiction = engine.evaluateClaimContradiction(claim);
    expect(contradiction).toBeNull();
  });

  it('records and retrieves contradictions from the database with multi-evidence columns cleanly', async () => {
    const claim: ManagementClaim = {
      claimId: 'CLM_PERSIST_01',
      issuerNseSymbol: 'APARINDS',
      period: 'FY24',
      category: 'DEBT',
      statement: 'Deleveraging to continue; debt to fall by 50%.',
      evidenceId: 'EV_APAR_01',
      status: 'MISSED',
      actualOutcomeDescription: 'Short-term debt rose by 20% to fund raw material working capital',
      resolutionEvidenceId: 'EV_APAR_RES_01',
      createdAt: new Date().toISOString()
    };

    const contradiction = engine.evaluateClaimContradiction(claim)!;
    await engine.recordContradiction(contradiction);

    const retrieved = await engine.getContradictionsForIssuer('APARINDS');
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].claimId).toBe('CLM_PERSIST_01');
    expect(retrieved[0].status).toBe('OPEN');
    expect(retrieved[0].leftEvidenceId).toBe('EV_APAR_01');
    expect(retrieved[0].rightEvidenceId).toBe('EV_APAR_RES_01');
  });

  it('rejects saving contradiction if either leftEvidenceId or rightEvidenceId is missing', async () => {
    const invalidContra: any = {
      contradictionId: 'INVALID_01',
      issuerNseSymbol: 'TEST',
      severity: 'HIGH',
      type: 'CLAIM_VS_RESULT',
      description: 'Invalid contradiction lacking dual evidence',
      leftEvidenceId: 'EV_01',
      rightEvidenceId: '', // missing
      supportingEvidenceIds: [],
      status: 'OPEN',
      materiality: 'HIGH'
    };

    await expect(engine.recordContradiction(invalidContra)).rejects.toThrow(/Both leftEvidenceId and rightEvidenceId are required/);
  });
});
