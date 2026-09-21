const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../');
const DB_PATH = path.join(ROOT, 'portfolio.db');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');

const NSE_CALENDAR_MAP = {
  '2024-01-22': true, '2024-01-26': true, '2024-03-08': true, '2024-03-25': true,
  '2024-03-29': true, '2024-04-11': true, '2024-04-17': true, '2024-05-01': true,
  '2024-05-20': true, '2024-06-17': true, '2024-07-17': true, '2024-08-15': true,
  '2024-10-02': true, '2024-11-15': true, '2024-11-20': true, '2024-12-25': true
};

function getTradingSessions(startStr, endStr) {
  const dates = [];
  const start = new Date(startStr); const end = new Date(endStr);
  while (start <= end) {
    const dStr = start.toISOString().split('T')[0];
    if (start.getUTCDay() >= 1 && start.getUTCDay() <= 5 && !NSE_CALENDAR_MAP[dStr]) {
      dates.push(dStr);
    }
    start.setDate(start.getDate() + 1);
  }
  return dates;
}

function getHash(data) {
  return crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex').toUpperCase();
}

// Simple seeded PRNG
function seededRandom(seed) {
  let x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function run() {
  console.log("Generating Phase 10R Deterministic Sample...");
  
  if (!fs.existsSync(DB_PATH)) {
    console.error("Missing portfolio.db.");
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const symbols = db.prepare("SELECT symbol FROM MasterTickers WHERE status = 'ACTIVE'").all().map(r => r.symbol);
  
  const startTarget = '2024-01-01';
  const endTarget = '2024-08-31';
  const targetSessions = getTradingSessions(startTarget, endTarget);
  
  const unresolvedDelta = [];
  
  for (const sym of symbols) {
    const m = db.prepare('SELECT upstox_key_nse, isin, exchange, listing_date FROM MasterTickers WHERE symbol = ?').get(sym);
    if (!m || !m.upstox_key_nse) continue;
    
    const existing = db.prepare('SELECT trade_date FROM DailyOHLCV WHERE symbol = ? AND trade_date >= ? AND trade_date <= ?').all(sym, startTarget, endTarget).map(r => r.trade_date);
    const existingSet = new Set(existing);
    
    for (const d of targetSessions) {
      if (m.listing_date && d < m.listing_date) continue; // skip pre-listing days
      if (!existingSet.has(d)) {
        unresolvedDelta.push({
          symbol: sym,
          instrumentKey: m.upstox_key_nse,
          date: d
        });
      }
    }
  }
  
  db.close();

  const populationCount = unresolvedDelta.length;
  console.log(`Unresolved Actionable Delta Length: ${populationCount}`);
  
  // Sort deterministically
  unresolvedDelta.sort((a, b) => {
    if (a.symbol < b.symbol) return -1;
    if (a.symbol > b.symbol) return 1;
    return a.date.localeCompare(b.date);
  });
  
  const populationHash = getHash(unresolvedDelta);

  // Take 100 deterministic samples
  const SAMPLE_SIZE = 100;
  const SEED = 42;
  const sample = [];
  
  let currentSeed = SEED;
  const selectedIndices = new Set();
  
  while (sample.length < SAMPLE_SIZE && sample.length < populationCount) {
    const idx = Math.floor(seededRandom(currentSeed) * populationCount);
    currentSeed++;
    
    if (!selectedIndices.has(idx)) {
      selectedIndices.add(idx);
      sample.push({
        recordId: `DEL-${unresolvedDelta[idx].symbol}-${unresolvedDelta[idx].date}`,
        symbol: unresolvedDelta[idx].symbol,
        instrumentKey: unresolvedDelta[idx].instrumentKey,
        date: unresolvedDelta[idx].date
      });
    }
  }

  const sampleContract = {
    populationCount: populationCount,
    populationHash: populationHash,
    sampleSize: SAMPLE_SIZE,
    samplingAlgorithm: "Seeded PRNG (Math.sin) over sorted array index",
    seed: SEED,
    strata: "Uniform random over sorted symbol-date tuples",
    selectedRecordIds: sample,
    generatedAt: new Date().toISOString(),
    sourceDeltaHash: populationHash
  };
  
  const contractPath = path.join(REPORTS_DIR, 'PHASE10R_SAMPLE_CONTRACT.json');
  fs.writeFileSync(contractPath, JSON.stringify(sampleContract, null, 2));
  console.log(`Sample contract written to ${contractPath}`);
}

run();
