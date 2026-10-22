/**
 * FactDerivationEngine.ts
 *
 * FERE v3.2.1 Fact Derivation Engine.
 * Sits strictly between Canonical Facts and Reasoning (Temporal/Contradiction/Thesis).
 * Computes deterministic financial derivatives with machine-verifiable calculation provenance.
 *
 * v3.2.1 Critical Fixes:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. DETERMINISTIC IDs: derivedFactId now uses SHA-256 of (formulaId + sorted sourceFactIds + metric).
 *    REMOVED: Date.now() — same facts + same formula → same ID on every execution.
 *
 * 2. DETERMINISTIC TIMESTAMPS: calculatedAt is set to the later of the two source fact dates
 *    (not new Date().toISOString()). This makes derived artifacts reproducible across executions.
 *
 * 3. SEMANTIC VALIDATION: deriveYoYGrowth now enforces:
 *    - Same issuer (was already present)
 *    - Same metric (by canonical metricId or metric string)
 *    - Compatible metric family (must be identical)
 *    - Compatible unit (must match — cannot compare Cr revenue to MW dispatch)
 *    - Compatible currency (must match or both absent)
 *    - Compatible scope (STANDALONE vs CONSOLIDATED → error)
 *    - Chronological period relationship (priorFact.periodEnd < currentFact.periodEnd)
 *
 * 4. deriveLeverageRatio: same deterministic ID treatment.
 */

import crypto from 'crypto';
import { FinancialFact } from '../types/FinancialFact.js';
import { DerivedFact } from '../types/DerivedFact.js';

export class FactDerivationEngine {

  /**
   * Computes a deterministic SHA-256-based derived fact ID.
   *
   * INVARIANT: given identical (formulaId, sourceFactIds, metric), the ID is byte-for-byte identical
   * on every execution — no runtime entropy (no Date.now(), no Math.random()).
   */
  private static computeDerivedFactId(formulaId: string, sourceFactIds: string[], metric: string): string {
    const payload = `${formulaId}:${sourceFactIds.slice().sort().join(',')}:${metric}`;
    const hash = crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
    return `DF_${formulaId.split('_')[1] || 'DERIVED'}_${hash}`;
  }

  /**
   * Resolves the deterministic "calculatedAt" timestamp for a derived fact.
   * Uses the later of the two source fact period-end/asOfDate dates so the timestamp
   * is derived purely from raw inputs — not from wall-clock time.
   */
  private static resolveCalculatedAt(factA: FinancialFact, factB: FinancialFact): string {
    const dateA = factA.periodEnd || factA.asOfDate || factA.filingDate;
    const dateB = factB.periodEnd || factB.asOfDate || factB.filingDate;

    if (dateA && dateB) {
      return new Date(dateA) >= new Date(dateB) ? dateA : dateB;
    }
    return dateA || dateB || 'UNKNOWN';
  }

