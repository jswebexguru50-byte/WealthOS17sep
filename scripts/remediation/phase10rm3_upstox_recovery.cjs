const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const STAGING_FILE = path.join(ROOT, 'reports/market-data/BSE_EQ_OPTIMIZED_STAGING.json');
const OUTPUT_JSONL = path.join(ROOT, 'reports/market-data/RECOVERED_CANDLES.jsonl');
const REPORT_MD = path.join(ROOT, 'reports/market-data/PHASE10RM3_UPSTOX_RECOVERY_REPORT.md');

const DELAY_MS = 2000;
const sleep = ms => new Promise(res => setTimeout(res, ms));

async function run() {
  console.log('PHASE 10R-M.3 — UPSTOX OPTIMIZED CONTROLLED RECOVERY');
  
  if (!fs.existsSync(STAGING_FILE)) {
    throw new Error(`Staging file not found: ${STAGING_FILE}`);
  }
  
  const ranges = JSON.parse(fs.readFileSync(STAGING_FILE, 'utf8'));
  console.log(`Loaded ${ranges.length} optimized range requests.`);
  
  // Clear or initialize the output file
  fs.writeFileSync(OUTPUT_JSONL, '');
  
  let successCount = 0;
  let failCount = 0;
  let totalCandlesRecovered = 0;
  let totalCandlesExpected = ranges.reduce((sum, r) => sum + r.requiredMissingDates.length, 0);
  
  const startTime = Date.now();
  let previousRequestAt = 0;
  
  for (let i = 0; i < ranges.length; i++) {
    const req = ranges[i];
    
    const now = Date.now();
    const wait = Math.max(0, DELAY_MS - (now - previousRequestAt));
    if (wait > 0) {
      await sleep(wait);
    }
    
    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(req.providerKey)}/day/${req.toDate}/${req.fromDate}`;
    
    if (i % 20 === 0) {
      console.log(`Progress: ${i}/${ranges.length} (Recovered so far: ${totalCandlesRecovered})`);
    }
    
    let ok = false;
    let payload = null;
    let httpStatus = 0;
    
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      httpStatus = res.status;
      ok = res.ok;
      const text = await res.text();
      try { payload = JSON.parse(text); } catch(e) {}
    } catch(err) {
      console.error(`Fetch error for ${req.providerKey}:`, err.message);
    }
    
    previousRequestAt = Date.now();
    
    if (!ok || !payload || payload.status !== 'success' || !payload.data || !payload.data.candles) {
      console.log(`[FAIL] ${req.providerKey} | HTTP ${httpStatus}`);
      failCount++;
      continue;
    }
    
    successCount++;
    const candles = payload.data.candles; // Array of [timestamp, open, high, low, close, volume, OI]
    
    // Filter out candles that match the required missing dates
    const requiredSet = new Set(req.requiredMissingDates);
    const recovered = [];
    
    for (const c of candles) {
      const dt = c[0].split('T')[0];
      if (requiredSet.has(dt)) {
        recovered.push({
          providerKey: req.providerKey,
          ISIN: req.ISIN,
          symbol: req.symbol,
          date: dt,
          open: c[1],
          high: c[2],
          low: c[3],
          close: c[4],
          volume: c[5]
        });
      }
    }
    
    if (recovered.length > 0) {
      totalCandlesRecovered += recovered.length;
      const jsonlData = recovered.map(x => JSON.stringify(x)).join('\n') + '\n';
      fs.appendFileSync(OUTPUT_JSONL, jsonlData);
    }
  }
  
  const elapsedMinutes = ((Date.now() - startTime) / 60000).toFixed(2);
  
  console.log('\n================================');
  console.log('RECOVERY COMPLETE');
  console.log(`Elapsed Time: ${elapsedMinutes} minutes`);
  console.log(`Requests: ${successCount} successful, ${failCount} failed`);
  console.log(`Candles Recovered: ${totalCandlesRecovered} / ${totalCandlesExpected}`);
  console.log('================================\n');
  
  const md = [
    `# Phase 10R-M.3 Upstox Recovery Report`,
    ``,
    `- **Date**: ${new Date().toISOString()}`,
    `- **Total Ranges Requested**: ${ranges.length}`,
    `- **Successful Requests**: ${successCount}`,
    `- **Failed Requests**: ${failCount}`,
    `- **Total Expected Missing Sessions**: ${totalCandlesExpected}`,
    `- **Total Candles Recovered**: ${totalCandlesRecovered}`,
    `- **Elapsed Time**: ${elapsedMinutes} minutes`,
    ``,
    `### Outcome`,
    `Candles were successfully fetched via Upstox public historical API using strict sequential delay (2000ms).`,
    `The payload was saved to \`${OUTPUT_JSONL}\`.`
  ].join('\n');
  
  fs.writeFileSync(REPORT_MD, md);
}

run().catch(err => {
  console.error("Fatal Error in Recovery:", err);
  process.exit(1);
});
