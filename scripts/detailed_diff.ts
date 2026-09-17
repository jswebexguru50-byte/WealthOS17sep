import { getDB, dbAll } from '../src/server/database.js';
import { BankAndFDService } from '../src/server/services/BankAndFDService.js';

async function diff() {
  const db = getDB();

  // 1. Raw holdings in DB
  const rawHoldings = await dbAll(db, "SELECT portfolio, symbol, isin, quantity, total_cost, ltp, native_ltp, current_value, native_current_value, currency FROM Holdings WHERE quantity > 0");

  const pmsBaseline = await dbAll(db, "SELECT portfolio, cash_in_hand FROM PmsReconciliationBaseline");
  console.log('PMS Baselines:', pmsBaseline);

  let cc9PmsCash = 0;
  pmsBaseline.forEach(b => {
    if (b.portfolio === 'cc9') cc9PmsCash = b.cash_in_hand || 0;
  });

  // Calculate per portfolio
  const portSummary: Record<string, { count: number, val: number, cost: number }> = {};
  rawHoldings.forEach(h => {
    if (!portSummary[h.portfolio]) portSummary[h.portfolio] = { count: 0, val: 0, cost: 0 };
    portSummary[h.portfolio].count++;
    portSummary[h.portfolio].val += h.current_value;
    portSummary[h.portfolio].cost += h.total_cost;
  });

  console.log('\n--- Holdings by Portfolio ---');
  let totalHoldings = 0;
  Object.entries(portSummary).forEach(([p, s]) => {
    console.log(`${p.padEnd(20)}: ${String(s.count).padStart(3)} positions | Val: ₹${(s.val/10000000).toFixed(4)} Cr`);
    totalHoldings += s.val;
  });

  const bankFDs = await BankAndFDService.getInstance().getAllBankAndFDs();
  const fxRates = { INR: 1, USD: 94.94, AED: 25.80, EUR: 110.1, GBP: 128.56 };
  let bankVal = 0;
  bankFDs.forEach(b => {
    const rate = fxRates[b.currency.toUpperCase()] || 1.0;
    bankVal += (b.balance_amount || 0) * rate;
  });

  console.log(`\nSum of Holdings in DB:     ₹${(totalHoldings/10000000).toFixed(4)} Cr`);
  console.log(`Bank Accounts & FDs:       ₹${(bankVal/10000000).toFixed(4)} Cr`);
  console.log(`PMS Cash in Hand (cc9):    ₹${(cc9PmsCash/10000000).toFixed(4)} Cr`);
  console.log(`Consolidated Grand Total:  ₹${((totalHoldings + bankVal + cc9PmsCash)/10000000).toFixed(4)} Cr`);
}

diff();