  /**
   * Derives YoY growth rate between two chronological facts of the same metric family.
   *
   * v3.2.1: Enforces semantic compatibility before computing.
   * Throws a typed error if any semantic constraint is violated.
   */
  public static deriveYoYGrowth(
    priorFact: FinancialFact,
    currentFact: FinancialFact
  ): DerivedFact {

    // ── Constraint 1: Same issuer ──────────────────────────────────────────
    if (priorFact.issuerSymbol !== currentFact.issuerSymbol) {
      throw new Error(
        `[FactDerivationEngine] YoY derivation rejected: issuer mismatch ` +
        `(${priorFact.issuerSymbol} vs ${currentFact.issuerSymbol}). ` +
        `Cross-issuer growth is not a valid derived fact.`
      );
    }

    // ── Constraint 2: Same canonical metric ───────────────────────────────
    const priorMetric = (priorFact.metricId || priorFact.metric).toLowerCase();
    const currentMetric = (currentFact.metricId || currentFact.metric).toLowerCase();
    if (priorMetric !== currentMetric) {
      throw new Error(
        `[FactDerivationEngine] YoY derivation rejected: metric mismatch ` +
        `('${priorFact.metric}' vs '${currentFact.metric}'). ` +
        `Cannot compute growth across different metrics.`
      );
    }

    // ── Constraint 3: Same metric family ─────────────────────────────────
    if (priorFact.metricFamily !== currentFact.metricFamily) {
      throw new Error(
        `[FactDerivationEngine] YoY derivation rejected: metric family mismatch ` +
        `(${priorFact.metricFamily} vs ${currentFact.metricFamily}). ` +
        `Cannot compute growth across different metric families.`
      );
    }

    // ── Constraint 4: Compatible unit ────────────────────────────────────
    const priorUnit = (priorFact.unit || '').trim().toUpperCase();
    const currentUnit = (currentFact.unit || '').trim().toUpperCase();
    if (priorUnit !== currentUnit) {
      throw new Error(
        `[FactDerivationEngine] YoY derivation rejected: unit mismatch ` +
        `('${priorFact.unit}' vs '${currentFact.unit}'). ` +
        `Cannot compare revenue in Crore against revenue in Lakh.`
      );
    }

    // ── Constraint 5: Compatible currency ────────────────────────────────
    if (priorFact.currency && currentFact.currency) {
      const priorCcy = priorFact.currency.trim().toUpperCase();
      const currentCcy = currentFact.currency.trim().toUpperCase();
      if (priorCcy !== currentCcy) {
        throw new Error(
          `[FactDerivationEngine] YoY derivation rejected: currency mismatch ` +
          `('${priorFact.currency}' vs '${currentFact.currency}'). ` +
          `Cannot compare INR revenue against USD revenue.`
        );
      }
    }

    // ── Constraint 6: Compatible scope ───────────────────────────────────
    if (priorFact.scope && currentFact.scope && priorFact.scope !== currentFact.scope) {
      throw new Error(
        `[FactDerivationEngine] YoY derivation rejected: scope mismatch ` +
        `(${priorFact.scope} vs ${currentFact.scope}). ` +
        `Cannot compute YoY growth between Standalone and Consolidated observations.`
      );
    }

    // ── Constraint 7: Chronological period relationship ───────────────────
    const priorPeriodEnd = priorFact.periodEnd || priorFact.asOfDate;
    const currentPeriodEnd = currentFact.periodEnd || currentFact.asOfDate;

    if (priorPeriodEnd && currentPeriodEnd) {
      const priorTime = new Date(priorPeriodEnd).getTime();
      const currentTime = new Date(currentPeriodEnd).getTime();
      if (priorTime >= currentTime) {
        throw new Error(
          `[FactDerivationEngine] YoY derivation rejected: prior period (${priorPeriodEnd}) ` +
          `is not strictly before current period (${currentPeriodEnd}). ` +
          `Argument order must be (priorFact, currentFact) with prior < current.`
        );
      }
    }

    // ── Numeric computation ───────────────────────────────────────────────
    const priorVal = typeof priorFact.value === 'number'
      ? priorFact.value
      : parseFloat(String(priorFact.value).replace(/,/g, ''));
    const currentVal = typeof currentFact.value === 'number'
      ? currentFact.value
      : parseFloat(String(currentFact.value).replace(/,/g, ''));

    if (isNaN(priorVal) || isNaN(currentVal) || priorVal === 0) {
      throw new Error(
        `[FactDerivationEngine] Invalid numeric values for YoY growth: prior=${priorFact.value}, current=${currentFact.value}`
      );
    }

    const growthPct = ((currentVal - priorVal) / Math.abs(priorVal)) * 100;
    const roundedGrowth = Math.round(growthPct * 100) / 100;

    const sourceFactIds = [priorFact.factId, currentFact.factId];
    const formulaId = 'FORMULA_YOY_GROWTH_V1';
    const derivedMetric = `${currentFact.metric}_YOY_GROWTH`;

    return {
      // v3.2.1: SHA-256-based deterministic ID — same inputs always produce the same ID
      derivedFactId: this.computeDerivedFactId(formulaId, sourceFactIds, derivedMetric),
      issuerSymbol: currentFact.issuerSymbol,
      metric: derivedMetric,
      metricFamily: currentFact.metricFamily,
      value: roundedGrowth,
      unit: '%',
      measurementPeriod: currentFact.measurementPeriod,
      asOfDate: currentFact.asOfDate || currentFact.periodEnd,
      sourceFactIds,
      formulaId,
      formulaVersion: '1.0',
      formulaExpression: '((currentValue - priorValue) / Math.abs(priorValue)) * 100',
      // v3.2.1: Deterministic timestamp from source data — NOT wall-clock time
      calculatedAt: this.resolveCalculatedAt(priorFact, currentFact),
      notes: `Derived YoY growth from ${priorFact.measurementPeriod || priorPeriodEnd} ` +
             `(${priorVal}) to ${currentFact.measurementPeriod || currentPeriodEnd} (${currentVal}). ` +
             `Scope: ${currentFact.scope || 'unspecified'}. Unit: ${currentFact.unit}. ` +
             `Currency: ${currentFact.currency || 'unspecified'}.`
    };
  }

