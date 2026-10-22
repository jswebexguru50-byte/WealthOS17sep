import { dbAll, dbGet } from './database.js';
import { parseDate } from './fifoEngine.js';

export interface CashFlow {
  date: Date;
  amount: number;
  type?: 'start' | 'tx' | 'end';
}

export function calculateXIRR(cashFlows: CashFlow[]): number {
  if (cashFlows.length < 2) return 0;

  // 1. Filter out zero flows and consolidate same-day flows
  const dateToAmount = new Map<string, number>();
  for (const cf of cashFlows) {
    if (Math.abs(cf.amount) < 0.01) continue;
    const year = cf.date.getFullYear();
    const month = String(cf.date.getMonth() + 1).padStart(2, '0');
    const day = String(cf.date.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    dateToAmount.set(dateKey, (dateToAmount.get(dateKey) || 0) + cf.amount);
  }

  const activeFlows = Array.from(dateToAmount.entries()).map(([dateStr, amount]) => ({
    date: new Date(dateStr),
    amount
  })).sort((a, b) => a.date.getTime() - b.date.getTime());

  if (activeFlows.length < 2) return 0;

  const hasPositive = activeFlows.some(cf => cf.amount > 0);
  const hasNegative = activeFlows.some(cf => cf.amount < 0);
  if (!hasPositive || !hasNegative) return 0;

  const firstDate = activeFlows[0].date.getTime();
  const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
  
  // f(rate) = sum of amount_i / (1 + rate)^((date_i - date_0) / 365)
  const f = (rate: number): number => {
    let sum = 0;
    const rSafe = rate <= -0.999 ? -0.999 : rate;
    for (const cf of activeFlows) {
      const fractionOfYears = (cf.date.getTime() - firstDate) / MS_PER_YEAR;
      sum += cf.amount / Math.pow(1 + rSafe, fractionOfYears);
    }
    return sum;
  };

  // Derivative: f'(rate) = sum of -amount_i * fraction_i * (1 + rate)^(-fraction_i - 1)
  const df = (rate: number): number => {
    let sum = 0;
    const rSafe = rate <= -0.999 ? -0.999 : rate;
    for (const cf of activeFlows) {
      const fractionOfYears = (cf.date.getTime() - firstDate) / MS_PER_YEAR;
      sum += -cf.amount * fractionOfYears * Math.pow(1 + rSafe, -fractionOfYears - 1);
    }
    return sum;
  };

  const maxIterations = 100;
  const precision = 1e-7;
  let resultRate = NaN;

  // Newton-Raphson with Multiple Initial Guesses
  // Different starting points catch cases where the NPV function has steep
  // gradients, multiple roots, or the single 0.1 guess diverges
  const initialGuesses = [0.1, 0.5, -0.3, 1.0, 2.0, 0.0, -0.5];
  for (const startGuess of initialGuesses) {
    if (!isNaN(resultRate)) break;
    let guess = startGuess;
    
    for (let i = 0; i < maxIterations; i++) {
      const val = f(guess);
      const deriv = df(guess);
      
      if (Math.abs(deriv) < 1e-12) break;

      let nextGuess = guess - val / deriv;
      if (nextGuess <= -0.999) nextGuess = -0.99;
      // Dampen large jumps to prevent divergence
      if (Math.abs(nextGuess - guess) > 5.0) {
        nextGuess = guess + Math.sign(nextGuess - guess) * 5.0;
      }

      if (Math.abs(nextGuess - guess) < precision) {
        if (!isNaN(nextGuess) && isFinite(nextGuess)) {
          resultRate = nextGuess;
        }
        break;
      }
      guess = nextGuess;
    }
  }

  // Secant Method Fallback if Newton-Raphson didn't converge from any guess
  if (isNaN(resultRate)) {
    let x0 = 0.1;
    let x1 = 0.2;
    let y0 = f(x0);
    let y1 = f(x1);

    for (let i = 0; i < maxIterations; i++) {
      if (Math.abs(y1 - y0) < 1e-12) break;

      let x2 = x1 - y1 * (x1 - x0) / (y1 - y0);
      if (x2 <= -0.999) x2 = -0.99;

      if (Math.abs(x2 - x1) < precision) {
        if (!isNaN(x2) && isFinite(x2)) {
          resultRate = x2;
        }
        break;
      }

      x0 = x1;
      y0 = y1;
      x1 = x2;
      y1 = f(x2);
    }
  }

  // Bisection Method Fallback if Newton & Secant both failed
  if (isNaN(resultRate)) {
    let low = -0.99;
    let high = 10.0; // 1000%
    let fLow = f(low);
    let fHigh = f(high);

    if (fLow * fHigh <= 0) {
      for (let i = 0; i < 100; i++) {
        const mid = (low + high) / 2;
        const fMid = f(mid);
        if (Math.abs(high - low) < precision || Math.abs(fMid) < 1e-7) {
          resultRate = mid;
          break;
        }
        if (fLow * fMid < 0) {
          high = mid;
          fHigh = fMid;
        } else {
          low = mid;
          fLow = fMid;
        }
      }
    }
  }

  // Brent's Method Fallback — combines bisection reliability with
  // inverse quadratic interpolation for superlinear convergence
  if (isNaN(resultRate)) {
    let a = -0.99;
    let b = 10.0;
    let fa = f(a);
    let fb = f(b);

    if (fa * fb < 0) {
      let c = a, fc = fa;
      let d = b - a, e = d;
      let mflag = true;

      for (let i = 0; i < 200; i++) {
        if (Math.abs(fa) < Math.abs(fb)) {
          // Swap so b always has the best estimate
          [a, b] = [b, a];
          [fa, fb] = [fb, fa];
        }

        const tol = 2 * 1e-12 * Math.abs(b) + precision;
        const m = 0.5 * (c - b);

        if (Math.abs(m) <= tol || Math.abs(fb) < 1e-10) {
          resultRate = b;
          break;
        }

        // Inverse quadratic interpolation or secant
        let s: number;
        if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
          const mu = fb / fa;
          if (Math.abs(a - c) < 1e-14) {
            // Secant step
            s = b + m * (2 * mu) / (1 - mu);
          } else {
            // Inverse quadratic interpolation
            const nu = fb / fc;
            const rho = fa / fc;
            s = b - (mu * (nu * (mu - rho) * (c - b) - (1 - rho) * (b - a))) / ((nu - 1) * (mu - 1) * (rho - 1));
          }

          // Acceptance conditions
          const cond1 = s < (3 * a + b) / 4 || s > b;
          const cond2 = mflag && Math.abs(s - b) >= Math.abs(d) / 2;
          const cond3 = !mflag && Math.abs(s - b) >= Math.abs(e) / 2;

          if (cond1 || cond2 || cond3) {
            s = b + m; // Fall back to bisection
            mflag = true;
          } else {
            mflag = false;
          }
        } else {
          s = b + m; // Bisection
          mflag = true;
        }

        if (s <= -0.999) s = -0.99;
        const fs = f(s);
        e = d;
        d = s - b;

        if (fa * fs < 0) {
          c = b; fc = fb;
          b = s; fb = fs;
        } else {
          c = a; fc = fa;
          a = s; fa = fs;
        }
      }
    }
  }

  const finalRate = !isNaN(resultRate) ? resultRate : 0;
  if (isNaN(finalRate) || !isFinite(finalRate)) return 0;

  const percentage = finalRate * 100;
  // Cap XIRR between -99.9% and 1000% to avoid astronomical/misleading numbers
  if (percentage > 1000) return 1000;
  if (percentage < -99.9) return -99.9;
  return percentage;
}

