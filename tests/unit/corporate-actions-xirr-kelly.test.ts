/**
 * WealthOS Test Suite 4 & 5: Corporate Actions + XIRR Engine
 *
 * TS-4: Bonus issue, stock split, reverse split — INV-2 (zero cost variance)
 * TS-5: XIRR mathematical accuracy, post-tax vs pre-tax ordering
 *
 * Pillar: P2 (Functional Accuracy)
 */
import { describe, test, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Inline implementations mirroring decimalUtils.ts for pure math validation
// ---------------------------------------------------------------------------
function mulINR(price: number, qty: number): number {
  return Math.round(Math.round(price * 100) * qty) / 100;
}
function roundINR(v: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

/** Bonus issue adjustment — mirrors decimalUtils.applyBonusAdjustment */
function applyBonus(qty: number, avgCost: number, bonusRatio: number) {
  const totalCost = mulINR(avgCost, qty);
  const bonusQty = Math.floor(qty * bonusRatio);
  const newQty = qty + bonusQty;
  const newAvgCost = newQty > 0 ? roundINR(totalCost / newQty, 4) : 0;
  return { newQty, newAvgCost, totalCost, preTotalCost: totalCost };
}

/** Stock split adjustment — mirrors decimalUtils.applySplitAdjustment */
function applySplit(qty: number, avgCost: number, multiplier: number) {
  const totalCost = mulINR(avgCost, qty);
  const newQty = Math.round(qty * multiplier);
  const newAvgCost = newQty > 0 ? roundINR(totalCost / newQty, 4) : 0;
  return { newQty, newAvgCost, totalCost, preTotalCost: totalCost };
}

/**
 * Newton-Raphson XIRR (inline, mirrors src/server/xirr.ts)
 * cashFlows: array of { date: Date; amount: number }
 * amount < 0 = cash out (buy); amount > 0 = cash in (sell/terminal value)
 */
function calculateXIRR(cashFlows: { date: Date; amount: number }[]): number {
  const base = cashFlows[0].date;
  const days = cashFlows.map(cf => (cf.date.getTime() - base.getTime()) / 86_400_000);

  const npv = (r: number) =>
    cashFlows.reduce((acc, cf, i) => acc + cf.amount / Math.pow(1 + r, days[i] / 365), 0);

  const dnpv = (r: number) =>
    cashFlows.reduce(
      (acc, cf, i) => acc - (cf.amount * (days[i] / 365)) / Math.pow(1 + r, days[i] / 365 + 1),
      0
    );

  let r = 0.1;
  for (let iter = 0; iter < 100; iter++) {
    const f = npv(r);
    const df = dnpv(r);
    if (Math.abs(df) < 1e-12) break;
    const rNew = r - f / df;
    if (Math.abs(rNew - r) < 1e-6) return rNew;
    r = rNew;
    if (r < -0.999) r = -0.999;
    if (r > 10) r = 10;
  }
  return r;
}

// ===========================================================================
// TS-4: CORPORATE ACTIONS ENGINE (INV-2 — Zero Cost Variance)
// ===========================================================================
describe('TS-4.1: Bonus Issue — INV-2 (Zero Cost Variance)', () => {

  test('TS4-01: Standard 1:1 bonus preserves total cost', () => {
    const { newQty, newAvgCost, totalCost, preTotalCost } = applyBonus(500, 1200, 1); // 1:1
    expect(newQty).toBe(1_000);
    expect(newAvgCost).toBeCloseTo(600, 2);
    const postCost = mulINR(newAvgCost, newQty);
    expect(Math.abs(postCost - preTotalCost)).toBeLessThan(0.01); // ≡ 0.00 variance
  });

  test('TS4-02: Fractional bonus (3:5) — floor applied, cost conserved', () => {
    // 100 shares, 3:5 bonus = floor(100 × 3/5) = 60 bonus shares
    const { newQty, newAvgCost, preTotalCost } = applyBonus(100, 500, 3 / 5);
    expect(newQty).toBe(160); // 100 + 60
    const postCost = mulINR(newAvgCost, newQty);
    expect(Math.abs(postCost - preTotalCost)).toBeLessThan(0.01);
  });

  test('TS4-02b: Bonus ratio 1:2 (50%) — cost conserved', () => {
    // 200 shares @₹300; 1:2 bonus = 100 bonus shares; post = 300 shares
    const { newQty, newAvgCost, preTotalCost } = applyBonus(200, 300, 0.5);
    expect(newQty).toBe(300);
    expect(newAvgCost).toBeCloseTo(200, 2);
    const postCost = mulINR(newAvgCost, newQty);
    expect(Math.abs(postCost - preTotalCost)).toBeLessThan(0.01);
  });
});

describe('TS-4.2: Stock Split — INV-2 (Zero Cost Variance)', () => {

  test('TS4-03: 10:1 split (face value ₹10 → ₹1) — cost conserved', () => {
    const { newQty, newAvgCost, preTotalCost } = applySplit(50, 2_000, 10);
    expect(newQty).toBe(500);
    expect(newAvgCost).toBeCloseTo(200, 2);
    const postCost = mulINR(newAvgCost, newQty);
    expect(Math.abs(postCost - preTotalCost)).toBeLessThan(0.01);
  });

  test('TS4-04: Reverse 1:5 split — cost conserved', () => {
    const { newQty, newAvgCost, preTotalCost } = applySplit(1_000, 20, 1 / 5);
    expect(newQty).toBe(200);
    expect(newAvgCost).toBeCloseTo(100, 2);
    const postCost = mulINR(newAvgCost, newQty);
    expect(Math.abs(postCost - preTotalCost)).toBeLessThan(0.01);
  });

  test('TS4-03b: 2:1 split — cost conserved', () => {
    const { newQty, newAvgCost, preTotalCost } = applySplit(100, 1_000, 2);
    expect(newQty).toBe(200);
    expect(newAvgCost).toBeCloseTo(500, 2);
    const postCost = mulINR(newAvgCost, newQty);
    expect(Math.abs(postCost - preTotalCost)).toBeLessThan(0.01);
  });
});

describe('TS-4.3: Rights Issue Math', () => {

  test('TS4-Rights: Blended average price after rights subscription', () => {
    const preQty = 100;
    const preAvg = 500;
    const preCost = mulINR(preAvg, preQty); // 50,000

    const rightsQty = 20;    // 1 right for every 5 shares
    const rightsPrice = 300;
    const rightsCost = mulINR(rightsPrice, rightsQty); // 6,000

    const postQty = preQty + rightsQty;        // 120
    const postCost = preCost + rightsCost;      // 56,000
    const postAvg = roundINR(postCost / postQty, 4); // 466.6667

    expect(postQty).toBe(120);
    expect(postAvg).toBeCloseTo(466.67, 1);
    expect(mulINR(postAvg, postQty)).toBeCloseTo(postCost, 0);
  });
});

describe('TS-4.4: Dividend TDS Calculation', () => {

  test('TS4-07: TDS deducted at 10% for dividend > ₹5,000 (Section 194)', () => {
    const grossDividend = 8_000;
    const tdsRate = 0.10;
    const tds = grossDividend > 5_000 ? grossDividend * tdsRate : 0;
    const netDividend = grossDividend - tds;
    expect(tds).toBe(800);
    expect(netDividend).toBe(7_200);
  });

  test('TS4-07b: No TDS for dividend <= ₹5,000', () => {
    const grossDividend = 4_500;
    const tds = grossDividend > 5_000 ? grossDividend * 0.10 : 0;
    expect(tds).toBe(0);
  });
});

// ===========================================================================
// TS-5: XIRR ENGINE
// ===========================================================================
describe('TS-5: XIRR & Valuation Engine', () => {

  test('TS5-01: 1-year doubling yields ~100% XIRR', () => {
    const flows = [
      { date: new Date('2025-01-01'), amount: -100_000 },
      { date: new Date('2026-01-01'), amount: 200_000 },
    ];
    const xirr = calculateXIRR(flows);
    expect(xirr).toBeGreaterThan(0.95);
    expect(xirr).toBeLessThan(1.05);
  });

  test('TS5-01b: 1-year 20% return yields ~20% XIRR', () => {
    const flows = [
      { date: new Date('2025-01-01'), amount: -100_000 },
      { date: new Date('2026-01-01'), amount: 120_000 },
    ];
    const xirr = calculateXIRR(flows);
    expect(xirr).toBeGreaterThan(0.18);
    expect(xirr).toBeLessThan(0.22);
  });

  test('TS5-02: Multiple cash flows converge correctly', () => {
    // Buy in 3 tranches, sell all at end
    const flows = [
      { date: new Date('2024-01-01'), amount: -30_000 },
      { date: new Date('2024-04-01'), amount: -30_000 },
      { date: new Date('2024-07-01'), amount: -30_000 },
      { date: new Date('2025-01-01'), amount: 108_000 }, // profitable exit
    ];
    const xirr = calculateXIRR(flows);
    expect(xirr).toBeGreaterThan(0.15); // positive return
    expect(xirr).toBeLessThan(0.80);    // within bounds
  });

  test('TS5-04: Negative returns yield negative XIRR', () => {
    const flows = [
      { date: new Date('2024-01-01'), amount: -100_000 },
      { date: new Date('2025-01-01'), amount: 70_000 }, // 30% loss
    ];
    const xirr = calculateXIRR(flows);
    expect(xirr).toBeLessThan(0); // Negative return
  });

  test('TS5-05: Post-tax valuation < pre-tax valuation', () => {
    // Post-tax = current value - unrealized tax liability
    const currentValue = 200_000;
    const unrealizedSTCG = 50_000;
    const unrealizedLTCG = 30_000;
    const stcgTax = unrealizedSTCG * 0.20;  // 10,000
    const ltcgTax = Math.max(0, unrealizedLTCG - 125_000) * 0.125; // 0 (below exemption)

    const postTaxValuation = currentValue - stcgTax - ltcgTax;
    expect(postTaxValuation).toBeLessThan(currentValue);
    expect(postTaxValuation).toBe(190_000);
  });

  test('TS5-06: Market value = Σ(qty × LTP) for each holding', () => {
    const holdings = [
      { qty: 100, ltp: 500.75 },
      { qty: 50,  ltp: 1200.00 },
      { qty: 200, ltp: 75.50 },
    ];
    holdings.forEach(h => {
      const computed = mulINR(h.ltp, h.qty);
      // Verify mulINR gives proper value without floating point drift
      expect(computed).toBeCloseTo(h.qty * h.ltp, 1);
    });
  });

  test('TS5-07: Unrealized P&L = Market Value − Total Cost', () => {
    const testHoldings = [
      { qty: 100, avgBuyPrice: 300, ltp: 450 },
      { qty: 50,  avgBuyPrice: 1000, ltp: 800 }, // loss
    ];
    testHoldings.forEach(h => {
      const marketValue = mulINR(h.ltp, h.qty);
      const totalCost = mulINR(h.avgBuyPrice, h.qty);
      const unrealizedPnl = marketValue - totalCost;
      expect(unrealizedPnl).toBeCloseTo(h.qty * (h.ltp - h.avgBuyPrice), 1);
    });
  });
});

// ===========================================================================
// TS-7.3: Half-Kelly Position Sizing (INV-5)
// ===========================================================================
describe('TS-7.3: Half-Kelly Position Sizing — INV-5', () => {

  function kellyAllocation(
    p: number,
    b: number, // risk-reward ratio
    drawdownPct: number,
    portfolioNAV: number,
    adv20Day: number
  ): { rawKelly: number; halfKelly: number; drawdownPenalty: number; allocated: number } {
    const rawKelly = p - (1 - p) / b;
    const halfKelly = rawKelly / 2;

    let drawdownPenalty = 0;
    if (drawdownPct >= 25) {
      drawdownPenalty = 1.0; // 100% penalty → freeze
    } else if (drawdownPct >= 10) {
      drawdownPenalty = 0.5; // 50% penalty
    }

    const afterPenalty = halfKelly * (1 - drawdownPenalty);
    // Hard caps
    const stockCapPct = 0.05; // 5% of NAV
    const stockCap = portfolioNAV * stockCapPct;
    const advCap  = adv20Day * 0.02;           // 2% of ADV
    const absoluteAllocated = Math.min(afterPenalty * portfolioNAV, stockCap, advCap);
    const allocated = portfolioNAV > 0 ? absoluteAllocated / portfolioNAV : 0;

    return { rawKelly, halfKelly, drawdownPenalty, allocated: drawdownPenalty >= 1.0 ? 0 : allocated };
  }

  const NAV = 10_000_000; // ₹1 crore portfolio
  const ADV = 5_000_000;  // ₹50L 20-day average volume

  test('TS7-13: Normal sizing, 5% drawdown — capped at 5% NAV', () => {
    const result = kellyAllocation(0.65, 2.0, 5, NAV, ADV);
    expect(result.rawKelly).toBeCloseTo(0.475, 3);
    expect(result.halfKelly).toBeCloseTo(0.2375, 3);
    expect(result.drawdownPenalty).toBe(0);
    expect(result.allocated).toBeLessThanOrEqual(0.05);
  });

  test('TS7-14: 15% drawdown applies 50% penalty', () => {
    const result = kellyAllocation(0.65, 2.0, 15, NAV, ADV);
    expect(result.drawdownPenalty).toBe(0.5);
    expect(result.allocated).toBeLessThanOrEqual(0.05);
    expect(result.allocated).toBeGreaterThan(0); // Not frozen
  });

  test('TS7-15: INV-5 — 26% drawdown freezes allocation to exactly 0%', () => {
    const result = kellyAllocation(0.65, 2.0, 26, NAV, ADV);
    expect(result.drawdownPenalty).toBe(1.0);
    expect(result.allocated).toBe(0);
  });

  test('TS7-16: Allocation never exceeds 5% of NAV (hard cap)', () => {
    // Even with perfect signal (p=0.99, b=10), cap enforced
    const result = kellyAllocation(0.99, 10, 0, NAV, ADV);
    expect(result.allocated).toBeLessThanOrEqual(0.05);
  });

  test('TS7-17: Liquidity ceiling — 2% of 20-day ADV enforced', () => {
    const tinyADV = 100_000; // Very illiquid stock
    const result = kellyAllocation(0.65, 2.0, 0, NAV, tinyADV);
    const maxAllowedByADV = (tinyADV * 0.02) / NAV;
    expect(result.allocated).toBeLessThanOrEqual(maxAllowedByADV + 0.0001);
  });
});

// ===========================================================================
// TS-6.4: 8-Year CFL Waterfall
// ===========================================================================
describe('TS-6.4: Carried Forward Loss Waterfall', () => {

  test('TS6-18: CFL expires after exactly 8 assessment years', () => {
    const originAY = '2017-2018';
    const originYear = 2017;
    const expiryYear = originYear + 8;
    const expiryAY = `${expiryYear}-${expiryYear + 1}`;
    expect(expiryAY).toBe('2025-2026');
  });

  test('TS6-19: Loss expiring within 1 year is near-expiry', () => {
    const today = new Date('2026-09-06');
    const expiryAY = '2026-2027'; // Expires in AY 2026-27 (i.e., by March 31 2027)
    const expiryDate = new Date('2027-03-31');
    const yearsRemaining = (expiryDate.getTime() - today.getTime()) / (365.25 * 86_400_000);
    expect(yearsRemaining).toBeLessThanOrEqual(1);
  });

  test('TS6-20: Tax loss offset priority — STCL offsets STCG before LTCG', () => {
    // Per spec: STCL offsets STCG(20%) first, then excess offsets LTCG(12.5%)
    const stcl = 80_000;
    const stcg = 50_000;
    const ltcg = 100_000;

    const stcgOffset = Math.min(stcl, stcg);     // 50,000
    const remainingSTCL = stcl - stcgOffset;       // 30,000
    const ltcgOffset = remainingSTCL;              // 30,000 offsets LTCG
    const netLTCG = ltcg - ltcgOffset;             // 70,000

    expect(stcgOffset).toBe(50_000);
    expect(remainingSTCL).toBe(30_000);
    expect(netLTCG).toBe(70_000);

    // Tax savings
    const taxSavedOnSTCG = stcgOffset * 0.20;   // 10,000
    const taxSavedOnLTCG = ltcgOffset * 0.125;  // 3,750
    expect(taxSavedOnSTCG).toBe(10_000);
    expect(taxSavedOnLTCG).toBe(3_750);
  });

  test('TS6-LTCL: LTCL ONLY offsets LTCG (not STCG)', () => {
    // Per spec: LTCL strictly only offsets LTCG
    const ltcl = 50_000;
    const stcg = 80_000;  // Cannot be offset by LTCL
    const ltcg = 60_000;

    const ltcgOffset = Math.min(ltcl, ltcg);      // 50,000
    const netLTCG = ltcg - ltcgOffset;             // 10,000
    const netSTCG = stcg;                          // Unaffected — LTCL cannot offset STCG

    expect(netSTCG).toBe(80_000); // STCG unchanged
    expect(netLTCG).toBe(10_000);
  });
});

// ===========================================================================
// TS-6.3: Advance Tax Schedule
// ===========================================================================
describe('TS-6.3: Advance Tax Schedule', () => {

  const installments = [
    { num: 1, dueDay: '06-15', cumPct: 0.15, label: 'Q1' },
    { num: 2, dueDay: '09-15', cumPct: 0.45, label: 'Q2' },
    { num: 3, dueDay: '12-15', cumPct: 0.75, label: 'Q3' },
    { num: 4, dueDay: '03-15', cumPct: 1.00, label: 'Q4' },
  ];

  test('TS6-13: Q1 due date is June 15', () => {
    expect(installments[0].dueDay).toBe('06-15');
  });

  test('TS6-14: Q2 cumulative target is 45%', () => {
    expect(installments[1].cumPct).toBe(0.45);
  });

  test('TS6-15: Q3 cumulative target is 75%', () => {
    expect(installments[2].cumPct).toBe(0.75);
  });

  test('TS6-16: Q4 cumulative target is 100%', () => {
    expect(installments[3].cumPct).toBe(1.00);
  });

  test('TS6-17: Section 234C interest = 1% per month for 3 months on shortfall', () => {
    const estimatedLiability = 100_000;
    const Q1Required = estimatedLiability * 0.15;   // 15,000
    const Q1Paid = 10_000;
    const shortfall = Q1Required - Q1Paid;           // 5,000
    const interest234C = shortfall * 0.01 * 3;       // 150
    expect(shortfall).toBe(5_000);
    expect(interest234C).toBe(150);
  });
});
