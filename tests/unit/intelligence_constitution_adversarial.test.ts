/**
 * intelligence_constitution_adversarial.test.ts
 *
 * Constitution Section 23 & 32: Adversarial Language, Claim Safety,
 * Cross-Module Consistency, and Evidence Strength Validation.
 *
 * Stresses the exact cases from the DYCL analysis:
 * 1. Governance inference: 0% MF holding != "Institutions distrust company"
 * 2. Trading activity: Prop desk roundtrips != "Float manipulated" or "operator activity"
 * 3. Management resignations: 2 resignations != "Management crisis"
 * 4. Valuation: 46% lower P/E != "Obviously undervalued"
 * 5. Price prediction: "₹420 will hold" is forbidden
 * 6. Evidence strength: UNSUPPORTED assertions must never enter synthesis
 */

import { describe, it, expect } from 'vitest';
import { ClaimSafetyGate } from '../../src/server/services/intelligence/safety/ClaimSafetyGate.js';
import { CrossModuleConsistencyValidator } from '../../src/server/services/intelligence/validation/CrossModuleConsistencyValidator.js';
import { DataCoverageEngine } from '../../src/server/services/intelligence/coverage/DataCoverageEngine.js';
import { IntelligenceAssertion } from '../../src/server/services/intelligence/contracts/IntelligenceAssertion.js';
import { EvidenceRef } from '../../src/server/services/intelligence/contracts/EvidenceRef.js';

