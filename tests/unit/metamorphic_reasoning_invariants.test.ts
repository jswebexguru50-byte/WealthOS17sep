/**
 * tests/unit/metamorphic_reasoning_invariants.test.ts
 *
 * FERE v3.2.1 Metamorphic Reasoning Invariant Suite (MR-1 through MR-14).
 *
 * v3.2.1 Expansion: Added MR-6 through MR-14 to specifically attack the
 * exact implementation weaknesses identified in the independent code-level audit:
 *
 * MR-6:  Currency mismatch MUST NOT preserve numerical equivalence
 * MR-7:  Invalid unit for metric family MUST fail Gate A (ontology check)
 * MR-8:  Absent sourceQuotedText MUST fail Gate A (quote is mandatory)
 * MR-9:  Case B restatement MUST produce SUPERSEDED + COMPARABLE (not NOT_COMPARABLE)
 * MR-10: Derived fact IDs MUST be deterministic (same inputs → same ID, no Date.now())
 * MR-11: Fail-closed replay MUST throw if rawQuantInput is missing
 * MR-12: YoY derivation MUST reject cross-metric and cross-scope inputs
 * MR-13: Undated evidence MUST NOT be historically admissible (Fail-closed boundary)
 * MR-14: Modifying ANY material raw-input field MUST alter rawInputHash
 */

import { describe, it, expect } from 'vitest';
import {
  ItasIiceReconciliationService,
  ItasQuantInput,
  IiceIntelligenceInput
} from '../../src/server/intelligence/services/ItasIiceReconciliationService';
import { TemporalReasoningEngine } from '../../src/server/intelligence/engines/TemporalReasoningEngine';
import { DecisionReplayEngine } from '../../src/server/intelligence/engines/DecisionReplayEngine';
import { FactValidationGate, CandidateFactInput } from '../../src/server/intelligence/engines/FactValidationGate';
import { NumericalNormalizationEngine } from '../../src/server/intelligence/engines/NumericalNormalizationEngine';
import { ContradictionResolutionEngine } from '../../src/server/intelligence/engines/ContradictionResolutionEngine';
import { FactDerivationEngine } from '../../src/server/intelligence/engines/FactDerivationEngine';
import { FinancialFact } from '../../src/server/intelligence/types/FinancialFact';
import { ManagementClaim } from '../../src/server/intelligence/types/ManagementClaim';