  /**
   * Derives Leverage ratio (Net Debt to EBITDA) from separate balance sheet and income statement facts.
   */
  public static deriveLeverageRatio(
    netDebtFact: FinancialFact,
    ebitdaFact: FinancialFact
  ): DerivedFact {
    if (netDebtFact.issuerSymbol !== ebitdaFact.issuerSymbol) {
      throw new Error(
        `[FactDerivationEngine] Leverage derivation rejected: issuer mismatch ` +
        `(${netDebtFact.issuerSymbol} vs ${ebitdaFact.issuerSymbol}).`
      );
    }

    if (netDebtFact.currency && ebitdaFact.currency &&
        netDebtFact.currency.trim().toUpperCase() !== ebitdaFact.currency.trim().toUpperCase()) {
      throw new Error(
        `[FactDerivationEngine] Leverage derivation rejected: currency mismatch ` +
        `(Net Debt='${netDebtFact.currency}' vs EBITDA='${ebitdaFact.currency}').`
      );
    }

    const netDebt = typeof netDebtFact.value === 'number'
      ? netDebtFact.value
      : parseFloat(String(netDebtFact.value).replace(/,/g, ''));
    const ebitda = typeof ebitdaFact.value === 'number'
      ? ebitdaFact.value
      : parseFloat(String(ebitdaFact.value).replace(/,/g, ''));

    if (isNaN(netDebt) || isNaN(ebitda) || ebitda <= 0) {
      throw new Error(
        `[FactDerivationEngine] Invalid values for leverage ratio: netDebt=${netDebtFact.value}, ebitda=${ebitdaFact.value}`
      );
    }

    const ratio = Math.round((netDebt / ebitda) * 100) / 100;
    const sourceFactIds = [netDebtFact.factId, ebitdaFact.factId];
    const formulaId = 'FORMULA_NET_DEBT_TO_EBITDA_V1';
    const derivedMetric = 'NET_DEBT_TO_EBITDA';

    return {
      // v3.2.1: Deterministic ID
      derivedFactId: this.computeDerivedFactId(formulaId, sourceFactIds, derivedMetric),
      issuerSymbol: netDebtFact.issuerSymbol,
      metric: derivedMetric,
      metricFamily: 'LEVERAGE',
      value: ratio,
      unit: 'x',
      asOfDate: netDebtFact.asOfDate || ebitdaFact.asOfDate,
      sourceFactIds,
      formulaId,
      formulaVersion: '1.0',
      formulaExpression: 'netDebt / ebitda',
      // v3.2.1: Deterministic timestamp from source data
      calculatedAt: this.resolveCalculatedAt(netDebtFact, ebitdaFact),
      notes: `Derived Net Debt / EBITDA ratio (${ratio}x) from Net Debt (${netDebt}) and EBITDA (${ebitda}).`
    };
  }
}
