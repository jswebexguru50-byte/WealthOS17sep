const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yahooFinance = require('yahoo-finance2').default;

const ROOT = path.resolve(__dirname, '../../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');
const ACQUISITION_DIR = path.join(ROOT, 'evidence/market-data-certification/acquisition');

function getHash(data) {
  return crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

function getYahooSymbol(symbol) {
  return symbol.endsWith('.NS') ? symbol : `${symbol}.NS`;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status !== 429 && res.status < 500) return res; // Don't retry 400s (except 429)
      
      const backoff = Math.pow(2, i) * 500 + Math.random() * 200;
      await delay(backoff);
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      const backoff = Math.pow(2, i) * 500 + Math.random() * 200;
      await delay(backoff);
    }
  }
  throw new Error("Max retries exceeded");
}

async function run() {
  if (!fs.existsSync(ACQUISITION_DIR)) fs.mkdirSync(ACQUISITION_DIR, { recursive: true });

  const queuePath = path.join(REPORTS_DIR, 'DELTA_ACQUISITION_QUEUE.json');
  if (!fs.existsSync(queuePath)) return;
  const deltaQueue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));

  if (deltaQueue.length === 0) return;

  const acquiredData = [];
  const acquisitionLog = [];
  const mappingLog = [];
  
  let stats = {
    rows_from_upstox: 0,
    rows_from_yahoo_fallback: 0,
    rows_failed_both: 0,
    rows_quarantined: 0
  };

  console.log(`[Phase 10] Starting Acquisition of ${deltaQueue.length} deltas...`);

  for (let i = 0; i < deltaQueue.length; i++) {
    const task = deltaQueue[i];
    
    const instrumentKey = task.instrumentKey;
    if (!instrumentKey) {
      stats.rows_quarantined += task.missingSessions;
      acquisitionLog.push({ task, result: "FAILED_IDENTITY_UNRESOLVED" });
      continue;
    }

    let missingRemaining = new Set(task.missingDates);
    
    // 1. Attempt Upstox
    const upstoxUrl = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${task.to}/${task.from}`;
    let upstoxDefinitivelyLacksData = false;
    
    try {
      const upstoxRes = await fetchWithRetry(upstoxUrl, { headers: { 'Accept': 'application/json' } });
      const retrieval_timestamp = new Date().toISOString();
      if (upstoxRes.ok) {
        const json = await upstoxRes.json();
        const rawPayloadHash = getHash(json);
        const rawCandles = json?.data?.candles || [];
        for (const c of rawCandles) {
          const date = c[0].split('T')[0];
          if (missingRemaining.has(date)) {
            const rowData = {
              deltaQueueId: task.queueId,
              symbol: task.symbol,
              exchange: task.exchange,
              date: date,
              open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5]),
              raw_close: Number(c[4]),
              adjusted_close: null,
              adjustment_policy: "UPSTOX_NATIVE",
              provider: "UPSTOX",
              instrument_key: instrumentKey,
              source: "UPSTOX",
              retrieval_timestamp,
              source_timestamp: c[0],
              raw_payload_hash: rawPayloadHash,
              raw_record_hash: getHash(c),
              authorization_basis: "APPLICATION_AUTHORIZED_UPSTOX_API",
              status: "SUCCESS"
            };
            acquiredData.push(rowData);
            stats.rows_from_upstox++;
            missingRemaining.delete(date);
          }
        }
      } else {
        acquisitionLog.push({ task, upstox_attempt_id: crypto.randomUUID(), upstox_failure_class: 'UPSTOX_API_ERROR', message: `Status: ${upstoxRes.status}` });
      }
      await delay(350); // Upstox base rate limit
      
      if (missingRemaining.size > 0) {
        upstoxDefinitivelyLacksData = true; // Upstox succeeded but didn't have all requested dates
      }
    } catch (e) {
      acquisitionLog.push({ task, upstox_attempt_id: crypto.randomUUID(), upstox_failure_class: 'UPSTOX_SERVER_ERROR', message: e.message });
    }
    
    // 2. Fallback to Yahoo for missing dates
    if (missingRemaining.size > 0 && upstoxDefinitivelyLacksData) {
      const fallbackReason = "UPSTOX_PARTIAL_DATA_OR_FAILURE";
      const ySymbol = getYahooSymbol(task.symbol);
      mappingLog.push({
        internal_symbol: task.symbol,
        exchange: task.exchange,
        provider: "YAHOO_FINANCE",
        provider_symbol: ySymbol,
        mapping_method: "APPEND_NS_FOR_EQ",
        mapping_confidence: "HIGH",
        mapping_evidence: "STANDARD_YAHOO_FORMAT"
      });
      
      const d1 = new Date(task.from); const d2 = new Date(task.to); d2.setDate(d2.getDate() + 1);
      try {
        const yahooRes = await yahooFinance.historical(ySymbol, { period1: d1.toISOString().split('T')[0], period2: d2.toISOString().split('T')[0] });
        const retrieval_timestamp = new Date().toISOString();
        const rawPayloadHash = getHash(yahooRes);
        
        for (const date of missingRemaining) {
          const yRow = yahooRes.find(r => r.date.toISOString().split('T')[0] === date);
          if (yRow) {
             const rowData = {
              deltaQueueId: task.queueId,
              symbol: task.symbol,
              exchange: task.exchange,
              date: date,
              open: yRow.open, high: yRow.high, low: yRow.low, close: yRow.adjClose || yRow.close, volume: yRow.volume,
              raw_close: yRow.close,
              adjusted_close: yRow.adjClose || null,
              adjustment_policy: "USE_ADJ_CLOSE_IF_AVAILABLE",
              provider: "YAHOO_FINANCE",
              provider_symbol: ySymbol,
              source: "YAHOO_FINANCE_FALLBACK",
              fallback_reason: fallbackReason,
              upstox_attempt_id: "PREVIOUS_FAILED",
              upstox_failure_class: fallbackReason,
              retrieval_timestamp,
              source_timestamp: yRow.date.toISOString(),
              raw_payload_hash: rawPayloadHash,
              raw_record_hash: getHash(yRow),
              authorization_basis: "PROJECT_AUTHORIZED_FALLBACK_SOURCE",
              status: "SUCCESS"
            };
            acquiredData.push(rowData);
            stats.rows_from_yahoo_fallback++;
            missingRemaining.delete(date);
          }
        }
        await delay(500); // Yahoo rate limit
      } catch (e) {
        acquisitionLog.push({ task, result: "FAILED_YAHOO_FALLBACK", message: e.message });
      }
    }
    
    if (missingRemaining.size > 0) {
      stats.rows_failed_both += missingRemaining.size;
    }

    if ((i + 1) % 25 === 0) {
      console.log(`[Phase 10] Processed ${i + 1} / ${deltaQueue.length} symbols. Acquired: ${acquiredData.length} records...`);
      // Flush intermediate results
      fs.writeFileSync(path.join(ACQUISITION_DIR, 'ACQUIRED_RAW_DATA.json'), JSON.stringify(acquiredData, null, 2));
    }
  }

  console.log(`[Phase 10] Complete! Total Upstox: ${stats.rows_from_upstox}, Yahoo Fallback: ${stats.rows_from_yahoo_fallback}`);
  
  fs.writeFileSync(path.join(ACQUISITION_DIR, 'ACQUIRED_RAW_DATA.json'), JSON.stringify(acquiredData, null, 2));
  fs.writeFileSync(path.join(ACQUISITION_DIR, 'ACQUISITION_LOG.json'), JSON.stringify(acquisitionLog, null, 2));
  fs.writeFileSync(path.join(ACQUISITION_DIR, 'SYMBOL_MAPPING_LOG.json'), JSON.stringify(mappingLog, null, 2));
  
  const manifest = {
    status: "COMPLETED",
    deltasRequested: deltaQueue.length,
    statistics: stats
  };
  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10_ACQUISITION_MANIFEST.json'), JSON.stringify(manifest, null, 2));
  if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 10' });
}

run();