/**
 * Calculate Time-Weighted Return (TWR) using Modified Dietz method.
 * GIPS-compliant: measures portfolio manager skill independent of cash flow timing.
 * Complements XIRR (money-weighted) which measures actual investor experience.
 *
 * @param periodReturns Array of sub-period snapshots with start/end values and interim cash flows
 * @returns Annualized TWR as a percentage
 */
export interface TWRPeriod {
  startDate: Date;
  endDate: Date;
  startValue: number;
  endValue: number;
  cashFlows: { date: Date; amount: number }[];
}

export function calculateTWR(periods: TWRPeriod[]): number {
  if (periods.length === 0) return 0;

  let chainedReturn = 1.0;
  let totalDays = 0;

  for (const period of periods) {
    const periodDays = Math.max(1, (period.endDate.getTime() - period.startDate.getTime()) / (24 * 60 * 60 * 1000));
    totalDays += periodDays;

    if (period.startValue <= 0) continue;

    // Modified Dietz: weight each cash flow by fraction of period remaining
    let weightedCashFlows = 0;
    let totalCashFlows = 0;
    for (const cf of period.cashFlows) {
      const daysSinceStart = Math.max(0, (cf.date.getTime() - period.startDate.getTime()) / (24 * 60 * 60 * 1000));
      const weight = 1 - (daysSinceStart / periodDays);
      weightedCashFlows += cf.amount * weight;
      totalCashFlows += cf.amount;
    }

    const denominator = period.startValue + weightedCashFlows;
    if (denominator <= 0) continue;

    const periodReturn = (period.endValue - period.startValue - totalCashFlows) / denominator;
    chainedReturn *= (1 + periodReturn);
  }

  if (totalDays <= 0) return 0;
  const years = totalDays / 365.25;

  // Annualize if > 1 year; otherwise return absolute
  if (years >= 1.0) {
    const annualized = (Math.pow(chainedReturn, 1 / years) - 1) * 100;
    return Math.round(annualized * 100) / 100;
  } else {
    return Math.round((chainedReturn - 1) * 100 * 100) / 100;
  }
}

