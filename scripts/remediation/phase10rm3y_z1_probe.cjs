#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('node:fs');
const path = require('node:path');
const KiteConnect = require('kiteconnect').KiteConnect;

const ROOT = process.cwd();
const STAGING_FILE = path.join(ROOT, 'reports/market-data/BSE_EQ_POPULATION_MAPPING_STAGING.json');
const OUTPUT_JSON = path.join(ROOT, 'reports/market-data/PHASE10RM3Y_Z1_ZERODHA_BSE_SYMBOL_PROBE.json');
const OUTPUT_MD = path.join(ROOT, 'reports/market-data/PHASE10RM3Y_Z1_ZERODHA_BSE_SYMBOL_PROBE.md');

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
    phase: '10R-M.3Y-Z1',
    provider: 'ZERODHA',
    authentication: 'PENDING',
    instrumentMaster: 'PENDING',
    isinDirectResolution: 'NOT_USED',
    wealthosBseSymbolResolution: 'PENDING',
    zerodhaInstrumentTokenResolution: 'PENDING',
    historicalProbe: 'PENDING',
    rangeProbe: 'PENDING',
    productionDbWrites: 0,
    certificationChanged: false
  };

  const API_KEY = process.env.ZERODHA_API_KEY;
  const ACCESS_TOKEN = process.env.ZERODHA_ACCESS_TOKEN;

  if (!API_KEY || !ACCESS_TOKEN) {
    result.authentication = 'FAILED';
    writeOutput(result, null);
    return;
  }

  const kc = new KiteConnect({ api_key: API_KEY });
  kc.setAccessToken(ACCESS_TOKEN);

  // 1. Authentication Test
  try {
    await kc.getProfile();
    result.authentication = 'SUCCESS';
  } catch (err) {
    result.authentication = 'FAILED';
    writeOutput(result, null, null, null, err.message);
    return;
  }

  // 2. Load BSE Instruments
  let instruments = [];
  try {
    instruments = await kc.getInstruments("BSE");
    result.instrumentMaster = 'SUCCESS';
  } catch (err) {
    result.instrumentMaster = 'FAILED';
    writeOutput(result, null, null, null, err.message);
    return;
  }

  // 3. Target Resolution
  let targetIsin = 'INE174Q01011';
  let targetSymbol = '538128';
  let targetDate = '2024-01-01';
  
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

  // Step 2: Symbol Resolution Classification
  const matches = instruments.filter(i => 
    i.exchange === 'BSE' && 
    (i.instrument_type === 'EQ' || i.segment === 'BSE') && 
    i.tradingsymbol === targetSymbol
  );
  
  let resolvedToken = null;
  
  if (matches.length === 0) {
    result.wealthosBseSymbolResolution = 'ZERODHA_BSE_SYMBOL_NOT_FOUND';
    result.zerodhaInstrumentTokenResolution = 'NOT_FOUND';
    writeOutput(result, targetSymbol, 'NOT_FOUND');
    return;
  } else if (matches.length > 1) {
    result.wealthosBseSymbolResolution = 'ZERODHA_BSE_SYMBOL_COLLISION';
    result.zerodhaInstrumentTokenResolution = 'COLLISION';
    writeOutput(result, targetSymbol, 'COLLISION');
    return;
  } else {
    result.wealthosBseSymbolResolution = 'ZERODHA_BSE_SYMBOL_RESOLVED';
    resolvedToken = matches[0].instrument_token;
    result.zerodhaInstrumentTokenResolution = resolvedToken;
    result.resolvedInstrument = {
      instrument_token: matches[0].instrument_token,
      exchange_token: matches[0].exchange_token,
      tradingsymbol: matches[0].tradingsymbol,
      name: matches[0].name,
      segment: matches[0].segment,
      exchange: matches[0].exchange,
      instrument_type: matches[0].instrument_type
    };
  }

  // Step 3 & 4: Historical Probe & Exact Date Validation
  const fromDate = datePlusDays(targetDate, -2);
  const toDate = datePlusDays(targetDate, 2);
  
  try {
    const hist = await kc.getHistoricalData(resolvedToken, "day", fromDate, toDate, false, false);
    
    const exact = hist.filter(c => dateOnlyFromCandle(c.date) === targetDate);
    if (exact.length === 1) {
      result.historicalProbe = 'ZERODHA_HISTORICAL_EXACT_CANDLE_FOUND';
      result.historicalData = {
        requestedFrom: fromDate,
        requestedTo: toDate,
        returnedCandleCount: hist.length,
        targetDate: targetDate,
        targetDateFound: true,
        instrumentToken: resolvedToken,
        tradingsymbol: matches[0].tradingsymbol,
        exchange: matches[0].exchange,
        segment: matches[0].segment
      };
    } else {
      result.historicalProbe = 'ZERODHA_HISTORICAL_NO_EXACT_CANDLE';
    }
  } catch(err) {
    result.historicalProbe = 'ZERODHA_HISTORICAL_API_ERROR';
    result.historicalError = err.message;
    writeOutput(result, targetSymbol, resolvedToken, 'ERROR', 'PENDING');
    return;
  }
  
  // Step 5: One Range Probe
  if (result.historicalProbe === 'ZERODHA_HISTORICAL_EXACT_CANDLE_FOUND') {
    const rFrom = datePlusDays(targetDate, -30);
    const rTo = datePlusDays(targetDate, 30);
    try {
      const rangeHist = await kc.getHistoricalData(resolvedToken, "day", rFrom, rTo, false, false);
      result.rangeProbeData = {
        returnedCandleCount: rangeHist.length
      };
      
      if (rangeHist.length > 0) {
        result.rangeProbe = 'ZERODHA_RANGE_SUPPORTED';
      } else {
        result.rangeProbe = 'ZERODHA_RANGE_NO_DATA';
      }
    } catch(err) {
      result.rangeProbe = 'ZERODHA_RANGE_API_ERROR';
      result.rangeError = err.message;
    }
  }
  
  let histPrint = 'NOT_FOUND';
  if (result.historicalProbe === 'ZERODHA_HISTORICAL_EXACT_CANDLE_FOUND') histPrint = 'FOUND';
  else if (result.historicalProbe === 'ZERODHA_HISTORICAL_API_ERROR') histPrint = 'ERROR';
  
  let rangePrint = 'PENDING';
  if (result.rangeProbe === 'ZERODHA_RANGE_SUPPORTED') rangePrint = 'SUCCESS';
  else if (result.rangeProbe === 'ZERODHA_RANGE_NO_DATA') rangePrint = 'NO_DATA';
  else if (result.rangeProbe === 'ZERODHA_RANGE_API_ERROR') rangePrint = 'ERROR';
  
  writeOutput(result, targetSymbol, resolvedToken, histPrint, rangePrint);
}

