const sqlite3 = require('./node_modules/sqlite3').verbose();
const db = new sqlite3.Database('./portfolio.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS IndexOHLCV (
    index_symbol TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL NOT NULL,
    volume INTEGER,
    turnover REAL,
    data_source TEXT DEFAULT 'NSE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (index_symbol, trade_date)
  )`, (err) => {
    if (err) console.error('IndexOHLCV table error:', err);
    else console.log('IndexOHLCV table created OK');
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_index_ohlcv_symbol ON IndexOHLCV(index_symbol)`, (err) => {
    if (err) console.error('idx_index_ohlcv_symbol error:', err);
    else console.log('idx_index_ohlcv_symbol index created OK');
  });

  db.run(`CREATE TABLE IF NOT EXISTS IndexConstituents (
    index_symbol TEXT NOT NULL,
    symbol TEXT NOT NULL,
    company_name TEXT,
    isin TEXT,
    weight REAL,
    sector TEXT,
    effective_from TEXT,
    effective_to TEXT,
    data_source TEXT DEFAULT 'NSE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (index_symbol, symbol)
  )`, (err) => {
    if (err) console.error('IndexConstituents table error:', err);
    else console.log('IndexConstituents table created OK');
  });
});

db.close(() => console.log('Done'));
