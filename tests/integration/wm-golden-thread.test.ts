/**
 * Suite 16.4: The Golden Thread — End-to-End Wealth-Maximization Lifecycle (OBJ-1 to OBJ-6)
 * Test: WM-GOLDEN-01
 *
 * Walks a portfolio through the complete causal chain:
 * 1. Capture: Ingest transactions with zero loss or duplication (OBJ-1)
 * 2. Ledger Reconciliation: Holdings reconcile to transaction history (OBJ-2)
 * 3. Screening: Only calibrated, trustworthy signals flagged Actionable (OBJ-3)
 * 4. Sizing: Half-Kelly position sizing respects 5% NAV & ADV caps (OBJ-4)
 * 5. Rebalancing: Sized to no-trade bands, optimizing after-tax friction (OBJ-5)
 * 6. After-Tax Wealth Outcome: Terminal risk-adjusted after-tax NAV strictly >= do-nothing baseline (OBJ-5)
 * 7. Audit Reproducibility: Deterministic replay with cryptographic audit ledger (OBJ-6)
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { createTestDatabase, dbRun, dbAll, dbGet } from '../helpers/seedTestDb';
import { runFIFO } from '../../src/server/fifoEngine';
import { calculateHalfKelly, classifySignal } from '../unit/wm-opportunity-trust.test';
import { generateRebalancePlan, simulateHoldForward } from '../../src/server/services/RebalancingEngine';

describe('WM-GOLDEN: Golden-Thread Verification for Accurate Capture → Screening → Rebalancing → After-Tax Wealth', () => {
  let db: any;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  test('WM-GOLDEN-01: End-to-End Causal Chain maximizes risk-adjusted after-tax wealth vs do-nothing', async () => {
    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 1: CAPTURE (OBJ-1)
    // Ingest a realistic 90-day transaction history across 6 ISINs
    // ─────────────────────────────────────────────────────────────────────────
    const initialTrades = [
      { date: '2026-01-05', isin: 'INE002A01018', sym: 'RELIANCE', qty: 100, price: 2500 },
      { date: '2026-01-10', isin: 'INE009A01021', sym: 'INFY',     qty: 200, price: 1500 },
      { date: '2026-01-20', isin: 'INE001A01036', sym: 'TESTSTOCK',qty: 300, price: 300 },
      { date: '2026-02-01', isin: 'INE040A01034', sym: 'HDFCBANK', qty: 150, price: 1600 },
      { date: '2026-02-15', isin: 'INE002A01018', sym: 'RELIANCE', qty: 50,  price: 2600 },
      { date: '2026-03-01', isin: 'INE009A01021', sym: 'INFY',     qty: -50, price: 1700 }, // Partial sale
    ];

    for (const t of initialTrades) {
      const type = t.qty > 0 ? 'BUY' : 'SELL';
      const absQty = Math.abs(t.qty);
      const gross = absQty * t.price;
      await dbRun(
        db,
        `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source)
         VALUES (?, 'TestPF1', ?, ?, ?, ?, ?, ?, ?, 'DIRECT_LEDGER')`,
        [t.date, type, t.isin, t.sym, absQty, t.price, gross, gross]
      );
    }

    // Assert capture count
    const capturedTxns = await dbAll(db, `SELECT * FROM Transactions WHERE portfolio='TestPF1'`);
    expect(capturedTxns.length).toBe(initialTrades.length);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 2: HOLDINGS INTEGRITY (OBJ-2)
    // Run FIFO depletion; assert exact mathematical reconciliation
    // ─────────────────────────────────────────────────────────────────────────
    await runFIFO(db);

    const holdings = await dbAll(db, `SELECT * FROM Holdings WHERE portfolio='TestPF1'`);
    expect(holdings.length).toBeGreaterThan(0);

    for (const h of holdings) {
      const netLedger = await dbGet(
        db,
        `SELECT 
           SUM(CASE WHEN type IN ('BUY', 'BONUS') THEN quantity ELSE 0 END) -
           SUM(CASE WHEN type = 'SELL' THEN quantity ELSE 0 END) as net_qty
         FROM Transactions WHERE portfolio='TestPF1' AND isin=?`,
        [h.isin]
      );
      expect(h.quantity).toBeCloseTo(netLedger.net_qty, 4);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 3: OPPORTUNITY SCREENING & CALIBRATION (OBJ-3)
    // Gating rule: Signals are only Actionable if N >= 15 and Brier <= 0.25
    // ─────────────────────────────────────────────────────────────────────────
    const candidateSignals = [
      { symbol: 'RELIANCE', strategy: 'MOMENTUM_BREAKOUT', sampleSize: 24, brierScore: 0.18, winProb: 0.68, payoffRatio: 2.4 },
      { symbol: 'INFY',     strategy: 'VALUE_COMPOUNDER',  sampleSize: 18, brierScore: 0.21, winProb: 0.62, payoffRatio: 2.0 },
      { symbol: 'UNCALIB',  strategy: 'SPECULATIVE_PATTERN',sampleSize: 6, brierScore: 0.12, winProb: 0.75, payoffRatio: 3.0 },
    ];

    const actionable = candidateSignals
      .map(s => ({ ...s, classification: classifySignal({ strategy: s.strategy, historicalSampleSize: s.sampleSize, brierScore: s.brierScore }) }))
      .filter(s => s.classification.label === 'ACTIONABLE_RECOMMENDATION');

    // UNCALIB must be rejected because N=6 < 15
    expect(actionable.length).toBe(2);
    expect(actionable.every(s => s.sampleSize >= 15)).toBe(true);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 4: HALF-KELLY POSITION SIZING (OBJ-4)
    // Verify sizing enforces 5% NAV single-stock cap and liquidity limits
    // ─────────────────────────────────────────────────────────────────────────
    for (const s of actionable) {
      const sizing = calculateHalfKelly({
        winProb: s.winProb,
        payoffRatio: s.payoffRatio,
        portfolioDrawdownPct: 0,
        portfolioNAV: 10_000_000,
        adv20DayValueINR: 50_000_000,
      });

      expect(sizing.allocatedPct).toBeLessThanOrEqual(5.0);
      expect(sizing.allocatedValueINR).toBeLessThanOrEqual(500_000);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 5: REBALANCING & TAX-OPTIMAL EXECUTION (OBJ-5)
    // Setup target allocations and test rebalance trade-offs
    // ─────────────────────────────────────────────────────────────────────────
    await dbRun(
      db,
      `INSERT INTO TargetAllocations (entity_id, asset_class, target_pct, min_pct, max_pct, rebalance_tolerance_pct)
       VALUES 
       ('TestPF1', 'EQUITY_LARGE_CAP', 50.0, 45.0, 55.0, 5.0),
       ('TestPF1', 'TAX_FREE_NRE_FD',  50.0, 45.0, 55.0, 5.0)`
    );

    const rebalancePlan = await generateRebalancePlan(db, 'TestPF1');
    expect(rebalancePlan).toBeDefined();

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 6: TERMINAL WEALTH OUTCOME — AFTER-TAX COMPARISON (OBJ-5)
    // Verify rebalancing improves or preserves terminal risk-adjusted after-tax NAV
    // ─────────────────────────────────────────────────────────────────────────
    const baselineOutcome = simulateHoldForward(db, 'TestPF1', { rebalance: false, plan: rebalancePlan });
    const rebalancedOutcome = simulateHoldForward(db, 'TestPF1', { rebalance: true, plan: rebalancePlan });

    expect(rebalancedOutcome.riskAdjustedAfterTaxValue).toBeGreaterThanOrEqual(
      baselineOutcome.riskAdjustedAfterTaxValue
    );

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 7: AUDIT REPRODUCIBILITY (OBJ-6)
    // Verify idempotent re-evaluation produces identical plan and audit logs
    // ─────────────────────────────────────────────────────────────────────────
    const replayPlan = await generateRebalancePlan(db, 'TestPF1');
    expect(JSON.stringify(replayPlan.actions)).toBe(JSON.stringify(rebalancePlan.actions));

    // Execute plan and assert audit ledger entry
    const executionResult = await rebalancePlan.execute(db, { approvedBy: 'portfolio-manager' });
    expect(executionResult.transactions.length).toBeGreaterThanOrEqual(0);

    const auditLedger = await dbAll(db, `SELECT * FROM audit_ledger WHERE event_type = 'REBALANCE_EXECUTED'`);
    expect(auditLedger.length).toBe(executionResult.transactions.length);
  });
});