function writeOutput(result, symbol, token, histPrint='PENDING', rangePrint='PENDING') {
  ensureParent(OUTPUT_JSON);
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  
  const md = [
    `# PHASE 10R-M.3Y-Z1 Zerodha BSE Symbol Probe`,
    ``,
    `- **Provider**: ${result.provider}`,
    `- **Authentication**: ${result.authentication}`,
    `- **Instrument Master**: ${result.instrumentMaster}`,
    `- **BSE Symbol Resolution**: ${result.wealthosBseSymbolResolution}`,
    `- **Instrument Token**: ${result.zerodhaInstrumentTokenResolution}`,
    `- **Historical Probe**: ${result.historicalProbe}`,
    `- **Range Probe**: ${result.rangeProbe}`,
    `- **Production DB Writes**: ${result.productionDbWrites}`
  ].join('\n');
  
  fs.writeFileSync(OUTPUT_MD, md);
  
  console.log('PHASE 10R-M.3Y-Z1 COMPLETE\n');
  console.log(`Authentication: ${result.authentication}`);
  console.log(`BSE instrument master: ${result.instrumentMaster}`);
  console.log(`WealthOS BSE symbol: ${symbol || '<symbol>'}`);
  console.log(`Zerodha instrument token: ${token || 'NOT_FOUND'}`);
  console.log(`Historical exact candle: ${histPrint}`);
  console.log(`30-day range probe: ${rangePrint}`);
  console.log(`\nProduction DB writes: ${result.productionDbWrites}`);
  console.log(`Certification changed: NO`);
}

run().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
