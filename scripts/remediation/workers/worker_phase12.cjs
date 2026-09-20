const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../../');
const ACQUISITION_DIR = path.join(ROOT, 'evidence/market-data-certification/acquisition');
const DB_PATH = path.join(ROOT, 'portfolio_staging.db');

function reportProgress(msg, progress = null) {
  if (parentPort) parentPort.postMessage({ type: 'progress', phase: 'Phase 12', message: msg, progress });
}

function run() {
  reportProgress('Initializing Phase 12: Staging Database Insertion...', 0);
  
  const validationReportPath = path.join(ACQUISITION_DIR, 'PHASE11_VALIDATION_REPORT.json');
  const stageableDataPath = path.join(ACQUISITION_DIR, 'VALIDATED_STAGEABLE_DATA.json');
  
  if (!fs.existsSync(validationReportPath) || !fs.existsSync(stageableDataPath)) {
    reportProgress('Failed: Phase 11 Validation artifacts missing.', 100);
    if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 12', result: 'FAILED' });
    return;
  }

  const validationReport = JSON.parse(fs.readFileSync(validationReportPath, 'utf8'));
  
  // Phase 12 Acceptance Gate
  if (validationReport.status !== "PASS" || validationReport.stageableRows === 0) {
    reportProgress('Phase 12 Blocked: Phase 11 Validation did not PASS or data is quarantined.', 100);
    if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 12', result: 'FAILED' });
    return;
  }

  const stageableData = JSON.parse(fs.readFileSync(stageableDataPath, 'utf8'));

  reportProgress('Creating portfolio_staging.db...', 10);
  
  // Create or open staging db
  const db = new Database(DB_PATH);
  
  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS Staging_DailyOHLCV (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      exchange TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume INTEGER NOT NULL,
      source TEXT NOT NULL,
      source_record_id TEXT NOT NULL,
      retrieval_timestamp TEXT NOT NULL,
      source_timestamp TEXT NOT NULL,
      raw_record_hash TEXT NOT NULL,
      validation_hash TEXT NOT NULL,
      delta_queue_id TEXT NOT NULL,
      validation_run_id TEXT NOT NULL,
      UNIQUE(exchange, symbol, date)
    );
  `);

  reportProgress('Inserting validated data into portfolio_staging.db...', 30);

  const insert = db.prepare(`
    INSERT INTO Staging_DailyOHLCV (
      symbol, exchange, date, open, high, low, close, volume,
      source, source_record_id, retrieval_timestamp, source_timestamp,
      raw_record_hash, validation_hash, delta_queue_id, validation_run_id
    ) VALUES (
      @symbol, @exchange, @date, @open, @high, @low, @close, @volume,
      @source, @source_record_id, @retrieval_timestamp, @source_timestamp,
      @raw_record_hash, @validation_hash, @delta_queue_id, @validation_run_id
    )
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row);
    }
  });

  try {
    insertMany(stageableData);
  } catch (err) {
    reportProgress(`Failed: DB Insertion error: ${err.message}`, 100);
    if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 12', result: 'FAILED' });
    return;
  }

  const count = db.prepare('SELECT COUNT(*) as count FROM Staging_DailyOHLCV').get().count;

  reportProgress(`Phase 12 Complete: Successfully staged ${count} rows.`, 100);
  db.close();

  if (parentPort) parentPort.postMessage({ type: 'done', phase: 'Phase 12', result: 'PASS' });
}

run();
