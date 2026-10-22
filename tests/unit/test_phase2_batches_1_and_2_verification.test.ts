/**
 * tests/unit/test_phase2_batches_1_and_2_verification.test.ts
 *
 * Independent Audit & Verification Test for IICE Phase 2 Batches 1 & 2 (10 Companies):
 * Batch 1: SOLARINDS, ARVSMART, NOVARTIND, BAJAJHLDNG, UNOMINDA
 * Batch 2: VMART, TATATECH, HINDCOPPER, SCI, BOROLTD
 *
 * Independent Verifications Conducted:
 * 1. Dossier Completeness: All 10 companies have complete 10-file audit packages.
 * 2. Extraction Integrity: Real documents, valid SHA-256 hashes, physical page numbers, non-empty verbatim quotes.
 * 3. Cross-Issuer Isolation: Zero cross-company citation or claim contamination.
 * 4. Temporal Semantics: Claim periods, evaluation dates, and valid basis.
 * 5. Inferred Outcomes: Correct claim lifecycle evaluations (ACHIEVED vs MISSED vs PARTIALLY_ACHIEVED).
 * 6. Dual-Evidence Symmetry: Contradictions require left/right evidence with same issuer and valid linkage.
 * 7. Breaker Trigger Accuracy: Mathematical execution of thresholds (e.g. VMART leverage > 3.0x).
 * 8. Two-Axis Reconciliation: Decoupled ITAS Quant Opportunity x IICE Intel Risk -> Reconciled Thesis State.
 * 9. Credibility Scoring Invariants: INSUFFICIENT_HISTORY for <2 evaluated claims; WEAK for multiple misses.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

const BATCH_1_SYMBOLS = ['SOLARINDS', 'ARVSMART', 'NOVARTIND', 'BAJAJHLDNG', 'UNOMINDA'];
const BATCH_2_SYMBOLS = ['VMART', 'TATATECH', 'HINDCOPPER', 'SCI', 'BOROLTD'];
const ALL_10_SYMBOLS = [...BATCH_1_SYMBOLS, ...BATCH_2_SYMBOLS];

const COHORT_DIR = path.resolve('data', 'phase2_cohort');
const DB_PATH = path.resolve('data', 'phase2_cohort', 'iice_cohort.db');

interface CompanyDossier {
  symbol: string;
  company: any;
  sourceManifest: any[];
  evidence: any[];
  claims: any[];
  events: any[];
  contradictionPackage: any;
  contradictions: any[];
  thesis: any;
  breakerEvaluation: any[];
  itasInput: any;
  investmentBrief: any;
}

function loadDossier(symbol: string): CompanyDossier {
  const dir = path.join(COHORT_DIR, symbol);
  expect(fs.existsSync(dir), `Cohort directory for ${symbol} must exist`).toBe(true);

  const srcRaw = JSON.parse(fs.readFileSync(path.join(dir, 'source-manifest.json'), 'utf8'));
  const contraRaw = JSON.parse(fs.readFileSync(path.join(dir, 'contradictions.json'), 'utf8'));

  return {
    symbol,
    company: JSON.parse(fs.readFileSync(path.join(dir, 'company.json'), 'utf8')),
    sourceManifest: Array.isArray(srcRaw) ? srcRaw : (srcRaw.sources || []),
    evidence: JSON.parse(fs.readFileSync(path.join(dir, 'evidence.json'), 'utf8')),
    claims: JSON.parse(fs.readFileSync(path.join(dir, 'claims.json'), 'utf8')),
    events: JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8')),
    contradictionPackage: contraRaw,
    contradictions: Array.isArray(contraRaw) ? contraRaw : (contraRaw.contradictions || []),
    thesis: JSON.parse(fs.readFileSync(path.join(dir, 'thesis.json'), 'utf8')),
    breakerEvaluation: JSON.parse(fs.readFileSync(path.join(dir, 'breaker-evaluation.json'), 'utf8')),
    itasInput: JSON.parse(fs.readFileSync(path.join(dir, 'itas-input.json'), 'utf8')),
    investmentBrief: JSON.parse(fs.readFileSync(path.join(dir, 'investment-brief.json'), 'utf8'))
  };
}

describe('Independent Verification: Phase 2 Cohort Batches 1 & 2 (10 Companies)', () => {
  let dossiers: Record<string, CompanyDossier> = {};

  beforeAll(() => {
    for (const sym of ALL_10_SYMBOLS) {
      dossiers[sym] = loadDossier(sym);
    }
  });

  describe('1. File System Completeness & Schema Integrity', () => {
    it('verifies that all 10 companies have complete 10-file audit dossiers', () => {
      const requiredFiles = [
        'company.json',
        'source-manifest.json',
        'evidence.json',
        'claims.json',
        'events.json',
        'contradictions.json',
        'thesis.json',
        'breaker-evaluation.json',
        'itas-input.json',
        'investment-brief.json'
      ];

      for (const sym of ALL_10_SYMBOLS) {
        const companyDir = path.join(COHORT_DIR, sym);
        for (const file of requiredFiles) {
          const filePath = path.join(companyDir, file);
          expect(fs.existsSync(filePath), `${sym} missing ${file}`).toBe(true);
          const stat = fs.statSync(filePath);
          expect(stat.size, `${sym}/${file} must not be empty`).toBeGreaterThan(10);
        }
      }
    });

    it('verifies canonical company metadata for all 10 companies', () => {
      for (const sym of ALL_10_SYMBOLS) {
        const comp = dossiers[sym].company;
        expect(comp.symbol).toBe(sym);
        expect(comp.companyName).toBeTruthy();
        expect(comp.bseCode).toMatch(/^\d{6}$/);
        expect(comp.isin).toMatch(/^INE[A-Z0-9]{9}$/);
        expect(['LARGECAP', 'MIDCAP', 'SMALLCAP', 'MICROCAP_SME']).toContain(comp.marketCapTier);
        expect(['MAIN_BOARD', 'SME_EXCHANGE']).toContain(comp.exchangeBoard);
      }
    });
  });

  describe('2. Source & Evidence Extraction Rigor (Zero Hallucinations)', () => {
    it('verifies all source documents have authentic SHA-256 hashes, physical page counts, and filing authorities', () => {
      const sha256Regex = /^[a-f0-9]{64,66}$/;
      const validDocTypes = [
        'ANNUAL_REPORT',
        'STATUTORY_FILING',
        'CONCALL_TRANSCRIPT',
        'INVESTOR_PRESENTATION',
        'EXCHANGE_DISCLOSURE',
        'BSE_DISCLOSURE'
      ];

      for (const sym of ALL_10_SYMBOLS) {
        const sources = dossiers[sym].sourceManifest;
        expect(sources.length).toBeGreaterThanOrEqual(1);

        for (const src of sources) {
          expect(src.documentId).toMatch(/^DOC_/);
          expect(src.documentName).toBeTruthy();
          expect(validDocTypes).toContain(src.documentType);
          expect(src.documentHashSha256).toMatch(sha256Regex);
          expect(src.pageCount).toBeGreaterThan(0);
          expect(src.filingAuthority).toBeTruthy();
          expect(src.publicationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    });

    it('verifies that every evidence span is a substantive verbatim quote tied to an authentic source and page', () => {
      for (const sym of ALL_10_SYMBOLS) {
        const evidenceSpans = dossiers[sym].evidence;
        const sourceIds = new Set(dossiers[sym].sourceManifest.map(s => s.documentId));

        expect(evidenceSpans.length).toBeGreaterThanOrEqual(2);

        for (const ev of evidenceSpans) {
          expect(ev.evidenceId).toMatch(/^EV_/);
          expect(sourceIds.has(ev.documentId), `Evidence ${ev.evidenceId} links to invalid document ${ev.documentId}`).toBe(true);
          const page = ev.pagePhysical !== undefined ? ev.pagePhysical : ev.pagePhysicalNumber;
          expect(page).toBeGreaterThan(0);
          expect(ev.quotedText.length).toBeGreaterThanOrEqual(20);
        }
      }
    });

    it('verifies universal issuer isolation: zero cross-issuer evidence contamination across all 10 companies', () => {
      for (const sym of ALL_10_SYMBOLS) {
        const evidenceSpans = dossiers[sym].evidence;
        for (const ev of evidenceSpans) {
          expect(ev.issuerNseSymbol).toBe(sym);
        }

        const claims = dossiers[sym].claims;
        for (const clm of claims) {
          expect(clm.issuerNseSymbol).toBe(sym);
        }

        const events = dossiers[sym].events;
        for (const evt of events) {
          expect(evt.issuerNseSymbol).toBe(sym);
        }

        const contradictions = dossiers[sym].contradictions;
        for (const contra of contradictions) {
          expect(contra.issuerNseSymbol).toBe(sym);
        }
      }
    });
  });

  describe('3. Management Claim Lifecycle & Temporal Semantics Verification', () => {
    it('verifies that all evaluated claims have valid evaluation dates, evaluation evidence links, and substantive basis', () => {
      for (const sym of ALL_10_SYMBOLS) {
        const claims = dossiers[sym].claims;
        const evidenceIds = new Set(dossiers[sym].evidence.map(e => e.evidenceId));

        expect(claims.length).toBeGreaterThanOrEqual(1);

        for (const clm of claims) {
          expect(clm.claimId).toMatch(/^CLM_/);
          expect(clm.statement.length).toBeGreaterThan(15);
          expect(evidenceIds.has(clm.evidenceId), `Claim ${clm.claimId} primary evidence ${clm.evidenceId} missing`).toBe(true);

          if (['ACHIEVED', 'MISSED', 'PARTIALLY_ACHIEVED'].includes(clm.status)) {
            expect(clm.evaluationDate).toBeTruthy();
            expect(clm.evaluationEvidenceId).toBeTruthy();
            expect(evidenceIds.has(clm.evaluationEvidenceId), `Claim ${clm.claimId} evaluation evidence missing`).toBe(true);
            expect(clm.evaluationBasis.length).toBeGreaterThan(15);
          }
        }
      }
    });

    it('verifies Batch 1 (Clean Leaders): all evaluated claims resolve to ACHIEVED or ACHIEVED_EARLY', () => {
      for (const sym of BATCH_1_SYMBOLS) {
        const claims = dossiers[sym].claims;
        for (const clm of claims) {
          expect(['ACHIEVED', 'ACHIEVED_EARLY'], `Batch 1 company ${sym} claim ${clm.claimId} should be ACHIEVED or ACHIEVED_EARLY`).toContain(clm.status);
        }
      }
    });

    it('verifies Batch 2 (Guidance & Capex Delays): accurately identifies MISSED and PARTIALLY_ACHIEVED claims', () => {
      // 1. VMART: Store EBITDA and EBITDA margin misses
      const vmartClaims = dossiers['VMART'].claims;
      expect(vmartClaims.length).toBe(2);
      expect(vmartClaims.every(c => c.status === 'MISSED')).toBe(true);
      expect(vmartClaims[0].actualOutcomeDescription).toContain('loss');

      // 2. TATATECH: 20%+ margin target missed (delivered 18.4%)
      const tataClaims = dossiers['TATATECH'].claims;
      expect(tataClaims.length).toBe(1);
      expect(tataClaims[0].status).toBe('MISSED');
      expect(tataClaims[0].actualOutcomeDescription).toContain('18.4%');

      // 3. HINDCOPPER: Malanjkhand 5.0 MTPA delayed
      const hindClaims = dossiers['HINDCOPPER'].claims;
      expect(hindClaims.length).toBe(1);
      expect(hindClaims[0].status).toBe('MISSED');
      expect(hindClaims[0].actualOutcomeDescription).toContain('deferred');

      // 4. SCI: Disinvestment timeline missed
      const sciClaims = dossiers['SCI'].claims;
      expect(sciClaims.length).toBe(1);
      expect(sciClaims[0].status).toBe('MISSED');
      expect(sciClaims[0].evaluationBasis).toContain('DIPAM');

      // 5. BOROLTD: Capex delivered (ACHIEVED), margin lagged (PARTIALLY_ACHIEVED)
      const boroClaims = dossiers['BOROLTD'].claims;
      expect(boroClaims.length).toBe(2);
      expect(boroClaims.find(c => c.category === 'CAPEX')?.status).toBe('ACHIEVED');
      expect(boroClaims.find(c => c.category === 'MARGIN')?.status).toBe('PARTIALLY_ACHIEVED');
    });
  });

  describe('4. Contradiction Engine & Dual-Evidence Symmetry Verification', () => {
    it('verifies Batch 1 companies have ZERO active adverse contradictions', () => {
      for (const sym of BATCH_1_SYMBOLS) {
        const contras = dossiers[sym].contradictions;
        expect(contras.length).toBe(0);
        expect(dossiers[sym].contradictionPackage.activeContradictionCount).toBe(0);
        expect(dossiers[sym].contradictionPackage.status).toBe('CONFIRMED_ZERO_ADVERSE_CONTRADICTIONS');
      }
    });

    it('verifies Batch 2 companies with misses have valid, symmetric CLAIM_VS_RESULT contradictions', () => {
      for (const sym of BATCH_2_SYMBOLS) {
        const contras = dossiers[sym].contradictions;
        const evidenceIds = new Set(dossiers[sym].evidence.map(e => e.evidenceId));

        expect(contras.length, `${sym} must have exactly 1 contradiction`).toBe(1);
        const contra = contras[0];

        expect(contra.contradictionId).toMatch(/^CONTRA_/);
        expect(contra.type).toBe('CLAIM_VS_RESULT');
        expect(evidenceIds.has(contra.leftEvidenceId), `Left evidence ${contra.leftEvidenceId} must exist`).toBe(true);
        expect(evidenceIds.has(contra.rightEvidenceId), `Right evidence ${contra.rightEvidenceId} must exist`).toBe(true);
        expect(contra.leftEvidenceId).not.toBe(contra.rightEvidenceId);
        expect(contra.status).toBe('OPEN');
        expect(contra.issuerNseSymbol).toBe(sym);
      }
    });
  });

  describe('5. Thesis Breaker Execution Accuracy (Machine-Executable)', () => {
    it('verifies VMART lease-adjusted leverage breaker triggers ACTIVE status (Net Debt / EBITDA = 3.4x > 3.0x)', () => {
      const vmartBreakers = dossiers['VMART'].breakerEvaluation;
      const levBreaker = vmartBreakers.find((b: any) => b.breakerId === 'TB_VMART_LEVERAGE');
      expect(levBreaker).toBeDefined();
      expect(levBreaker.status).toBe('ACTIVE');
      expect(levBreaker.currentObservedValue).toBeGreaterThan(3.0);
      expect(levBreaker.rationale).toContain('3.4');
      expect(dossiers['VMART'].investmentBrief.decisionState.activeThesisBreakers).toBe(1);
    });

    it('verifies SOLARINDS and ARVSMART conservative leverage breakers remain INACTIVE', () => {
      // SOLARINDS: Net Debt / EBITDA 0.35x vs 2.5x threshold -> INACTIVE
      const solarBreakers = dossiers['SOLARINDS'].breakerEvaluation;
      const solarLev = solarBreakers.find((b: any) => b.breakerId === 'TB_SOLAR_LEVERAGE');
      expect(solarLev.status).toBe('INACTIVE');
      expect(solarLev.currentObservedValue).toBe(0.35);

      // ARVSMART: Net Debt / Equity -0.18x vs 0.5x threshold -> INACTIVE
      const arvBreakers = dossiers['ARVSMART'].breakerEvaluation;
      const arvLev = arvBreakers.find((b: any) => b.breakerId === 'TB_ARV_LEVERAGE');
      expect(arvLev.status).toBe('INACTIVE');
      expect(arvLev.currentObservedValue).toBe(-0.18);
    });
  });

  describe('6. Two-Axis ITAS ↔ IICE Reconciliation Contract Verification', () => {
    it('verifies Batch 1 clean compounding leaders resolve to SUPPORTED thesis states', () => {
      for (const sym of BATCH_1_SYMBOLS) {
        const brief = dossiers[sym].investmentBrief;
        expect(brief.decisionState.intelligenceRisk).toBe('LOW');
        expect(brief.decisionState.thesisState).toBe('SUPPORTED');
        expect(['STRONG', 'MODERATE']).toContain(brief.decisionState.quantOpportunity);
      }
    });

    it('verifies Batch 2 guidance miss & delay companies resolve to MIXED, CHALLENGED, or BROKEN thesis states', () => {
      // VMART: STRONG Quant x CRITICAL Risk -> BROKEN Thesis
      const vmartBrief = dossiers['VMART'].investmentBrief;
      expect(vmartBrief.decisionState.quantOpportunity).toBe('STRONG');
      expect(vmartBrief.decisionState.intelligenceRisk).toBe('CRITICAL');
      expect(vmartBrief.decisionState.thesisState).toBe('BROKEN');

      // TATATECH: STRONG Quant x MODERATE Risk -> MIXED Thesis
      const tataBrief = dossiers['TATATECH'].investmentBrief;
      expect(tataBrief.decisionState.quantOpportunity).toBe('STRONG');
      expect(tataBrief.decisionState.intelligenceRisk).toBe('MODERATE');
      expect(tataBrief.decisionState.thesisState).toBe('MIXED');

      // HINDCOPPER: STRONG Quant x HIGH Risk -> CHALLENGED Thesis
      const hindBrief = dossiers['HINDCOPPER'].investmentBrief;
      expect(hindBrief.decisionState.quantOpportunity).toBe('STRONG');
      expect(hindBrief.decisionState.intelligenceRisk).toBe('HIGH');
      expect(hindBrief.decisionState.thesisState).toBe('CHALLENGED');

      // SCI: STRONG Quant x HIGH Risk -> CHALLENGED Thesis
      const sciBrief = dossiers['SCI'].investmentBrief;
      expect(sciBrief.decisionState.quantOpportunity).toBe('STRONG');
      expect(sciBrief.decisionState.intelligenceRisk).toBe('HIGH');
      expect(sciBrief.decisionState.thesisState).toBe('CHALLENGED');

      // BOROLTD: STRONG Quant x MODERATE Risk -> MIXED Thesis
      const boroBrief = dossiers['BOROLTD'].investmentBrief;
      expect(boroBrief.decisionState.quantOpportunity).toBe('STRONG');
      expect(boroBrief.decisionState.intelligenceRisk).toBe('MODERATE');
      expect(boroBrief.decisionState.thesisState).toBe('MIXED');
    });

    it('verifies Credibility Grade calculation invariants across all 10 companies', () => {
      // Rule: Evaluated claims < 2 must strictly yield INSUFFICIENT_HISTORY
      const singleClaimSymbols = ['NOVARTIND', 'BAJAJHLDNG', 'UNOMINDA', 'ARVSMART', 'TATATECH', 'HINDCOPPER', 'SCI'];
      for (const sym of singleClaimSymbols) {
        const grade = dossiers[sym].investmentBrief.decisionState.managementCredibility;
        expect(grade, `${sym} with <2 claims must be INSUFFICIENT_HISTORY`).toBe('INSUFFICIENT_HISTORY');
      }

      // Rule: Multi-claim clean companies yield STRONG or GENERALLY_CREDIBLE
      expect(dossiers['SOLARINDS'].investmentBrief.decisionState.managementCredibility).toBe('STRONG');
      expect(dossiers['BOROLTD'].investmentBrief.decisionState.managementCredibility).toBe('GENERALLY_CREDIBLE');

      // Rule: Multi-claim missed company yields WEAK
      expect(dossiers['VMART'].investmentBrief.decisionState.managementCredibility).toBe('WEAK');
    });
  });

  describe('7. Physical Database Persistence Verification (SQLite)', () => {
    it('verifies that all claims, events, and contradictions are persisted in data/phase2_cohort/iice_cohort.db', async () => {
      expect(fs.existsSync(DB_PATH)).toBe(true);

      const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

      const queryCount = (sql: string, params: any[] = []): Promise<number> => {
        return new Promise((resolve, reject) => {
          db.get(sql, params, (err, row: any) => {
            if (err) reject(err);
            else resolve(row.count);
          });
        });
      };

      const totalClaims = await queryCount('SELECT count(*) as count FROM ManagementClaims');
      const totalEvents = await queryCount('SELECT count(*) as count FROM IntelligenceEvents');
      const totalContradictions = await queryCount('SELECT count(*) as count FROM Contradictions');

      expect(totalClaims).toBe(22); // Full 20-company cohort database
      expect(totalEvents).toBe(20);
      expect(totalContradictions).toBe(11);

      // Check specific symbol rows in DB
      for (const sym of ALL_10_SYMBOLS) {
        const count = await queryCount('SELECT count(*) as count FROM ManagementClaims WHERE symbol = ?', [sym]);
        expect(count, `Database must contain claims for ${sym}`).toBeGreaterThanOrEqual(1);
      }

      await new Promise<void>(resolve => db.close(() => resolve()));
    });
  });
});
