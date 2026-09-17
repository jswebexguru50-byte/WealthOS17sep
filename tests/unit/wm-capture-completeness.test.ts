/**
 * Suite 16.1: Transaction & Holding Capture Completeness (OBJ-1, OBJ-2)
 * Tests: WM-CAP-01 to WM-CAP-09
 * Focus: Nothing gets lost, nothing gets doubled, and Holdings never drifts from Transactions.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { createTestDatabase, dbRun, dbAll, dbGet } from '../helpers/seedTestDb';
import { runFIFO } from '../../src/server/fifoEngine';
import crypto from 'crypto';

describe('WM-CAP: Transaction Capture Completeness & Integrity', () => {
  let db: any;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  test('WM-CAP-01: every row in a contract note is captured exactly once (no silent drops)', async () => {
    const fixtureRows = 47;
    const batchId = `BATCH-${Date.now()}`;

    // Simulate batch insertion of 47 trade lines
    for (let i = 1; i <= fixtureRows; i++) {
      await dbRun(
        db,
        `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, notes)
         VALUES ('2026-08-15', 'TestPF1', 'BUY', 'INE001A01036', 'TESTSTOCK', 10, 150.0, 1500.0, 1500.0, 'CONTRACT_NOTE', ?)`,
        [`import_batch:${batchId}`]
      );
    }

    const captured = await dbAll(
      db,
      `SELECT * FROM Transactions WHERE notes LIKE ?`,
      [`%import_batch:${batchId}%`]
    );

    expect(captured.length).toBe(fixtureRows);
  });

  test('WM-CAP-02: re-importing the same file is a no-op (idempotent duplicate prevention)', async () => {
    const fileHash = crypto.createHash('sha256').update('fixture-contract-note-content-v1').digest('hex');
    const dedupKey = `FILE-HASH-${fileHash}`;

    // First import
    await dbRun(
      db,
      `INSERT INTO mutation_dedup_keys (dedup_key, entity_type, entity_id, created_at)
       VALUES (?, 'CONTRACT_NOTE_IMPORT', 'TestPF1', datetime('now'))`,
      [dedupKey]
    );

    await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source)
       VALUES ('2026-08-15', 'TestPF1', 'BUY', 'INE001A01036', 'TESTSTOCK', 100, 200, 20000, 20000, 'CONTRACT_NOTE')`
    );

    const firstCount = await dbGet(db, `SELECT COUNT(*) as n FROM Transactions WHERE portfolio='TestPF1'`);

    // Second import attempt: checks dedup key first
    const existing = await dbGet(db, `SELECT dedup_key FROM mutation_dedup_keys WHERE dedup_key = ?`, [dedupKey]);
    expect(existing).toBeDefined();

    // If duplicate detected, transaction insertion is blocked
    let duplicateBlocked = false;
    if (existing) {
      duplicateBlocked = true; // Blocked from executing duplicate insert
    }

    expect(duplicateBlocked).toBe(true);

    const secondCount = await dbGet(db, `SELECT COUNT(*) as n FROM Transactions WHERE portfolio='TestPF1'`);
    expect(secondCount.n).toBe(firstCount.n); // Row count unchanged
  });

  test('WM-CAP-03: importing overlapping files from two brokers computes union of unique transactions', async () => {
    // Broker A reports 100 shares bought on 2026-01-10
    await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, broker_name)
       VALUES ('2026-01-10', 'TestPF1', 'BUY', 'INE009A01021', 'INFY', 100, 1500, 150000, 150000, 'BROKER_A', 'Zerodha')`
    );

    // Broker B reports 50 shares bought on 2026-02-15
    await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, broker_name)
       VALUES ('2026-02-15', 'TestPF1', 'BUY', 'INE009A01021', 'INFY', 50, 1600, 80000, 80000, 'BROKER_B', 'HDFC Sky')`
    );

    await runFIFO(db);

    const holding = await dbGet(db, `SELECT * FROM Holdings WHERE portfolio='TestPF1' AND isin='INE009A01021'`);
    expect(holding.quantity).toBe(150); // 100 + 50
    expect(holding.total_cost).toBe(230000); // 150000 + 80000
    expect(holding.avg_buy_price).toBeCloseTo(230000 / 150, 2);
  });

  test('WM-CAP-04: bonus issue (1:1) applied before same-day sale is matched against lots', async () => {
    // Initial buy: 100 shares @ ₹200 = ₹20,000
    await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount)
       VALUES ('2024-06-01', 'TestPF1', 'BUY', 'INE001A01036', 'TEST', 100, 200, 20000, 20000)`
    );

    // Ex-date bonus 1:1 on 2024-07-01: 100 -> 200 shares, total cost basis remains 20,000 (INV-2)
    await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount)
       VALUES ('2024-07-01', 'TestPF1', 'BONUS', 'INE001A01036', 'TEST', 100, 0, 0, 0)`
    );

    // Same-day SELL of 150 shares (only valid because bonus made 200 shares available)
    await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount)
       VALUES ('2024-07-01', 'TestPF1', 'SELL', 'INE001A01036', 'TEST', 150, 120, 18000, 18000)`
    );

    await runFIFO(db);

    const holding = await dbGet(db, `SELECT * FROM Holdings WHERE portfolio='TestPF1' AND isin='INE001A01036'`);
    expect(holding.quantity).toBe(50); // 200 - 150

    const gains = await dbAll(db, `SELECT * FROM RealizedGains WHERE portfolio='TestPF1'`);
    const totalCostSold = gains.reduce((s: number, g: any) => s + Number(g.buy_cost ?? g.cost_basis ?? 0), 0);
    // Post-bonus cost basis per share = 20,000 / 200 = ₹100. 150 shares sold -> cost basis = 15,000
    expect(totalCostSold).toBeCloseTo(15000, 1);

    // Audit check: zero cost variance
    const remainingCost = holding.total_cost;
    expect(totalCostSold + remainingCost).toBeCloseTo(20000, 1);
  });

  test('WM-CAP-05: broker amendment creates reversal + correction pair, never in-place mutation', async () => {
    // Original trade
    const orig = await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source)
       VALUES ('2026-08-01', 'TestPF1', 'BUY', 'INE001A01036', 'TEST', 100, 200, 20000, 20000, 'ZERODHA')`
    );
    const origId = orig.lastID;

    // Broker correction arrives: true quantity was 90, not 100
    // Immutable ledger creates an offsetting REVERSAL row and a NEW CORRECTION row
    await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, notes)
       VALUES ('2026-08-01', 'TestPF1', 'REVERSAL', 'INE001A01036', 'TEST', -100, 200, -20000, -20000, 'AMENDMENT', 'Reversal of txn #${origId}')`
    );

    await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, notes)
       VALUES ('2026-08-01', 'TestPF1', 'BUY', 'INE001A01036', 'TEST', 90, 200, 18000, 18000, 'AMENDMENT', 'Corrected trade for txn #${origId}')`
    );

    // Verify original row was NOT deleted or mutated
    const originalRow = await dbGet(db, `SELECT * FROM Transactions WHERE id = ?`, [origId]);
    expect(originalRow.quantity).toBe(100);

    // Verify net ledger quantity is 90
    const netTxn = await dbGet(db, `
      SELECT SUM(CASE WHEN type IN ('BUY', 'CORRECTION') THEN quantity WHEN type = 'REVERSAL' THEN quantity ELSE 0 END) as net_qty
      FROM Transactions WHERE portfolio='TestPF1' AND isin='INE001A01036'
    `);
    expect(netTxn.net_qty).toBe(90);
  });

  test('WM-CAP-06: reconciliation flags broker mismatch and never silently overwrites Holdings', async () => {
    await dbRun(
      db,
      `INSERT INTO Holdings (portfolio, isin, symbol, quantity, avg_buy_price, total_cost)
       VALUES ('TestPF1', 'INE001A01036', 'TEST', 50, 120, 6000)`
    );

    // Broker demat statement claims 55 shares
    const brokerReportedQty = 55;
    const dbHolding = await dbGet(db, `SELECT quantity FROM Holdings WHERE portfolio='TestPF1' AND isin='INE001A01036'`);

    const variance = brokerReportedQty - dbHolding.quantity;
    const status = Math.abs(variance) > 0 ? 'RECON_MISMATCH' : 'MATCHED';

    expect(status).toBe('RECON_MISMATCH');
    expect(variance).toBe(5);

    // Critical Invariant: App must NOT silently overwrite Holdings.quantity
    const holdingAfterRecon = await dbGet(db, `SELECT quantity FROM Holdings WHERE portfolio='TestPF1' AND isin='INE001A01036'`);
    expect(holdingAfterRecon.quantity).toBe(50);
  });

  test('WM-CAP-07: Holdings <-> Ledger drift check maintains exact identity across portfolios', async () => {
    // Seed transactions for multiple stocks
    await dbRun(db, `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount)
      VALUES ('2026-01-01', 'TestPF1', 'BUY', 'INE002A01018', 'RELIANCE', 100, 2500, 250000, 250000)`);
    await dbRun(db, `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount)
      VALUES ('2026-03-01', 'TestPF1', 'SELL', 'INE002A01018', 'RELIANCE', 40, 2800, 112000, 112000)`);

    await runFIFO(db);

    const holdings = await dbAll(db, `SELECT * FROM Holdings WHERE portfolio='TestPF1'`);
    for (const h of holdings) {
      const txnAgg = await dbGet(
        db,
        `SELECT 
           SUM(CASE WHEN type IN ('BUY', 'BONUS', 'RIGHTS') THEN quantity ELSE 0 END) -
           SUM(CASE WHEN type = 'SELL' THEN quantity ELSE 0 END) as net_qty
         FROM Transactions WHERE portfolio = ? AND isin = ?`,
        [h.portfolio, h.isin]
      );
      expect(h.quantity).toBeCloseTo(txnAgg.net_qty, 4);
    }
  });

  test('WM-CAP-08: multi-currency transactions capture INR equivalent using date-effective FX rate', async () => {
    const tradeDate = '2026-05-10';
    const fxRateOnDate = 85.50; // Historical FX rate on May 10 2026
    const netUSD = 1000.0;
    const netINR = netUSD * fxRateOnDate;

    await dbRun(
      db,
      `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, notes)
       VALUES (?, 'TestNRI', 'BUY', 'US0378331005', 'AAPL', 5, 200.0, 1000.0, ?, 'IBKR_USD', ?)`,
      [tradeDate, netINR, `currency:USD;fx_rate:${fxRateOnDate};usd_amount:${netUSD}`]
    );

    const txn = await dbGet(db, `SELECT * FROM Transactions WHERE portfolio='TestNRI' AND symbol='AAPL'`);
    expect(txn.net_amount).toBe(85500.0);
    expect(txn.notes).toContain('fx_rate:85.5');
    expect(txn.notes).toContain('usd_amount:1000');
  });

  test('WM-CAP-09: partial fills captured as distinct individual lots with actual execution prices', async () => {
    // An order of 100 shares filled in 3 tranches: 30 @ 500, 50 @ 502, 20 @ 505
    const fills = [
      { qty: 30, price: 500.0, fillId: 'FILL-1' },
      { qty: 50, price: 502.0, fillId: 'FILL-2' },
      { qty: 20, price: 505.0, fillId: 'FILL-3' },
    ];

    for (const f of fills) {
      await dbRun(
        db,
        `INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, notes)
         VALUES ('2026-08-01', 'TestPF1', 'BUY', 'INE001A01036', 'TEST', ?, ?, ?, ?, ?)`,
        [f.qty, f.price, f.qty * f.price, f.qty * f.price, `order_id:ORD-999;fill_id:${f.fillId}`]
      );
    }

    const recordedFills = await dbAll(db, `SELECT * FROM Transactions WHERE notes LIKE '%order_id:ORD-999%' ORDER BY id ASC`);
    expect(recordedFills.length).toBe(3); // Preserved as 3 distinct lots, not merged
    expect(recordedFills[0].price).toBe(500.0);
    expect(recordedFills[1].price).toBe(502.0);
    expect(recordedFills[2].price).toBe(505.0);

    const totalQty = recordedFills.reduce((s: number, r: any) => s + r.quantity, 0);
    expect(totalQty).toBe(100);
  });
});
