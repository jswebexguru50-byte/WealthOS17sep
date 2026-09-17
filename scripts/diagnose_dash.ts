import { getDB, dbAll } from '../src/server/database.js';
import { BankAndFDService } from '../src/server/services/BankAndFDService.js';

async function diagnose() {
  const db = getDB();
  const rawHoldings = await dbAll(db, "SELECT * FROM Holdings WHERE quantity > 0");

  const fxRates = { INR: 1, USD: 94.94, AED: 25.80, EUR: 110.1, GBP: 128.56 };
  const usdRate = 94.94;

  const holdings = rawHoldings.map((h: any) => {
    const isUsAsset = h.currency === 'USD' || (h.portfolio && h.portfolio.toLowerCase().includes('ibkr')) || (h.portfolio && h.portfolio.toLowerCase().includes('sarwa'));
    const currency = isUsAsset ? 'USD' : (h.currency || 'INR');
    const rate = fxRates[currency.toUpperCase()] || 1.0;
    const inrVal = (isUsAsset && h.native_current_value > 0) ? (h.native_current_value * rate) : (isUsAsset && h.current_value < 100000 ? h.current_value * rate : h.current_value);
    return { ...h, inr_valuation: inrVal };
  });

  const equityMfUnlistedVal = holdings.reduce((s: number, h: any) => s + h.inr_valuation, 0);

  const allBankFDs = await BankAndFDService.getInstance().getAllBankAndFDs();
  let bankVal = 0;
  for (const b of allBankFDs) {
    const rate = fxRates[b.currency.toUpperCase()] || 1.0;
    bankVal += (b.balance_amount || 0) * rate;
  }

  const pmsBaseline = await dbAll(db, "SELECT portfolio, cash_in_hand FROM PmsReconciliationBaseline");
  let pmsCash = 0;
  pmsBaseline.forEach(b => {
    if (b.portfolio === 'cc9') pmsCash = b.cash_in_hand || 0;
  });

  console.log('1. Equity + MF + Unlisted + US ETFs (inr_valuation): ₹', (equityMfUnlistedVal/10000000).toFixed(4), 'Cr');
  console.log('2. Bank Accounts & FDs:                             ₹', (bankVal/10000000).toFixed(4), 'Cr');
  console.log('3. PMS Cash in Hand:                                ₹', (pmsCash/10000000).toFixed(4), 'Cr');
  console.log('TOTAL CONSOLIDATED FAMILY NET WORTH:                ₹', ((equityMfUnlistedVal + bankVal + pmsCash)/10000000).toFixed(4), 'Cr');
}

diagnose();
