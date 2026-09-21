#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('node:fs');
const path = require('node:path');
const KiteConnect = require('kiteconnect').KiteConnect;

const ROOT = process.cwd();
const STAGING_FILE = path.join(ROOT, 'reports/market-data/BSE_EQ_POPULATION_MAPPING_STAGING.json');
const OUTPUT_JSON = path.join(ROOT, 'reports/market-data/PHASE10RM3Y_ZERODHA_EXISTING_API_PROBE.json');
const OUTPUT_MD = path.join(ROOT, 'reports/market-data/PHASE10RM3Y_ZERODHA_EXISTING_API_PROBE.md');

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function datePlusDays(dateString, days) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateOnlyFromCandle(value) {
  if (!value) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

async function run() {
  const result = {
    phase: '10R-M.3Y-Z0',
    timestamp: new Date().toISOString(),
    packageVersion: require('kiteconnect/package.json').version,
    authenticationStatus: 'PENDING',
    instrumentMasterStatus: 'PENDING',
    targetIdentity: null,
    identityResolution: 'PENDING',
    historicalProbe: 'PENDING',
    rangeProbe: 'PENDING',
    productionDbWrites: 0,
    certificationChanged: false,
    finalClassification: 'PENDING'
  };

  const API_KEY = process.env.ZERODHA_API_KEY;
  const ACCESS_TOKEN = process.env.ZERODHA_ACCESS_TOKEN;

  if (!API_KEY || !ACCESS_TOKEN) {
    result.authenticationStatus = 'FAILED';
    result.finalClassification = 'ACCESS_TOKEN_REQUIRED';
    writeOutput(result);
    return;
  }

  const kc = new KiteConnect({ api_key: API_KEY });
  kc.setAccessToken(ACCESS_TOKEN);

  // 1. Authentication Test
  try {
    const profile = await kc.getProfile();
    result.authenticationStatus = 'SUCCESS';
    result.userId = profile.user_id;
  } catch (err) {
    result.authenticationStatus = 'FAILED';
    result.finalClassification = 'AUTHENTICATION_FAILED';
    result.authError = err.message;
    writeOutput(result);
    return;
  }

  // 2. Instrument Master Test
  let instruments = [];
  try {
    instruments = await kc.getInstruments();
    const bseInstruments = instruments.filter(i => i.exchange === 'BSE');
    const bseEqInstruments = bseInstruments.filter(i => i.instrument_type === 'EQ' || i.segment === 'BSE');
    
    result.instrumentMasterStatus = 'SUCCESS';
    result.instrumentCounts = {
      total: instruments.length,
      bseTotal: bseInstruments.length,
      bseEquity: bseEqInstruments.length
    };
  } catch (err) {
    result.instrumentMasterStatus = 'FAILED';
    result.finalClassification = 'AUTHENTICATED_INSTRUMENT_MASTER_UNAVAILABLE';
    result.instrumentError = err.message;
    writeOutput(result);
    return;
  }

  // 3. ISIN Resolution Test
  let targetIsin = 'INE174Q01011';
  let targetSymbol = '538128';
  let targetDate = '2024-01-01'; // Fallback
  
  if (fs.existsSync(STAGING_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(STAGING_FILE, 'utf8'));
      const keys = Object.keys(data);
      if (keys.length > 0) {
        const item = data[keys[0]];
        targetIsin = item.ISIN || targetIsin;
        targetSymbol = item.symbol || targetSymbol;
      }
    } catch(e) {}
  }
  
  result.targetIdentity = {
    isin: targetIsin,
    symbol: targetSymbol,
    targetDate: targetDate
  };

  const matches = instruments.filter(i => i.exchange === 'BSE' && (i.instrument_type === 'EQ' || i.segment === 'BSE') && i.isin === targetIsin);
  
  let resolvedToken = null;
  
  if (matches.length === 0) {
    result.identityResolution = 'ZERODHA_ISIN_NOT_FOUND';
    result.finalClassification = 'ZERODHA_ISIN_NOT_FOUND';
    writeOutput(result);
    return;
  } else if (matches.length > 1) {
    result.identityResolution = 'ZERODHA_ISIN_COLLISION';
    result.finalClassification = 'ZERODHA_ISIN_COLLISION';
    writeOutput(result);
    return;
  } else {
    result.identityResolution = 'ZERODHA_ISIN_RESOLVED';
    resolvedToken = matches[0].instrument_token;
    
    // Symbol Cross-Check
    if (matches[0].tradingsymbol === targetSymbol) {
      result.symbolCrossCheck = 'SYMBOL_MATCH';
    } else {
      result.symbolCrossCheck = 'SYMBOL_DIFFERENT_BUT_IDENTITY_SUPPORTED';
    }
  }

  // 4. Historical Candle Test
  const fromDate = datePlusDays(targetDate, -2);
  const toDate = datePlusDays(targetDate, 2);
  
  try {
    const hist = await kc.getHistoricalData(resolvedToken, "day", fromDate, toDate, false, false);
    
    const exact = hist.filter(c => dateOnlyFromCandle(c.date) === targetDate);
    if (exact.length === 1) {
      result.historicalProbe = 'EXACT_TARGET_DATE_CANDLE';
      result.finalClassification = 'ZERODHA_ISIN_RESOLVED_EXACT_CANDLE_FOUND';
      result.historicalData = {
        date: dateOnlyFromCandle(exact[0].date),
        open: exact[0].open,
        high: exact[0].high,
        low: exact[0].low,
        close: exact[0].close,
        volume: exact[0].volume
      };
    } else {
      result.historicalProbe = 'NO_EXACT_TARGET_DATE_CANDLE';
      result.finalClassification = 'ZERODHA_ISIN_RESOLVED_HISTORICAL_NOT_AVAILABLE';
    }
  } catch(err) {
    result.historicalProbe = 'HISTORICAL_API_ERROR';
    result.finalClassification = 'HISTORICAL_API_ERROR';
    result.historicalError = err.message;
    writeOutput(result);
    return;
  }
  
  // 5. Range Capability Test
  if (result.historicalProbe === 'EXACT_TARGET_DATE_CANDLE') {
    const rFrom = datePlusDays(targetDate, -30);
    const rTo = datePlusDays(targetDate, 30);
    try {
      const rangeHist = await kc.getHistoricalData(resolvedToken, "day", rFrom, rTo, false, false);
      result.rangeProbeData = {
        requestedFrom: rFrom,
        requestedTo: rTo,
        returnedCandleCount: rangeHist.length,
        firstReturnedDate: rangeHist.length > 0 ? dateOnlyFromCandle(rangeHist[0].date) : null,
        lastReturnedDate: rangeHist.length > 0 ? dateOnlyFromCandle(rangeHist[rangeHist.length - 1].date) : null
      };
      
      if (rangeHist.length > 0) {
        result.rangeProbe = 'RANGE_REQUEST_WORKS';
        result.finalClassification = 'ZERODHA_ISIN_RESOLVED_RANGE_SUPPORTED';
      } else {
        result.rangeProbe = 'RANGE_REQUEST_EMPTY';
      }
    } catch(err) {
      result.rangeProbe = 'RANGE_REQUEST_FAILED';
      result.rangeError = err.message;
    }
  }
  
  writeOutput(result);
}

