/**
 * Suite 16.3: Rebalancing Engine — Wealth-Maximizing Trade Selection (OBJ-5)
 * Tests: WM-REB-01 to WM-REB-10
 * Focus: A rebalance is recommended ONLY when the expected after-tax, after-cost benefit
 * is positive; suppressed when a trade would cause needless friction or is inside a no-trade band.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { createTestDatabase, dbRun, dbAll, dbGet } from '../helpers/seedTestDb';
import { generateRebalancePlan } from '../../src/server/services/RebalancingEngine';

describe('WM-REB: Rebalancing Engine — Wealth-Maximizing Trade Selection', () => {
  let db: any;

  beforeEach(async () => {
    db = await createTestDatabase();
    await dbRun(
      db,
      `INSERT OR REPLACE INTO Portfolios (portfolio, owner_name, pan, broker_name)
       VALUES ('TestPF1', 'Test User A', 'PAN1', 'Zerodha')`
    );
  });

  test('WM-REB-01: inside no-trade band (42% vs 40% ± 5%) -> no rebalance action recommended', async () => {
    await dbRun(
      db,
      `INSERT INTO TargetAllocations (entity_id, asset_class, target_pct, min_pct, max_pct, rebalance_tolerance_pct)
       VALUES ('PAN1', 'EQUITY_LARGE_CAP', 40.0, 35.0, 45.0, 5.0)`
    );

    // Seed holdings such that actual weight = 42% (e.g. ₹42L out of ₹1 Cr total)
    await dbRun(
      db,
      `INSERT INTO Holdings (portfolio, isin, symbol, quantity, avg_buy_price, total_cost, ltp, current_value)
       VALUES 
       ('TestPF1', 'INE001A01036', 'TESTSTOCK', 4200, 1000, 4200000, 1000, 4200000),
       ('TestPF1', 'INE002A01018', 'FD_CASH', 5800, 1000, 5800000, 1000, 5800000)`
    );

    const plan = await generateRebalancePlan(db, 'PAN1');
    const largeCapAction = plan.actions.find(a => a.asset_class === 'EQUITY_LARGE_CAP');
    expect(largeCapAction).toBeUndefined();
  });

  test('WM-REB-02: outside band (47% vs 40% ± 5%) -> sized to land safely inside band, not overshoot', async () => {
    await dbRun(
      db,
      `INSERT INTO TargetAllocations (entity_id, asset_class, target_pct, min_pct, max_pct, rebalance_tolerance_pct)
       VALUES ('PAN1', 'EQUITY_LARGE_CAP', 40.0, 35.0, 45.0, 5.0)`
    );

    // Seed holdings such that actual weight = 47% (₹47L out of ₹1 Cr total)
    await dbRun(
      db,
      `INSERT INTO Holdings (portfolio, isin, symbol, quantity, avg_buy_price, total_cost, ltp, current_value)
       VALUES 
       ('TestPF1', 'INE001A01036', 'TESTSTOCK', 4700, 1000, 4700000, 1000, 4700000),
       ('TestPF1', 'INE002A01018', 'FD_CASH', 5300, 1000, 5300000, 1000, 5300000)`
    );

    const plan = await generateRebalancePlan(db, 'PAN1');
    const action = plan.actions.find(a => a.asset_class === 'EQUITY_LARGE_CAP');
    expect(action).toBeDefined();
    expect(action?.direction).toBe('SELL');
    // Resulting weight lands inside the band [35%, 45%]
    expect(action?.resultingWeightPct).toBeGreaterThanOrEqual(35);
    expect(action?.resultingWeightPct).toBeLessThanOrEqual(45);
  });

  test('WM-REB-03: prefers LTCG-qualified lot over STCG lot for the same ISIN to minimize tax', async () => {
    await dbRun(
      db,
      `INSERT INTO TargetAllocations (entity_id, asset_class, target_pct, min_pct, max_pct, rebalance_tolerance_pct)
       VALUES ('PAN1', 'EQUITY_LARGE_CAP', 20.0, 15.0, 25.0, 5.0)`
    );

    // Buy lot 1: 400 days old -> LTCG qualified (12.5% rate)
    await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount)
       VALUES ('2025-01-01', 'TestPF1', 'BUY', 'INE001A01036', 'ABC', 100, 100, 10000, 10000)`
    );

    // Buy lot 2: 120 days old -> STCG lot (20% rate)
    await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount)
       VALUES ('2026-05-01', 'TestPF1', 'BUY', 'INE001A01036', 'ABC', 100, 100, 10000, 10000)`
    );

    await dbRun(
      db,
      `INSERT INTO Holdings (portfolio, isin, symbol, quantity, avg_buy_price, total_cost, ltp, current_value)
       VALUES ('TestPF1', 'INE001A01036', 'ABC', 200, 100, 20000, 200, 40000)`
    );

    const plan = await generateRebalancePlan(db, 'PAN1');
    const sell = plan.actions.find(a => a.direction === 'SELL');
    expect(sell).toBeDefined();
    expect(sell?.selectedLot?.gain_type_at_sale).toBe('LTCG');
    // Estimated tax impact of LTCG lot is strictly less than STCG lot alternative
    expect(sell?.estimatedTaxImpact).toBeLessThan(sell?.alternativeIfStcgLotSold?.estimatedTaxImpact || 0);
  });

  test('WM-REB-05: drawdown freeze blocks NEW buys but permits risk-reducing SELLs', async () => {
    await dbRun(
      db,
      `INSERT INTO TargetAllocations (entity_id, asset_class, target_pct, min_pct, max_pct, rebalance_tolerance_pct)
       VALUES 
       ('PAN1', 'EQUITY_LARGE_CAP', 30.0, 25.0, 35.0, 5.0),
       ('PAN1', 'TAX_FREE_NRE_FD', 70.0, 65.0, 75.0, 5.0)`
    );

    // Overweight in Equity (60%), underweight in FD (40%)
    await dbRun(
      db,
      `INSERT INTO Holdings (portfolio, isin, symbol, quantity, avg_buy_price, total_cost, ltp, current_value)
       VALUES 
       ('TestPF1', 'INE001A01036', 'RISKY_STOCK', 6000, 1000, 6000000, 1000, 6000000),
       ('TestPF1', 'INE002A01018', 'FD_CASH', 4000, 1000, 4000000, 1000, 4000000)`
    );

    // Portfolio in acute drawdown (30%)
    await dbRun(
      db,
      `INSERT INTO PortfolioSnapshot (portfolio, as_of_date, current_drawdown_pct)
       VALUES ('TestPF1', '2026-09-06', 30.0)`
    );

    const plan = await generateRebalancePlan(db, 'PAN1');
    const sells = plan.actions.filter(a => a.direction === 'SELL');
    const buys = plan.actions.filter(a => a.direction === 'BUY');

    // Risk-reducing SELL of overweight risky stock is allowed
    expect(sells.length).toBeGreaterThan(0);
    expect(sells.every(s => !s.blockedByCircuitBreaker)).toBe(true);

    // New BUYs are blocked by the drawdown circuit breaker
    expect(buys.every(b => b.blockedByCircuitBreaker === true)).toBe(true);
  });

  test('WM-REB-06: cost-benefit gate suppresses trades whose tax+cost exceeds benefit', async () => {
    await dbRun(
      db,
      `INSERT INTO TargetAllocations (entity_id, asset_class, target_pct, min_pct, max_pct, rebalance_tolerance_pct)
       VALUES ('PAN1', 'EQUITY_LARGE_CAP', 40.0, 38.0, 42.0, 2.0)`
    );

    // Slight drift (43% vs 42% max), but massive tax liability
    await dbRun(
      db,
      `INSERT INTO Holdings (portfolio, isin, symbol, quantity, avg_buy_price, total_cost, ltp, current_value)
       VALUES ('TestPF1', 'INE001A01036', 'HIGH_TAX_STOCK', 430, 10, 4300, 1000, 430000)`
    );

    const plan = await generateRebalancePlan(db, 'PAN1');
    // If marginal benefit does not compensate for tax drag, trade is suppressed or net benefit is positive
    for (const act of plan.actions) {
      if (act.direction === 'SELL') {
        expect(act.estimatedNetBenefit).toBeGreaterThan(0);
      }
    }
    expect(plan.suppressedForCostBenefit).toBeDefined();
  });

  test('WM-REB-07: multi-PAN rebalancing strictly segregates plans and tax lots across PANs (INV-7)', async () => {
    // PAN1 setup
    await dbRun(
      db,
      `INSERT INTO TargetAllocations (entity_id, asset_class, target_pct, min_pct, max_pct)
       VALUES ('AAAAA0001A', 'EQUITY_LARGE_CAP', 30.0, 25.0, 35.0)`
    );
    // PAN2 setup
    await dbRun(
      db,
      `INSERT INTO TargetAllocations (entity_id, asset_class, target_pct, min_pct, max_pct)
       VALUES ('BBBBB0002B', 'EQUITY_LARGE_CAP', 50.0, 45.0, 55.0)`
    );

    const plan1 = await generateRebalancePlan(db, 'AAAAA0001A');
    const plan2 = await generateRebalancePlan(db, 'BBBBB0002B');

    expect(plan1.entityId).toBe('AAAAA0001A');
    expect(plan2.entityId).toBe('BBBBB0002B');

    // Lots and actions do not cross PANs
    const lots1 = plan1.actions.map(a => a.lotId).filter(Boolean);
    const lots2 = plan2.actions.map(a => a.lotId).filter(Boolean);
    const crossLots = lots1.filter(l => lots2.includes(l));
    expect(crossLots.length).toBe(0);
  });

  test('WM-REB-08: accepted rebalance creates audit trail in audit_ledger with SHA-256 hash', async () => {
    await dbRun(
      db,
      `INSERT INTO TargetAllocations (entity_id, asset_class, target_pct, min_pct, max_pct, rebalance_tolerance_pct)
       VALUES ('PAN1', 'EQUITY_LARGE_CAP', 30.0, 25.0, 35.0, 5.0)`
    );

    await dbRun(
      db,
      `INSERT INTO Holdings (portfolio, isin, symbol, quantity, avg_buy_price, total_cost, ltp, current_value)
       VALUES ('TestPF1', 'INE001A01036', 'TEST', 500, 100, 50000, 100, 50000)`
    );

    const plan = await generateRebalancePlan(db, 'PAN1');
    const executed = await plan.execute(db, { approvedBy: 'chief-investment-officer' });

    for (const txn of executed.transactions) {
      expect(txn.source).toBe('REBALANCE_ENGINE');
    }

    const auditRows = await dbAll(db, `SELECT * FROM audit_ledger WHERE event_type = 'REBALANCE_EXECUTED'`);
    expect(auditRows.length).toBe(executed.transactions.length);
    if (auditRows.length > 0) {
      expect(auditRows[0].hash.length).toBe(64); // SHA-256 hex length
    }
  });

  test('WM-REB-10: idempotent rebalancing — identical inputs yield identical plan', async () => {
    await dbRun(
      db,
      `INSERT INTO TargetAllocations (entity_id, asset_class, target_pct, min_pct, max_pct, rebalance_tolerance_pct)
       VALUES ('PAN1', 'EQUITY_LARGE_CAP', 40.0, 35.0, 45.0, 5.0)`
    );

    const planA = await generateRebalancePlan(db, 'PAN1');
    const planB = await generateRebalancePlan(db, 'PAN1');

    expect(JSON.stringify(planA.actions)).toBe(JSON.stringify(planB.actions));
  });
});
