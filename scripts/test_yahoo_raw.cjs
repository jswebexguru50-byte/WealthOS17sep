const https = require('https');

async function testTicker(sym) {
  return new Promise((resolve) => {
    https.get(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const meta = j.chart.result[0].meta;
          const quotes = j.chart.result[0].indicators.quote[0];
          console.log(`\n=== ${sym} ===`);
          console.log('Regular Market Price:', meta.regularMarketPrice);
          console.log('Previous Close:', meta.chartPreviousClose || meta.previousClose);
          console.log('Currency:', meta.currency);
          console.log('Last 5 close prices:', quotes.close);
          resolve(meta);
        } catch(e) {
          console.error(sym, e.message);
          resolve(null);
        }
      });
    });
  });
}

async function run() {
  await testTicker('QQQ');
  await testTicker('VOO');
  await testTicker('VGT');
  await testTicker('SCHG');
}

run();