/**
 * Shared PMS Cash Ledger Utility
 * Reconstructs cash-in-hand for PMS portfolios from transaction history.
 * Eliminates the 3x duplicated logic in compileCashFlows, buildDashboardPayload, and /api/dashboard/xirr.
 */
export function computePmsCashLedger(
  events: any[],
  portfolioFilter?: (portfolio: string) => boolean,
  endDate?: Date
): number {
  let cashInHand = 0;
  for (const ev of events) {
    if (!isPMSPortfolio(ev.portfolio, ev.source)) continue;
    if (portfolioFilter && !portfolioFilter(ev.portfolio)) continue;

    if (endDate) {
      const evDate = (ev.date instanceof Date) ? ev.date : (parseDate(ev.date) || new Date(ev.date));
      if (!evDate || isNaN(evDate.getTime()) || evDate > endDate) continue;
    }

    const type = String(ev.type || '').toUpperCase();
    const absAmt = Math.abs(ev.net_amount || (ev.quantity * ev.price) || 0);

    if (type === 'DEPOSIT') cashInHand += absAmt;
    else if (type === 'WITHDRAWAL') cashInHand -= absAmt;
    else if (type === 'BUY' || type.includes('PURCHASE')) cashInHand -= absAmt;
    else if (type === 'SELL' || type.includes('SALE') || type === 'BUYBACK') cashInHand += absAmt;
    else if (type === 'EXPENSE' || type === 'TAX' || type === 'MANAGEMENT_FEE' || type === 'TDS' || type.includes('FEE') || type.includes('CHARGE') || type.includes('CUSTODY')) cashInHand -= absAmt;
    else if (type === 'CASH_INCOME' || type === 'DIVIDEND' || type === 'INTEREST') cashInHand += absAmt;
  }
  return cashInHand;
}

function getHoldingValuation(h: any, isStart: boolean, usdRate: number): { usdVal: number; inrVal: number } {
  const isUs = h.currency === 'USD' || h.portfolio === 'US - IBKR' || h.portfolio === 'Sarwa' || (h.isin && String(h.isin).startsWith('US'));
  if (isUs) {
    if (isStart) {
      const usdVal = (h.current_value !== undefined && h.current_value > 0) ? h.current_value : (h.total_cost || 0);
      return { usdVal, inrVal: usdVal * usdRate };
    } else {
      const usdVal = (h.native_current_value !== undefined && h.native_current_value > 0) 
        ? h.native_current_value 
        : ((h.native_total_cost > 0 ? h.native_total_cost : (h.total_cost ? h.total_cost / usdRate : 0)));
      const inrVal = (h.current_value !== undefined && h.current_value > 0) ? h.current_value : (usdVal * usdRate);
      return { usdVal, inrVal };
    }
  } else {
    const inrVal = (h.current_value !== undefined && h.current_value > 0) ? h.current_value : (h.total_cost || 0);
    return { usdVal: inrVal / usdRate, inrVal };
  }

}

export function isPMSPortfolio(portfolio?: string, source?: string): boolean {
  if (source === 'PMS' || source === 'BANKBOOK') return true;
  if (!portfolio) return false;
  const pLower = String(portfolio).trim().toLowerCase();
  return pLower.includes('pms') || pLower === 'cc9' || pLower.includes('cc9') || pLower === 'iifl360' || pLower.includes('iifl') || pLower.includes('360');
}

