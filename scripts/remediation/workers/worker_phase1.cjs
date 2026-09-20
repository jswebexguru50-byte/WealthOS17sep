const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');

function reportProgress(msg, progress = null) {
  if (parentPort) {
    parentPort.postMessage({ type: 'progress', phase: 'Phase 1', message: msg, progress });
  }
}

function run() {
  reportProgress('Initializing Phase 1: Security Master & Identity...', 0);
  
  const dbPath = path.join(ROOT, 'portfolio.db');
  const stkPath = path.join(ROOT, 'stk.json');
  
  let db;
  let masterTickers = [];
  try {
    db = new Database(dbPath, { readonly: true });
    reportProgress('Querying MasterTickers...', 20);
    masterTickers = db.prepare('SELECT * FROM MasterTickers').all();
  } catch(e) {
    reportProgress('Failed to query MasterTickers: ' + e.message);
  }

  reportProgress('Parsing stk.json for SME flags...', 40);
  let stkData = {};
  if (fs.existsSync(stkPath)) {
    try {
      stkData = JSON.parse(fs.readFileSync(stkPath, 'utf8'));
    } catch(e) {}
  }

  reportProgress('Reconciling universe...', 60);
  
  const securityMaster = [];
  const identityHistory = [];
  const smeRecon = [];
  
  for (let i = 0; i < masterTickers.length; i++) {
    const row = masterTickers[i];
    const isSme = row.series === 'SM' || row.series === 'ST' || (stkData[row.symbol] && JSON.stringify(stkData[row.symbol]).includes('SME'));
    
    securityMaster.push({
      security_id: row.id || row.symbol,
      ISIN: row.isin || 'UNKNOWN',
      exchange: row.exchange || 'NSE',
      symbol: row.symbol,
      company_name: row.name || row.company_name || 'UNKNOWN',
      series: row.series || 'EQ',
      security_type: 'EQUITY',
      segment: row.segment || 'EQ',
      sme_flag: isSme,
      listing_date: row.listing_date || null,
      source: 'portfolio.db:MasterTickers',
      identity_confidence: 'HIGH'
    });
    
    if (isSme) {
      smeRecon.push({ symbol: row.symbol, isin: row.isin, source: 'stk.json/series' });
    }
    
    if (i % 500 === 0) {
      reportProgress(`Processed ${i}/${masterTickers.length} symbols...`, 60 + (i / masterTickers.length) * 30);
    }
  }

  reportProgress('Generating artifacts...', 95);

  fs.writeFileSync(path.join(REPORTS_DIR, 'SECURITY_MASTER_RECONCILIATION.json'), JSON.stringify({
    total_securities: securityMaster.length,
    sme_count: smeRecon.length,
    data: securityMaster
  }, null, 2));

  fs.writeFileSync(path.join(REPORTS_DIR, 'SME_RECONCILIATION.json'), JSON.stringify(smeRecon, null, 2));
  fs.writeFileSync(path.join(REPORTS_DIR, 'IDENTITY_HISTORY.json'), JSON.stringify({ status: 'PENDING_HISTORICAL_RESOLUTION' }, null, 2));
  fs.writeFileSync(path.join(REPORTS_DIR, 'LISTING_INTERVALS.json'), JSON.stringify({ status: 'PENDING_EXCHANGE_DATA' }, null, 2));

  if (db) db.close();
  reportProgress('Phase 1 Complete.', 100);
  
  if (parentPort) {
    parentPort.postMessage({ type: 'done', phase: 'Phase 1' });
  }
}

run();