function writeOutput(result) {
  ensureParent(OUTPUT_JSON);
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  
  const md = [
    `# PHASE 10R-M.3Y-Z0 Zerodha Existing-API Capability Probe`,
    ``,
    `- **Timestamp**: ${result.timestamp}`,
    `- **Package Version**: ${result.packageVersion}`,
    `- **Authentication**: ${result.authenticationStatus}`,
    `- **Instrument Master**: ${result.instrumentMasterStatus}`,
    `- **Identity Resolution**: ${result.identityResolution}`,
    `- **Historical Probe**: ${result.historicalProbe}`,
    `- **Range Probe**: ${result.rangeProbe}`,
    `- **Final Classification**: ${result.finalClassification}`
  ].join('\n');
  
  fs.writeFileSync(OUTPUT_MD, md);
  
  console.log('PHASE 10R-M.3Y-Z0 COMPLETE\n');
  console.log(`Authentication: ${result.authenticationStatus}`);
  console.log(`Instrument master: ${result.instrumentMasterStatus}`);
  console.log(`ISIN resolution: ${result.identityResolution}`);
  console.log(`Historical candle: ${result.historicalProbe}`);
  console.log(`Range request: ${result.rangeProbe}`);
  console.log(`Production DB writes: ${result.productionDbWrites}`);
  console.log(`Certification changed: ${result.certificationChanged ? 'YES' : 'NO'}`);
}

run().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