describe('FERE v3.2.1 Metamorphic Reasoning Invariants Suite (MR-1 to MR-14)', () => {
  const service = new ItasIiceReconciliationService();

  // ─────────────────────────────────────────────────────────────────────────
  // MR-1: Monotonic Threshold Scaling (preserved from v3.2)
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-1: Monotonic threshold scaling: increasing score never demotes quant opportunity', () => {
    const tiers = { NONE: 0, WEAK: 1, MODERATE: 2, STRONG: 3 };

    for (let s = 0; s < 99; s += 5) {
      const qLower: ItasQuantInput = {
        symbol: 'TEST_MR1',
        strategyAgreementCount: 0,
        totalStrategiesEvaluated: 20,
        signalStrength: s,
        marketRegime: 'BULLISH',
        quantDirective: 'BUY'
      };
      const qHigher: ItasQuantInput = { ...qLower, signalStrength: s + 5 };

      const resLower = service.evaluateQuantOpportunity(qLower);
      const resHigher = service.evaluateQuantOpportunity(qHigher);

      expect(tiers[resHigher]).toBeGreaterThanOrEqual(tiers[resLower]);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-2: Corroborating Evidence Monotonicity (preserved from v3.2)
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-2: Corroborating evidence monotonicity: corroboration never weakens thesis state', () => {
    const baseQuant: ItasQuantInput = {
      symbol: 'TEST_CORROB',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 85,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    };
    const baseIice: IiceIntelligenceInput = {
      symbol: 'TEST_CORROB',
      companyName: 'Test Corroboration Corp',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      walkTheTalk: {
        totalClaims: 2,
        achievedClaims: 2,
        brokenClaims: 0,
        pendingClaims: 0,
        unverifiableClaims: 0,
        grade: 'STRONG',
        sayDoRatio: 1.0,
        historicalBasis: 'PRIMARY',
        keyEvidencedExamples: []
      },
      contradictions: [],
      evaluatedBreakers: [],
      unknowns: [],
      recentEvents: [],
      evidenceCount: 3
    };

    const baseState = service.reconcile(baseQuant, baseIice);
    expect(baseState.thesisState).toBe('SUPPORTED');

    const corroboratingIice: IiceIntelligenceInput = {
      ...baseIice,
      evidenceCount: baseIice.evidenceCount + 5,
      walkTheTalk: { ...baseIice.walkTheTalk, totalClaims: 4, achievedClaims: 4 }
    };
    const corroboratedState = service.reconcile(baseQuant, corroboratingIice);
    expect(corroboratedState.thesisState).toBe('SUPPORTED');

    const contradictoryIice: IiceIntelligenceInput = {
      ...baseIice,
      contradictions: [{
        contradictionId: 'C_HIGH_1',
        issuerNseSymbol: 'TEST_CORROB',
        severity: 'HIGH',
        type: 'CLAIM_VS_RESULT',
        description: 'Material margin discrepancy',
        divergenceDetails: {},
        leftEvidenceId: 'EV_1',
        rightEvidenceId: 'EV_2',
        supportingEvidenceIds: [],
        materiality: 'HIGH',
        status: 'OPEN',
        detectedAt: '2026-09-15',
        createdAt: '2026-09-15'
      }]
    };
    const challengedState = service.reconcile(baseQuant, contradictoryIice);
    expect(challengedState.thesisState).toBe('CHALLENGED');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-3: Support Dependency Sensitivity (preserved from v3.2)
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-3: Support dependency sensitivity: removing all evidence demotes from SUPPORTED', () => {
    const quant: ItasQuantInput = {
      symbol: 'TEST_DEP',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 85,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    };
    const supportedIice: IiceIntelligenceInput = {
      symbol: 'TEST_DEP',
      companyName: 'Test Dependency Corp',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      walkTheTalk: {
        totalClaims: 2,
        achievedClaims: 2,
        brokenClaims: 0,
        pendingClaims: 0,
        unverifiableClaims: 0,
        grade: 'STRONG',
        sayDoRatio: 1.0,
        historicalBasis: 'PRIMARY',
        keyEvidencedExamples: []
      },
      contradictions: [],
      evaluatedBreakers: [],
      unknowns: [],
      recentEvents: [],
      evidenceCount: 4
    };
    const supportedDecision = service.reconcile(quant, supportedIice);
    expect(supportedDecision.thesisState).toBe('SUPPORTED');

    const strippedIice: IiceIntelligenceInput = {
      ...supportedIice,
      evidenceCount: 0,
      walkTheTalk: {
        ...supportedIice.walkTheTalk,
        totalClaims: 0,
        achievedClaims: 0,
        grade: 'INSUFFICIENT_HISTORY'
      }
    };
    const strippedDecision = service.reconcile(quant, strippedIice);
    expect(strippedDecision.thesisState).toBe('UNRESOLVED');
    expect(strippedDecision.intelligenceRisk).toBe('UNKNOWN');
    expect(strippedDecision.allocationRecommendation).toBe('GATED_ESCROW');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-4: Temporal Horizon Progression (preserved from v3.2)
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-4: Temporal horizon: time progression preserves early fulfillment', () => {
    const claim: ManagementClaim = {
      claimId: 'CLM_SOLAR_DEFENSE',
      issuerNseSymbol: 'SOLARINDS',
      statement: 'Defense order book will reach ₹1,000 Cr by FY25',
      domain: 'ORDER_BOOK_RUNWAY',
      targetHorizon: 'DEADLINE',
      targetPeriod: 'FY25',
      targetDate: '2025-03-31',
      metricTarget: '₹1,000 Cr',
      sourceDocType: 'INVESTOR_PRESENTATION',
      sourceFilingDate: '2023-08-15',
      sourceEvidenceId: 'EV_SOLAR_001',
      status: 'PENDING',
      verificationType: 'METRIC_TRACKED',
      createdAt: '2023-08-15',
      updatedAt: '2023-08-15'
    };
    const fulfillingFact: FinancialFact = {
      factId: 'FACT_SOLAR_DEF_FY24',
      issuerSymbol: 'SOLARINDS',
      metric: 'DEFENSE_ORDER_BOOK',
      metricFamily: 'ORDER_BOOK',
      value: 1250,
      unit: 'INR_CRORE',
      scope: 'CONSOLIDATED',
      measurementType: 'STOCK',
      asOfDate: '2024-03-31',
      sourceEvidenceId: 'EV_SOLAR_002',
      verificationStatus: 'SOURCE_SUPPORTED'
    };
    const tEarly = TemporalReasoningEngine.evaluate({
      claimId: claim.claimId,
      metric: 'DEFENSE_ORDER_BOOK',
      targetOperator: '>=',
      targetValue: 1000,
      semantics: 'DEADLINE',
      deadlineDate: '2025-03-31',
      fact: fulfillingFact
    });
    expect(tEarly.outcome).toBe('ACHIEVED_EARLY');

    const deadlineFact: FinancialFact = { ...fulfillingFact, asOfDate: '2025-03-31' };
    const tDeadline = TemporalReasoningEngine.evaluate({
      claimId: claim.claimId,
      metric: 'DEFENSE_ORDER_BOOK',
      targetOperator: '>=',
      targetValue: 1000,
      semantics: 'DEADLINE',
      deadlineDate: '2025-03-31',
      fact: deadlineFact
    });
    expect(tDeadline.outcome).toBe('ACHIEVED');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-5: Temporal Non-Leakage (preserved from v3.2)
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-5: Temporal non-leakage: post-cutoff filings cannot leak into historical decisions', () => {
    const historicalFacts: FinancialFact[] = [
      {
        factId: 'FACT_FY23', issuerSymbol: 'TEST_LEAK', metric: 'REVENUE',
        metricFamily: 'REVENUE', value: 1000, unit: 'INR_CRORE', scope: 'CONSOLIDATED',
        measurementType: 'FLOW', periodEnd: '2023-03-31', filingDate: '2023-05-15',
        publicationDate: '2023-05-15', sourceEvidenceId: 'EV_2023'
      },
      {
        factId: 'FACT_FY24', issuerSymbol: 'TEST_LEAK', metric: 'REVENUE',
        metricFamily: 'REVENUE', value: 1200, unit: 'INR_CRORE', scope: 'CONSOLIDATED',
        measurementType: 'FLOW', periodEnd: '2024-03-31', filingDate: '2024-05-20',
        publicationDate: '2024-05-20', sourceEvidenceId: 'EV_2024'
      }
    ];
    const cutoff = '2024-06-30';
    const filtered = DecisionReplayEngine.filterByHistoricalBoundary(historicalFacts, [], cutoff);
    expect(filtered.facts.length).toBe(2);

    const futureFact: FinancialFact = {
      factId: 'FACT_FY25_ADVERSE', issuerSymbol: 'TEST_LEAK', metric: 'REVENUE',
      metricFamily: 'REVENUE', value: 600, unit: 'INR_CRORE', scope: 'CONSOLIDATED',
      measurementType: 'FLOW', periodEnd: '2025-03-31', filingDate: '2025-05-20',
      publicationDate: '2025-05-20', sourceEvidenceId: 'EV_2025_FUTURE'
    };
    const expanded = [...historicalFacts, futureFact];
    const filteredAfterLeak = DecisionReplayEngine.filterByHistoricalBoundary(expanded, [], cutoff);

    expect(filteredAfterLeak.facts.length).toBe(2);
    expect(filteredAfterLeak.facts.some(f => f.factId === 'FACT_FY25_ADVERSE')).toBe(false);

    const hashA = DecisionReplayEngine.computeCanonicalStateHash(filtered.facts);
    const hashB = DecisionReplayEngine.computeCanonicalStateHash(filteredAfterLeak.facts);
    expect(hashB).toBe(hashA);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // v3.2.1 NEW TESTS — Directly attacking the audit-identified defects
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  // MR-6: Currency Mismatch MUST NOT Preserve Numerical Equivalence
  // Audit finding: NumericalNormalizationEngine stripped currencies before comparing,
  // allowing ₹1,250 Cr to match $1,250 Cr.
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-6: Currency mismatch MUST NOT preserve numerical equivalence (₹ ≠ $)', () => {
    // ₹1,250 Cr and $1,250 Cr have the same number but different currencies
    const inrResult = NumericalNormalizationEngine.isValuePresentInQuote(
      1250, 'crore',
      'Revenue stood at Rs. 1,250 crore for FY24.',
      'INR' // candidate declares INR
    );
    expect(inrResult.found).toBe(true);
    expect(inrResult.detectedCurrency).toBe('INR');

    const usdResult = NumericalNormalizationEngine.isValuePresentInQuote(
      1250, 'crore',
      'Revenue stood at $1,250 crore for FY24.',
      'INR' // candidate declares INR but quote has USD
    );
    // The match must FAIL because USD ≠ INR semantically
    expect(usdResult.found).toBe(false);

    // Also verify that the normalizer correctly identifies both currencies
    const detectInr = NumericalNormalizationEngine.isValuePresentInQuote(
      1250, 'crore', 'Revenue was ₹1,250 crore.'
    );
    expect(detectInr.found).toBe(true);
    expect(detectInr.detectedCurrency).toBe('INR');

    const detectUsd = NumericalNormalizationEngine.isValuePresentInQuote(
      1250, 'crore', 'Revenue was $1,250 crore.'
    );
    expect(detectUsd.found).toBe(true);
    expect(detectUsd.detectedCurrency).toBe('USD');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-7: Invalid Unit for Metric Family MUST Fail Gate A
  // Audit finding: unitConsistentWithFamily was Boolean(unit) && unit.length > 0.
  // "Revenue + BANANAS" passed. Now requires ontology membership check.
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-7: Nonsense unit MUST fail Gate A unit ontology check', () => {
    const validCandidate: CandidateFactInput = {
      factId: 'FACT_VALID_001',
      issuerSymbol: 'TATASTEEL',
      metric: 'REVENUE',
      metricFamily: 'REVENUE',
      value: 1250,
      unit: 'INR_CRORE',  // valid unit for REVENUE family
      scope: 'CONSOLIDATED',
      measurementType: 'FLOW',
      periodStart: '2023-04-01',
      periodEnd: '2024-03-31',
      sourceEvidenceId: 'EV_TATA_001',
      sourceQuotedText: 'Total revenue for FY24 was ₹1,250 crore on a consolidated basis.',
      currency: 'INR'
    };

    const validResult = FactValidationGate.validate(validCandidate);
    expect(validResult.checks.unitConsistentWithFamily).toBe(true);

    // BANANAS is not a valid unit for REVENUE family
    const bananasCandidate: CandidateFactInput = {
      ...validCandidate,
      factId: 'FACT_BAD_UNIT',
      unit: 'BANANAS'
    };
    const bananasResult = FactValidationGate.validate(bananasCandidate);
    expect(bananasResult.isValid).toBe(false);
    expect(bananasResult.checks.unitConsistentWithFamily).toBe(false);
    expect(bananasResult.verificationStatus).toBe('REJECTED');
    expect(bananasResult.rejectionReasons.some(r => r.includes('BANANAS'))).toBe(true);

    // METERS is not valid for REVENUE family
    const metersCandidate: CandidateFactInput = { ...validCandidate, factId: 'FACT_METERS', unit: 'METERS' };
    expect(FactValidationGate.validate(metersCandidate).checks.unitConsistentWithFamily).toBe(false);

    // % is valid for MARGIN family but not REVENUE family
    const percentRevenueCandidate: CandidateFactInput = {
      ...validCandidate, factId: 'FACT_PCT_REV', unit: '%', metricFamily: 'REVENUE'
    };
    expect(FactValidationGate.validate(percentRevenueCandidate).checks.unitConsistentWithFamily).toBe(false);

    // % IS valid for MARGIN family
    const percentMarginCandidate: CandidateFactInput = {
      ...validCandidate, factId: 'FACT_PCT_MARGIN',
      metric: 'EBITDA_MARGIN', metricFamily: 'MARGIN', unit: '%',
      sourceQuotedText: 'EBITDA margin was 18% for FY24 on a consolidated basis.'
    };
    expect(FactValidationGate.validate(percentMarginCandidate).checks.unitConsistentWithFamily).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-8: Absent sourceQuotedText MUST Fail Gate A
  // Audit finding: If sourceQuotedText was absent, numericalValuePresentInQuote
  // defaulted to true. A fact could become SOURCE_SUPPORTED with no cited quote.
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-8: Missing sourceQuotedText MUST fail Gate A — no quote means no SOURCE_SUPPORTED', () => {
    // A candidate that is otherwise valid but has no quoted text
    // TypeScript enforces sourceQuotedText is now required in CandidateFactInput,
    // but we simulate old behavior by passing an empty string.
    const noQuoteCandidate: CandidateFactInput = {
      factId: 'FACT_NOQUOTE',
      issuerSymbol: 'TATASTEEL',
      metric: 'REVENUE',
      metricFamily: 'REVENUE',
      value: 1250,
      unit: 'INR_CRORE',
      scope: 'CONSOLIDATED',
      measurementType: 'FLOW',
      periodStart: '2023-04-01',
      periodEnd: '2024-03-31',
      sourceEvidenceId: 'EV_TATA_001',
      sourceQuotedText: '',   // EMPTY — simulates absent quote
      currency: 'INR'
    };

    const result = FactValidationGate.validate(noQuoteCandidate);
    expect(result.isValid).toBe(false);
    expect(result.checks.quotePresent).toBe(false);
    expect(result.verificationStatus).toBe('REJECTED');
    expect(result.rejectionReasons.some(r =>
      r.toLowerCase().includes('mandatory') || r.toLowerCase().includes('quotedtext')
    )).toBe(true);

    // Very short quote (≤ 10 chars) also fails
    const tinyQuoteCandidate: CandidateFactInput = {
      ...noQuoteCandidate,
      factId: 'FACT_TINYQUOTE',
      sourceQuotedText: '1250'
    };
    expect(FactValidationGate.validate(tinyQuoteCandidate).checks.quotePresent).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-9: Case B Restatement MUST Produce SUPERSEDED + COMPARABLE
  // Audit finding: Case B was SUPERSEDED + NOT_COMPARABLE. This incorrectly
  // blocked restatement magnitude analysis and audit trail reviews.
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-9: Restatement (Case B) MUST produce ContradictionState=SUPERSEDED + ComparabilityState=COMPARABLE', () => {
    const originalFiling: FinancialFact = {
      factId: 'FACT_ORIG_FY24',
      issuerSymbol: 'TATASTEEL',
      metric: 'REVENUE',
      metricFamily: 'REVENUE',
      value: 1000,
      unit: 'INR_CRORE',
      scope: 'CONSOLIDATED',
      measurementType: 'FLOW',
      periodStart: '2023-04-01',
      periodEnd: '2024-03-31',
      measurementPeriod: 'FY24',
      sourceEvidenceId: 'EV_ORIG_001',
      filingType: 'ANNUAL_REPORT',
      filingDate: '2024-05-15',
      auditStatus: 'UNAUDITED'
    };

    const auditedRestatement: FinancialFact = {
      ...originalFiling,
      factId: 'FACT_RESTATE_FY24',
      value: 950,  // Audited restatement: ₹950 Cr (was ₹1,000 Cr)
      sourceEvidenceId: 'EV_RESTATE_002',
      filingType: 'STATUTORY_RESTATEMENT',
      filingDate: '2024-09-01',  // Later date (after original)
      auditStatus: 'AUDITED',
      notes: 'Statutory restatement: revenue revised to ₹950 Cr after audit adjustment.'
    };

    const result = ContradictionResolutionEngine.evaluateResolution({
      issuerSymbol: 'TATASTEEL',
      leftFact: originalFiling,
      rightFact: auditedRestatement
    });

    // v3.2.1 FIX: MUST be SUPERSEDED + COMPARABLE (not NOT_COMPARABLE)
    expect(result.contradictionState).toBe('SUPERSEDED');
    expect(result.comparabilityState).toBe('COMPARABLE');
    expect(result.resolutionOutcome).toBe('SUPERSEDED');

    // The policy rationale must explain why COMPARABLE is correct
    expect(result.policyRationale.toLowerCase()).toContain('comparable');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-10: Derived Fact IDs MUST Be Deterministic
  // Audit finding: derivedFactId used Date.now() → same inputs produced different
  // IDs on different executions, breaking replay/audit-trail integrity.
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-10: Derived fact ID MUST be deterministic (same inputs → same ID, no Date.now())', () => {
    const priorFact: FinancialFact = {
      factId: 'FACT_TATA_REV_FY23',
      issuerSymbol: 'TATASTEEL',
      metric: 'REVENUE',
      metricFamily: 'REVENUE',
      value: 1000,
      unit: 'INR_CRORE',
      currency: 'INR',
      scope: 'CONSOLIDATED',
      measurementType: 'FLOW',
      periodStart: '2022-04-01',
      periodEnd: '2023-03-31',
      measurementPeriod: 'FY23',
      sourceEvidenceId: 'EV_TATA_FY23'
    };

    const currentFact: FinancialFact = {
      factId: 'FACT_TATA_REV_FY24',
      issuerSymbol: 'TATASTEEL',
      metric: 'REVENUE',
      metricFamily: 'REVENUE',
      value: 1250,
      unit: 'INR_CRORE',
      currency: 'INR',
      scope: 'CONSOLIDATED',
      measurementType: 'FLOW',
      periodStart: '2023-04-01',
      periodEnd: '2024-03-31',
      measurementPeriod: 'FY24',
      sourceEvidenceId: 'EV_TATA_FY24'
    };

    // Run derivation TWICE — must produce identical IDs
    const result1 = FactDerivationEngine.deriveYoYGrowth(priorFact, currentFact);
    const result2 = FactDerivationEngine.deriveYoYGrowth(priorFact, currentFact);

    expect(result1.derivedFactId).toBe(result2.derivedFactId);
    expect(result1.calculatedAt).toBe(result2.calculatedAt);

    // Value must be correct: (1250 - 1000) / 1000 * 100 = 25%
    expect(result1.value).toBe(25);

    // ID must NOT contain timestamps or random suffixes
    expect(result1.derivedFactId).not.toMatch(/\d{13}/); // No Unix ms timestamps
    expect(result1.derivedFactId.startsWith('DF_')).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-11: Fail-Closed Replay MUST Throw if rawQuantInput is Missing
  // Audit finding: Replay fell back to deriving signalStrength from decisionState.
  // This is circular and MUST be eliminated.
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-11: Replay MUST throw (fail-closed) when rawQuantInput is absent', () => {
    const snapshotWithoutRawInput: any = {
      snapshotId: 'SNAP_NO_RAW',
      decisionId: 'DEC_001',
      issuerSymbol: 'TATASTEEL',
      evaluatedAt: '2024-06-15',
      decisionDate: '2024-06-15',
      schemaVersion: '3.2.1',
      ontologyVersion: '1.3',
      ruleSetVersion: '2026.09',
      policyVersion: '1.0',
      factVersion: '3.2.1',
      claimVersion: '3.2.1',
      rawQuantInput: undefined,  // MISSING — must fail-closed
      rawInputFacts: [
        {
          factId: 'FACT_001', issuerSymbol: 'TATASTEEL', metric: 'REVENUE',
          metricFamily: 'REVENUE', value: 1250, unit: 'INR_CRORE',
          scope: 'CONSOLIDATED', measurementType: 'FLOW',
          sourceEvidenceId: 'EV_001'
        }
      ],
      rawInputClaims: [],
      rawInputBreakers: [],
      rawInputContradictions: [],
      decisionState: {
        quantOpportunity: 'STRONG', intelligenceRisk: 'LOW',
        thesisState: 'SUPPORTED', managementCredibility: 'STRONG',
        activeThesisBreakers: 0, criticalUnknowns: 0,
        evidenceQuality: 'HIGH', interpretation: 'test',
        allocationRecommendation: 'FULL_TARGET_SIZING'
      },
      portfolioPolicy: { directive: 'FULL_TARGET_SIZING', targetSizingCapRatio: 1.0, policyRationale: 'test' },
      provenanceDAG: { rootDecisionId: 'DEC_001', nodes: [], edges: [] },
      provenanceHash: 'abc123',
      canonicalStateHash: 'abc123'
    };

    // MUST throw — not silently reconstruct from decisionState
    expect(() => DecisionReplayEngine.replayFromColdStorage(snapshotWithoutRawInput)).toThrow();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-12: YoY Derivation MUST Reject Cross-Metric / Cross-Scope Inputs
  // Audit finding: deriveYoYGrowth did not validate metric/unit/scope/period.
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-12: YoY derivation MUST reject cross-metric, cross-unit, cross-scope, and non-chronological inputs', () => {
    const baseFact: FinancialFact = {
      factId: 'F_BASE', issuerSymbol: 'TATASTEEL', metric: 'REVENUE',
      metricFamily: 'REVENUE', value: 1000, unit: 'INR_CRORE', currency: 'INR',
      scope: 'CONSOLIDATED', measurementType: 'FLOW',
      periodStart: '2022-04-01', periodEnd: '2023-03-31',
      sourceEvidenceId: 'EV_BASE'
    };
    const currentFact: FinancialFact = {
      ...baseFact,
      factId: 'F_CURRENT', value: 1250,
      periodStart: '2023-04-01', periodEnd: '2024-03-31'
    };

    // Valid derivation must succeed
    expect(() => FactDerivationEngine.deriveYoYGrowth(baseFact, currentFact)).not.toThrow();

    // Cross-metric: REVENUE vs EBITDA
    const ebitdaFact: FinancialFact = {
      ...currentFact, factId: 'F_EBITDA', metric: 'EBITDA', metricFamily: 'MARGIN'
    };
    expect(() => FactDerivationEngine.deriveYoYGrowth(baseFact, ebitdaFact)).toThrow(/metric/i);

    // Cross-unit: INR_CRORE vs INR_LAKH
    const lakhFact: FinancialFact = { ...currentFact, factId: 'F_LAKH', unit: 'INR_LAKH' };
    expect(() => FactDerivationEngine.deriveYoYGrowth(baseFact, lakhFact)).toThrow(/unit/i);

    // Cross-currency: INR vs USD
    const usdFact: FinancialFact = { ...currentFact, factId: 'F_USD', currency: 'USD' };
    expect(() => FactDerivationEngine.deriveYoYGrowth(baseFact, usdFact)).toThrow(/currency/i);

    // Cross-scope: CONSOLIDATED vs STANDALONE
    const standaloneFact: FinancialFact = { ...currentFact, factId: 'F_STANDALONE', scope: 'STANDALONE' };
    expect(() => FactDerivationEngine.deriveYoYGrowth(baseFact, standaloneFact)).toThrow(/scope/i);

    // Inverted chronological order (current before prior)
    expect(() => FactDerivationEngine.deriveYoYGrowth(currentFact, baseFact)).toThrow(/prior period/i);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-13: Strict Historical Publication Boundary (v3.2.1 P0-3 / P1-3)
  // ─────────────────────────────────────────────────────────────────────────
  describe('MR-13: strict historical publication boundary', () => {
    const cutoff = '2024-06-30';
    const baseFact: FinancialFact = {
      factId: 'FACT_HIST_BASE',
      issuerSymbol: 'TATASTEEL',
      metric: 'REVENUE',
      metricFamily: 'REVENUE',
      value: 1000,
      unit: 'INR_CRORE',
      currency: 'INR',
      scope: 'CONSOLIDATED',
      measurementType: 'FLOW',
      sourceEvidenceId: 'EV_BASE'
    };

    it('A: filing before cutoff is admissible', () => {
      const facts = [{
        ...baseFact,
        publicationDate: '2024-06-29'
      }];

      expect(
        DecisionReplayEngine
          .filterByHistoricalBoundary(facts, [], cutoff)
          .facts
      ).toHaveLength(1);
    });

    it('B: filing after cutoff is rejected', () => {
      const facts = [{
        ...baseFact,
        publicationDate: '2024-07-01'
      }];

      expect(
        DecisionReplayEngine
          .filterByHistoricalBoundary(facts, [], cutoff)
          .facts
      ).toHaveLength(0);
    });

    it('C: missing publication date cannot use periodEnd fallback', () => {
      const facts = [{
        ...baseFact,
        periodEnd: '2024-03-31',
        publicationDate: undefined
      }];

      expect(
        DecisionReplayEngine
          .filterByHistoricalBoundary(facts, [], cutoff)
          .facts
      ).toHaveLength(0);
    });

    it('D: missing publication date cannot use asOfDate fallback', () => {
      const facts = [{
        ...baseFact,
        asOfDate: '2024-03-31',
        publicationDate: undefined
      }];

      expect(
        DecisionReplayEngine
          .filterByHistoricalBoundary(facts, [], cutoff)
          .facts
      ).toHaveLength(0);
    });

    it('E: old accounting period with future publication is rejected', () => {
      const facts = [{
        ...baseFact,
        periodEnd: '2024-03-31',
        publicationDate: '2024-07-15'
      }];

      expect(
        DecisionReplayEngine
          .filterByHistoricalBoundary(facts, [], cutoff)
          .facts
      ).toHaveLength(0);
    });

    it('F: publication exactly on cutoff is admissible', () => {
      const facts = [{
        ...baseFact,
        publicationDate: cutoff
      }];

      expect(
        DecisionReplayEngine
          .filterByHistoricalBoundary(facts, [], cutoff)
          .facts
      ).toHaveLength(1);
    });

    it('G: malformed publication date is rejected', () => {
      const facts = [{
        ...baseFact,
        publicationDate: 'not-a-date'
      }];

      expect(
        DecisionReplayEngine
          .filterByHistoricalBoundary(facts, [], cutoff)
          .facts
      ).toHaveLength(0);
    });

    it('H: undated claim is rejected', () => {
      const claims = [{
        claimId: 'CLAIM_UNDATED'
      }];

      expect(
        DecisionReplayEngine
          .filterByHistoricalBoundary([], claims, cutoff)
          .claims
      ).toHaveLength(0);
    });

    it('I: post-cutoff claim is rejected', () => {
      const claims = [{
        claimId: 'CLAIM_FUTURE',
        publicationDate: '2024-07-01'
      }];

      expect(
        DecisionReplayEngine
          .filterByHistoricalBoundary([], claims, cutoff)
          .claims
      ).toHaveLength(0);
    });

    it('filingDate alone cannot make a fact historically admissible', () => {
      const fact = {
        ...baseFact,
        filingDate: '2024-06-01',
        publicationDate: undefined,
      };

      const result =
        DecisionReplayEngine.filterByHistoricalBoundary(
          [fact],
          [],
          '2024-06-30'
        );

      expect(result.facts).toHaveLength(0);
    });

    it('claims require publicationDate and cannot use filingDate fallback', () => {
      const claims = [{
        claimId: 'CLAIM_FILING_ONLY',
        filingDate: '2024-06-01',
        sourceFilingDate: '2024-06-01',
        publicationDate: undefined,
      }];

      const result =
        DecisionReplayEngine.filterByHistoricalBoundary(
          [],
          claims,
          '2024-06-30'
        );

      expect(result.claims).toHaveLength(0);
    });

    it('strictly rejects impossible and non-calendar dates', () => {
      const invalidDates = [
        '2024-02-31',
        '2024-13-01',
        '2024-06-30T12:00:00Z',
        '2024/06/30',
        'June 30 2024',
        '2024-06-30Tgarbage'
      ];

      for (const d of invalidDates) {
        const fact = { ...baseFact, publicationDate: d };
        const result = DecisionReplayEngine.filterByHistoricalBoundary([fact], [], '2024-06-30');
        expect(result.facts).toHaveLength(0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-14: Raw-Field Hash Tampering Matrix (v3.2.1 P1-4)
  // ─────────────────────────────────────────────────────────────────────────
  describe('MR-14: Complete material raw-input mutation matrix', () => {
    function expectRawHashMutation(
      snapshot: any,
      mutate: (copy: any) => void
    ) {
      const original = DecisionReplayEngine.computeRawInputHash(snapshot);
      const mutated = JSON.parse(JSON.stringify(snapshot));
      mutate(mutated);
      const mutatedHash = DecisionReplayEngine.computeRawInputHash(mutated);
      expect(mutatedHash).not.toBe(original);
    }

    const baseSnapshot: any = {
      snapshotId: 'SNAP_MR14',
      issuerSymbol: 'TATASTEEL',
      decisionDate: '2024-06-30',
      schemaVersion: '3.2.1',
      ontologyVersion: '1.3',
      ruleSetVersion: '2026.09',
      rawInputFacts: [{
        factId: 'FACT_001',
        issuerSymbol: 'TATASTEEL',
        metric: 'REVENUE',
        metricFamily: 'REVENUE',
        value: 1000,
        unit: 'INR_CRORE',
        currency: 'INR',
        scope: 'CONSOLIDATED',
        measurementType: 'FLOW',
        periodStart: '2023-04-01',
        periodEnd: '2024-03-31',
        filingDate: '2024-05-20',
        publicationDate: '2024-05-20',
        sourceEvidenceId: 'EV_001',
        sourceQuotedText: 'Revenue stood at ₹1,000 Cr for FY24',
        accountingMethodology: 'REPORTED',
        accountingStandard: 'IND_AS'
      }],
      rawInputClaims: [{
        claimId: 'CLAIM_001',
        claimText: 'Target revenue of ₹1,500 Cr by FY25',
        statement: 'Target revenue of ₹1,500 Cr by FY25'
      }],
      rawInputBreakers: [{
        breakerId: 'BREAKER_001',
        status: 'INACTIVE'
      }],
      rawInputContradictions: [{
        contradictionId: 'CONTRA_001',
        resolution: 'NO_CONTRADICTION'
      }],
      rawQuantInput: {
        symbol: 'TATASTEEL',
        price: 150,
        signalStrength: 80
      }
    };

    it('MR-14: material fact mutations alter rawInputHash', () => {
      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].value = 1001;
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].metric = 'EBITDA';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].unit = 'INR_LAKH';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].currency = 'USD';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].scope = 'STANDALONE';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].issuerSymbol = 'OTHER';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].measurementType = 'STOCK';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].periodStart = '2023-04-02';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].periodEnd = '2024-04-01';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].filingDate = '2024-07-01';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].sourceEvidenceId = 'EV_OTHER';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].sourceQuotedText = 'Different source evidence';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].accountingMethodology = 'ADJUSTED';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputFacts[0].accountingStandard = 'IFRS';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputClaims[0].claimText = 'Different claim';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputBreakers[0].status = 'ACTIVE';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawInputContradictions[0].resolution = 'CONFLICTING';
      });

      expectRawHashMutation(baseSnapshot, s => {
        s.rawQuantInput.price = s.rawQuantInput.price + 1;
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-15: Hash Ordering Invariant (v3.2.1 P1-5)
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-15: raw input ordering does not alter hash', () => {
    const baseSnapshot: any = {
      snapshotId: 'SNAP_MR15',
      issuerSymbol: 'TATASTEEL',
      decisionDate: '2024-06-30',
      schemaVersion: '3.2.1',
      ontologyVersion: '1.3',
      ruleSetVersion: '2026.09',
      rawInputClaims: [],
      rawInputBreakers: [],
      rawInputContradictions: [],
      rawQuantInput: null
    };

    const factA: FinancialFact = {
      factId: 'FACT_A', issuerSymbol: 'TATASTEEL', metric: 'REVENUE',
      metricFamily: 'REVENUE', value: 100, unit: 'INR_CRORE', scope: 'CONSOLIDATED',
      measurementType: 'FLOW', sourceEvidenceId: 'EV_A'
    };
    const factB: FinancialFact = {
      factId: 'FACT_B', issuerSymbol: 'TATASTEEL', metric: 'EBITDA',
      metricFamily: 'MARGIN', value: 20, unit: 'INR_CRORE', scope: 'CONSOLIDATED',
      measurementType: 'FLOW', sourceEvidenceId: 'EV_B'
    };
    const factC: FinancialFact = {
      factId: 'FACT_C', issuerSymbol: 'TATASTEEL', metric: 'PAT',
      metricFamily: 'MARGIN', value: 10, unit: 'INR_CRORE', scope: 'CONSOLIDATED',
      measurementType: 'FLOW', sourceEvidenceId: 'EV_C'
    };

    const snapshotA = {
      ...baseSnapshot,
      rawInputFacts: [factA, factB, factC]
    };

    const snapshotB = {
      ...baseSnapshot,
      rawInputFacts: [factC, factA, factB]
    };

    expect(
      DecisionReplayEngine.computeRawInputHash(snapshotA)
    ).toBe(
      DecisionReplayEngine.computeRawInputHash(snapshotB)
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-16: Historical Contamination Protection (v3.2.1 P1-7)
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-16: historical replay is invariant to future evidence', () => {
    const decisionDate = '2024-06-30';

    const historicalFact: FinancialFact = {
      factId: 'F_HIST', issuerSymbol: 'TATASTEEL', metric: 'REVENUE',
      metricFamily: 'REVENUE', value: 1000, unit: 'INR_CRORE', scope: 'CONSOLIDATED',
      measurementType: 'FLOW', publicationDate: '2024-05-15', sourceEvidenceId: 'EV_HIST'
    };
    const futureFact: FinancialFact = {
      factId: 'F_FUTURE', issuerSymbol: 'TATASTEEL', metric: 'REVENUE',
      metricFamily: 'REVENUE', value: 1200, unit: 'INR_CRORE', scope: 'CONSOLIDATED',
      measurementType: 'FLOW', publicationDate: '2024-08-15', sourceEvidenceId: 'EV_FUTURE'
    };

    const cleanFiltered = DecisionReplayEngine.filterByHistoricalBoundary([historicalFact], [], decisionDate);
    const contaminatedFiltered = DecisionReplayEngine.filterByHistoricalBoundary([historicalFact, futureFact], [], decisionDate);

    expect(contaminatedFiltered.facts).toEqual(cleanFiltered.facts);
    expect(contaminatedFiltered.facts.length).toBe(1);
    expect(contaminatedFiltered.facts[0].factId).toBe('F_HIST');

    // Pre-cutoff document can alter the boundary when materially relevant
    const earlierFact: FinancialFact = {
      factId: 'F_EARLIER', issuerSymbol: 'TATASTEEL', metric: 'EBITDA',
      metricFamily: 'MARGIN', value: 150, unit: 'INR_CRORE', scope: 'CONSOLIDATED',
      measurementType: 'FLOW', publicationDate: '2024-04-10', sourceEvidenceId: 'EV_EARLY'
    };
    const withEarlier = DecisionReplayEngine.filterByHistoricalBoundary([historicalFact, earlierFact], [], decisionDate);
    expect(withEarlier.facts.length).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-17 & MR-18: Deterministic Decision Snapshots & Timestamp Separation (v3.2.1 P1-8)
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-17: identical inputs and decisionDate produce identical deterministic identity', () => {
    const service = new ItasIiceReconciliationService();
    const input: ItasQuantInput = {
      symbol: 'TATASTEEL',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 85,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    };
    const iice: IiceIntelligenceInput = {
      symbol: 'TATASTEEL',
      companyName: 'Tata Steel',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      walkTheTalk: {
        totalClaims: 2,
        achievedClaims: 2,
        brokenClaims: 0,
        pendingClaims: 0,
        unverifiableClaims: 0,
        grade: 'STRONG',
        sayDoRatio: 1.0,
        historicalBasis: 'PRIMARY',
        keyEvidencedExamples: []
      },
      contradictions: [],
      evaluatedBreakers: [],
      unknowns: [],
      recentEvents: [],
      evidenceCount: 5
    };

    const brief1 = service.generateBrief(input, iice);
    const brief2 = service.generateBrief(input, iice);
    const result1 = brief1.decisionState.decisionSnapshot!;
    const result2 = brief2.decisionState.decisionSnapshot!;

    expect(result1.snapshotId).toBe(result2.snapshotId);
    expect(result1.canonicalStateHash).toBe(result2.canonicalStateHash);

    const hash1 = DecisionReplayEngine.computeRawInputHash(result1);
    const hash2 = DecisionReplayEngine.computeRawInputHash(result2);
    expect(hash1).toBe(hash2);
  });

  it('MR-18: evaluatedAt does not alter deterministic hashes', () => {
    const service = new ItasIiceReconciliationService();
    const inputA: ItasQuantInput = {
      symbol: 'TATASTEEL',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 85,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30',
      evaluatedAt: '2024-07-01T10:00:00Z'
    };
    const inputB: ItasQuantInput = {
      ...inputA,
      evaluatedAt: '2025-07-01T10:00:00Z'
    };
    const iice: IiceIntelligenceInput = {
      symbol: 'TATASTEEL',
      companyName: 'Tata Steel',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      walkTheTalk: {
        totalClaims: 2,
        achievedClaims: 2,
        brokenClaims: 0,
        pendingClaims: 0,
        unverifiableClaims: 0,
        grade: 'STRONG',
        sayDoRatio: 1.0,
        historicalBasis: 'PRIMARY',
        keyEvidencedExamples: []
      },
      contradictions: [],
      evaluatedBreakers: [],
      unknowns: [],
      recentEvents: [],
      evidenceCount: 5
    };

    const snapA = service.generateBrief(inputA, iice).decisionState.decisionSnapshot!;
    const snapB = service.generateBrief(inputB, iice).decisionState.decisionSnapshot!;

    expect(snapA.canonicalStateHash).toBe(snapB.canonicalStateHash);
    expect(snapA.snapshotId).toBe(snapB.snapshotId);
    expect(DecisionReplayEngine.computeRawInputHash(snapA)).toBe(DecisionReplayEngine.computeRawInputHash(snapB));
  });

  it('MR-18b: changing only evaluatedAt cannot change either deterministic hash', () => {
    const service = new ItasIiceReconciliationService();
    const inputA: ItasQuantInput = {
      symbol: 'TATASTEEL',
      strategyAgreementCount: 16,
      totalStrategiesEvaluated: 20,
      signalStrength: 85,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    };
    const iice: IiceIntelligenceInput = {
      symbol: 'TATASTEEL',
      companyName: 'Tata Steel',
      marketCapTier: 'LARGECAP',
      exchangeBoard: 'MAIN_BOARD',
      walkTheTalk: {
        totalClaims: 2,
        achievedClaims: 2,
        brokenClaims: 0,
        pendingClaims: 0,
        unverifiableClaims: 0,
        grade: 'STRONG',
        sayDoRatio: 1.0,
        historicalBasis: 'PRIMARY',
        keyEvidencedExamples: []
      },
      contradictions: [],
      evaluatedBreakers: [],
      unknowns: [],
      recentEvents: [],
      evidenceCount: 5
    };

    const original =
      service.generateBrief(inputA, iice).decisionState.decisionSnapshot!;

    const modified = {
      ...original,
      evaluatedAt: '2099-12-31T23:59:59.999Z',
    };

    expect(modified.evaluatedAt).not.toBe(original.evaluatedAt);

    expect(
      DecisionReplayEngine.computeRawInputHash(modified)
    ).toBe(
      DecisionReplayEngine.computeRawInputHash(original)
    );

    expect(modified.canonicalStateHash)
      .toBe(original.canonicalStateHash);

    expect(modified.snapshotId)
      .toBe(original.snapshotId);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MR-19: Zero Hardcoding / Issuer Invariance (v3.2.1 P1-10)
  // ─────────────────────────────────────────────────────────────────────────
  it('MR-19: reasoning engines process artificial issuers through identical rules (hardcoding resistance)', () => {
    const service = new ItasIiceReconciliationService();
    const fakeQuantA: ItasQuantInput = {
      symbol: 'ZZZ_FAKE_ISSUER_A',
      strategyAgreementCount: 18,
      totalStrategiesEvaluated: 20,
      signalStrength: 92,
      marketRegime: 'BULLISH',
      quantDirective: 'STRONG_BUY',
      decisionDate: '2024-06-30'
    };
    const fakeQuantB: ItasQuantInput = {
      ...fakeQuantA,
      symbol: 'ZZZ_FAKE_ISSUER_B'
    };
    const fakeIiceA: IiceIntelligenceInput = {
      symbol: 'ZZZ_FAKE_ISSUER_A',
      companyName: 'Fake A',
      marketCapTier: 'MIDCAP',
      exchangeBoard: 'MAIN_BOARD',
      walkTheTalk: {
        totalClaims: 2,
        achievedClaims: 2,
        brokenClaims: 0,
        pendingClaims: 0,
        unverifiableClaims: 0,
        grade: 'STRONG',
        sayDoRatio: 1.0,
        historicalBasis: 'PRIMARY',
        keyEvidencedExamples: []
      },
      contradictions: [],
      evaluatedBreakers: [],
      unknowns: [],
      recentEvents: [],
      evidenceCount: 4
    };
    const fakeIiceB: IiceIntelligenceInput = {
      ...fakeIiceA,
      symbol: 'ZZZ_FAKE_ISSUER_B',
      companyName: 'Fake B'
    };

    const decisionA = service.reconcile(fakeQuantA, fakeIiceA);
    const decisionB = service.reconcile(fakeQuantB, fakeIiceB);

    expect(decisionA.quantOpportunity).toBe(decisionB.quantOpportunity);
    expect(decisionA.intelligenceRisk).toBe(decisionB.intelligenceRisk);
    expect(decisionA.thesisState).toBe(decisionB.thesisState);
    expect(decisionA.portfolioPolicy?.directive).toBe(decisionB.portfolioPolicy?.directive);
  });
});

