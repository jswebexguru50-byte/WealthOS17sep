const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const ROOT = path.resolve(__dirname, '../../');
const STAGING_FILE = path.join(ROOT, 'reports/market-data/BSE_EQ_OPTIMIZED_STAGING.json');

const ZERODHA_API_KEY = process.env.ZERODHA_API_KEY;
const ZERODHA_ACCESS_TOKEN = process.env.ZERODHA_ACCESS_TOKEN;

async function fetchInstruments() {
  return new Promise((resolve, reject) => {
    https.get('https://api.kite.trade/instruments', (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch instruments: ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function testZerodha() {
  console.log("Starting Zerodha Integration Test...");
  if (!ZERODHA_API_KEY || !ZERODHA_ACCESS_TOKEN) {
    console.error("Missing ZERODHA_API_KEY or ZERODHA_ACCESS_TOKEN in .env");
    process.exit(1);
  }

  // 1. Download Instruments Dump
  console.log("Downloading Zerodha instruments CSV...");
  const csvData = await fetchInstruments();
  const lines = csvData.split('\n');
  const headers = lines[0].split(',');
  console.log(`CSV Headers: ${headers.join(', ')}`);

  // Parse CSV
  const instruments = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Handle quoted commas (basic parse, usually kite dump has no quoted commas)
    const parts = line.split(',');
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = parts[idx] ? parts[idx].trim() : '';
    });
    instruments.push(obj);
  }

  console.log(`Loaded ${instruments.length} instruments.`);

  // 2. Load Optimized Staging to get a test instrument
  const stagingData = JSON.parse(fs.readFileSync(STAGING_FILE, 'utf8'));
  const testTarget = stagingData[0]; // Take the first range request
  console.log(`\nTest Target: ${testTarget.symbol} (ISIN: ${testTarget.ISIN}) for range ${testTarget.fromDate} to ${testTarget.toDate}`);

  // 3. Resolve Identity
  let matchedInstrument = instruments.find(inst => 
    inst.exchange === 'BSE' && inst.tradingsymbol === testTarget.symbol
  );

  // If simple tradingsymbol match fails, try by ISIN if available or name mapping
  if (!matchedInstrument && headers.includes('isin')) {
    matchedInstrument = instruments.find(inst => inst.exchange === 'BSE' && inst.isin === testTarget.ISIN);
  }

  if (!matchedInstrument) {
    console.log("Failed to find exact BSE symbol match. Checking sample of BSE instruments...");
    const bseSample = instruments.filter(inst => inst.exchange === 'BSE').slice(0, 5);
    console.log(bseSample);
    process.exit(1);
  }

  console.log(`Resolved Identity -> instrument_token: ${matchedInstrument.instrument_token}`);

  // 4. Test Historical API Fetch
  const url = `https://api.kite.trade/instruments/historical/${matchedInstrument.instrument_token}/day?from=${testTarget.fromDate}&to=${testTarget.toDate}`;
  console.log(`\nFetching: ${url}`);
  
  const options = {
    headers: {
      'X-Kite-Version': '3',
      'Authorization': `token ${ZERODHA_API_KEY}:${ZERODHA_ACCESS_TOKEN}`
    }
  };

  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
      console.log(`Zerodha API Status: ${res.statusCode} ${res.statusMessage}`);
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(rawData);
          if (json.status === 'success') {
            console.log(`Success! Retrieved ${json.data.candles.length} candles.`);
            console.log("Sample candle:", json.data.candles[0]);
          } else {
            console.error("Zerodha API Error Response:", json);
          }
          resolve();
        } catch (e) {
          console.error("Failed to parse response:", rawData.slice(0, 500));
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

testZerodha().catch(console.error);
