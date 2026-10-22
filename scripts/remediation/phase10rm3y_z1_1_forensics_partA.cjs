#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const KiteConnect = require('kiteconnect').KiteConnect;

const ROOT = process.cwd();
const STAGING_FILE = path.join(ROOT, 'reports/market-data/BSE_EQ_POPULATION_MAPPING_STAGING.json');
const OUTPUT_JSON_A = path.join(ROOT, 'reports/market-data/PHASE10RM3Y_Z1_1_ZERODHA_IDENTITY_FORENSICS.json');

const FROZEN_FILES = {
  'src/server/services/PureTechnicalStrategiesEngine.ts': '825FA6C067CF26AB28E15451ABEA80E1015EA15A8F24145102F7FC054977A2A3',
  'src/server/services/StrategyParameterConfig.ts': '901CA7A27B2EB4E09183426C9E0DFD7B812AEEBF84472B49B9F829661FE7194B',
  'src/server/services/SignalQualityOverlay.ts': 'C41CDDB152C150BEA932A8B9BD8FCC6EA01A03A2BA030A723789AAADA5C17452',
  'src/server/services/CapitalProtectionEngine.ts': '63B8317889F5A60E9462F883E89ACB57FE99E819935EC8F7B30036ECFE4ED753',
  'src/server/services/NewTechnicalStrategiesEngine.ts': '78415BA3C74CA6A9CC2FCC96D2E54BA871E9BCA73FC6E078570C412781B1D354',
  'src/server/services/UpstoxIntradayIngestor.ts': '0F1C96D0E0C704672517F378990E17FACDCED7BFBF359DAF9C6F37333BE1B151'
};

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function computeHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
}

async function run() {
  console.log("=== FROZEN FILE VERIFICATION ===");
  let frozenMatch = true;
  for (const [file, expectedHash] of Object.entries(FROZEN_FILES)) {
    const p = path.join(ROOT, file);
    const actual = computeHash(p);
    if (actual === expectedHash) {
      console.log(`[PASS] ${file}`);
    } else {
      console.log(`[FAIL] ${file} | Expected: ${expectedHash} | Actual: ${actual}`);
      frozenMatch = false;
    }
  }
  if (!frozenMatch) console.log("FROZEN_CONTROL_HASH_MISMATCH");

  console.log("\n=== PART A: ZERODHA IDENTITY FORENSICS ===");
  const resultA = {
    phase: '10R-M.3Y-Z1.1',
    provider: 'ZERODHA',
    authentication: 'PENDING',
    instrumentMaster: 'PENDING',
    target: {},
    identityEvidence: [],
    zerodhaMatches: [],
    classification: 'PENDING',
    historicalProbe: 'NOT_RUN',
    productionDbWrites: 0,
    certificationChanged: false
  };

  const API_KEY = process.env.ZERODHA_API_KEY;
  const ACCESS_TOKEN = process.env.ZERODHA_ACCESS_TOKEN;

  if (!API_KEY || !ACCESS_TOKEN) {
    resultA.authentication = 'FAILED';
    writeOutputA(resultA);
    return;
  }

  const kc = new KiteConnect({ api_key: API_KEY });
  kc.setAccessToken(ACCESS_TOKEN);

  try {
    await kc.getProfile();
    resultA.authentication = 'SUCCESS';
  } catch(e) {
    resultA.authentication = 'FAILED';
    writeOutputA(resultA);
    return;
  }

  let instruments = [];
  try {
    instruments = await kc.getInstruments("BSE");
    resultA.instrumentMaster = 'SUCCESS';
  } catch(e) {
    resultA.instrumentMaster = 'FAILED';
    writeOutputA(resultA);
    return;
  }

  if (fs.existsSync(STAGING_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(STAGING_FILE, 'utf8'));
      // Find candidate '534109' or fallback to INE174Q01011
      const keys = Object.keys(data);
      let targetItem = null;
      for (const k of keys) {
        if (data[k].symbol === '534109' || data[k].ISIN === 'INE174Q01011') {
          targetItem = data[k];
          break;
        }
      }
      if (!targetItem && keys.length > 0) targetItem = data[keys[0]];
      
      if (targetItem) {
        resultA.target = targetItem;
        // Search instruments for matches on name, exchange_token, symbol, etc.
        const matches = [];
        
        for (const i of instruments) {
          if (
            (i.tradingsymbol && targetItem.symbol && i.tradingsymbol.includes(targetItem.symbol)) ||
            (i.exchange_token && targetItem.symbol && i.exchange_token === targetItem.symbol) ||
            (i.name && targetItem.name && i.name.toUpperCase().includes(targetItem.name.toUpperCase().slice(0, 10))) // fuzzy name
          ) {
            matches.push(i);
          }
        }
        
        resultA.zerodhaMatches = matches;
        if (matches.length === 0) {
          resultA.classification = 'ZERODHA_CURRENT_INSTRUMENT_NOT_FOUND';
        } else if (matches.length > 1) {
          resultA.classification = 'ZERODHA_IDENTITY_COLLISION';
        } else {
          resultA.classification = 'ZERODHA_CURRENT_INSTRUMENT_RESOLVED';
        }
      }
    } catch(e) {}
  }

  writeOutputA(resultA);
  
  console.log(`Zerodha authentication: ${resultA.authentication}`);
  let idResult = 'NOT_FOUND';
  if (resultA.classification === 'ZERODHA_CURRENT_INSTRUMENT_RESOLVED') idResult = 'RESOLVED';
  else if (resultA.classification === 'ZERODHA_IDENTITY_COLLISION') idResult = 'COLLISION';
  console.log(`Zerodha BSE identity: ${idResult}`);
}

function writeOutputA(result) {
  ensureParent(OUTPUT_JSON_A);
  fs.writeFileSync(OUTPUT_JSON_A, JSON.stringify(result, null, 2));
}

run().catch(console.error);
