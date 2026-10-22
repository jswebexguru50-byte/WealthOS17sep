import { getDB, dbAll } from '../src/server/database.js';
import { BankAndFDService } from '../src/server/services/BankAndFDService.js';

async function compare() {
  const db = getDB();

  console.log('=== HOLDINGS PER PORTFOLIO IN DB ===');
  const rows = await dbAll(db, `
    SELECT portfolio, COUNT(*) as cnt, SUM(total_cost) as cost, SUM(current_value) as val 
    FROM Holdings 
    WHERE quantity > 0 
    GROUP BY portfolio
  `);
  let totalHoldingsVal = 0;
  for (const r of rows) {
    console.log(`${r.portfolio.padEnd(20)}: ${String(r.cnt).padStart(3)} rows | Cost: ₹${(r.cost/10000000).toFixed(4)} Cr | Val: ₹${(r.val/10000000).toFixed(4)} Cr`);
    totalHoldingsVal += r.val;
  }
  console.log(`TOTAL HOLDINGS VALUATION: ₹${(totalHoldingsVal/10000000).toFixed(4)} Cr`);

  const bankFDs = await BankAndFDService.getInstance().getAllBankAndFDs();
  const fxRates = { INR: 1, USD: 94.94, AED: 25.80, EUR: 110.1, GBP: 128.56 };
  let totalBankVal = 0;
  bankFDs.forEach(b => {
    const rate = fxRates[b.currency.toUpperCase()] || 1.0;
    totalBankVal += (b.balance_amount || 0) * rate;
  });
  console.log(`TOTAL BANK FDs:           ₹${(totalBankVal/10000000).toFixed(4)} Cr`);
  console.log(`TRUE CONSOLIDATED NET WORTH: ₹${((totalHoldingsVal + totalBankVal)/10000000).toFixed(4)} Cr`);
}

compare();
