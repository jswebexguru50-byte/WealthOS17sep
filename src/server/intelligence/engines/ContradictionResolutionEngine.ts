/**
 * ContradictionResolutionEngine.ts
 *
 * FERE v3.2.1 Multi-Factor Contradiction Resolution Policy Engine.
 * Resolves divergences between candidate facts, claims, and external intelligence.
 *
 * Implements the orthogonal separation between:
 * - ContradictionState: NO_CONTRADICTION | CONFLICTING | SUPERSEDED | STALE | UNRESOLVED
 * - ComparabilityState: COMPARABLE | NOT_COMPARABLE | CONDITIONALLY_COMPARABLE
 *
 * v3.2.1 Critical Fixes:
 * ─────────────────────────────────────────────────────────────────────────────
 * FIX 1 — Case B Comparability Correction:
 *   BEFORE: Restatement → SUPERSEDED + NOT_COMPARABLE   ← WRONG
 *   AFTER:  Restatement → SUPERSEDED + COMPARABLE        ← CORRECT
 *
 *   Rationale: FY24 Revenue original filing (₹1,000 Cr) and audited restatement (₹950 Cr)
 *   both describe the SAME economic metric, period, scope, and measurement basis.
 *   The old value is superseded as the OPERATIVE value, but the two observations are
 *   semantically COMPARABLE (for growth derivations, restatement magnitude analysis, etc.).
 *   Marking them NOT_COMPARABLE would incorrectly prevent restatement impact analysis.
 *
 * FIX 2 — Methodology is now a real comparison, not a hardcoded constant:
 *   BEFORE: const sameMethodology = true;  // IndAS GAAP canonical standard
 *   AFTER:  Compares accountingMethodology and accountingStandard fields on FinancialFact.
 *
 *   Rationale: Reported EBITDA ≠ Adjusted EBITDA ≠ Lease-adjusted EBITDA.
 *   IND_AS EBITDA ≠ US_GAAP EBITDA.
 *   These are NOT automatically interchangeable and must be flagged as NOT_COMPARABLE.
 *
 * Explicit Invariant (preserved):
 *   No conflict may be resolved solely by document chronology when authority,
 *   period, and metric are otherwise equivalent. (Case C produces CONFLICTING).
 */

import { FinancialFact } from '../types/FinancialFact.js';
import {
  ContradictionResolutionStatus,
  ContradictionResolutionFactorEvaluation,
  ContradictionState,
  ComparabilityState
} from '../types/Contradiction.js';

export interface ContradictionEvaluationInput {
  issuerSymbol: string;
  leftFact: FinancialFact;
  rightFact: FinancialFact;
}

