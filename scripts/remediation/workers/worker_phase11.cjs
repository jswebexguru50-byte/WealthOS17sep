const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../../../');
const ACQUISITION_DIR = path.join(ROOT, 'evidence/market-data-certification/acquisition');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');

function getHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function run() {
  if (!fs.existsSync(path.join(ACQUISITION_DIR, 'ACQUIRED_RAW_DATA.json'))) return;
  const acquired = JSON.parse(fs.readFileSync(path.join(ACQUISITION_DIR, 'ACQUIRED_RAW_DATA.json'), 'utf8'));
  const queue = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'DELTA_ACQUISITION_QUEUE.json'), 'utf8'));
  
  const queueSet = new Set(queue.map(q => q.queueId));
  const validatedData = [];
  const failures = [];
  
  for (const row of acquired) {
    let isValid = true;
    let failReason = [];
    
    // 1. Identity
    if (!row.symbol || !row.date) { isValid = false; failReason.push('MISSING_IDENTITY'); }
    
    // 2. OHLC relationships
    if (row.high < row.low) { isValid = false; failReason.push('HIGH_LESS_THAN_LOW'); }
    if (row.high < row.open || row.high < row.close) { isValid = false; failReason.push('HIGH_LESS_THAN_OPEN_OR_CLOSE'); }
    if (row.low > row.open || row.low > row.close) { isValid = false; failReason.push('LOW_GREATER_THAN_OPEN_OR_CLOSE'); }
    
    // 3. Positive values
    if (row.open < 0 || row.high < 0 || row.low < 0 || row.close < 0 || row.volume < 0) {
      isValid = false; failReason.push('NEGATIVE_VALUES');
    }
    
    // 4. Provider Auth
    if (row.source === "UPSTOX" && row.authorization_basis !== "APPLICATION_AUTHORIZED_UPSTOX_API") {
      isValid = false; failReason.push('INVALID_UPSTOX_AUTH');
    }
    if (row.source === "YAHOO_FINANCE_FALLBACK" && row.authorization_basis !== "PROJECT_AUTHORIZED_FALLBACK_SOURCE") {
      isValid = false; failReason.push('INVALID_YAHOO_AUTH');
    }
    
    // 5. Fallback condition
    if (row.source === "YAHOO_FINANCE_FALLBACK" && !row.fallback_reason) {
      isValid = false; failReason.push('MISSING_FALLBACK_REASON');
    }
    
    // 6. Hashes
    if (!row.raw_payload_hash || !row.raw_record_hash) {
       isValid = false; failReason.push('MISSING_HASHES');
    }
    
    if (isValid) {
      row.validation_hash = getHash(row);
      validatedData.push(row);
    } else {
      failures.push({ row, failReason });
    }
  }
  
  fs.writeFileSync(path.join(ACQUISITION_DIR, 'VALIDATED_DATA.json'), JSON.stringify(validatedData, null, 2));
  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE11_VALIDATION_REPORT.json'), JSON.stringify({
    totalAcquired: acquired.length,
    validatedCount: validatedData.length,
    failedCount: failures.length,
    failures
  }, null, 2));
}

run();
