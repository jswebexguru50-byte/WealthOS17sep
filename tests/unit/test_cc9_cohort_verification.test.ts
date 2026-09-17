/**
 * test_cc9_cohort_verification.test.ts
 *
 * Verification test suite for cc9 Portfolio Indian Equities Cohort.
 * Verifies that all 48 Indian stock dossiers conform 100% to:
 * 1. FERE v3.2.1 Canonical Dossier Architecture (11 canonical JSON files per issuer)
 * 2. Gate A Fact Validation (all checks valid, strict numerical binding, 2-15 char tickers including LT & NH)
 * 3. Cold-Storage Deterministic Replay Invariance (isMatch === true, zero divergence)
 * 4. Reconciliation Engine Semantics (ITAS + IICE thesis states and allocation directives)
 * 5. Intelligence Governance & Contradiction Vetoes (PAYTM Section 35A veto, RBLBANK asset quality divergence)
 * 6. SQLite Storage Lineage (cc9_cohort.db integrity)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import sqlite3 from 'sqlite3';
import { FactValidationGate } from '../../src/server/intelligence/engines/FactValidationGate.js';
import { DecisionReplayEngine } from '../../src/server/intelligence/engines/DecisionReplayEngine.js';

const CC9_DIR = path.resolve(process.cwd(), 'data/cc9_cohort');
const DB_PATH = path.resolve(CC9_DIR, 'cc9_cohort.db');

export const EXPECTED_48_SYMBOLS = [
  'SOLARINDS', 'LAURUSLABS', 'HIRECT', 'UNOMINDA', 'BHARTIARTL', 'POLYCAB',
  'FEDERALBNK', 'JGCHEM', 'MAZDOCK', 'LT', 'CDSL', 'RELIANCE',
  'HDFCBANK', 'AZAD', 'ETERNAL', 'DIVISLAB', 'GANECOS', 'HAL',
  'RAJRATAN', 'PAYTM', 'GROWW', 'PIDILITIND', 'ZENTEC', 'NH',
  'HOMEFIRST', 'BAJFINANCE', 'BLUEJET', 'M&M', 'BEL', 'APLAPOLLO',
  'CGPOWER', 'GOKEX', 'SBIFUN', 'EPL', 'DIXON', 'OLECTRA',
  'SBIN', 'RBLBANK', 'BANKBARODA', 'KPITTECH', 'ARE&M', 'TATACONSUM',
  'BAJAJHFL', 'TATAPOWER', 'TINNARUBR', 'TATAMOTORS', 'MEESHO', 'FRATELLIVI'
];

const CANONICAL_DOSSIER_FILES = [
  'company.json',
  'source-manifest.json',
  'evidence.json',
  'facts.json',
  'claims.json',
  'events.json',
  'contradictions.json',
  'breaker-evaluation.json',
  'itas-input.json',
  'thesis.json',
  'investment-brief.json'
];

describe('cc9 Portfolio Indian Equities FERE v3.2.1 Cohort Verification Suite', () => {
  it('Cohort Universe: Exactly 48 Indian listed equities present in cc9_cohort directory', () => {
    expect(fs.existsSync(CC9_DIR)).toBe(true);

    const entries = fs.readdirSync(CC9_DIR).filter((e) => {
      const fullPath = path.join(CC9_DIR, e);
      return fs.statSync(fullPath).isDirectory();
    });

    expect(entries.sort()).toEqual([...EXPECTED_48_SYMBOLS].sort());
    expect(entries.length).toBe(48);
  });

  it('Dossier Completeness: All 48 issuers contain all 11 canonical JSON files', () => {
    for (const sym of EXPECTED_48_SYMBOLS) {
      const symbolDir = path.join(CC9_DIR, sym);
      for (const requiredFile of CANONICAL_DOSSIER_FILES) {
        const filePath = path.join(symbolDir, requiredFile);
        expect(fs.existsSync(filePath), `Missing ${requiredFile} for ${sym}`).toBe(true);
        const stat = fs.statSync(filePath);
        expect(stat.size).toBeGreaterThan(0);
      }
    }
  });

  it('ISIN & Country Invariant: All 48 issuers have Indian ISINs (INE prefix) and Indian headquarters', () => {
    for (const sym of EXPECTED_48_SYMBOLS) {
      const companyPath = path.join(CC9_DIR, sym, 'company.json');
      const company = JSON.parse(fs.readFileSync(companyPath, 'utf8'));

      expect(company.symbol).toBe(sym);
      expect(company.isin.startsWith('INE'), `${sym} ISIN must start with INE`).toBe(true);
      expect(company.headquarters.toLowerCase().includes('india'), `${sym} HQ must be in India`).toBe(true);
    }
  });

  it('Gate A Conformance: Every canonical fact in every dossier passes all Gate A deterministic checks', () => {
    for (const sym of EXPECTED_48_SYMBOLS) {
      const factsPath = path.join(CC9_DIR, sym, 'facts.json');
      const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
      expect(facts.length).toBeGreaterThan(0);

      for (const fact of facts) {
        const report = FactValidationGate.validate({
          factId: fact.factId,
          issuerSymbol: fact.issuerSymbol,
          metric: fact.metric,
          metricFamily: fact.metricFamily,
          value: fact.value,
          unit: fact.unit,
          scope: fact.scope,
          measurementType: fact.measurementType,
          asOfDate: fact.asOfDate,
          sourceEvidenceId: fact.sourceEvidenceId,
          sourceQuotedText: fact.sourceQuotedText
        });

        expect(report.isValid, `Fact ${fact.factId} for ${sym} failed Gate A: ${report.rejectionReasons.join('; ')}`).toBe(true);
        expect(report.rejectionReasons.length).toBe(0);
        expect(report.checks.datesChronologicallySound).toBe(true);
        expect(report.checks.unitConsistentWithFamily).toBe(true);
        expect(report.checks.deterministicMetricContextBinding).toBe(true);
        expect(report.metricBinding?.bindingStrength).toBe('HIGH');
      }
    }
  });

  it('Cold-Storage Deterministic Replay: All 48 briefs replay identically with zero state hash drift', () => {
    for (const sym of EXPECTED_48_SYMBOLS) {
      const briefPath = path.join(CC9_DIR, sym, 'investment-brief.json');
      const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));

      const snapshot = brief.decisionState.decisionSnapshot;
      expect(snapshot).toBeDefined();
      expect(snapshot.canonicalStateHash).toBeDefined();
      expect(snapshot.rawInputHash).toBeDefined();
      expect(snapshot.decisionDate).toBeDefined();
      expect(snapshot.rawInputFacts).toBeDefined();
      expect(snapshot.rawInputClaims).toBeDefined();
      expect(snapshot.rawInputBreakers).toBeDefined();

      const replayResult = DecisionReplayEngine.replayFromColdStorage(snapshot);
      expect(replayResult.isMatch, `Replay failed for ${sym}: divergences = ${replayResult.divergences.join('; ')}`).toBe(true);
      expect(replayResult.divergences.length).toBe(0);
      expect(replayResult.reconstructedHash).toBe(snapshot.canonicalStateHash);
    }
  });

  it('Intelligence Governance Veto: PAYTM triggered regulatory contradiction and is BROKEN / HARD_EXCLUSION_VETO', () => {
    const briefPath = path.join(CC9_DIR, 'PAYTM', 'investment-brief.json');
    const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));

    expect(brief.decisionState.intelligenceRisk).toBe('CRITICAL');
    expect(brief.decisionState.thesisState).toBe('BROKEN');
    expect(brief.decisionState.portfolioPolicy.directive).toBe('HARD_EXCLUSION_VETO');
    expect(brief.decisionState.portfolioPolicy.targetSizingCapRatio).toBe(0.0);
  });

  it('Intelligence Governance Veto: RBLBANK triggered asset quality contradiction and is CHALLENGED / PROHIBITED_ENTRY', () => {
    const briefPath = path.join(CC9_DIR, 'RBLBANK', 'investment-brief.json');
    const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));

    expect(brief.decisionState.intelligenceRisk).toBe('HIGH');
    expect(brief.decisionState.thesisState).toBe('CHALLENGED');
    expect(brief.decisionState.portfolioPolicy.directive).toBe('PROHIBITED_ENTRY');
    expect(brief.decisionState.portfolioPolicy.targetSizingCapRatio).toBe(0.0);
  });

  it('Reconciliation Invariant: Remaining 46 issuers maintain clean risk and SUPPORTED thesis state', () => {
    const nonVetoedSymbols = EXPECTED_48_SYMBOLS.filter((s) => s !== 'PAYTM' && s !== 'RBLBANK');
    for (const sym of nonVetoedSymbols) {
      const briefPath = path.join(CC9_DIR, sym, 'investment-brief.json');
      const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));

      expect(brief.decisionState.intelligenceRisk).toBe('LOW');
      expect(brief.decisionState.thesisState).toBe('SUPPORTED');
      expect(brief.decisionState.portfolioPolicy.directive).toBe('CAPPED_ALLOCATION');
      expect(brief.decisionState.portfolioPolicy.targetSizingCapRatio).toBe(0.5);
    }
  });

  it('SQLite Cohort Database Integrity: Evidence, Claims, Events, and Contradictions are populated', async () => {
    expect(fs.existsSync(DB_PATH)).toBe(true);

    const db = new sqlite3.Database(DB_PATH);
    const getCount = (table: string): Promise<number> => {
      return new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as cnt FROM ${table}`, (err, row: any) => {
          if (err) reject(err);
          else resolve(row.cnt);
        });
      });
    };

    const evidenceCount = await getCount('EvidenceInventory');
    const claimsCount = await getCount('ManagementClaims');
    const eventsCount = await getCount('IntelligenceEvents');
    const contraCount = await getCount('Contradictions');

    expect(evidenceCount).toBeGreaterThanOrEqual(48);
    expect(claimsCount).toBe(48);
    expect(eventsCount).toBe(48);
    expect(contraCount).toBe(2);

    await new Promise<void>((resolve) => db.close(() => resolve()));
  });

  it('Master Summary & Execution Report: Conforming and complete for all 48 issuers', () => {
    const summaryPath = path.join(CC9_DIR, 'all_cc9_summary.json');
    const reportPath = path.join(CC9_DIR, 'CC9_COHORT_EXECUTION_REPORT.md');

    expect(fs.existsSync(summaryPath)).toBe(true);
    expect(fs.existsSync(reportPath)).toBe(true);

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    expect(summary.length).toBe(48);

    const reportContent = fs.readFileSync(reportPath, 'utf8');
    for (const sym of EXPECTED_48_SYMBOLS) {
      expect(reportContent.includes(sym), `Report missing mention of ${sym}`).toBe(true);
    }
  });
});
