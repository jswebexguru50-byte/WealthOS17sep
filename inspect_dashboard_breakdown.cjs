const http = require('http');

http.get('http://localhost:3000/api/dashboard/breakdown', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log("=== /api/dashboard/breakdown Output ===");
      console.log('Totals:', JSON.stringify(json.totals, null, 2));
      console.log('Breakdowns Keys:', Object.keys(json.breakdowns || {}));
      if (json.breakdowns?.byPortfolio) {
        console.log('By Portfolio:', JSON.stringify(json.breakdowns.byPortfolio, null, 2));
      }
    } catch(e) {
      console.log('Raw output:', data.slice(0, 1000));
    }
  });
});
