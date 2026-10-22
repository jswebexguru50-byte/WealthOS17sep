const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

function runAsync(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function migrate() {
  try {
    await runAsync(`
      CREATE TABLE IF NOT EXISTS StatutoryEvents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scripCode TEXT NOT NULL,
        eventDate TEXT NOT NULL,
        eventType TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        sourceUrl TEXT,
        contentHash TEXT UNIQUE NOT NULL,
        ingestedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`CREATE INDEX IF NOT EXISTS idx_statutory_scrip ON StatutoryEvents(scripCode)`);
    await runAsync(`CREATE INDEX IF NOT EXISTS idx_statutory_hash ON StatutoryEvents(contentHash)`);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS ScripSchedule (
        scripCode TEXT PRIMARY KEY,
        priorityTier TEXT NOT NULL,
        lastStatutoryCheck TEXT,
        lastConcallProcessed TEXT,
        nextConcallExpected TEXT
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS SnapshotProvenance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scripCode TEXT NOT NULL,
        fieldName TEXT NOT NULL,
        sourceTierUsed TEXT NOT NULL,
        confidenceScore REAL NOT NULL,
        citationVeracityScore REAL,
        extractedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('[MIGRATION_OK] StatutoryEvents, ScripSchedule, SnapshotProvenance successfully created!');
  } catch (err) {
    console.error('[MIGRATION_ERROR]', err);
  } finally {
    db.close();
  }
}

migrate();
