import { getDB, dbAll, dbGet, dbRun } from './src/server/database.js';

async function seedIntegrityData() {
  const db = getDB();
  await new Promise(r => setTimeout(r, 1500));

  console.log('\n=== Seeding Integrity Data ===\n');

  const tables = await dbAll(db, "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ReconciledHoldings','SoldStockRegistry','FifoRunLog')");
  console.log('New integrity tables:', tables.map((t: any) => t.name).join(', '));

  const baseline = await dbGet(db, "SELECT cash_in_hand FROM PmsReconciliationBaseline WHERE portfolio = 'cc9'").catch(() => null);
  const cc9Cash = baseline?.cash_in_hand;
  console.log('cc9 cash_in_hand:', cc9Cash);
  if (!cc9Cash || cc9Cash <= 0) {
    await dbRun(db, "INSERT INTO PmsReconciliationBaseline (portfolio, cash_in_hand) VALUES ('cc9', 22559.08) ON CONFLICT(portfolio) DO UPDATE SET cash_in_hand = CASE WHEN cash_in_hand IS NULL OR cash_in_hand = 0 THEN 22559.08 ELSE cash_in_hand END").catch(() => {});
    console.log('  Seeded cc9 cash = 22559.08');
  }

  const sarwaCashRow = await dbGet(db, "SELECT value FROM AppConfig WHERE key = 'sarwa_cash_usd'").catch(() => null);
  if (!sarwaCashRow) {
    await dbRun(db, "INSERT INTO AppConfig (key, value) VALUES ('sarwa_cash_usd', '168.82')").catch(() => {});
    console.log('Seeded sarwa_cash_usd = 168.82');
  } else {
    console.log('sarwa_cash_usd:', sarwaCashRow.value);
  }

  const portfolios = await dbAll(db, "SELECT DISTINCT portfolio FROM Holdings WHERE portfolio IS NOT NULL AND portfolio != '' AND symbol != 'CASH'");
  let totalLocked = 0;
  for (const { portfolio } of portfolios as any[]) {
    const holdings = await dbAll(db, 
      "SELECT portfolio, isin, symbol, quantity, avg_buy_price, total_cost FROM Holdings WHERE portfolio = ? AND quantity > 0 AND symbol != 'CASH'",
      [portfolio]
    );
    for (const h of holdings as any[]) {
      await dbRun(db, 
        "INSERT OR REPLACE INTO ReconciledHoldings (portfolio, isin, symbol, quantity, avg_buy_price, total_cost, reconciled_at, reconciled_by, is_locked, notes) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'initial_seed', 1, 'Locked on upgrade to v3.1.0')",
        [h.portfolio, h.isin, h.symbol, h.quantity, h.avg_buy_price, h.total_cost]
      );
      totalLocked++;
    }
    console.log(`  Locked ${holdings.length} positions for '${portfolio}'`);
  }
  console.log('Total locked:', totalLocked);

  const gsm = await dbAll(db, "SELECT portfolio, isin, symbol, quantity FROM Holdings WHERE UPPER(symbol) LIKE '%GSM%'");
  if ((gsm as any[]).length > 0) {
    console.log('\nGSM still in Holdings - needs sealing:');
    for (const g of gsm as any[]) console.log(`  ${g.portfolio}::${g.symbol} (${g.isin}) qty=${g.quantity}`);
  } else {
    console.log('\nGSM NOT in Holdings. Good.');
  }

  console.log('\n=== Done ===');
}

seedIntegrityData().catch(console.error);
