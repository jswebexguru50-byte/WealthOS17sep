#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.cwd();
const ARTIFACT_DIR = path.join(ROOT, 'reports/market-data');
const QUEUE_FILE = path.join(ARTIFACT_DIR, 'PHASE10RM3_9_REMAINING_COVERAGE_RECOVERY_QUEUE.jsonl');

const OUT_CANDLES = path.join(ARTIFACT_DIR, 'PHASE10RM4_RECOVERED_CANDLES.jsonl');
const OUT_AUDIT = path.join(ARTIFACT_DIR, 'PHASE10RM4_REQUEST_AUDIT.jsonl');
const OUT_FAILURES = path.join(ARTIFACT_DIR, 'PHASE10RM4_FAILURES.jsonl');
const OUT_CHECKPOINT = path.join(ARTIFACT_DIR, 'PHASE10RM4_RECOVERY_CHECKPOINT.json');
const OUT_REPORT_JSON = path.join(ARTIFACT_DIR, 'PHASE10RM4_RECOVERY_REPORT.json');
const OUT_REPORT_MD = path.join(ARTIFACT_DIR, 'PHASE10RM4_RECOVERY_REPORT.md');

const REQUEST_GAP_MS = 10000;
const RUN_ID = crypto.randomUUID().slice(0, 8);

const sleep = ms => new Promise(res => setTimeout(res, ms));

function computeFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function run() {
  console.log("PHASE 10R-M.4 — CONTROLLED TARGETED BSE DAILY RECOVERY");

  if (!fs.existsSync(QUEUE_FILE)) {
    console.error("FAIL CLOSED: Queue file not found.");
    process.exit(1);
  }

  // 1. Read queue and filter only RECOVER_MISSING_DATES
  const queueHash = computeFileHash(QUEUE_FILE);
  const queueLines = fs.readFileSync(QUEUE_FILE, 'utf8').split('\n').filter(l => l.trim() !== '');
  
  const recoverableTargets = [];
  const blockedCount = [];
  for (const l of queueLines) {
    const rec = JSON.parse(l);
    if (rec.recovery_action === 'RECOVER_MISSING_DATES') {
      recoverableTargets.push(rec);
    } else {
      blockedCount.push(rec);
    }
  }

  const targetsByProvider = new Map();
  for (const rec of recoverableTargets) {
    if (!targetsByProvider.has(rec.provider_key)) {
      targetsByProvider.set(rec.provider_key, {
        instrument_key: rec.instrument_key,
        isin: rec.isin,
        symbol: rec.symbol,
        exchange: rec.exchange,
        segment: rec.segment,
        provider_key: rec.provider_key,
        requiredDates: new Set()
      });
    }
    targetsByProvider.get(rec.provider_key).requiredDates.add(rec.required_date);
  }

  const requestWindows = [];
  for (const [providerKey, data] of targetsByProvider.entries()) {
    const dates = Array.from(data.requiredDates).sort();
    const fromDate = dates[0];
    const toDate = dates[dates.length - 1]; // Upstox allows 10 years, which is well within 2000-2026

    requestWindows.push({
      providerKey,
      isin: data.isin,
      symbol: data.symbol,
      exchange: data.exchange,
      segment: data.segment,
      fromDate,
      toDate,
      requiredDates: data.requiredDates
    });
  }

  // 2. Load Checkpoint
  let checkpoint = {
    queue_hash: queueHash,
    queue_record_count: recoverableTargets.length,
    completed_request_windows: 0,
    successful_request_windows: 0,
    failed_request_windows: 0,
    staged_candle_keys: [],
    last_request_timestamp: null,
    consecutive_429_count: 0,
    run_id: RUN_ID,
    processed_providers: []
  };

  if (fs.existsSync(OUT_CHECKPOINT)) {
    const cpData = JSON.parse(fs.readFileSync(OUT_CHECKPOINT, 'utf8'));
    if (cpData.queue_hash !== queueHash) {
      console.error("FAIL CLOSED: Queue hash changed.");
      process.exit(1);
    }
    checkpoint = cpData;
  } else {
    fs.writeFileSync(OUT_CANDLES, '');
    fs.writeFileSync(OUT_AUDIT, '');
    fs.writeFileSync(OUT_FAILURES, '');
  }

  const processedProviders = new Set(checkpoint.processed_providers || []);
  const stagedKeys = new Set(checkpoint.staged_candle_keys || []);

  let count200 = 0;
  let count400 = 0;
  let count429 = checkpoint.consecutive_429_count;
  let countFailures = 0;
  let recoveredCandlesCount = 0;
  let duplicatesSkipped = 0;
  
  const totalTargets = recoverableTargets.length;
  let satisfiedTargets = stagedKeys.size;
  
  let previousRequestAt = checkpoint.last_request_timestamp ? new Date(checkpoint.last_request_timestamp).getTime() : 0;

  for (let i = 0; i < requestWindows.length; i++) {
    const req = requestWindows[i];
    if (processedProviders.has(req.providerKey)) continue;

    const now = Date.now();
    const wait = Math.max(0, REQUEST_GAP_MS - (now - previousRequestAt));
    if (wait > 0) await sleep(wait);

    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(req.providerKey)}/day/${req.toDate}/${req.fromDate}`;
    
    let ok = false;
    let payload = null;
    let httpStatus = 0;
    const retrievedAt = new Date().toISOString();
    
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      httpStatus = res.status;
      ok = res.ok;
      
      if (httpStatus === 429) {
        count429++;
        checkpoint.consecutive_429_count = count429;
        
        const delayConfig = [60000, 180000, 600000];
        if (count429 > 3) {
          console.error("FAIL CLOSED: Repeated 429 reached hard limit.");
          process.exit(1);
        }
        
        fs.appendFileSync(OUT_AUDIT, JSON.stringify({ request_window: req, status: 429, retrieved_at: retrievedAt }) + '\n');
        fs.writeFileSync(OUT_CHECKPOINT, JSON.stringify(checkpoint, null, 2));
        
        console.log(`HTTP 429 Hit. Waiting ${delayConfig[count429-1]/1000}s...`);
        await sleep(delayConfig[count429-1]);
        i--; // retry this index
        continue;
      }
      
      if (httpStatus === 401 || httpStatus === 403) {
        console.error(`FAIL CLOSED: HTTP ${httpStatus} Authentication Error.`);
        process.exit(1);
      }

      const text = await res.text();
      try { payload = JSON.parse(text); } catch(e) {}
    } catch(err) {
      console.error(`Fetch error for ${req.providerKey}:`, err.message);
      httpStatus = 500;
    }

    previousRequestAt = Date.now();
    checkpoint.last_request_timestamp = retrievedAt;
    count429 = 0;
    checkpoint.consecutive_429_count = 0;

    let executionRequestId = `10RM4-${RUN_ID}-${i}`;

    if (!ok || !payload || payload.status !== 'success' || !payload.data || !payload.data.candles) {
      if (httpStatus === 400) count400++;
      else countFailures++;
      
      checkpoint.failed_request_windows++;
      checkpoint.processed_providers.push(req.providerKey);
      processedProviders.add(req.providerKey);
      
      fs.appendFileSync(OUT_FAILURES, JSON.stringify({
        instrument: req.symbol,
        provider_key: req.providerKey,
        requested_range: { from_date: req.fromDate, to_date: req.toDate },
        status: httpStatus,
        retrieved_at: retrievedAt,
        classification: httpStatus === 400 ? "PROVIDER_400_NO_AUTOMATIC_RETRY" : "HTTP_FAILURE"
      }) + '\n');
      
      fs.appendFileSync(OUT_AUDIT, JSON.stringify({ request_window: req, status: httpStatus, retrieved_at: retrievedAt, execution_request_id: executionRequestId }) + '\n');
      fs.writeFileSync(OUT_CHECKPOINT, JSON.stringify(checkpoint, null, 2));
      continue;
    }

    count200++;
    const candles = payload.data.candles;
    const recovered = [];
    
    for (const c of candles) {
      const dt = c[0].split('T')[0];
      
      if (req.requiredDates.has(dt)) {
        const candleKey = `${req.providerKey}_${dt}`;
        if (stagedKeys.has(candleKey)) {
          duplicatesSkipped++;
          continue;
        }
        
        // OHLC Validation
        const o = c[1], h = c[2], l = c[3], close = c[4], vol = c[5];
        if (o > 0 && h > 0 && l > 0 && close > 0 && h >= Math.max(o, close) && l <= Math.min(o, close) && h >= l) {
          recovered.push({
            identity_key: `${req.symbol}_${dt}`,
            provider_key: req.providerKey,
            isin: req.isin,
            symbol: req.symbol,
            exchange: req.exchange,
            segment: req.segment,
            trade_date: dt,
            open: o,
            high: h,
            low: l,
            close: close,
            volume: vol,
            source_provider: "UPSTOX",
            recovery_phase: "10R-M.4",
            retrieved_at: retrievedAt,
            request_id: null,
            execution_request_id: executionRequestId,
            request_window: { from_date: req.fromDate, to_date: req.toDate }
          });
          stagedKeys.add(candleKey);
          checkpoint.staged_candle_keys.push(candleKey);
          satisfiedTargets++;
        }
      }
    }

    recoveredCandlesCount += recovered.length;
    checkpoint.successful_request_windows++;
    checkpoint.completed_request_windows++;
    checkpoint.processed_providers.push(req.providerKey);
    processedProviders.add(req.providerKey);

    if (recovered.length > 0) {
      fs.appendFileSync(OUT_CANDLES, recovered.map(x => JSON.stringify(x)).join('\n') + '\n');
    }
    fs.appendFileSync(OUT_AUDIT, JSON.stringify({ request_window: req, status: 200, retrieved_at: retrievedAt, execution_request_id: executionRequestId, candles_staged: recovered.length }) + '\n');
    fs.writeFileSync(OUT_CHECKPOINT, JSON.stringify(checkpoint, null, 2));
    
    if (i > 0 && i % 10 === 0) {
      console.log(`Progress: ${i}/${requestWindows.length} requests completed. Total Recovered: ${recoveredCandlesCount}`);
    }
    
    // For test purposes only, let's artificially limit if we want, but the user explicitly requested the REAL execution. 
    // We will just execute it.
  }

  // Final Reports
  const reportJSON = {
    phase: "10R-M.4",
    queue_targets: totalTargets,
    unique_instruments: targetsByProvider.size,
    request_windows_planned: requestWindows.length,
    http_200: count200,
    http_400: count400,
    http_429: count429,
    other_failures: countFailures,
    recovered_candles: recoveredCandlesCount,
    unique_recovered_keys: stagedKeys.size,
    duplicates_skipped: duplicatesSkipped,
    targets_satisfied: satisfiedTargets,
    targets_remaining: totalTargets - satisfiedTargets,
    blocked_records_requested: 0,
    production_db_writes: 0,
    certification_changed: false
  };

  fs.writeFileSync(OUT_REPORT_JSON, JSON.stringify(reportJSON, null, 2));

  console.log('\nPHASE 10R-M.4 COMPLETE\n');
  console.log(`Queue targets: ${totalTargets}`);
  console.log(`Unique instruments: ${targetsByProvider.size}`);
  console.log(`Request windows planned: ${requestWindows.length}\n`);
  
  console.log(`HTTP 200: ${count200}`);
  console.log(`HTTP 400: ${count400}`);
  console.log(`HTTP 429: ${count429}`);
  console.log(`Other failures: ${countFailures}\n`);
  
  console.log(`Recovered candles: ${recoveredCandlesCount}`);
  console.log(`Unique recovered instrument-date keys: ${stagedKeys.size}`);
  console.log(`Duplicates skipped: ${duplicatesSkipped}\n`);
  
  console.log(`Targets satisfied: ${satisfiedTargets}`);
  console.log(`Targets remaining: ${totalTargets - satisfiedTargets}\n`);
  
  console.log(`Blocked/manual-review records requested: 0\n`);
  
  console.log(`Production DB writes: 0`);
  console.log(`Certification changed: NO\n`);
  
  console.log(`NEXT PHASE:\nPhase 10R-M.5 recovered-candle validation and instrument-level reconciliation.\n`);
}

run().catch(err => {
  console.error("PHASE 10R-M.4 PAUSED/FAILED CLOSED");
  console.error(err);
  process.exit(1);
});
