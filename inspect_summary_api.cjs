const http = require('http');

http.get('http://localhost:3000/api/portfolio/summary?portfolio=Combined', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log("=== API /api/portfolio/summary?portfolio=Combined ===");
      console.log('Total Current Value:', json.summary?.totalCurrentValue || json.data?.totalCurrentValue || json.total_current_value);
      console.log('Total Cost:', json.summary?.totalCost || json.data?.totalCost || json.total_cost);
      console.log('Total PnL:', json.summary?.totalPnL || json.data?.totalPnL || json.total_pnl);
      console.log('Portfolios:', json.portfolios || json.data?.portfolios);
      console.log('\nFull JSON:', JSON.stringify(json, null, 2).slice(0, 1500));
    } catch(e) {
      console.log('Raw output:', data.slice(0, 1000));
    }
  });
});
