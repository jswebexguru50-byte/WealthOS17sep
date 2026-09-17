const http = require('http');

function fetchJson(url, postData = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: postData ? 'POST' : 'GET',
      headers: postData ? { 'Content-Type': 'application/json' } : {}
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function main() {
  console.log('=== 1. TESTING /api/pms/dashboard?portfolio=cc9 ===');
  const dash = await fetchJson('http://localhost:3000/api/pms/dashboard?portfolio=cc9');
  console.log('Dashboard summary:', {
    success: dash.success,
    cashInHand: dash.data?.cashInHand,
    totalDeposits: dash.data?.totalDeposits,
    totalTransferIn: dash.data?.totalTransferIn,
    totalWithdrawals: dash.data?.totalWithdrawals,
    totalTransferOut: dash.data?.totalTransferOut,
    totalExpenses: dash.data?.totalExpenses,
    totalIncome: dash.data?.totalIncome
  });

  console.log('\n=== 2. TESTING /api/reconciliation/pms-audit?portfolio=cc9 ===');
  const audit = await fetchJson('http://localhost:3000/api/reconciliation/pms-audit?portfolio=cc9');
  console.log('PMS Audit summary:', {
    matchedCount: audit.matchedCount,
    discrepancyCount: audit.discrepancyCount,
    overallStatus: audit.overallStatus,
    cashRecon: audit.cashRecon
  });

  console.log('\n=== 3. TESTING /api/pms/calculate-xirr ===');
  const xirr = await fetchJson('http://localhost:3000/api/pms/calculate-xirr', { portfolio: 'cc9' });
  console.log('XIRR result:', xirr);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
