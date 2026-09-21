const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../../');
const ACQUISITION_DIR = path.join(ROOT, 'evidence/market-data-certification/acquisition');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');
const STAGING_DB_PATH = path.join(ROOT, 'portfolio_staging.db');

function run() {
  const p = path.join(ACQUISITION_DIR, 'VALIDATED_DATA.json');
  if (!fs.existsSync(p)) return;
  
  const validated = JSON.parse(fs.readFileSync(p, 'utf8'));
  
  if (fs.existsSync(STAGING_DB_PATH)) fs.unlinkSync(STAGING_DB_PATH);
  const db = new Database(STAGING_DB_PATH);
  
  db.exec(`CREATE TABLE Staging_DailyOHLCV (
    symbol TEXT, exchange TEXT, trade_date TEXT,
    open REAL, high REAL, low REAL, close REAL, volume INTEGER,
    source TEXT, provider_symbol TEXT, instrument_key TEXT,
    raw_record_hash TEXT, validation_hash TEXT
  )`);
  
  const insert = db.prepare(`INSERT INTO Staging_DailyOHLCV 
    (symbol, exchange, trade_date, open, high, low, close, volume, source, provider_symbol, instrument_key, raw_record_hash, validation_hash) 
    VALUES (@symbol, @exchange, @date, @open, @high, @low, @close, @volume, @source, @provider_symbol, @instrument_key, @raw_record_hash, @validation_hash)`);
    
  db.transaction((rows) => {
    for (const row of rows) {
      insert.run({
        symbol: row.symbol,
        exchange: row.exchange,
        date: row.date || row.trade_date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        source: row.source,
        provider_symbol: row.provider_symbol || null,
        instrument_key: row.instrument_key || null,
        raw_record_hash: row.raw_record_hash || 'UNKNOWN',
        validation_hash: row.validation_hash || 'UNKNOWN'
      });
    }
  })(validated);
  
  const count = db.prepare('SELECT COUNT(*) as c FROM Staging_DailyOHLCV').get().c;
  db.close();
  
  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE12_STAGING_REPORT.json'), JSON.stringify({
    stagedCount: count,
    stagingDbPath: STAGING_DB_PATH
  }, null, 2));
}

run();
