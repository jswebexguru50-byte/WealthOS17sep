import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';

const {
  runQualityGate,
  partitionByQualityGate,
  persistThroughQualityGate
} = require('../../pipeline/quality-gate.cjs');

describe('Constitution Rule 5: Dynamic Runtime Chokepoint & Enforcement Integration Test', () => {
  let db: any;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    await new Promise<void>((resolve, reject) => {
      db.run(`
        CREATE TABLE SecurityDossierSnapshots (
          symbol TEXT PRIMARY KEY,
          company_name TEXT,
          full_dossier_json TEXT,
          updated_at TEXT
        )
      `, (err: any) => {
        if (err) return reject(err);
        db.run(`
          INSERT INTO SecurityDossierSnapshots (symbol, company_name, full_dossier_json)
          VALUES ('TESTSCRIP', 'Test Scrip Limited', '{"operationalMoat":{"qualitativeTier":"STATUTORY_ONLY_NO_CONCALL"}}')
        `, (iErr: any) => {
          if (iErr) reject(iErr);
          else resolve();
        });
      });
    });
  });

  afterEach(async () => {
    if (db) {
      await new Promise<void>((resolve) => db.close(() => resolve()));
    }
  });

  it('proves valid evidence-grounded assertion successfully passes quality gate and updates serving tier', async () => {
    const validAssertion = {
      assertionId: 'TESTSCRIP:managementOutlook:1001',
      scripId: 'TESTSCRIP',
      field: 'managementOutlook',
      value: 'The Company focuses on selective exploration of profitable, feasible and sustainable projects.',
      status: 'VERIFIED',
      evidenceIds: ['TESTSCRIP:doc123:p42'],
      confidence: 0.70,
      sourceCount: 1,
      extractionMethod: 'LLM',
      methodologyVersion: 'mda-extractor-v1.0.0',
      createdAt: new Date().toISOString()
    };

    // Quality gate evaluation
    const check = runQualityGate(validAssertion);
    expect(check.pass).toBe(true);
    expect(check.reason).toBeNull();

    // Persist through quality gate chokepoint
    const result = await persistThroughQualityGate(db, [validAssertion]);
    expect(result.passedCount).toBe(1);
    expect(result.quarantinedCount).toBe(0);

    // Verify row was written to ForensicAssertions
    const assertionRow: any = await new Promise((res, rej) => {
      db.get(`SELECT * FROM ForensicAssertions WHERE assertionId = ?`, [validAssertion.assertionId], (e: any, r: any) => e ? rej(e) : res(r));
    });
    expect(assertionRow).toBeDefined();
    expect(assertionRow.scripId).toBe('TESTSCRIP');

    // Verify serving snapshot tier was promoted to ANNUAL_REPORT_BACKED
    const dossierRow: any = await new Promise((res, rej) => {
      db.get(`SELECT full_dossier_json FROM SecurityDossierSnapshots WHERE symbol = ?`, ['TESTSCRIP'], (e: any, r: any) => e ? rej(e) : res(r));
    });
    const fd = JSON.parse(dossierRow.full_dossier_json);
    expect(fd.operationalMoat.qualitativeTier).toBe('ANNUAL_REPORT_BACKED');
    expect(fd.operationalMoat.evidenceBackedFields).toContain('managementOutlook');
  });

  it('strictly blocks invalid assertions at runtime, routes them to quarantine, and prevents serving table mutation', async () => {
    const invalidAssertions = [
      // Case A: Missing evidenceIds
      {
        assertionId: 'TESTSCRIP:demandTone:2001',
        scripId: 'TESTSCRIP',
        field: 'demandTone',
        value: 'Growth is strong',
        status: 'VERIFIED',
        evidenceIds: [], // VIOLATION
        confidence: 0.70,
        sourceCount: 1,
        extractionMethod: 'LLM',
        methodologyVersion: 'mda-extractor-v1.0.0',
        createdAt: new Date().toISOString()
      },
      // Case B: Confidence exceeds LLM single-source cap of 0.70
      {
        assertionId: 'TESTSCRIP:capexPlans:2002',
        scripId: 'TESTSCRIP',
        field: 'capexPlans',
        value: 'New capex planned',
        status: 'VERIFIED',
        evidenceIds: ['TESTSCRIP:doc123:p10'],
        confidence: 0.95, // VIOLATION
        sourceCount: 1,
        extractionMethod: 'LLM',
        methodologyVersion: 'mda-extractor-v1.0.0',
        createdAt: new Date().toISOString()
      },
      // Case C: Invalid status
      {
        assertionId: 'TESTSCRIP:keyRisks:2003',
        scripId: 'TESTSCRIP',
        field: 'keyRisks',
        value: 'High inflation',
        status: 'SOME_FAKE_STATUS', // VIOLATION
        evidenceIds: ['TESTSCRIP:doc123:p15'],
        confidence: 0.5,
        sourceCount: 1,
        extractionMethod: 'LLM',
        methodologyVersion: 'mda-extractor-v1.0.0',
        createdAt: new Date().toISOString()
      }
    ];

    for (const bad of invalidAssertions) {
      const check = runQualityGate(bad);
      expect(check.pass).toBe(false);
      expect(check.reason).toBeDefined();
    }

    // Attempt persistence through quality gate
    const result = await persistThroughQualityGate(db, invalidAssertions);
    expect(result.passedCount).toBe(0);
    expect(result.quarantinedCount).toBe(3);

    // Verify ZERO rows inserted into ForensicAssertions
    const assertionCount: any = await new Promise((res, rej) => {
      db.get(`SELECT COUNT(*) as cnt FROM ForensicAssertions`, (e: any, r: any) => e ? rej(e) : res(r));
    });
    expect(assertionCount.cnt).toBe(0);

    // Verify 3 rows inserted into QuarantinedRecords
    const qCount: any = await new Promise((res, rej) => {
      db.get(`SELECT COUNT(*) as cnt FROM QuarantinedRecords`, (e: any, r: any) => e ? rej(e) : res(r));
    });
    expect(qCount.cnt).toBe(3);

    // Verify serving snapshot was NOT mutated (remains STATUTORY_ONLY_NO_CONCALL)
    const dossierRow: any = await new Promise((res, rej) => {
      db.get(`SELECT full_dossier_json FROM SecurityDossierSnapshots WHERE symbol = ?`, ['TESTSCRIP'], (e: any, r: any) => e ? rej(e) : res(r));
    });
    const fd = JSON.parse(dossierRow.full_dossier_json);
    expect(fd.operationalMoat.qualitativeTier).toBe('STATUTORY_ONLY_NO_CONCALL');
    expect(fd.operationalMoat.evidenceBackedFields).toBeUndefined();
  });
});
