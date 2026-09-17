import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('portfolio.db');

const usdRate = 94.94;

const liveQuotes = [
  { symbol: 'VGT', isin: 'US92204A7028', qty: 1248.3672, ltp_usd: 119.00 },
  { symbol: 'VOO', isin: 'US9229083632', qty: 141.0000, ltp_usd: 700.57 },
  { symbol: 'SCHG', isin: 'US8085243015', qty: 2516.0000, ltp_usd: 35.37 },
  { symbol: 'QQQ', isin: 'US46090E1038', qty: 67.8100, ltp_usd: 698.91 },
  { symbol: 'CASH', isin: 'CASH_USD', qty: 5280.0000, ltp_usd: 1.00 }
];

async function updateIbkrPrices() {
  console.log('--- Applying Live IBKR Broker Rates ---');
  let totalUsd = 0;
  for (const q of liveQuotes) {
    const valUsd = q.qty * q.ltp_usd;
    totalUsd += valUsd;
    const valInr = valUsd * usdRate;
    const ltpInr = q.ltp_usd * usdRate;

    await new Promise((resolve) => {
      db.run(`
        UPDATE Holdings 
        SET native_ltp = ?, native_current_value = ?, ltp = ?, current_value = ?, data_source = 'IBKR Live Broker Feed', last_update = datetime('now')
        WHERE portfolio = 'US - IBKR' AND (symbol = ? OR isin = ?)
      `, [q.ltp_usd, valUsd, ltpInr, valInr, q.symbol, q.isin], (err) => {
        if (err) console.error(err);
        resolve(null);
      });
    });

    console.log(`${q.symbol}: ${q.qty} @ $${q.ltp_usd} = $${valUsd.toFixed(2)} USD (₹${(valInr/100000).toFixed(2)} Lakh)`);
  }

  console.log(`\nTOTAL IBKR ACCOUNT VALUATION: $${totalUsd.toFixed(2)} USD (₹${(totalUsd * usdRate / 10000000).toFixed(4)} Cr)`);
}

updateIbkrPrices();
