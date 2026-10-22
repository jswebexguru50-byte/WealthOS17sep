const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../');
const DB_PATH = path.join(ROOT, 'portfolio.db');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');
const DELTA_QUEUE_PATH = path.join(REPORTS_DIR, 'DELTA_ACQUISITION_QUEUE.json');

function seededRandom(seed) {
  let x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function run() {
  console.log("Generating Phase 10R-M Expansion Sample from Unresolved Delta...");
  
  if (!fs.existsSync(DELTA_QUEUE_PATH)) {
    console.error("Missing DELTA_ACQUISITION_QUEUE.json");
    process.exit(1);
  }
  
  const queue = JSON.parse(fs.readFileSync(DELTA_QUEUE_PATH, 'utf8'));
  const db = new Database(DB_PATH, { readonly: true });
  
  // Create a fast lookup for segment from MasterTickers
  const masterTickers = db.prepare("SELECT symbol, segment, upstox_key_nse FROM MasterTickers WHERE status = 'ACTIVE'").all();
  const symbolMap = {};
  for (const row of masterTickers) {
    symbolMap[row.symbol] = row;
  }
  db.close();

  const affectedDelta = [];
  
  for (const item of queue) {
    const symInfo = symbolMap[item.symbol];
    if (!symInfo) continue;
    
    const exch = item.exchange || 'UNKNOWN';
    const seg = symInfo.segment || 'UNKNOWN';
    const isNumeric = /^\d+$/.test(item.symbol);
    const originalKey = item.instrumentKey || "";
    const prefix = originalKey.split('|')[0];
    const isin = item.isin || originalKey.split('|')[1];
    
    let mapping = null;
    
    if (exch === 'BSE' && seg === 'EQ' && isNumeric && isin && originalKey === `NSE_EQ|${isin}`) {
      mapping = {
        original: originalKey,
        corrected: `BSE_EQ|${isin}`,
        exchange: exch,
        rationale: "BSE numeric with valid ISIN mapped to BSE_EQ"
      };
    } else if (exch === 'MUTUAL_FUND') {
      mapping = {
        original: originalKey,
        corrected: originalKey, 
        exchange: exch,
        rationale: "MUTUAL_FUND marked for independent provider validation"
      };
    } else if (exch !== 'NSE') {
      mapping = {
        original: originalKey,
        corrected: originalKey,
        exchange: exch,
        rationale: "Other exchange marked for independent provider validation"
      };
    }
    
    if (mapping) {
      for (const dStr of item.missingDates) {
        affectedDelta.push({
          symbol: item.symbol,
          date: dStr,
          mapping: mapping
        });
      }
    }
  }

  const populationCount = affectedDelta.length;
  console.log(`Identity-Defective Unresolved Delta Length: ${populationCount} sessions across ${new Set(affectedDelta.map(x => x.symbol)).size} symbols.`);
  
  // Sort deterministically for reproducibility
  affectedDelta.sort((a, b) => {
    if (a.symbol < b.symbol) return -1;
    if (a.symbol > b.symbol) return 1;
    return a.date.localeCompare(b.date);
  });
  
  // Stratified sampling
  // The user wants 100 records focused on BSE numeric, across different symbols and dates.
  const bsePopulation = affectedDelta.filter(x => x.mapping.exchange === 'BSE');
  const SAMPLE_SIZE = 100;
  
  const sample = [];
  
  if (bsePopulation.length > 0) {
    console.log(`BSE Population Available: ${bsePopulation.length}`);
    const N = Math.min(bsePopulation.length, SAMPLE_SIZE);
    
    // To stratify across symbols, group by symbol
    const bySymbol = {};
    for (const item of bsePopulation) {
      if (!bySymbol[item.symbol]) bySymbol[item.symbol] = [];
      bySymbol[item.symbol].push(item);
    }
    
    const symbols = Object.keys(bySymbol).sort();
    
    let currentSeed = 42;
    while (sample.length < N) {
      // Pick a random symbol
      const symIdx = Math.floor(seededRandom(currentSeed++) * symbols.length);
      const sym = symbols[symIdx];
      
      const dates = bySymbol[sym];
      if (dates.length > 0) {
        // Pick a random date for this symbol
        const dateIdx = Math.floor(seededRandom(currentSeed++) * dates.length);
        sample.push(dates.splice(dateIdx, 1)[0]);
      } else {
        // Remove symbol if empty
        symbols.splice(symIdx, 1);
        if (symbols.length === 0) break;
      }
    }
  }
  
  const stagingOut = {};
  for (const item of sample) {
    const recId = `DEL-${item.symbol}-${item.date}`;
    stagingOut[recId] = {
      symbol: item.symbol,
      exchange: item.mapping.exchange,
      original_upstox_key: item.mapping.original,
      corrected_upstox_key: item.mapping.corrected,
      mapping_rationale: item.mapping.rationale,
      mapping_source: "Phase 10R-M Expansion Logic",
      mapping_timestamp: new Date().toISOString(),
      validation_status: "PENDING_RETEST"
    };
  }

  const outputPath = path.join(REPORTS_DIR, 'IDENTITY_MAPPING_STAGING_EXPANDED.json');
  fs.writeFileSync(outputPath, JSON.stringify(stagingOut, null, 2));
  console.log(`Wrote ${Object.keys(stagingOut).length} BSE-stratified records to ${outputPath}`);
}

run();