export class ContradictionResolutionEngine {
  /**
   * Evaluates a potential divergence between two facts under the FERE v3.2.1 Resolution Policy.
   */
  public static evaluateResolution(
    input: ContradictionEvaluationInput
  ): ContradictionResolutionFactorEvaluation {
    const { leftFact, rightFact, issuerSymbol } = input;

    const sameIssuer =
      leftFact.issuerSymbol === rightFact.issuerSymbol &&
      leftFact.issuerSymbol === issuerSymbol;

    const sameMetric =
      (leftFact.metricId || leftFact.metric).toLowerCase() ===
      (rightFact.metricId || rightFact.metric).toLowerCase();

    const sameMetricFamily = leftFact.metricFamily === rightFact.metricFamily;

    const sameUnit = leftFact.unit.toLowerCase() === rightFact.unit.toLowerCase();

    // Currency comparison
    const leftCcy = (leftFact.currency || '').trim().toUpperCase();
    const rightCcy = (rightFact.currency || '').trim().toUpperCase();
    const sameCurrency = !leftCcy || !rightCcy || leftCcy === rightCcy;

    // Measurement period comparison
    const leftPeriod = leftFact.measurementPeriod ||
      `${leftFact.periodStart || ''}_${leftFact.periodEnd || leftFact.asOfDate || ''}`;
    const rightPeriod = rightFact.measurementPeriod ||
      `${rightFact.periodStart || ''}_${rightFact.periodEnd || rightFact.asOfDate || ''}`;
    const sameMeasurementPeriod = leftPeriod === rightPeriod;

    // Scope comparison
    const leftScope = leftFact.scope || 'CONSOLIDATED';
    const rightScope = rightFact.scope || 'CONSOLIDATED';
    const sameScope = leftScope === rightScope;

    // Measurement type comparison (Flow vs Stock)
    const sameMeasurementType = leftFact.measurementType === rightFact.measurementType;

    // ── v3.2.1 FIX 2: Real methodology comparison (replaces hardcoded sameMethodology = true) ──
    // Accounting methodology: REPORTED vs ADJUSTED vs NORMALIZED vs STATUTORY vs MANAGEMENT_DEFINED
    // If either side is undefined, we conservatively treat as compatible (avoid false positives
    // where methodology wasn't populated during migration).
    const leftMethodology = leftFact.accountingMethodology;
    const rightMethodology = rightFact.accountingMethodology;
    const sameMethodology =
      !leftMethodology ||
      !rightMethodology ||
      leftMethodology === rightMethodology;

    // Accounting standard: IND_AS vs IFRS vs US_GAAP vs IGAAP
    const leftStandard = leftFact.accountingStandard;
    const rightStandard = rightFact.accountingStandard;
    const sameStandard =
      !leftStandard ||
      !rightStandard ||
      leftStandard === rightStandard ||
      leftStandard === 'UNKNOWN' ||
      rightStandard === 'UNKNOWN';

    // Combined methodology compatibility
    const methodologiesCompatible = sameMethodology && sameStandard;

    // Restatement check
    const isRestatementOrAmendment =
      (rightFact.filingType === 'STATUTORY_RESTATEMENT' ||
       rightFact.filingType === 'AMENDED_ANNUAL_REPORT' ||
       rightFact.notes?.toLowerCase().includes('restatement') ||
       rightFact.notes?.toLowerCase().includes('amended')) ?? false;

    // Source authority ranking
    const getAuthorityRank = (fact: FinancialFact): number => {
      if (fact.auditStatus === 'AUDITED' ||
          fact.filingType === 'ANNUAL_REPORT' ||
          fact.filingType === 'STATUTORY_AUDITED_FINANCIALS') return 3;
      if (fact.auditStatus === 'LIMITED_REVIEW' ||
          fact.filingType === 'STATUTORY_FILING') return 2;
      return 1;
    };

    const leftRank = getAuthorityRank(leftFact);
    const rightRank = getAuthorityRank(rightFact);
    const sourceAuthorityComparison =
      leftRank > rightRank ? 'LEFT_HIGHER' :
      rightRank > leftRank ? 'RIGHT_HIGHER' :
      'EQUIVALENT';

    // Chronology check
    const leftDate = new Date(leftFact.filingDate || leftFact.asOfDate || '2000-01-01').getTime();
    const rightDate = new Date(rightFact.filingDate || rightFact.asOfDate || '2000-01-01').getTime();
    const publicationChronology =
      leftDate < rightDate ? 'LEFT_EARLIER' :
      rightDate < leftDate ? 'RIGHT_EARLIER' :
      'CONTEMPORANEOUS';

    // Values comparison
    const isValuesIdentical = String(leftFact.value) === String(rightFact.value);

    // Multi-factor resolution synthesis across Adversarial Cases A-E:
    let contradictionState: ContradictionState;
    let comparabilityState: ComparabilityState;
    let resolutionOutcome: ContradictionResolutionStatus;
    let policyRationale: string;

    // ── Case D: Scope divergence (Standalone vs Consolidated) ────────────────
    if (sameIssuer && sameMetric && !sameScope) {
      contradictionState = 'NO_CONTRADICTION';
      comparabilityState = 'NOT_COMPARABLE';
      resolutionOutcome = 'NOT_COMPARABLE';
      policyRationale =
        'Case D: Scope mismatch (Standalone vs Consolidated). ' +
        'Observations represent different corporate perimeters — not a factual contradiction.';
    }
    // ── Methodology incompatibility (REPORTED vs ADJUSTED vs STATUTORY) ──────
    else if (sameIssuer && sameMetric && !methodologiesCompatible) {
      contradictionState = 'NO_CONTRADICTION';
      comparabilityState = 'NOT_COMPARABLE';
      resolutionOutcome = 'NOT_COMPARABLE';
      policyRationale =
        `Methodology mismatch: accounting methodology (${leftMethodology} vs ${rightMethodology}) ` +
        `or accounting standard (${leftStandard} vs ${rightStandard}) differs. ` +
        `REPORTED EBITDA, ADJUSTED EBITDA, and STATUTORY EBITDA are not automatically interchangeable.`;
    }
    // ── Currency incompatibility ─────────────────────────────────────────────
    else if (sameIssuer && sameMetric && !sameCurrency) {
      contradictionState = 'NO_CONTRADICTION';
      comparabilityState = 'NOT_COMPARABLE';
      resolutionOutcome = 'NOT_COMPARABLE';
      policyRationale =
        `Currency mismatch: (${leftCcy} vs ${rightCcy}). ` +
        `Cannot compare revenue reported in different currencies without FX conversion.`;
    }
    // ── Case E: Family/MeasurementType divergence ────────────────────────────
    else if (sameIssuer && (!sameMetricFamily || !sameMeasurementType)) {
      contradictionState = 'NO_CONTRADICTION';
      comparabilityState = 'NOT_COMPARABLE';
      resolutionOutcome = 'NOT_COMPARABLE';
      policyRationale =
        'Case E: Measurement type or metric family mismatch ' +
        '(e.g. Dispatches vs Order Book). Not comparable.';
    }
    // ── Entity/metric/unit mismatch ──────────────────────────────────────────
    else if (!sameIssuer || !sameMetric || !sameUnit) {
      contradictionState = 'NO_CONTRADICTION';
      comparabilityState = 'NOT_COMPARABLE';
      resolutionOutcome = 'NOT_COMPARABLE';
      policyRationale =
        'Facts differ in entity, metric name, or measurement unit. Divergence is not a contradiction.';
    }
    // ── Identical values ─────────────────────────────────────────────────────
    else if (isValuesIdentical) {
      contradictionState = 'NO_CONTRADICTION';
      comparabilityState = 'COMPARABLE';
      resolutionOutcome = 'CONFIRMED';
      policyRationale =
        'Both observations report identical values across evidence sources.';
    }
    // ── Case A: Chronological Flow Progression (FY2024 vs FY2025) ────────────
    else if (!sameMeasurementPeriod) {
      contradictionState = 'NO_CONTRADICTION';
      comparabilityState = 'COMPARABLE';
      resolutionOutcome = 'CONFIRMED';
      policyRationale =
        `Case A: Chronological progression across distinct reporting periods ` +
        `(${leftPeriod} vs ${rightPeriod}). ` +
        `Facts do not contradict and are comparable for growth derivations.`;
    }
    // ── Case B: Restatement or Higher-Authority Amendment ────────────────────
    // v3.2.1 FIX: ComparabilityState MUST be COMPARABLE (not NOT_COMPARABLE).
    //
    // Rationale: FY24 Revenue original (₹1,000 Cr) and audited restatement (₹950 Cr)
    // reference the SAME economic metric, period, scope, and basis. The old figure is
    // superseded as the operative value, but the two observations ARE semantically
    // comparable — e.g. for restatement magnitude analysis, audit trail review, etc.
    // Marking them NOT_COMPARABLE would prevent valid downstream use cases.
    else if (isRestatementOrAmendment && sourceAuthorityComparison !== 'LEFT_HIGHER') {
      contradictionState = 'SUPERSEDED';
      comparabilityState = 'COMPARABLE';   // ← v3.2.1 FIX (was NOT_COMPARABLE)
      resolutionOutcome = 'SUPERSEDED';
      policyRationale =
        'Case B: Subsequent statutory restatement amends and supersedes earlier reported figure. ' +
        'Earlier figure is SUPERSEDED as operative value. ' +
        'ComparabilityState = COMPARABLE because both observations describe the same economic metric, ' +
        'period, and scope — enabling restatement magnitude and audit trail analysis.';
    }
    else if (sourceAuthorityComparison === 'RIGHT_HIGHER' && publicationChronology === 'LEFT_EARLIER') {
      contradictionState = 'SUPERSEDED';
      comparabilityState = 'COMPARABLE';   // ← v3.2.1 FIX (was NOT_COMPARABLE)
      resolutionOutcome = 'SUPERSEDED';
      policyRationale =
        'Case B: Higher-authority statutory audit filing supersedes earlier provisional disclosure. ' +
        'ComparabilityState = COMPARABLE — same metric and period, superseded for operative use only.';
    }
    // ── Case C: Same Authority, Same Period, Same Metric, Different Values ────
    // INVARIANT: No conflict may be resolved solely by document chronology!
    else if (sourceAuthorityComparison === 'EQUIVALENT') {
      contradictionState = 'CONFLICTING';
      comparabilityState = 'COMPARABLE';
      resolutionOutcome = 'CONFLICTING';
      policyRationale =
        'Case C: Substantive divergence between sources of equivalent authority for identical period. ' +
        'Requires resolution (restatement/scope/extraction check). ' +
        'INVARIANT: chronology alone cannot resolve this conflict.';
    }
    else {
      contradictionState = 'UNRESOLVED';
      comparabilityState = 'CONDITIONALLY_COMPARABLE';
      resolutionOutcome = 'OPEN';
      policyRationale = 'Unresolved divergence under current policy evaluation.';
    }

    return {
      sameIssuer,
      sameMetric,
      sameScope,
      sameUnit,
      sameMeasurementPeriod,
      sameMethodology: methodologiesCompatible,  // v3.2.1: real comparison
      isRestatementOrAmendment,
      sourceAuthorityComparison,
      publicationChronology,
      contradictionState,
      comparabilityState,
      resolutionOutcome,
      policyRationale
    };
  }
}
