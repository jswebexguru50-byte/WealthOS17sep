const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);

function auditDB(dbRel) {
  const dbPath = path.join(ROOT, dbRel);
  if (!fs.existsSync(dbPath)) return { missing: true };
  const stat = fs.statSync(dbPath);
  const result = { sizeMB: Math.round(stat.size / 1024 / 1024), tables: {}, errors: [] };
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
    
    for (const t of tables) {
      try {
        const count = db.prepare(`SELECT COUNT(*) as c FROM "${t}"`).get().c;
        result.tables[t] = count;
      } catch(e) { result.tables[t] = 'ERR: ' + e.message; }
    }
    
    // Deep dive: DailyOHLCV
    if (tables.includes('DailyOHLCV')) {
      try {
        result.ohlcvSummary = db.prepare(`
          SELECT 
            MIN(date) as minDate, MAX(date) as maxDate,
            COUNT(DISTINCT symbol) as distinctSymbols,
            COUNT(*) as totalRows
          FROM DailyOHLCV
        `).get();
        // Sample symbols
        result.ohlcvSampleSymbols = db.prepare('SELECT DISTINCT symbol FROM DailyOHLCV LIMIT 20').all().map(r => r.symbol);
      } catch(e) { result.ohlcvDeepDiveError = e.message; }
    }
    
    // Deep dive: MasterTickers
    if (tables.includes('MasterTickers')) {
      try {
        result.masterTickersSummary = db.prepare('SELECT COUNT(*) as c FROM MasterTickers').get();
        const cols = db.prepare('PRAGMA table_info(MasterTickers)').all().map(c => c.name);
        result.masterTickersCols = cols;
        result.masterTickersSample = db.prepare(`SELECT * FROM MasterTickers LIMIT 5`).all();
      } catch(e) { result.masterTickersError = e.message; }
    }
    
    // Check for Nifty 500 / SME index tables
    const indexTables = tables.filter(t => /nifty|index|sme|benchmark|universe|calendar/i.test(t));
    result.indexRelatedTables = indexTables;
    for (const t of indexTables) {
      try {
        const cnt = db.prepare(`SELECT COUNT(*) as c FROM "${t}"`).get().c;
        const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name);
        result[`${t}_count`] = cnt;
        result[`${t}_cols`] = cols;
      } catch(e) {}
    }
    
    // historical_investable_universe
    if (tables.includes('historical_investable_universe')) {
      try {
        result.universe = db.prepare('SELECT COUNT(*) as c FROM historical_investable_universe').get();
        const cols = db.prepare('PRAGMA table_info(historical_investable_universe)').all().map(c => c.name);
        result.universeCols = cols;
        result.universeSample = db.prepare('SELECT * FROM historical_investable_universe LIMIT 10').all();
      } catch(e) { result.universeError = e.message; }
    }
    
    db.close();
  } catch(e) {
    result.errors.push(e.message);
  }
  return result;
}

const report = {};

// Audit primary DB
report['portfolio.db'] = auditDB('portfolio.db');

// Audit research subset
report['data/portfolio_v6.3_research_subset.db'] = auditDB('data/portfolio_v6.3_research_subset.db');

// Audit market data sqlite
report['data/wealthos_market_data.sqlite'] = auditDB('data/wealthos_market_data.sqlite');

// Check stk.json for symbol universe
const stkPath = path.join(ROOT, 'stk.json');
if (fs.existsSync(stkPath)) {
  try {
    const stk = JSON.parse(fs.readFileSync(stkPath, 'utf8'));
    const keys = Object.keys(stk);
    report['stk.json'] = {
      totalSymbols: keys.length,
      sample: keys.slice(0, 20),
      hasNifty500Tag: keys.some(k => stk[k] && (JSON.stringify(stk[k]).includes('NIFTY500') || JSON.stringify(stk[k]).includes('Nifty 500'))),
      hasSMETag: keys.some(k => stk[k] && (JSON.stringify(stk[k]).includes('SME') || JSON.stringify(stk[k]).includes('NSE_SME'))),
    };
  } catch(e) { report['stk.json'] = { error: e.message }; }
}

// Check universe/coverage audit files
const auditFiles = [
  'data/v6.3_UNIVERSE_INTEGRITY_REPORT.json',
  'data/v6.3_PILOT_COVERAGE_AUDIT.json',
  'data/v6.3_DATA_CONTRACT.json',
  'AUDIT_DATA_SOURCES.md',
];
for (const f of auditFiles) {
  const fp = path.join(ROOT, f);
  if (fs.existsSync(fp)) {
    try {
      if (f.endsWith('.json')) {
        report[f] = JSON.parse(fs.readFileSync(fp, 'utf8'));
      } else {
        report[f] = fs.readFileSync(fp, 'utf8').substring(0, 3000);
      }
    } catch(e) { report[f] = { error: e.message }; }
  }
}

// Check scripts/audit directory
const auditDir = path.join(ROOT, 'scripts/audit');
if (fs.existsSync(auditDir)) {
  report['scripts/audit/'] = fs.readdirSync(auditDir);
}

// Check ingestion pipeline for Nifty 500 / SME references
const ingestionDir = path.join(ROOT, 'ingestion');
if (fs.existsSync(ingestionDir)) {
  report['ingestion/'] = fs.readdirSync(ingestionDir);
}

const outPath = path.join(ROOT, 'reports/MARKET_DATA_CERTIFICATION_AUDIT.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
