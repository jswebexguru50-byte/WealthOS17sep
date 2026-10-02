/**
 * WealthOS Fundamental Interpretation Calibration — Deterministic Arithmetic Verifiers
 * Master Specification — Section 20: Independent Arithmetic
 *
 * Recalculates arithmetic ratios directly from raw numbers so the reviewer does
 * not evaluate arithmetic manually, keeping arithmetic separate from interpretation.
 */

export interface ArithmeticCheckResult {
  metric: string;
  productionValue: number | null;
  oracleValue: number | null;
  difference: number;
  tolerance: number;
  status: 'MATCH' | 'MISMATCH' | 'NOT_CALCULABLE';
  details: string;
}

export class DeterministicVerifiers {
  /**
   * Recalculates percentage growth between two periods: ((v0 - v1) / |v1|) * 100
   */
  static verifyGrowth(v0: number | null, v1: number | null, productionGrowthPct: number | null, tolerance: number = 0.1): ArithmeticCheckResult {
    if (v0 === null || v1 === null || v1 === 0) {
      return {
        metric: 'YoY_GROWTH',
        productionValue: productionGrowthPct,
        oracleValue: null,
        difference: 0,
        tolerance,
        status: 'NOT_CALCULABLE',
        details: 'Insufficient or zero base period value'
      };
    }

    const oracle = Number((((v0 - v1) / Math.abs(v1)) * 100).toFixed(2));
    const diff = productionGrowthPct !== null ? Math.abs(productionGrowthPct - oracle) : 0;
    const match = productionGrowthPct !== null && diff <= tolerance;

    return {
      metric: 'YoY_GROWTH',
      productionValue: productionGrowthPct,
      oracleValue: oracle,
      difference: Number(diff.toFixed(3)),
      tolerance,
      status: match ? 'MATCH' : 'MISMATCH',
      details: `Oracle: ((${v0} - ${v1}) / |${v1}|) * 100 = ${oracle}%, Production: ${productionGrowthPct}%`
    };
  }

  /**
   * Recalculates margin percentage: (numerator / denominator) * 100
   */
  static verifyMargin(numerator: number | null, denominator: number | null, productionMarginPct: number | null, tolerance: number = 0.1): ArithmeticCheckResult {
    if (numerator === null || denominator === null || denominator === 0) {
      return {
        metric: 'MARGIN_PCT',
        productionValue: productionMarginPct,
        oracleValue: null,
        difference: 0,
        tolerance,
        status: 'NOT_CALCULABLE',
        details: 'Denominator zero or missing'
      };
    }

    const oracle = Number(((numerator / denominator) * 100).toFixed(2));
    const diff = productionMarginPct !== null ? Math.abs(productionMarginPct - oracle) : 0;
    const match = productionMarginPct !== null && diff <= tolerance;

    return {
      metric: 'MARGIN_PCT',
      productionValue: productionMarginPct,
      oracleValue: oracle,
      difference: Number(diff.toFixed(3)),
      tolerance,
      status: match ? 'MATCH' : 'MISMATCH',
      details: `Oracle: (${numerator} / ${denominator}) * 100 = ${oracle}%, Production: ${productionMarginPct}%`
    };
  }

  /**
   * Recalculates basis points delta: (margin0 - margin1) * 100
   */
  static verifyBpsDelta(m0: number | null, m1: number | null, productionBps: number | null, tolerance: number = 2): ArithmeticCheckResult {
    if (m0 === null || m1 === null) {
      return {
        metric: 'BPS_DELTA',
        productionValue: productionBps,
        oracleValue: null,
        difference: 0,
        tolerance,
        status: 'NOT_CALCULABLE',
        details: 'Missing prior or current margin'
      };
    }

    const oracle = Math.round((m0 - m1) * 100);
    const diff = productionBps !== null ? Math.abs(productionBps - oracle) : 0;
    const match = productionBps !== null && diff <= tolerance;

    return {
      metric: 'BPS_DELTA',
      productionValue: productionBps,
      oracleValue: oracle,
      difference: diff,
      tolerance,
      status: match ? 'MATCH' : 'MISMATCH',
      details: `Oracle: (${m0} - ${m1}) * 100 = ${oracle} bps, Production: ${productionBps} bps`
    };
  }

  /**
   * Recalculates Cash Conversion Ratio: CFO / PAT
   */
  static verifyCfoToPat(cfo: number | null, pat: number | null, productionRatio: number | null, tolerance: number = 0.05): ArithmeticCheckResult {
    if (cfo === null || pat === null || pat === 0) {
      return {
        metric: 'CFO_PAT_RATIO',
        productionValue: productionRatio,
        oracleValue: null,
        difference: 0,
        tolerance,
        status: 'NOT_CALCULABLE',
        details: 'Missing CFO or PAT zero'
      };
    }

    const oracle = Number((cfo / pat).toFixed(2));
    const diff = productionRatio !== null ? Math.abs(productionRatio - oracle) : 0;
    const match = productionRatio !== null && diff <= tolerance;

    return {
      metric: 'CFO_PAT_RATIO',
      productionValue: productionRatio,
      oracleValue: oracle,
      difference: Number(diff.toFixed(3)),
      tolerance,
      status: match ? 'MATCH' : 'MISMATCH',
      details: `Oracle: ${cfo} / ${pat} = ${oracle}x, Production: ${productionRatio}x`
    };
  }
}
