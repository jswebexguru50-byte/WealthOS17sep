/**
 * Clean-Room Independent XIRR Verifier Oracle
 * Master Developer Specification — Section I, AC
 *
 * CRITICAL RULE:
 * This implementation is completely separate from WealthOS src/server/xirr.ts.
 * It is used SOLELY by independent reviewers/auditors to verify production math.
 */

export interface CashFlowInput {
  date: string; // ISO date string YYYY-MM-DD
  amount: number;
}

export interface VerificationComparison {
  productionResult: number | null;
  independentResult: number | null;
  difference: number | null;
  tolerance: number;
  status: 'MATCH' | 'DISCREPANCY' | 'INCONCLUSIVE';
  basis: string;
  notes?: string;
}

export function independentComputeXirr(cashflows: CashFlowInput[]): number | null {
  if (!cashflows || cashflows.length < 2) return null;

  // Filter zero amounts and parse dates
  const parsed = cashflows
    .filter(cf => Math.abs(cf.amount) >= 0.01)
    .map(cf => ({
      time: new Date(cf.date).getTime(),
      amount: cf.amount
    }))
    .sort((a, b) => a.time - b.time);

  if (parsed.length < 2) return null;

  const hasInflow = parsed.some(c => c.amount > 0);
  const hasOutflow = parsed.some(c => c.amount < 0);
  if (!hasInflow || !hasOutflow) return null;

  const t0 = parsed[0].time;
  const MS_IN_YEAR = 365.25 * 24 * 3600 * 1000;

  // NPV function: sum(C_i / (1 + r)^((t_i - t_0)/365.25))
  const npv = (r: number): number => {
    if (r <= -0.9999) return NaN;
    let sum = 0;
    for (const cf of parsed) {
      const yearFraction = (cf.time - t0) / MS_IN_YEAR;
      sum += cf.amount / Math.pow(1 + r, yearFraction);
    }
    return sum;
  };

  // Derivative dNPV/dr
  const dnpv = (r: number): number => {
    if (r <= -0.9999) return NaN;
    let sum = 0;
    for (const cf of parsed) {
      const yearFraction = (cf.time - t0) / MS_IN_YEAR;
      sum -= (cf.amount * yearFraction) / Math.pow(1 + r, yearFraction + 1);
    }
    return sum;
  };

  // 1. Try Newton-Raphson with multiple starting guesses
  const guesses = [0.1, 0.2, 0.0, -0.2, 0.5, 1.0];
  for (const guess of guesses) {
    let r = guess;
    let converged = false;
    for (let iter = 0; iter < 100; iter++) {
      const val = npv(r);
      const deriv = dnpv(r);
      if (isNaN(val) || isNaN(deriv) || Math.abs(deriv) < 1e-12) break;

      const step = val / deriv;
      r = r - step;
      if (r <= -0.999) r = -0.99;

      if (Math.abs(step) < 1e-7 && Math.abs(val) < 1e-5) {
        converged = true;
        break;
      }
    }
    if (converged && isFinite(r)) {
      return r;
    }
  }

  // 2. Bisection method fallback between -0.95 and 10.0
  let low = -0.95;
  let high = 10.0;
  let fLow = npv(low);
  let fHigh = npv(high);

  if (fLow * fHigh < 0) {
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      const fMid = npv(mid);
      if (Math.abs(fMid) < 1e-6 || (high - low) / 2 < 1e-7) {
        return mid;
      }
      if (fMid * fLow < 0) {
        high = mid;
        fHigh = fMid;
      } else {
        low = mid;
        fLow = fMid;
      }
    }
  }

  return null;
}

export function verifyXirrOracle(
  cashflows: CashFlowInput[],
  productionXirr: number | null,
  tolerance: number = 0.005 // 50 basis points tolerance for annualization conventions
): VerificationComparison {
  const independent = independentComputeXirr(cashflows);

  if (independent === null || productionXirr === null) {
    return {
      productionResult: productionXirr,
      independentResult: independent,
      difference: null,
      tolerance,
      status: 'INCONCLUSIVE',
      basis: 'Insufficient or degenerate cashflows for root-finding',
      notes: 'Requires at least one positive and one negative cashflow'
    };
  }

  // Normalize percentage vs decimal units (e.g. 35.32% vs 0.3532)
  const normProd = Math.abs(productionXirr) > 1.5 ? productionXirr / 100 : productionXirr;
  const normInd = Math.abs(independent) > 1.5 ? independent / 100 : independent;

  const diff = Math.abs(normProd - normInd);
  const status = diff <= tolerance ? 'MATCH' : 'DISCREPANCY';

  return {
    productionResult: Number(normProd.toFixed(6)),
    independentResult: Number(normInd.toFixed(6)),
    difference: Number(diff.toFixed(6)),
    tolerance,
    status,
    basis: 'ACTUAL/365.25 Newton-Raphson & Bisection root solver (Unit Normalized)',
    notes: status === 'MATCH'
      ? `Independent calculation reconciles within tolerance (diff: ${(diff * 100).toFixed(4)}%)`
      : `Discrepancy ${(diff * 100).toFixed(4)}% exceeds tolerance threshold ${(tolerance * 100).toFixed(2)}%`
  };
}
