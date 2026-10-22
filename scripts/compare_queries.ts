import { getDB, dbAll } from '../src/server/database.js';

async function compareQueries() {
  const db = getDB();

  // Query 1: commandCenter.ts
  const ccHoldings = await dbAll(db, `
    SELECT 
      h.portfolio, h.symbol, h.isin, h.quantity, h.current_value, h.ltp, h.avg_buy_price, h.currency
    FROM Holdings h
    LEFT JOIN Portfolios p ON h.portfolio = p.name
    WHERE h.quantity > 0
  `);

  // Query 2: server.ts
  const srvHoldings = await dbAll(db, `SELECT * FROM Holdings WHERE quantity > 0`);

  let ccTotal = 0;
  ccHoldings.forEach((h: any) => {
    const curVal = Number(h.current_value || (h.quantity * (h.ltp || h.avg_buy_price)) || 0);
    ccTotal += curVal;
  });

  let srvTotal = 0;
  const usdRate = 94.94;
  srvHoldings.forEach((h: any) => {
    const isUsAsset = h.currency === 'USD' || (h.portfolio && h.portfolio.toLowerCase().includes('ibkr')) || (h.portfolio && h.portfolio.toLowerCase().includes('sarwa'));
    const inrVal = (isUsAsset && h.native_current_value > 0) ? (h.native_current_value * usdRate) : (isUsAsset && h.current_value < 100000 ? h.current_value * usdRate : h.current_value);
    srvTotal += inrVal;
  });

  console.log('commandCenter calculation: ₹', (ccTotal/10000000).toFixed(4), 'Cr');
  console.log('server.ts calculation:     ₹', (srvTotal/10000000).toFixed(4), 'Cr');
  console.log('Diff:                      ₹', ((ccTotal - srvTotal)/100000).toFixed(2), 'Lakh');

  // Let's find which rows differ
  for (let i = 0; i < ccHoldings.length; i++) {
    const c = ccHoldings[i];
    const s = srvHoldings.find((x: any) => x.portfolio === c.portfolio && x.symbol === c.symbol);
    if (!s) continue;
    const isUsAsset = s.currency === 'USD' || (s.portfolio && s.portfolio.toLowerCase().includes('ibkr')) || (s.portfolio && s.portfolio.toLowerCase().includes('sarwa'));
    const inrValS = (isUsAsset && s.native_current_value > 0) ? (s.native_current_value * usdRate) : (isUsAsset && s.current_value < 100000 ? s.current_value * usdRate : s.current_value);
    const inrValC = Number(c.current_value || (c.quantity * (c.ltp || c.avg_buy_price)) || 0);

    if (Math.abs(inrValS - inrValC) > 10) {
      console.log(`Diff on ${c.portfolio} - ${c.symbol}: CC=${inrValC.toFixed(2)}, SRV=${inrValS.toFixed(2)} (diff=${(inrValC - inrValS).toFixed(2)})`);
    }
  }
}

compareQueries();