describe('Constitution Article C2 & C3: Adversarial Claim Safety & Observation vs Interpretation', () => {
  const safetyGate = ClaimSafetyGate.getInstance();

  const dummyEvidence: EvidenceRef = {
    evidenceId: 'EV_TEST_001',
    sourceType: 'SHAREHOLDING_DISCLOSURE',
    sourceName: 'BSE Shareholding Pattern Jun 2026',
    documentDate: '2026-06-30',
    availableAt: '2026-07-15T10:00:00Z',
    extractionMethod: 'STRUCTURED_XBRL',
  };

  it('Adversarial Test 1 (Governance): REJECTS "Institutions distrust company" and APPROVES factual observation', () => {
    // 1a. Forbidden psychological/motive inference
    const forbiddenAssertion: IntelligenceAssertion = {
      id: 'GOV_INF_01',
      text: 'Institutional investors distrust the company as mutual fund holding is 0.00%.',
      kind: 'INTERPRETATION',
      evidenceRefs: [dummyEvidence],
      confidence: 'MEDIUM',
      support: 'DIRECT',
      limitations: [],
      asOfDate: '2026-09-29',
    };
    const auditForbidden = safetyGate.auditAssertion(forbiddenAssertion);
    expect(auditForbidden.passed).toBe(false);
    expect(auditForbidden.violations.some(v => v.includes('motive') || v.includes('distrust'))).toBe(true);

    // 1b. Allowed restrained factual observation
    const allowedAssertion: IntelligenceAssertion = {
      id: 'GOV_FACT_01',
      text: 'No reported mutual-fund ownership in source dataset as of June 2026 shareholding pattern.',
      kind: 'FACT',
      evidenceRefs: [dummyEvidence],
      confidence: 'HIGH',
      support: 'DIRECT',
      limitations: [],
      asOfDate: '2026-09-29',
    };
    const auditAllowed = safetyGate.auditAssertion(allowedAssertion);
    expect(auditAllowed.passed).toBe(true);
    expect(auditAllowed.violations.length).toBe(0);
  });

  it('Adversarial Test 2 (Trading activity): REJECTS "float manipulated" or "operator activity", APPROVES trading facts', () => {
    const tradeEvidence: EvidenceRef = {
      ...dummyEvidence,
      sourceType: 'EXCHANGE_FILING',
      sourceName: 'NSE Bulk Deal Logs 01-Sep-2026',
    };

    // 2a. Forbidden manipulation claim without regulatory finding
    const forbiddenAssertion: IntelligenceAssertion = {
      id: 'TRADE_FORBIDDEN_01',
      text: 'The float is being manipulated by operators who are conducting circular trading schemes.',
      kind: 'INTERPRETATION',
      evidenceRefs: [tradeEvidence],
      confidence: 'LOW',
      support: 'DIRECT',
      limitations: [],
      asOfDate: '2026-09-29',
    };
    const auditForbidden = safetyGate.auditAssertion(forbiddenAssertion);
    expect(auditForbidden.passed).toBe(false);
    expect(auditForbidden.violations.some(v => v.includes('manipulation'))).toBe(true);

    // 2b. Allowed factual record of market microstructure
    const allowedAssertion: IntelligenceAssertion = {
      id: 'TRADE_FACT_01',
      text: 'Substantial same-day proprietary trading activity observed across four quantitative broker entities.',
      kind: 'FACT',
      evidenceRefs: [tradeEvidence],
      confidence: 'HIGH',
      support: 'DIRECT',
      limitations: [],
      asOfDate: '2026-09-29',
    };
    const auditAllowed = safetyGate.auditAssertion(allowedAssertion);
    expect(auditAllowed.passed).toBe(true);
  });

  it('Adversarial Test 3 (Management changes): REJECTS "management crisis", APPROVES verified resignation count', () => {
    const regEvidence: EvidenceRef = {
      ...dummyEvidence,
      sourceType: 'REGULATORY_DISCLOSURE',
      sourceName: 'Regulation 30 LODR Filings',
    };

    // 3a. Forbidden crisis narrative
    const forbiddenAssertion: IntelligenceAssertion = {
      id: 'MGMT_FORBIDDEN_01',
      text: 'A severe management crisis is developing following back-to-back executive departures.',
      kind: 'INTERPRETATION',
      evidenceRefs: [regEvidence],
      confidence: 'LOW',
      support: 'DIRECT',
      limitations: [],
      asOfDate: '2026-09-29',
    };
    const auditForbidden = safetyGate.auditAssertion(forbiddenAssertion);
    expect(auditForbidden.passed).toBe(false);
    expect(auditForbidden.violations.some(v => v.includes('crisis'))).toBe(true);

    // 3b. Allowed neutral observation
    const allowedAssertion: IntelligenceAssertion = {
      id: 'MGMT_FACT_01',
      text: 'Two disclosed departures of senior management personnel occurred during September 2026; operational implication currently unknown.',
      kind: 'FACT',
      evidenceRefs: [regEvidence],
      confidence: 'HIGH',
      support: 'DIRECT',
      limitations: ['Operational impact unobservable from disclosure documents alone'],
      asOfDate: '2026-09-29',
    };
    const auditAllowed = safetyGate.auditAssertion(allowedAssertion);
    expect(auditAllowed.passed).toBe(true);
  });

  it('Adversarial Test 4 (Valuation): REJECTS "obviously undervalued", APPROVES relative percentage difference', () => {
    const valEvidence: EvidenceRef = {
      ...dummyEvidence,
      sourceType: 'AUDITED_FINANCIAL_STATEMENT',
      sourceName: 'Peer Multiple Analysis',
    };

    // 4a. Forbidden promotional superlative
    const forbiddenAssertion: IntelligenceAssertion = {
      id: 'VAL_FORBIDDEN_01',
      text: 'The stock is obviously undervalued compared to Polycab and represents a screaming buy.',
      kind: 'INTERPRETATION',
      evidenceRefs: [valEvidence],
      confidence: 'HIGH',
      support: 'DIRECT',
      limitations: [],
      asOfDate: '2026-09-29',
    };
    const auditForbidden = safetyGate.auditAssertion(forbiddenAssertion);
    expect(auditForbidden.passed).toBe(false);
    expect(auditForbidden.violations.some(v => v.includes('superlative'))).toBe(true);

    // 4b. Allowed comparative observation
    const allowedAssertion: IntelligenceAssertion = {
      id: 'VAL_FACT_01',
      text: 'Current P/E of 23.1x is 46% lower than selected peer median of 43.1x, reflecting business mix differences and tender exposure.',
      kind: 'DERIVED_FACT',
      evidenceRefs: [valEvidence],
      confidence: 'HIGH',
      support: 'DERIVED',
      limitations: [],
      asOfDate: '2026-09-29',
    };
    const auditAllowed = safetyGate.auditAssertion(allowedAssertion);
    expect(auditAllowed.passed).toBe(true);
  });

  it('Adversarial Test 5 (Price Predictions): REJECTS definitive support promises ("₹420 will hold")', () => {
    const priceAssertion: IntelligenceAssertion = {
      id: 'TECH_PRED_01',
      text: 'The major support at ₹420 will hold against further downside pullbacks.',
      kind: 'INTERPRETATION',
      evidenceRefs: [dummyEvidence],
      confidence: 'HIGH',
      support: 'DIRECT',
      limitations: [],
      asOfDate: '2026-09-29',
    };
    const audit = safetyGate.auditAssertion(priceAssertion);
    expect(audit.passed).toBe(false);
    expect(audit.violations.some(v => v.includes('prediction'))).toBe(true);
  });

  it('Constitution C3 Invariant: Rejects any assertion with support: "UNSUPPORTED"', () => {
    const unbackedAssertion: IntelligenceAssertion = {
      id: 'UNBACKED_01',
      text: 'Company is expanding overseas into Southeast Asian grid distribution.',
      kind: 'FACT',
      evidenceRefs: [],
      confidence: 'HIGH',
      support: 'UNSUPPORTED',
      limitations: [],
      asOfDate: '2026-09-29',
    };
    const audit = safetyGate.auditAssertion(unbackedAssertion);
    expect(audit.passed).toBe(false);
    expect(audit.violations.some(v => v.includes('UNSUPPORTED'))).toBe(true);
  });
});

