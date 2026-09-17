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
  const auditRes = await fetchJson('http://localhost:3000/api/reconciliation/pms-audit?portfolio=cc9');
  const rep = auditRes.report;
  console.log('=== PMS AUDIT REPORT ===');
  console.log('Portfolio:', rep.portfolio);
  console.log('Audit Date:', rep.auditDate);
  console.log('Total Txns Parsed:', rep.totalTransactionsParsed);
  console.log('Matched Count:', rep.matchedCount);
  console.log('Settlement Pending:', rep.settlementPendingCount);
  console.log('Discrepancy Count:', rep.discrepancyCount);
  console.log('Overall Status:', rep.overallStatus);
  console.log('\nCash Recon:', rep.cashRecon);

  const reconHoldings = await fetchJson('http://localhost:3000/api/pms/reconcile-holdings?portfolio=cc9');
  console.log('\n=== RECONCILE HOLDINGS API ===');
  console.log('Count:', reconHoldings.data?.length);
  const mismatches = reconHoldings.data?.filter(x => x.status !== 'MATCHED');
  console.log('Non-matched items:', mismatches);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