/**
 * PMS Portfolio (cc9) — Definitive XIRR Cash Flow Rules
 * -------------------------------------------------------
 * A "cash flow event" means: real external money or assets moved between the
 * investor and the PMS. From the investor's perspective:
 *
 * POSITIVE COST (money/assets put IN by investor → negative XIRR flow):
 *   - DEPOSIT          : Cash wired into PMS by investor
 *   - TRANSFER IN      : Securities transferred IN at portfolio inception (in-kind capital)
 *   - SECURITY IN      : Same as TRANSFER IN; synonym used in some statements
 *
 * RETURN TO INVESTOR (money/assets taken OUT → positive XIRR flow):
 *   - WITHDRAWAL       : Cash withdrawn by investor from PMS
 *   - TRANSFER OUT     : Securities transferred OUT to investor
 *   - SECURITY OUT     : Same as TRANSFER OUT; synonym
 *   - TDS / TAX        : Tax deducted at source → money leaves portfolio to govt
 *
 * NOT a cash flow event (investor did NOT put in or take out money):
 *   - MANAGEMENT_FEE   : Deducted inside PMS; not fresh money from investor
 *   - EXPENSE          : Same — internal PMS cost
 *   - DIVIDEND         : Dividend received inside PMS; reinvested, not paid out to investor
 *   - INTEREST         : Same as DIVIDEND
 *   - CASH_INCOME      : Internal PMS income
 *   - BUY / SELL       : Internal portfolio trades; investor's capital is already in
 *   - Corporate Actions: BONUS, SPLIT, DEMERGER etc. — no external money changes hands
 *
 * IMPORTANT: The startup backfill (database.ts) must NOT override is_cash_flow for
 * rows where is_ca=1 (corporate action) or rows where the import script has explicitly
 * set the flag. TRANSFER IN rows from PMS imports must preserve their import-time
 * flag because the import distinguishes initial capital injection (flag=1) from
 * internal reorganisations like DVR conversions (flag=0).
 */
export function computeIsCashFlowFlag(type: string, portfolio?: string, source?: string): number {
  const tType = String(type || '').trim().toUpperCase();
  const isPms = isPMSPortfolio(portfolio, source);

  if (isPms) {
    // Explicit capital injections or returns to investor
    if (['DEPOSIT', 'WITHDRAWAL', 'SECURITY IN', 'SECURITY OUT'].includes(tType)) {
      return 1;
    }
    // TDS / TAX paid to government is an internal expense, NOT a return to the investor.
    // Standard financial accounting methodology dictates this should be 0 so it correctly reduces the XIRR instead of inflating it.
    if (tType === 'TDS' || tType === 'TAX' || tType.startsWith('TDS') || tType.startsWith('TAX')) {
      return 0;
    }
    // TRANSFER IN / TRANSFER OUT: can be EITHER initial capital (is_cash_flow=1)
    // OR internal reorganisation (e.g. DVR conversion, is_cash_flow=0).
    // The import script sets the correct flag at import time.
    // This function returns 1 as the DEFAULT (initial capital is the common case),
    // but the startup backfill must NEVER override a value already stored in the DB
    // for TRANSFER IN/OUT rows sourced from PMS — see database.ts backfill guard.
    if (tType === 'TRANSFER IN' || tType === 'TRANSFER OUT') {
      return 1; // default; overridden by import/manual flag in DB
    }
    // Internal PMS events — NOT investor cash flow events
    if (
      tType === 'MANAGEMENT_FEE' || tType === 'EXPENSE' ||
      tType === 'DIVIDEND' || tType === 'DIVIDEND PAYOUT' ||
      tType === 'CASH_INCOME' || tType === 'INTEREST' ||
      tType === 'CHARGES' || tType === 'BROKERAGE' ||
      tType.includes('MANAGEMENT_FEE') || tType.includes('EXPENSE') ||
      tType.includes('FEE') || tType.includes('INCOME')
    ) {
      return 0;
    }
    // Internal trades — investor's capital is already in the portfolio
    if (
      tType.includes('BUY') || tType.includes('PURCHASE') ||
      tType.includes('SELL') || tType.includes('SALE')
    ) {
      return 0;
    }
    return 0;
  } else {
    // Non-PMS (direct equity, MF): no internal cash ledger.
    // Corporate events are never cash flows.
    if (
      tType.includes('REINVEST') || tType.includes('SPLIT') ||
      tType.includes('BONUS') || tType.includes('MERGER') || tType.includes('DEMERGER')
    ) {
      return 0;
    }
    if (
      tType.includes('BUY') || tType.includes('PURCHASE') || tType.includes('IPO') ||
      tType.includes('ALLOTMENT') || tType.includes('INVESTMENT') ||
      tType.includes('SELL') || tType.includes('SALE') || tType.includes('REDEMPTION') ||
      tType.includes('DIVIDEND') || tType.includes('INTEREST') ||
      tType === 'DEPOSIT' || tType === 'WITHDRAWAL' ||
      tType === 'TRANSFER IN' || tType === 'TRANSFER OUT' ||
      tType.includes('TDS') || tType.includes('TAX') || tType.includes('EXPENSE')
    ) {
      return 1;
    }
    return 0;
  }
}