describe('Constitution Article C7: CrossModuleConsistencyValidator', () => {
  const validator = CrossModuleConsistencyValidator.getInstance();

  it('Passes when same metric across Fundamental and Valuation has matching values', () => {
    const report = validator.validate([
      { module: 'FUNDAMENTAL', metric: 'ROCE', value: 26.69, period: 'FY2026', scope: 'CONSOLIDATED' },
      { module: 'VALUATION', metric: 'ROCE', value: 26.69, period: 'FY2026', scope: 'CONSOLIDATED' },
    ]);
    expect(report.isConsistent).toBe(true);
    expect(report.conflicts.length).toBe(0);
    expect(report.verifiedMetrics).toContain('ROCE');
  });

  it('Detects and flags conflicting values across modules for the same metric horizon', () => {
    const report = validator.validate([
      { module: 'FUNDAMENTAL', metric: 'ROCE', value: 26.69, period: 'FY2026', scope: 'CONSOLIDATED' },
      { module: 'BUSINESS_DRIVERS', metric: 'ROCE', value: 18.20, period: 'FY2026', scope: 'CONSOLIDATED' },
    ]);
    expect(report.isConsistent).toBe(false);
    expect(report.conflicts.length).toBe(1);
    expect(report.conflicts[0].discrepancyType).toBe('VALUE_MISMATCH');
    expect(report.conflicts[0].message).toContain('FUNDAMENTAL reports 26.69 while BUSINESS_DRIVERS reports 18.2');
  });
});

describe('Constitution Article C5: DataCoverageEngine (Field-level vs raw snapshots)', () => {
  const coverageEngine = DataCoverageEngine.getInstance();

  it('Correctly identifies PARTIAL coverage when snapshots exist but financial history arrays are empty', () => {
    const rawWithEmptyHistories = {
      incomeStatement: { status: 'success', data: { income_statement: [{ category: 'revenue', history: [] }] } },
      balanceSheet: { status: 'success', data: { history: [] } },
      cashFlow: { status: 'success', data: { cash_flow: [] } },
      keyRatios: { status: 'success', data: [{ name: 'P/E', company_value: '23.1' }] },
      profile: { status: 'success', data: { company_profile: 'Wires manufacturer' } },
      corporateActions: { status: 'success', data: [{ name: 'Dividend' }] },
    };

    const result = coverageEngine.evaluateCoverage(
      'DYCL',
      'INE600Y01019',
      rawWithEmptyHistories,
      '2026-09-29'
    );

    // It must NOT say COMPLETE just because 6 objects exist!
    expect(result.domains.FUNDAMENTALS.overallStatus).not.toBe('COMPLETE');
    expect(result.domains.FUNDAMENTALS.unobservableDimensions.length).toBeGreaterThan(0);
    expect(result.domains.MANAGEMENT.overallStatus).toBe('INSUFFICIENT');
    expect(result.overallSuitability).toBe('CONDITIONAL_ANALYSIS');
  });
});
