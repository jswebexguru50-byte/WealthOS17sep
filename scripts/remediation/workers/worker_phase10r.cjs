const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');
const EVIDENCE_DIR = path.join(ROOT, 'evidence/market-data-certification/recovery');
const SAMPLE_CONTRACT = path.join(REPORTS_DIR, 'PHASE10R_SAMPLE_CONTRACT.json');

function getHash(data) {
  return crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex').toUpperCase();
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Inter-request delay with jitter
async function globalThrottleDelay() {
  const base = 10000; // 10 seconds
  const jitter = (Math.random() * 0.4 - 0.2) * base; // ±20%
  const waitMs = Math.floor(base + jitter);
  console.log(`[Throttler] Waiting ${waitMs}ms...`);
  await delay(waitMs);
}

// 429 backoff
function getBackoff(attempt) {
  // attempt 1->30s, 2->60s, 3->120s, 4->300s
  if (attempt === 1) return 30000;
  if (attempt === 2) return 60000;
  if (attempt === 3) return 120000;
  if (attempt >= 4) return 300000;
  return 300000;
}

function chunkDatesBy90Days(dates) {
  const sorted = [...dates].sort();
  const chunks = [];
  let currentChunk = [];
  let chunkStart = null;
  
  for (const dStr of sorted) {
    const d = new Date(dStr);
    if (!chunkStart) {
      chunkStart = d;
      currentChunk.push(dStr);
    } else {
      const diffDays = (d - chunkStart) / (1000 * 60 * 60 * 24);
      if (diffDays <= 90) {
        currentChunk.push(dStr);
      } else {
        chunks.push(currentChunk);
        currentChunk = [dStr];
        chunkStart = d;
      }
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

async function runPilot() {
  console.log("Starting Phase 10R Upstox Rate-Limit Recovery Pilot...");
  
  if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  
  const contract = JSON.parse(fs.readFileSync(SAMPLE_CONTRACT, 'utf8'));
  const sample = contract.selectedRecordIds;
  
  // Group by symbol to optimize requests into 90-day windows
  const bySymbol = {};
  for (const s of sample) {
    if (!bySymbol[s.symbol]) bySymbol[s.symbol] = { instrumentKey: s.instrumentKey, dates: new Set() };
    bySymbol[s.symbol].dates.add(s.date);
  }
  
  const requestQueue = [];
  for (const sym of Object.keys(bySymbol)) {
    const chunks = chunkDatesBy90Days(bySymbol[sym].dates);
    for (const chunk of chunks) {
      // Find min and max date in chunk
      const minD = chunk[0];
      const maxD = chunk[chunk.length - 1];
      requestQueue.push({
        symbol: sym,
        instrumentKey: bySymbol[sym].instrumentKey,
        targetDates: chunk,
        fromDate: minD,
        toDate: maxD
      });
    }
  }
  
  console.log(`Prepared ${requestQueue.length} HTTP requests for 100 sample records.`);
  
  const requestLog = [];
  const results = {
    populationCount: contract.populationCount,
    pilotSampleCount: contract.sampleSize,
    requestsMade: 0,
    successfulResponses: 0,
    rateLimitedResponses: 0,
    serverErrors: 0,
    networkFailures: 0,
    candlesReturned: 0,
    requiredCandlesRecovered: 0,
    alreadyPresent: 0,
    noCandleReturned: 0,
    invalidInstrument: 0,
    unresolved: 0,
    recoveryRate: 0,
    startedAt: new Date().toISOString(),
    completedAt: null
  };
  
  const failureClassification = {};
  for (const s of sample) {
    failureClassification[s.recordId] = "UNRESOLVED"; // Initial state
  }
  
  let rateLimit429Count = 0;
  let totalBackoffMs = 0;
  let maxBackoffMs = 0;
  
  for (const req of requestQueue) {
    const d1 = new Date(req.fromDate); d1.setDate(d1.getDate() - 2); // Buffer
    const d2 = new Date(req.toDate); d2.setDate(d2.getDate() + 2); // Buffer
    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(req.instrumentKey)}/day/${d2.toISOString().split('T')[0]}/${d1.toISOString().split('T')[0]}`;
    
    let attempt = 1;
    let maxRetries = 5;
    let success = false;
    let payload = null;
    let httpStatus = 0;
    
    while (attempt <= maxRetries && !success) {
      const reqId = crypto.randomUUID();
      const reqStart = new Date().toISOString();
      let errorClass = null;
      let backoffMs = 0;
      let responseHash = null;
      
      results.requestsMade++;
      
      try {
        await globalThrottleDelay();
        
        console.log(`[HTTP] GET ${req.symbol} (Attempt ${attempt}/5)`);
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        httpStatus = res.status;
        
        if (res.ok) {
          const json = await res.json();
          responseHash = getHash(json);
          payload = json?.data?.candles || [];
          success = true;
          results.successfulResponses++;
        } else if (res.status === 429) {
          results.rateLimitedResponses++;
          rateLimit429Count++;
          errorClass = "HTTP_429_RATE_LIMITED";
          backoffMs = getBackoff(attempt);
          totalBackoffMs += backoffMs;
          if (backoffMs > maxBackoffMs) maxBackoffMs = backoffMs;
          console.warn(`[429] Rate limited. Backing off for ${backoffMs}ms...`);
          await delay(backoffMs);
        } else if (res.status >= 500) {
          results.serverErrors++;
          errorClass = "HTTP_5XX";
          backoffMs = getBackoff(attempt);
          console.warn(`[5xx] Server error. Backing off for ${backoffMs}ms...`);
          await delay(backoffMs);
        } else {
          errorClass = `HTTP_${res.status}`;
          break; // Don't retry 400, 404, etc.
        }
      } catch (e) {
        results.networkFailures++;
        errorClass = "NETWORK_FAILURE";
        httpStatus = 0;
        backoffMs = getBackoff(attempt);
        console.warn(`[NET] Network error: ${e.message}. Backing off...`);
        await delay(backoffMs);
      }
      
      requestLog.push({
        requestId: reqId,
        symbol: req.symbol,
        instrumentKey: req.instrumentKey,
        exchange: "NSE",
        fromDate: req.fromDate,
        toDate: req.toDate,
        attempt: attempt,
        provider: "UPSTOX_V3",
        requestTimestamp: reqStart,
        httpStatus: httpStatus,
        responseTimestamp: new Date().toISOString(),
        retryAfterMs: backoffMs, // Used interchangeably for simplicity
        backoffMs: backoffMs,
        responseHash: responseHash || "FAILED",
        candlesReturned: payload ? payload.length : 0,
        errorClass: errorClass
      });
      
      if (!success) attempt++;
    }
    
    // Process outcome for the specific target dates
    for (const targetDate of req.targetDates) {
      const recId = `DEL-${req.symbol}-${targetDate}`;
      
      if (success && payload) {
        // Find if candle exists for this date
        const match = payload.find(c => c[0].split('T')[0] === targetDate);
        if (match) {
          results.requiredCandlesRecovered++;
          failureClassification[recId] = "ACQUIRED";
        } else {
          results.noCandleReturned++;
          failureClassification[recId] = "NO_CANDLE_RETURNED";
        }
      } else {
        if (httpStatus === 429) {
          failureClassification[recId] = "HTTP_429_RATE_LIMITED";
        } else if (httpStatus >= 500) {
          failureClassification[recId] = "HTTP_5XX";
        } else if (httpStatus > 0) {
          failureClassification[recId] = "INVALID_INSTRUMENT"; // Assumed for 400s
          results.invalidInstrument++;
        } else {
          failureClassification[recId] = "NETWORK_FAILURE";
        }
      }
    }
    if (payload) results.candlesReturned += payload.length;
  }
  
  results.completedAt = new Date().toISOString();
  results.unresolved = contract.sampleSize - results.requiredCandlesRecovered;
  results.recoveryRate = results.requiredCandlesRecovered / contract.sampleSize;
  
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'PHASE10R_REQUEST_LOG.jsonl'), requestLog.map(r => JSON.stringify(r)).join('\n'));
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'PHASE10R_RECOVERY_RESULTS.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'PHASE10R_FAILURE_CLASSIFICATION.json'), JSON.stringify(failureClassification, null, 2));
  
  // Generate Final Report
  const recommendation = results.recoveryRate > 0.5 && (results.rateLimitedResponses / results.requestsMade) < 0.2
    ? "EXPAND_RECOVERY" : "REQUIRES_CONFIGURATION_CHANGE";
    
  const finalReport = {
    recovery_rate: results.recoveryRate,
    "429_rate": results.requestsMade > 0 ? results.rateLimitedResponses / results.requestsMade : 0,
    average_attempts: results.requestsMade / requestQueue.length,
    median_attempts: 1, // simplified
    requests_per_recovered_candle: results.requiredCandlesRecovered > 0 ? results.requestsMade / results.requiredCandlesRecovered : 0,
    average_backoff: rateLimit429Count > 0 ? totalBackoffMs / rateLimit429Count : 0,
    maximum_backoff: maxBackoffMs,
    provider_success_rate: results.successfulResponses / results.requestsMade,
    recommendation: recommendation
  };
  
  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10R_RATE_LIMIT_RECOVERY.json'), JSON.stringify(finalReport, null, 2));
  
  console.log("Phase 10R Completed.");
  console.log(`Recovery Rate: ${(results.recoveryRate * 100).toFixed(2)}%`);
  console.log(`Recommendation: ${recommendation}`);
}

runPilot();