export function compileCashFlows(

  startDate: Date,
  endDate: Date,
  events: any[],
  symbolToYf: Record<string, string>,
  selectedPortfolios: string[] | null,
  startHoldings: any,
  endHoldings: any,
  usdRate: number = 83.5
): CashFlow[] {
  const cashFlows: CashFlow[] = [];
  const isSingleForeignPort = selectedPortfolios && selectedPortfolios.length === 1 && (selectedPortfolios[0] === 'US - IBKR' || selectedPortfolios[0].includes('IBKR'));

  const matchesPortfolio = (p: string | null | undefined): boolean => {
    if (!selectedPortfolios || selectedPortfolios.length === 0) return true;
    if (!p) return false;
    const cleanP = String(p).trim().toLowerCase();
    return selectedPortfolios.some(s => String(s).trim().toLowerCase() === cleanP);
  };

  // Start Valuation
  let startVal = 0;
  if (startHoldings) {
    for (const h of Object.values(startHoldings) as any[]) {
      if (!matchesPortfolio(h.portfolio)) continue;
      const val = getHoldingValuation(h, true, usdRate);
      startVal += isSingleForeignPort ? val.usdVal : val.inrVal;
    }
    // Also include PMS cash in hand as of startDate so trailing/window XIRR is accurate
    let pmsCashStart = 0;
    for (const ev of events) {
      if (!isPMSPortfolio(ev.portfolio, ev.source)) continue;
      if (!matchesPortfolio(ev.portfolio)) continue;
      const evDate = (ev.date instanceof Date) ? ev.date : (parseDate(ev.date) || new Date(ev.date));
      if (!evDate || isNaN(evDate.getTime()) || evDate > startDate) continue;

      const type = String(ev.type || '').toUpperCase();
      const absAmt = Math.abs(ev.net_amount || (ev.quantity * ev.price) || 0);
      if (type === 'DEPOSIT') pmsCashStart += absAmt;
      else if (type === 'WITHDRAWAL') pmsCashStart -= absAmt;
      else if (type === 'BUY' || type.includes('PURCHASE')) pmsCashStart -= absAmt;
      else if (type === 'SELL' || type.includes('SALE') || type === 'BUYBACK') pmsCashStart += absAmt;
      else if (type === 'EXPENSE' || type === 'TAX' || type === 'MANAGEMENT_FEE' || type === 'TDS' || type.includes('FEE') || type.includes('CHARGE') || type.includes('CUSTODY')) pmsCashStart -= absAmt;
      else if (type === 'CASH_INCOME' || type === 'DIVIDEND' || type === 'INTEREST') pmsCashStart += absAmt;
    }
    if (pmsCashStart > 0) {
      startVal += isSingleForeignPort ? (pmsCashStart / usdRate) : pmsCashStart;
    }
  }
  if (startVal > 0) {
    cashFlows.push({ date: startDate, amount: -startVal, type: 'start' });
  }

  // Intermediate cash flows
  for (const ev of events) {
    if ((ev.is_ca || 0) === 1 || (ev.is_cash_flow ?? 1) === 0) continue;
    if (!matchesPortfolio(ev.portfolio)) continue;

    const evDate = (ev.date instanceof Date) ? ev.date : (parseDate(ev.date) || new Date(ev.date));
    if (!evDate || isNaN(evDate.getTime())) continue;
    const isAfterStart = startVal > 0 ? evDate > startDate : evDate >= startDate;
    if (!isAfterStart || evDate > endDate) continue;

    const type = String(ev.type).toUpperCase();
    if (type.includes('REINVEST') || type.includes('REINVESTMENT')) {
      continue;
    }

    const isUsd = ev.portfolio === 'US - IBKR' || (ev.isin && String(ev.isin).startsWith('US'));

    const isPMSEv = isPMSPortfolio(ev.portfolio, ev.source);
    let rawAmount = ev.net_amount || (ev.quantity * ev.price);
    // For NON-PMS: override with qty*price if net_amount is wildly off (brokerage artifacts).
    // For PMS: NEVER override net_amount — it represents the actual capital injected (cost basis)
    // for TRANSFER IN records. Overriding with qty*price changes the cost basis every time
    // prices move, making XIRR completely unstable.
    if (!isPMSEv && ev.quantity > 0 && ev.price > 0) {
      const calcAmt = Math.abs(ev.quantity * ev.price);
      const storedAmt = Math.abs(ev.net_amount || 0);
      if (storedAmt > 0 && (storedAmt / calcAmt > 1.5 || storedAmt / calcAmt < 0.6)) {
        rawAmount = calcAmt;
      }
    }
    
    let amount = rawAmount;
    if (isSingleForeignPort) {
      if (!isUsd) {
        amount = rawAmount / usdRate;
      }
    } else {
      if (isUsd) {
        amount = rawAmount * usdRate;
      }
    }

    const isPMS = isPMSPortfolio(ev.portfolio, ev.source);
    if (isPMS) {
       // PMS Portfolios: Internal cash ledger exists.
       // Money Spent / External Inflow to PMS: DEPOSIT, TRANSFER IN, SECURITY IN
       if (type === 'DEPOSIT' || type === 'TRANSFER IN' || type === 'SECURITY IN') {
         cashFlows.push({ date: evDate, amount: -amount, type: 'tx' });
       }
       // Money Out / Return to Investor: WITHDRAWAL, or TRANSFER OUT / SECURITY OUT if flagged as external cash flow (is_cash_flow === 1)
       else if (type === 'WITHDRAWAL' || ((type === 'TRANSFER OUT' || type === 'SECURITY OUT') && ev.is_cash_flow === 1)) {
         cashFlows.push({ date: evDate, amount: amount, type: 'tx' });
       }
    } else {
       // Non-PMS Portfolios: No internal cash ledger. Every purchase is fresh money from outside, every sale/dividend is cash out to bank.
       // Exclude internal accounting 'ROUNDING' adjustments.
       if (type.includes('BUY') || type.includes('PURCHASE') || type.includes('IPO') || type.includes('ALLOTMENT') || type.includes('INVESTMENT') || type === 'DEPOSIT' || type === 'TRANSFER IN') {
         cashFlows.push({ date: evDate, amount: -amount, type: 'tx' });
       } else if (type.includes('SELL') || type.includes('SALE') || type.includes('REDEMPTION') || type.includes('DIVIDEND') || type === 'WITHDRAWAL' || type === 'TRANSFER OUT') {
         cashFlows.push({ date: evDate, amount: amount, type: 'tx' });
       }
    }
  }

  // End Valuation
  let endVal = 0;
  if (endHoldings) {
    for (const h of Object.values(endHoldings) as any[]) {
      if (!matchesPortfolio(h.portfolio)) continue;
      const val = getHoldingValuation(h, false, usdRate);
      endVal += isSingleForeignPort ? val.usdVal : val.inrVal;
    }
  }

  // Calculate PMS Cash in Hand
  let pmsCashInHand = 0;
  for (const ev of events) {
    if (!isPMSPortfolio(ev.portfolio, ev.source)) continue;

    if (!matchesPortfolio(ev.portfolio)) continue;
    
    const evDate = (ev.date instanceof Date) ? ev.date : (parseDate(ev.date) || new Date(ev.date));
    if (!evDate || isNaN(evDate.getTime()) || evDate > endDate) continue;

    const type = String(ev.type || '').toUpperCase();
    const absAmt = Math.abs(ev.net_amount || (ev.quantity * ev.price) || 0);

    // DEPOSIT: actual cash wired in by investor → adds to cash ledger
    // TRANSFER IN / SECURITY IN: securities transferred in (not cash) → do NOT touch cash ledger
    // WITHDRAWAL: cash returned to investor → reduces cash ledger
    // TRANSFER OUT / SECURITY OUT: securities going out (not cash) → do NOT touch cash ledger
    if (type === 'DEPOSIT') pmsCashInHand += absAmt;
    else if (type === 'WITHDRAWAL') pmsCashInHand -= absAmt;
    else if (type === 'BUY' || type.includes('PURCHASE')) pmsCashInHand -= absAmt;
    else if (type === 'SELL' || type.includes('SALE') || type === 'BUYBACK') pmsCashInHand += absAmt;
    else if (type === 'EXPENSE' || type === 'TAX' || type === 'MANAGEMENT_FEE' || type === 'TDS' || type.includes('FEE') || type.includes('CHARGE') || type.includes('CUSTODY')) pmsCashInHand -= absAmt;
    else if (type === 'CASH_INCOME' || type === 'DIVIDEND' || type === 'INTEREST') pmsCashInHand += absAmt;
  }

  if (pmsCashInHand > 0) {
     endVal += isSingleForeignPort ? (pmsCashInHand / usdRate) : pmsCashInHand;
  }

  if (endVal > 0) {
    cashFlows.push({ date: endDate, amount: endVal, type: 'end' });
  }

  cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return cashFlows;
}

