const https = require('https');

async function fetchYahooPrice(symbol) {
  return new Promise((resolve) => {
    https.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const meta = json.chart.result[0].meta;
          resolve({
            symbol,
            price: meta.regularMarketPrice,
            prevClose: meta.chartPreviousClose || meta.previousClose
          });
        } catch (e) {
          resolve({ symbol, error: e.message });
        }
      });
    }).on('error', (err) => resolve({ symbol, error: err.message }));
  });
}

async function checkEtfValuation() {
  const symbols = ['VGT', 'VOO', 'SCHG', 'QQQ', 'MET'];
  const prices = {};
  for (const s of symbols) {
    const res = await fetchYahooPrice(s);
    prices[s] = res.price;
    console.log(`${s}: Current Market Price = $${res.price}`);
  }

  // Let's check the valuation with current DB quantities
  const quantities = {
    VGT: 1092.3213,
    VOO: 141,
    SCHG: 1887,
    QQQ: 100
  };

  console.log('\n--- Valuation at LIVE Yahoo Finance Prices with DB Quantities ---');
  let totalVal = 0;
  for (const [sym, qty] of Object.entries(quantities)) {
    const p = prices[sym] || 0;
    const val = qty * p;
    totalVal += val;
    console.log(`${sym}: ${qty} shares @ $${p} = $${val.toFixed(2)} USD`);
  }
  console.log(`Total Securities Value: $${totalVal.toFixed(2)} USD`);
  console.log(`+ Cash ($5,280.00 USD): $${(totalVal + 5280).toFixed(2)} USD`);
  console.log(`Target IBKR Value:      $390,268.00 USD`);
  console.log(`Difference:             $${(390268 - (totalVal + 5280)).toFixed(2)} USD`);
}

checkEtfValuation();