// Fast-Track In-Memory Cash Flow Cache
let globalCacheVersion = 1;
const historicalCashFlowCache = new Map<string, {
  historicalFlows: CashFlow[];
  niftyHistoricalFlows: { date: Date; amount: number; isOutflow: boolean }[];
  cacheVersion: number;
}>();

export function invalidateXirrCache() {
  globalCacheVersion++;
  historicalCashFlowCache.clear();
  xirrResultCache.clear();
  console.log('[XIRR Cache] In-memory XIRR cache invalidated.');
}

export async function computePortfolioAndNiftyXIRR(
  db: any,
  selectedPortfolios: string[] | string | null,
  activeValuation: number,
  niftyData: any
): Promise<{ portfolioXIRR: number | null; niftyXIRR: number | null }> {
  try {
    let portList: string[] = [];
    if (typeof selectedPortfolios === 'string') {
      if (selectedPortfolios && selectedPortfolios !== 'Combined' && selectedPortfolios !== 'all') {
        portList = selectedPortfolios.split(',').map(p => p.trim()).filter(Boolean);
      }
    } else if (Array.isArray(selectedPortfolios)) {
      portList = selectedPortfolios.map(p => String(p).trim()).filter(Boolean);
    }
    const isCombined = portList.length === 0;
    const cacheKey = isCombined ? 'ALL' : portList.slice().sort().join('::');

    let txQuery = `SELECT date, type, isin, symbol, quantity, price, net_amount, portfolio, source, is_ca, is_cash_flow FROM Transactions`;
    let txParams: any[] = [];
    if (!isCombined) {
      const placeholders = portList.map(() => 'LOWER(TRIM(portfolio)) = LOWER(TRIM(?))').join(' OR ');
      txQuery += ` WHERE (${placeholders})`;
      txParams.push(...portList);
    }
    txQuery += ` ORDER BY date ASC`;

    const txns = await dbAll(db, txQuery, txParams);

    let holdingsSql = `SELECT * FROM Holdings WHERE quantity > 0`;
    let holdingsParams: any[] = [];
    if (!isCombined) {
      const placeholders = portList.map(() => 'LOWER(TRIM(portfolio)) = LOWER(TRIM(?))').join(' OR ');
      holdingsSql += ` AND (${placeholders})`;
      holdingsParams.push(...portList);
    }
    const holdings = await dbAll(db, holdingsSql, holdingsParams);

    const symbolToYf: Record<string, string> = {};
    for (const h of holdings) {
      symbolToYf[h.symbol] = h.symbol;
    }

    const currentHoldingsMap: Record<string, any> = {};
    for (const h of holdings) {
      currentHoldingsMap[`${h.portfolio}::${h.isin}::${h.folio || 'NA'}`] = h;
    }

    const firstDate = txns.reduce((min: Date, t: any) => {
      const d = (t.date instanceof Date) ? t.date : (parseDate(t.date) || new Date(t.date));
      return (d && !isNaN(d.getTime()) && d.getTime() < min.getTime()) ? d : min;
    }, new Date());
    const now = new Date();

    const flows = compileCashFlows(firstDate, now, txns, symbolToYf, isCombined ? null : portList, null, currentHoldingsMap, 83.5);
    const portfolioXIRR = calculateXIRR(flows);

    const caSql = `SELECT * FROM CorporateActions WHERE action_type = 'DIVIDEND'`;
    const corporateActions = await dbAll(db, caSql, []);
    const niftyDbRows = await dbAll(db, `SELECT date, close_price FROM HistoricalPrices WHERE symbol IN ('^NSEI', 'NIFTY50.NS') ORDER BY date ASC`).catch(() => []);
    const niftyPriceMap: Record<string, number> = {};
    if (niftyDbRows && niftyDbRows.length > 0) {
      for (const r of niftyDbRows) {
        if (r.date && r.close_price) niftyPriceMap[r.date] = r.close_price;
      }
    }
    if (niftyData && Array.isArray(niftyData.closePrices)) {
      for (const p of niftyData.closePrices) {
        if (p.date && p.close) niftyPriceMap[p.date] = p.close;
      }
    }

    const sortedNiftyDates = Object.keys(niftyPriceMap).sort();
    const latestNiftyPrice = (niftyData && niftyData.regularMarketPrice > 0)
      ? niftyData.regularMarketPrice
      : (sortedNiftyDates.length > 0 ? niftyPriceMap[sortedNiftyDates[sortedNiftyDates.length - 1]] : 24500);

    const getNearestNiftyPrice = (targetDateStr: string): number => {
      if (niftyPriceMap[targetDateStr]) return niftyPriceMap[targetDateStr];
      if (sortedNiftyDates.length === 0) return latestNiftyPrice;
      let low = 0, high = sortedNiftyDates.length - 1, best = sortedNiftyDates[0];
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (sortedNiftyDates[mid] <= targetDateStr) {
          best = sortedNiftyDates[mid];
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return niftyPriceMap[best] || latestNiftyPrice;
    };

    let niftyXIRR: number | null = null;
    if (sortedNiftyDates.length > 0) {
      let niftyUnits = 0;
      const niftyFlows: CashFlow[] = [];

      for (const cf of flows) {
        const dObj = cf.date instanceof Date ? cf.date : new Date(cf.date);
        const dateStr = !isNaN(dObj.getTime()) ? dObj.toISOString().split('T')[0] : '2026-01-01';
        if (cf.amount < 0) {
          const nPrice = getNearestNiftyPrice(dateStr);
          const boughtUnits = Math.abs(cf.amount) / nPrice;
          niftyUnits += boughtUnits;
          niftyFlows.push({ date: dObj, amount: cf.amount });
        } else if (cf.amount > 0 && dObj.getTime() !== now.getTime()) {
          const nPrice = getNearestNiftyPrice(dateStr);
          const soldUnits = cf.amount / nPrice;
          niftyUnits = Math.max(0, niftyUnits - soldUnits);
          niftyFlows.push({ date: dObj, amount: cf.amount });
        }
      }

      const niftyTerminalValuation = niftyUnits * latestNiftyPrice;
      if (niftyTerminalValuation > 0) {
        niftyFlows.push({ date: now, amount: niftyTerminalValuation });
        niftyXIRR = calculateXIRR(niftyFlows);
      }
    }

    return {
      portfolioXIRR: portfolioXIRR ? Math.round(portfolioXIRR * 100) / 100 : 0,
      niftyXIRR: niftyXIRR ? Math.round(niftyXIRR * 100) / 100 : 0
    };
  } catch (err) {
    console.warn('[XIRR] Error computing Nifty XIRR:', err);
    return { portfolioXIRR: 0, niftyXIRR: 0 };
  }
}

const xirrResultCache = new Map<string, { result: any; timestamp: number }>();

export function getCachedXIRRResult(cacheKey: string, ttlMs: number = 300000): any | null {
  const item = xirrResultCache.get(cacheKey);
  if (!item) return null;
  if (Date.now() - item.timestamp > ttlMs) {
    xirrResultCache.delete(cacheKey);
    return null;
  }
  return item.result;
}

export function setCachedXIRRResult(cacheKey: string, result: any): void {
  xirrResultCache.set(cacheKey, { result, timestamp: Date.now() });
}


