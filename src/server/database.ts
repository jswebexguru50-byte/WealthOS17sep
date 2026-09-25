import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { MasterTickerService } from './services/MasterTickerService.js';
import { computeIsCashFlowFlag } from './xirr.js';


export let isTransactionActive = false;
export async function runInDbLock<T>(fn: () => Promise<T>): Promise<T> {
  while (isTransactionActive) {
    await new Promise(r => setTimeout(r, 100));
  }
  isTransactionActive = true;
  try {
    return await fn();
  } finally {
    isTransactionActive = false;
  }
}

const DB_FILE = process.env.DATABASE_URL || path.join(process.cwd(), 'portfolio.db');
const PERSISTENT_BACKUP_PATH = path.join(process.cwd(), 'portfolio_persistent_backup.db');

let lastBackupTime = 0;
let isBackupInProgress = false;

export function createPersistentBackup() {
  const now = Date.now();
  if (isBackupInProgress || now - lastBackupTime < 600000) return;
  isBackupInProgress = true;
  lastBackupTime = now;

  setTimeout(async () => {
    try {
      if (fs.existsSync(DB_FILE)) {
        const stat = await fs.promises.stat(DB_FILE);
        if (stat.size > 8192) {
          await fs.promises.copyFile(DB_FILE, PERSISTENT_BACKUP_PATH);
        }
      }
    } catch (e) {
      // Ignore transient file locks during background backup
    } finally {
      isBackupInProgress = false;
    }
  }, 500);
}

function getDatabaseTxCountSync(filePath: string): number {
  if (!fs.existsSync(filePath)) return -1;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 8192) return -1;
    // Fast check: look for sqlite header magic bytes
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    if (!buffer.toString('utf8', 0, 15).startsWith('SQLite format 3')) {
      return -1;
    }
  } catch {
    return -1;
  }
  return 1; // Mark as valid SQLite database file
}

export function restorePersistentBackupIfNeeded() {
  if (process.env.VITEST || process.env.NODE_ENV === 'test' || process.env.DB_PATH?.includes('test')) {
    return; // Bypass auto-restore for unit/integration tests to allow clean test databases
  }
  try {
    const dbExists = fs.existsSync(DB_FILE);
    let currentDbValid = dbExists && fs.statSync(DB_FILE).size >= 8192;
    
    if (currentDbValid) {
      const checkVal = getDatabaseTxCountSync(DB_FILE);
      if (checkVal < 0) currentDbValid = false;
    }

    let needsRestore = !currentDbValid;

    // Discover best backup candidate if current db is missing or corrupted
    const candidateFiles = [
      PERSISTENT_BACKUP_PATH,
      ...fs.readdirSync(process.cwd())
        .filter(f => f.startsWith('portfolio.db.bak') || f.endsWith('.db.bak') || (f.includes('backup') && f.endsWith('.db')))
        .map(f => path.join(process.cwd(), f))
    ];

    let bestBackupPath: string | null = null;
    let bestBackupSize = 0;

    for (const candidate of candidateFiles) {
      if (candidate === DB_FILE) continue;
      if (fs.existsSync(candidate)) {
        const size = fs.statSync(candidate).size;
        if (size > 8192 && getDatabaseTxCountSync(candidate) > 0) {
          if (size > bestBackupSize) {
            bestBackupSize = size;
            bestBackupPath = candidate;
          }
        }
      }
    }

    if (needsRestore && bestBackupPath) {
      console.log(`[PersistentBackup] Auto-restoring portfolio.db from backup: ${path.basename(bestBackupPath)} (size: ${bestBackupSize} bytes)...`);
      if (fs.existsSync(DB_FILE)) {
        try { fs.unlinkSync(DB_FILE); } catch {}
      }
      fs.copyFileSync(bestBackupPath, DB_FILE);
      console.log(`[PersistentBackup] Successfully restored database from ${path.basename(bestBackupPath)}!`);
    }
  } catch (e) {
    console.warn('[PersistentBackup] Error during restore check:', e);
  }
}

let dbInstance: (sqlite3.Database & { isOpen?: boolean }) | null = null;
let isSwapInProgress = false;

export function setSwapInProgress(val: boolean) {
  isSwapInProgress = val;
}

export function getDB(): sqlite3.Database {
  if (isSwapInProgress) throw new Error("Database update in progress.");
  if (!dbInstance || !dbInstance.isOpen) {
    restorePersistentBackupIfNeeded();
  }
  if (dbInstance && dbInstance.isOpen) return dbInstance;
  const db = new sqlite3.Database(DB_FILE) as sqlite3.Database & { isOpen?: boolean };
  db.isOpen = true;
  dbInstance = db;
  db.on('error', (err) => {
    console.error('Database connection error event:', err);
  });
  // Enable WAL mode, a 10-second busy timeout, and NORMAL synchronous mode to prevent 'database is locked' errors.
  // No db.serialize() wrapper — the sqlite3 driver queues these sequentially on a single connection already.
  // Enable a 30-second busy timeout.
  // Safety fix: Removed PRAGMA journal_mode=WAL and synchronous=NORMAL
  // to avoid mutating the SQLite database file header.
  // The database should already be in WAL mode from setup, or operate read-only.
  // We only set non-persistent memory/cache settings.
  db.run("PRAGMA busy_timeout=30000;", (err) => {
    if (err) console.error("PRAGMA busy_timeout failed:", err.message);
  });
  db.run("PRAGMA temp_store=MEMORY;");
  db.run("PRAGMA cache_size=-64000;");
  return db;
}

export function closeDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      resolve();
      return;
    }
    dbInstance.isOpen = false;
    dbInstance.close((err) => {
      dbInstance = null;
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function repairCorruptDatabase(): Promise<boolean> {
  console.warn('[DB Recovery] Initiating self-healing repair for corrupt database file...');
  try {
    await closeDB();
    if (!fs.existsSync(DB_FILE)) {
      console.log('[DB Recovery] DB_FILE does not exist, nothing to repair.');
      return false;
    }

    const timestamp = Date.now();
    const backupCorruptFile = `${DB_FILE}.corrupt.${timestamp}`;
    const cleanFile = `${DB_FILE}.clean.${timestamp}`;

    if (fs.existsSync(cleanFile)) fs.unlinkSync(cleanFile);

    const srcDb = new sqlite3.Database(DB_FILE);
    const dstDb = new sqlite3.Database(cleanFile);

    // 1. Get all table schemas
    const tables: Array<{ name: string; sql: string }> = await new Promise((resolve) => {
      srcDb.all("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, rows) => {
        if (err || !rows) resolve([]);
        else resolve(rows as any[]);
      });
    });

    // 2. Create schema in target clean DB
    for (const t of tables) {
      if (!t.sql) continue;
      await new Promise<void>((resolve) => {
        dstDb.run(t.sql, () => resolve());
      });
    }

    // 3. Copy rows table by table
    for (const t of tables) {
      const tableName = t.name;
      try {
        const rows: any[] = await new Promise((resolve, reject) => {
          srcDb.all(`SELECT * FROM ${tableName}`, (err, r) => {
            if (err) reject(err);
            else resolve(r || []);
          });
        });

        if (rows && rows.length > 0) {
          const cols = Object.keys(rows[0]);
          const placeholders = cols.map(() => '?').join(',');
          const insertSql = `INSERT OR REPLACE INTO ${tableName} (${cols.join(',')}) VALUES (${placeholders})`;

          await new Promise<void>((resolve) => {
            dstDb.serialize(() => {
              dstDb.run('BEGIN TRANSACTION');
              for (const row of rows) {
                const vals = cols.map((c) => row[c]);
                dstDb.run(insertSql, vals);
              }
              dstDb.run('COMMIT', () => resolve());
            });
          });
          console.log(`[DB Recovery] Preserved ${rows.length} records from table '${tableName}'`);
        }
      } catch (err: any) {
        console.warn(`[DB Recovery] Skipped corrupted pages in table '${tableName}': ${err.message}`);
      }
    }

    await new Promise<void>((res) => srcDb.close(() => res()));
    await new Promise<void>((res) => dstDb.close(() => res()));

    // Rename corrupt DB to backup and replace
    try { fs.copyFileSync(DB_FILE, backupCorruptFile); } catch {}
    if (fs.existsSync(`${DB_FILE}-wal`)) try { fs.unlinkSync(`${DB_FILE}-wal`); } catch {}
    if (fs.existsSync(`${DB_FILE}-shm`)) try { fs.unlinkSync(`${DB_FILE}-shm`); } catch {}
    if (fs.existsSync(DB_FILE)) try { fs.unlinkSync(DB_FILE); } catch {}

    if (fs.existsSync(cleanFile) && tables.length > 0) {
      fs.renameSync(cleanFile, DB_FILE);
      console.log(`[DB Recovery] Database successfully repaired! Old corrupt copy backed up to ${path.basename(backupCorruptFile)}`);
    } else {
      if (fs.existsSync(cleanFile)) try { fs.unlinkSync(cleanFile); } catch {}
      console.log(`[DB Recovery] Unrecoverable corrupt database backed up to ${path.basename(backupCorruptFile)}. Re-creating fresh database.`);
    }
    return true;
  } catch (err) {
    console.error('[DB Recovery] Unhandled error during database repair:', err);
    return false;
  }
}

// ── Schema Migration System ───────────────────────────────────────────────────
// Each entry runs exactly once per database, tracked by version number.
// Safe to add new entries; existing databases catch up on next startup.
const SCHEMA_MIGRATIONS: Array<{ version: number; name: string; sqls: string[] }> = [
  {
    version: 1,
    name: 'add_as_of_date_to_options_chain_snapshot',
    sqls: ['ALTER TABLE options_chain_snapshot ADD COLUMN as_of_date TEXT'],
  },
  {
    version: 2,
    name: 'create_IndexOHLCV',
    sqls: [`CREATE TABLE IF NOT EXISTS IndexOHLCV (
      index_symbol TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      open REAL, high REAL, low REAL, close REAL NOT NULL,
      volume INTEGER, turnover REAL,
      data_source TEXT DEFAULT 'NSE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (index_symbol, trade_date)
    )`],
  },
  {
    version: 3,
    name: 'create_IndexConstituents',
    sqls: [`CREATE TABLE IF NOT EXISTS IndexConstituents (
      index_symbol TEXT NOT NULL,
      symbol TEXT NOT NULL,
      company_name TEXT, isin TEXT, weight REAL, sector TEXT,
      effective_from TEXT, effective_to TEXT,
      data_source TEXT DEFAULT 'NSE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (index_symbol, symbol)
    )`],
  },
  {
    version: 4,
    name: 'add_composite_performance_indexes',
    sqls: [
      'CREATE INDEX IF NOT EXISTS idx_txn_port_isin_date ON Transactions(portfolio, isin, date)',
      'CREATE INDEX IF NOT EXISTS idx_txn_type_port ON Transactions(type, portfolio)',
      'CREATE INDEX IF NOT EXISTS idx_rg_port_isin ON RealizedGains(portfolio, isin, symbol)',
      'CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_sym ON DailyOHLCV(symbol, trade_date)',
    ],
  },
  {
    version: 5,
    name: 'add_company_name_to_MasterTickers',
    sqls: ['ALTER TABLE MasterTickers ADD COLUMN company_name TEXT'],
  },
  {
    // Keep only 5 years of close-price history — cuts ~900K rows (~300MB)
    version: 6,
    name: 'trim_HistoricalPrices_to_5_years',
    sqls: [`DELETE FROM HistoricalPrices WHERE date < date('now', '-5 years')`],
  },
  {
    // Keep only 90 days of market snapshots — cuts ~580K rows (~180MB)
    version: 7,
    name: 'trim_MarketSnapshots_to_90_days',
    sqls: [`DELETE FROM MarketSnapshots WHERE snapshot_date < date('now', '-90 days')`],
  },
  {
    // Reclaim freed pages after the bulk deletes above
    version: 8,
    name: 'vacuum_after_trim',
    sqls: [`VACUUM`],
  },
  {
    version: 9,
    name: 'create_DataQualityAuditLedger',
    sqls: [
      `CREATE TABLE IF NOT EXISTS DataQualityAuditLedger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        company_name TEXT,
        sector TEXT,
        industry TEXT,
        as_of_quarter TEXT,
        as_of_year TEXT,
        promoter_pct REAL,
        fii_pct REAL,
        dii_pct REAL,
        govt_pct REAL,
        others_pct REAL,
        public_pct REAL,
        sum_total_pct REAL,
        free_float_pct REAL,
        no_of_shareholders TEXT,
        market_cap_cr REAL,
        current_price REAL,
        pe_ratio REAL,
        book_value REAL,
        dividend_yield_pct REAL,
        roce_pct REAL,
        roe_pct REAL,
        debt_to_equity REAL,
        latest_sales_cr REAL,
        latest_expenses_cr REAL,
        latest_op_profit_cr REAL,
        latest_opm_pct REAL,
        latest_pbt_cr REAL,
        latest_tax_pct REAL,
        latest_pat_cr REAL,
        latest_eps REAL,
        sales_yoy_growth_pct REAL,
        pat_yoy_growth_pct REAL,
        sales_qoq_growth_pct REAL,
        pat_qoq_growth_pct REAL,
        sales_growth_5y_pct REAL,
        profit_growth_5y_pct REAL,
        cfo_cr REAL,
        cfi_cr REAL,
        cff_cr REAL,
        net_cash_flow_cr REAL,
        total_assets_cr REAL,
        total_borrowings_cr REAL,
        integrity_status TEXT NOT NULL,
        violation_reasons TEXT,
        field_accuracy_score REAL,
        audited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol)
      )`,
      'CREATE INDEX IF NOT EXISTS idx_audit_symbol ON DataQualityAuditLedger(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_audit_status ON DataQualityAuditLedger(integrity_status)',
    ],
  },
  {
    version: 10,
    name: 'create_DataSyncDriftLedger',
    sqls: [
      `CREATE TABLE IF NOT EXISTS DataSyncDriftLedger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        as_of_period TEXT,
        statement_type TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        primary_source TEXT NOT NULL,
        primary_value REAL,
        secondary_source TEXT NOT NULL,
        secondary_value REAL,
        delta_absolute REAL,
        delta_percentage REAL,
        sync_status TEXT NOT NULL,
        resolution_note TEXT,
        reconciled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, statement_type, metric_name, as_of_period)
      )`,
      'CREATE INDEX IF NOT EXISTS idx_sync_drift_symbol ON DataSyncDriftLedger(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_sync_drift_status ON DataSyncDriftLedger(sync_status)',
    ],
  },
  {
    version: 11,
    name: 'create_Historical_Financials_and_Shareholding',
    sqls: [
      `CREATE TABLE IF NOT EXISTS HistoricalFinancialStatements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        statement_type TEXT NOT NULL,
        period_label TEXT NOT NULL,
        period_date TEXT,
        sales_cr REAL,
        expenses_cr REAL,
        operating_profit_cr REAL,
        opm_pct REAL,
        other_income_cr REAL,
        interest_cr REAL,
        depreciation_cr REAL,
        pbt_cr REAL,
        tax_pct REAL,
        net_profit_pat_cr REAL,
        eps REAL,
        equity_capital_cr REAL,
        reserves_cr REAL,
        borrowings_cr REAL,
        other_liabilities_cr REAL,
        total_liabilities_cr REAL,
        fixed_assets_cr REAL,
        cwip_cr REAL,
        investments_cr REAL,
        other_assets_cr REAL,
        total_assets_cr REAL,
        cfo_cr REAL,
        cfi_cr REAL,
        cff_cr REAL,
        net_cash_flow_cr REAL,
        primary_source TEXT NOT NULL,
        secondary_source TEXT,
        is_reconciled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, statement_type, period_label)
      )`,
      'CREATE INDEX IF NOT EXISTS idx_hist_fin_sym ON HistoricalFinancialStatements(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_hist_fin_stmt ON HistoricalFinancialStatements(symbol, statement_type)',
      `CREATE TABLE IF NOT EXISTS HistoricalShareholdingPattern (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        quarter_label TEXT NOT NULL,
        as_of_date TEXT,
        promoter_pct REAL NOT NULL,
        fii_pct REAL NOT NULL,
        dii_pct REAL NOT NULL,
        govt_pct REAL DEFAULT 0,
        others_pct REAL DEFAULT 0,
        public_pct REAL NOT NULL,
        employee_trusts_pct REAL DEFAULT 0,
        sum_total_pct REAL NOT NULL,
        free_float_pct REAL NOT NULL,
        primary_source TEXT NOT NULL,
        secondary_source TEXT,
        is_reconciled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol, quarter_label)
      )`,
      'CREATE INDEX IF NOT EXISTS idx_hist_shp_sym ON HistoricalShareholdingPattern(symbol)',
    ],
  },
];

export async function runMigrations(db: Database): Promise<void> {
  try {
    await dbRun(db, `CREATE TABLE IF NOT EXISTS db_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    const row = await dbGet<{ max_ver: number }>(db, 'SELECT COALESCE(MAX(version), 0) as max_ver FROM db_migrations');
    const currentVersion = row?.max_ver ?? 0;

    for (const migration of SCHEMA_MIGRATIONS) {
      if (migration.version <= currentVersion) continue;
      for (const sql of migration.sqls) {
        try {
          await dbRun(db, sql);
        } catch (e: any) {
          // Column/index already exists is OK; other errors are logged but not fatal
          if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) {
            console.warn(`[Migration v${migration.version}] Warning running "${sql.slice(0, 60)}...": ${e.message}`);
          }
        }
      }
      await dbRun(db, 'INSERT OR IGNORE INTO db_migrations (version, name) VALUES (?, ?)', [migration.version, migration.name]);
      console.log(`[Migration] Applied v${migration.version}: ${migration.name}`);
    }

    // Run explicit manual migrations for tables that need complex retrofitting
    await migrateDatasetPromotionManifests(db);
    
  } catch (e: any) {
    console.error('[Migration] Migration runner error:', e.message);
  }
}

async function migrateDatasetPromotionManifests(db: Database): Promise<void> {
  // Check if the constraint already exists
  const tableInfo = await dbGet<{ sql: string }>(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='DatasetPromotionManifests'");
  if (!tableInfo || tableInfo.sql.includes('CONSTRAINT valid_promoted_evidence CHECK')) {
    // Already migrated or doesn't exist yet
    return;
  }

  console.log('[Migration] Migrating DatasetPromotionManifests to enforce valid_promoted_evidence constraint...');

  await dbRun(db, 'PRAGMA foreign_keys=off;');
  await dbRun(db, 'BEGIN TRANSACTION;');

  try {
    // 1. Create Quarantine table if it doesn't exist
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS DatasetPromotionManifests_Quarantine (
        dataset_id TEXT PRIMARY KEY,
        raw_sha256 TEXT,
        canonical_sha256 TEXT,
        source TEXT,
        provider TEXT,
        endpoint_version TEXT,
        requested_start TEXT,
        requested_end TEXT,
        actual_start TEXT,
        actual_end TEXT,
        coverage_pct REAL,
        missing_ranges_json TEXT,
        pit_status TEXT,
        calendar_status TEXT,
        corporate_action_basis TEXT,
        verification_predicates_json TEXT,
        promotion_decision TEXT,
        promotion_reason TEXT,
        persisted_at TEXT,
        quarantine_reason TEXT,
        quarantine_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Identify invalid rows and move them to quarantine
    const rows = await dbAll<any>(db, "SELECT * FROM DatasetPromotionManifests");
    let quarantinedCount = 0;
    
    for (const row of rows) {
      let isInvalid = false;
      let reason = '';

      if (row.promotion_decision === 'PROMOTED') {
        if (!row.raw_sha256 || row.raw_sha256.trim().length !== 64) {
          isInvalid = true; reason += 'Missing/invalid raw_sha256. ';
        }
        if (!row.canonical_sha256 || row.canonical_sha256.trim().length !== 64) {
          isInvalid = true; reason += 'Missing/invalid canonical_sha256. ';
        }
        try {
          const preds = JSON.parse(row.verification_predicates_json);
          if (!Array.isArray(preds)) {
            isInvalid = true; reason += 'verification_predicates_json is not an array. ';
          }
        } catch (e) {
          isInvalid = true; reason += 'verification_predicates_json is invalid JSON. ';
        }
      }

      if (isInvalid) {
        await dbRun(db, `
          INSERT OR REPLACE INTO DatasetPromotionManifests_Quarantine (
            dataset_id, raw_sha256, canonical_sha256, source, provider, endpoint_version,
            requested_start, requested_end, actual_start, actual_end, coverage_pct,
            missing_ranges_json, pit_status, calendar_status, corporate_action_basis,
            verification_predicates_json, promotion_decision, promotion_reason, persisted_at,
            quarantine_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          row.dataset_id, row.raw_sha256, row.canonical_sha256, row.source, row.provider, row.endpoint_version,
          row.requested_start, row.requested_end, row.actual_start, row.actual_end, row.coverage_pct,
          row.missing_ranges_json, row.pit_status, row.calendar_status, row.corporate_action_basis,
          row.verification_predicates_json, row.promotion_decision, row.promotion_reason, row.persisted_at,
          reason.trim()
        ]);
        
        await dbRun(db, "DELETE FROM DatasetPromotionManifests WHERE dataset_id = ?", [row.dataset_id]);
        quarantinedCount++;
      }
    }

    // 3. Rename old table
    await dbRun(db, 'ALTER TABLE DatasetPromotionManifests RENAME TO _DatasetPromotionManifests_old');

    // 4. Create new table with constraint
    await dbRun(db, `
      CREATE TABLE DatasetPromotionManifests (
        dataset_id TEXT PRIMARY KEY,
        raw_sha256 TEXT NOT NULL,
        canonical_sha256 TEXT NOT NULL,
        source TEXT NOT NULL,
        provider TEXT NOT NULL,
        endpoint_version TEXT NOT NULL,
        requested_start TEXT NOT NULL,
        requested_end TEXT NOT NULL,
        actual_start TEXT NOT NULL,
        actual_end TEXT NOT NULL,
        coverage_pct REAL NOT NULL,
        missing_ranges_json TEXT NOT NULL,
        pit_status TEXT NOT NULL,
        calendar_status TEXT NOT NULL,
        corporate_action_basis TEXT NOT NULL,
        verification_predicates_json TEXT NOT NULL,
        promotion_decision TEXT NOT NULL,
        promotion_reason TEXT NOT NULL,
        persisted_at TEXT NOT NULL,
        CONSTRAINT valid_promoted_evidence CHECK (
          promotion_decision <> 'PROMOTED' 
          OR (
            length(trim(raw_sha256)) = 64 
            AND length(trim(canonical_sha256)) = 64
            AND json_valid(verification_predicates_json) = 1
            AND json_type(verification_predicates_json) = 'array'
          )
        )
      )
    `);

    // 5. Insert remaining valid rows
    await dbRun(db, `
      INSERT INTO DatasetPromotionManifests (
        dataset_id, raw_sha256, canonical_sha256, source, provider, endpoint_version,
        requested_start, requested_end, actual_start, actual_end, coverage_pct,
        missing_ranges_json, pit_status, calendar_status, corporate_action_basis,
        verification_predicates_json, promotion_decision, promotion_reason, persisted_at
      ) SELECT 
        dataset_id, raw_sha256, canonical_sha256, source, provider, endpoint_version,
        requested_start, requested_end, actual_start, actual_end, coverage_pct,
        missing_ranges_json, pit_status, calendar_status, corporate_action_basis,
        verification_predicates_json, promotion_decision, promotion_reason, persisted_at
      FROM _DatasetPromotionManifests_old
    `);

    // 6. Drop old table
    await dbRun(db, 'DROP TABLE _DatasetPromotionManifests_old');

    await dbRun(db, 'COMMIT;');
    console.log(`[Migration] DatasetPromotionManifests migration complete. Quarantined ${quarantinedCount} rows.`);
  } catch (e) {
    await dbRun(db, 'ROLLBACK;');
    console.error('[Migration] Failed to migrate DatasetPromotionManifests, rolled back.', e);
    throw e;
  } finally {
    await dbRun(db, 'PRAGMA foreign_keys=on;');
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export function initializeDatabase(db: Database, skipIntegrityCheck = false): Promise<void> {
  const proceed = () => runSchemaInitialization(db)
    .then(() => runMigrations(db))
    .catch(e => console.error('[Migration] Non-fatal migration error:', e));

  if (skipIntegrityCheck) {
    return proceed();
  }

  return new Promise((resolve, reject) => {
    // Use quick_check (fast) instead of full integrity_check (reads entire DB, very slow on large files)
    db.all('PRAGMA quick_check;', async (err, rows: any) => {
      const isCorrupt = err || !rows || rows.some((r: any) => {
        const result = r.quick_check ?? r.integrity_check;
        return result && result !== 'ok';
      });
      if (isCorrupt) {
        console.warn('[DB Init] Detected database corruption. Triggering auto-recovery...');
        const repaired = await repairCorruptDatabase();
        if (repaired) {
          const newDb = getDB();
          return initializeDatabase(newDb).then(resolve).catch(reject);
        }
      }
      proceed().then(resolve).catch(reject);
    });
  });
}

function runSchemaInitialization(db: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const errorHandler = (err: Error) => {
      if (!finished) {
        finished = true;
        reject(err);
      }
    };
    db.on('error', errorHandler);

    const cleanupAndResolve = () => {
      if (!finished) {
        finished = true;
        db.removeListener('error', errorHandler);

        // Ensure all high-performance indexes exist across all core and auxiliary tables
        const indexes = [
          // Transactions
          'CREATE INDEX IF NOT EXISTS idx_tx_portfolio_date ON Transactions(portfolio, date)',
          'CREATE INDEX IF NOT EXISTS idx_tx_date ON Transactions(date)',
          'CREATE INDEX IF NOT EXISTS idx_tx_isin ON Transactions(isin)',
          'CREATE INDEX IF NOT EXISTS idx_tx_symbol ON Transactions(symbol)',
          'CREATE INDEX IF NOT EXISTS idx_tx_type ON Transactions(type)',
          'CREATE INDEX IF NOT EXISTS idx_tx_folio ON Transactions(folio)',
          'CREATE INDEX IF NOT EXISTS idx_tx_is_cash_flow ON Transactions(is_cash_flow)',
          'CREATE INDEX IF NOT EXISTS idx_tx_batch_id ON Transactions(batch_id)',
          'CREATE INDEX IF NOT EXISTS idx_tx_port_sym_date ON Transactions(portfolio, symbol, date)',
          'CREATE INDEX IF NOT EXISTS idx_txns_port_isin_date ON Transactions(portfolio, isin, date)',
          'CREATE INDEX IF NOT EXISTS idx_tx_source ON Transactions(source)',

          // Holdings
          'CREATE INDEX IF NOT EXISTS idx_holdings_port_symbol ON Holdings(portfolio, symbol)',
          'CREATE INDEX IF NOT EXISTS idx_holdings_port_isin ON Holdings(portfolio, isin)',
          'CREATE INDEX IF NOT EXISTS idx_holdings_isin ON Holdings(isin)',
          'CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON Holdings(symbol)',
          'CREATE INDEX IF NOT EXISTS idx_holdings_data_status ON Holdings(data_status)',
          'CREATE INDEX IF NOT EXISTS idx_holdings_folio ON Holdings(folio)',
          'CREATE INDEX IF NOT EXISTS idx_holdings_holding_type ON Holdings(holding_type)',
          'CREATE INDEX IF NOT EXISTS idx_holdings_price_authority ON Holdings(price_authority)',
          'CREATE INDEX IF NOT EXISTS idx_holdings_port_type ON Holdings(portfolio, holding_type)',

          // MasterTickers
          'CREATE INDEX IF NOT EXISTS idx_master_isin ON MasterTickers(isin)',
          'CREATE INDEX IF NOT EXISTS idx_master_symbol ON MasterTickers(symbol)',
          'CREATE INDEX IF NOT EXISTS idx_master_isin_symbol ON MasterTickers(isin, symbol)',
          'CREATE INDEX IF NOT EXISTS idx_master_exchange ON MasterTickers(exchange)',
          'CREATE INDEX IF NOT EXISTS idx_master_sector ON MasterTickers(sector)',
          'CREATE INDEX IF NOT EXISTS idx_master_asset_class ON MasterTickers(asset_class)',

          // Portfolios & Members
          'CREATE INDEX IF NOT EXISTS idx_portfolios_name ON Portfolios(name)',
          'CREATE INDEX IF NOT EXISTS idx_portfolios_member ON Portfolios(member_id)',
          'CREATE INDEX IF NOT EXISTS idx_portfolios_status ON Portfolios(status)',
          'CREATE INDEX IF NOT EXISTS idx_portfolios_type ON Portfolios(type)',
          'CREATE INDEX IF NOT EXISTS idx_mpp_member_port ON MemberPortfolioPermissions(member_id, portfolio_name)',
          'CREATE INDEX IF NOT EXISTS idx_family_members_active ON FamilyMembers(is_active)',
          'CREATE INDEX IF NOT EXISTS idx_family_members_role ON FamilyMembers(role)',

          // CorporateActions & Audit
          'CREATE INDEX IF NOT EXISTS idx_ca_isin_recdate ON CorporateActions(isin, record_date)',
          'CREATE INDEX IF NOT EXISTS idx_ca_sym_date ON CorporateActions(symbol, record_date)',
          'CREATE INDEX IF NOT EXISTS idx_ca_symbol ON CorporateActions(symbol)',
          'CREATE INDEX IF NOT EXISTS idx_ca_applied ON CorporateActions(applied)',
          'CREATE INDEX IF NOT EXISTS idx_ca_action_type ON CorporateActions(action_type)',
          'CREATE INDEX IF NOT EXISTS idx_ca_audit_id ON CorporateActionAudit(action_id)',
          'CREATE INDEX IF NOT EXISTS idx_ca_audit_sym ON CorporateActionAudit(symbol)',

          // HistoricalPrices
          'CREATE INDEX IF NOT EXISTS idx_hist_prices_sym_date ON HistoricalPrices(symbol, date)',
          'CREATE INDEX IF NOT EXISTS idx_hist_prices_isin_date ON HistoricalPrices(isin, date)',
          'CREATE INDEX IF NOT EXISTS idx_hist_prices_date ON HistoricalPrices(date)',

          // RealizedGains & Tax
          'CREATE INDEX IF NOT EXISTS idx_rg_port_fy ON RealizedGains(portfolio, financial_year)',
          'CREATE INDEX IF NOT EXISTS idx_rg_port_sell_date ON RealizedGains(portfolio, sell_date)',
          'CREATE INDEX IF NOT EXISTS idx_rg_isin ON RealizedGains(isin)',
          'CREATE INDEX IF NOT EXISTS idx_rg_symbol ON RealizedGains(symbol)',
          'CREATE INDEX IF NOT EXISTS idx_rg_sell_date ON RealizedGains(sell_date)',
          'CREATE INDEX IF NOT EXISTS idx_rg_fy ON RealizedGains(financial_year)',
          'CREATE INDEX IF NOT EXISTS idx_tax_summary_port_fy ON TaxSummary(portfolio, financial_year)',
          'CREATE INDEX IF NOT EXISTS idx_cfl_port_fy ON CarriedForwardLosses(portfolio, financial_year)',

          // Benchmark & Portfolio History
          'CREATE INDEX IF NOT EXISTS idx_bench_cache ON BenchmarkCashFlowCache(portfolio, benchmark_symbol, date)',
          'CREATE INDEX IF NOT EXISTS idx_bench_cache_sym_date ON BenchmarkCashFlowCache(benchmark_symbol, date)',
          'CREATE INDEX IF NOT EXISTS idx_ph_port_date ON PortfolioHistory(portfolio, date)',
          'CREATE INDEX IF NOT EXISTS idx_history_date_port ON PortfolioHistory(date, portfolio)',
          'CREATE INDEX IF NOT EXISTS idx_dps_date_port ON DailyPortfolioSnapshot(date, portfolio)',
          'CREATE INDEX IF NOT EXISTS idx_dps_port ON DailyPortfolioSnapshot(portfolio)',
          'CREATE INDEX IF NOT EXISTS idx_val_snap_port_time ON ValuationSnapshots(portfolio, timestamp)',

          // Bank & Currency
          'CREATE INDEX IF NOT EXISTS idx_bank_portfolio ON BankAccountsAndFDs(portfolio)',
          'CREATE INDEX IF NOT EXISTS idx_bank_currency ON BankAccountsAndFDs(currency)',
          'CREATE INDEX IF NOT EXISTS idx_bank_maturity ON BankAccountsAndFDs(maturity_date)',
          'CREATE INDEX IF NOT EXISTS idx_currency_rates_curr ON CurrencyRates(currency)',

          // Mappings, Reconciliation & CAMS
          'CREATE INDEX IF NOT EXISTS idx_scrip_raw ON AssetScripMappings(raw_symbol)',
          'CREATE INDEX IF NOT EXISTS idx_scrip_standard ON AssetScripMappings(standard_symbol)',
          'CREATE INDEX IF NOT EXISTS idx_scrip_isin ON AssetScripMappings(isin)',
          'CREATE INDEX IF NOT EXISTS idx_user_mappings_raw ON UserMappings(raw_value)',
          'CREATE INDEX IF NOT EXISTS idx_cams_port_isin ON CamsSummaryHoldings(portfolio, isin)',
          'CREATE INDEX IF NOT EXISTS idx_cams_conf_port ON CamsConfigurations(portfolio_name)',
          'CREATE INDEX IF NOT EXISTS idx_recon_holdings_port ON ReconciledHoldings(portfolio, isin)',
          'CREATE INDEX IF NOT EXISTS idx_sold_reg_port ON SoldStockRegistry(portfolio, isin)',
          'CREATE INDEX IF NOT EXISTS idx_pms_base_port ON PmsReconciliationBaseline(portfolio)',
          'CREATE INDEX IF NOT EXISTS idx_pms_sum_port_isin ON PmsSummaryHoldings(portfolio, isin)',
          'CREATE INDEX IF NOT EXISTS idx_recon_disc_port ON ReconDiscrepancies(portfolio)',
          'CREATE INDEX IF NOT EXISTS idx_recon_audit_snap ON ReconciliationAuditSnapshots(portfolio, snapshot_date)',

          // NRI, FEMA & Allocations
          'CREATE INDEX IF NOT EXISTS idx_nri_account_port ON AccountProfiles(portfolio_name)',
          'CREATE INDEX IF NOT EXISTS idx_nri_tds_port_date ON NriTdsTransactions(portfolio, date)',
          'CREATE INDEX IF NOT EXISTS idx_nri_tds_fy ON NriTdsTransactions(financial_year, portfolio)',
          'CREATE INDEX IF NOT EXISTS idx_fema_fy ON FemaRepatriationLedger(financial_year)',
          'CREATE INDEX IF NOT EXISTS idx_fema_account ON FemaRepatriationLedger(bank_account)',
          'CREATE INDEX IF NOT EXISTS idx_target_alloc_model ON TargetAllocations(model_name)',

          // System Logs & Disk Cache
          'CREATE INDEX IF NOT EXISTS idx_dash_disk_cache_key ON DashboardDiskCache(cache_key)',
          'CREATE INDEX IF NOT EXISTS idx_fifo_log_date_port ON FifoRunLog(run_date, portfolio)',
          'CREATE INDEX IF NOT EXISTS idx_action_history_time ON ActionHistory(timestamp)',
          'CREATE INDEX IF NOT EXISTS idx_action_history_type ON ActionHistory(action_type)',
          'CREATE INDEX IF NOT EXISTS idx_data_change_table ON DataChangeLog(table_name, record_id)',
          'CREATE INDEX IF NOT EXISTS idx_app_changelog_time ON AppChangeLogs(timestamp)'
        ];

        db.serialize(() => {
          for (const idx of indexes) {
            db.run(idx, () => {});
          }
          resolve();
        });
      }
    };

    const cleanupAndReject = (err: any) => {
      if (!finished) {
        finished = true;
        db.removeListener('error', errorHandler);
        reject(err);
      }
    };

    db.serialize(() => {
      // Create AppConfig
      db.run(`
        CREATE TABLE IF NOT EXISTS AppConfig (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS strategy_scan_cache (
            id TEXT PRIMARY KEY,
            scan_id TEXT NOT NULL,
            strategy_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            qualified INTEGER NOT NULL,
            entry_price REAL,
            target1 REAL,
            target2 REAL,
            stop_loss REAL,
            rr_ratio REAL,
            confidence_pct REAL,
            rule_checks_json TEXT,
            scan_date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, () => {
        db.run('CREATE INDEX IF NOT EXISTS idx_strat_cache_lookup ON strategy_scan_cache(scan_id, strategy_id);');
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS strategy_scan_metadata (
            id TEXT PRIMARY KEY,
            scan_id TEXT NOT NULL UNIQUE,
            strategy_ids_json TEXT,
            universe_count INTEGER,
            stocks_qualified_total INTEGER,
            scan_started_at TEXT,
            scan_completed_at TEXT,
            duration_seconds INTEGER,
            status TEXT NOT NULL,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS DataQualityAuditLedger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL UNIQUE,
          company_name TEXT,
          sector TEXT,
          industry TEXT,
          as_of_quarter TEXT,
          promoter_pct REAL,
          fii_pct REAL,
          dii_pct REAL,
          govt_pct REAL,
          others_pct REAL,
          public_pct REAL,
          free_float_pct REAL,
          sum_total REAL,
          roce_pct REAL,
          roe_pct REAL,
          pe_ratio REAL,
          market_cap_cr REAL,
          latest_sales_cr REAL,
          latest_pat_cr REAL,
          opm_pct REAL,
          sales_yoy_pct REAL,
          pat_yoy_pct REAL,
          cfo_cr REAL,
          integrity_status TEXT NOT NULL,
          violation_flags TEXT,
          raw_data_json TEXT,
          audited_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, () => {
        db.run('CREATE INDEX IF NOT EXISTS idx_dq_audit_symbol ON DataQualityAuditLedger(symbol);');
        db.run('CREATE INDEX IF NOT EXISTS idx_dq_audit_status ON DataQualityAuditLedger(integrity_status);');
        db.run('CREATE INDEX IF NOT EXISTS idx_dq_audit_quarter ON DataQualityAuditLedger(as_of_quarter);');
      });

      // Create DataSyncDriftLedger table for Dual-Source Consensus & Cross-Validation
      db.run(`
        CREATE TABLE IF NOT EXISTS DataSyncDriftLedger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          as_of_period TEXT,
          statement_type TEXT NOT NULL,
          metric_name TEXT NOT NULL,
          primary_source TEXT NOT NULL,
          primary_value REAL,
          secondary_source TEXT NOT NULL,
          secondary_value REAL,
          delta_absolute REAL,
          delta_percentage REAL,
          sync_status TEXT NOT NULL,
          resolution_note TEXT,
          reconciled_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, () => {
        db.run('CREATE INDEX IF NOT EXISTS idx_ds_drift_symbol ON DataSyncDriftLedger(symbol);');
        db.run('CREATE INDEX IF NOT EXISTS idx_ds_drift_status ON DataSyncDriftLedger(sync_status);');
        db.run('CREATE INDEX IF NOT EXISTS idx_ds_drift_metric ON DataSyncDriftLedger(metric_name);');
      });

      // Create Portfolios table
      db.run(`
        CREATE TABLE IF NOT EXISTS Portfolios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          type TEXT DEFAULT 'EQUITY',
          status TEXT DEFAULT 'ACTIVE',
          family_group TEXT DEFAULT 'Primary Family Office',
          benchmark_symbol TEXT DEFAULT '^NSEI',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create FamilyGroups table
      db.run(`
        CREATE TABLE IF NOT EXISTS FamilyGroups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          benchmark_symbol TEXT DEFAULT '^NSEI',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ── NRI WealthOS Schemas (Modules C, D & E) ───────────────────────────

      // 1. Account Tax & Demat Scheme Metadata
      db.run(`
        CREATE TABLE IF NOT EXISTS AccountProfiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          portfolio_name TEXT NOT NULL UNIQUE,
          account_type TEXT CHECK(account_type IN ('NRE', 'NRO', 'RESIDENT', 'FOREIGN_US', 'FOREIGN_UAE')) DEFAULT 'NRE',
          demat_scheme TEXT CHECK(demat_scheme IN ('PIS', 'NON_PIS', 'DIRECT_MUTUAL_FUND', 'OFFSHORE_BROKER')) DEFAULT 'NON_PIS',
          designated_bank TEXT,
          bank_account_number TEXT,
          pis_permission_ref TEXT,
          resident_country TEXT DEFAULT 'UAE',
          tax_residency_status TEXT DEFAULT 'NRI',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. NRI TDS Withholding & Broker Deductions
      db.run(`
        CREATE TABLE IF NOT EXISTS NriTdsTransactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id INTEGER,
          portfolio TEXT NOT NULL,
          date TEXT NOT NULL,
          isin TEXT NOT NULL,
          symbol TEXT NOT NULL,
          realized_gain_inr REAL NOT NULL,
          gain_type TEXT CHECK(gain_type IN ('STCG', 'LTCG')) NOT NULL,
          tds_rate_pct REAL NOT NULL,
          surcharge_pct REAL DEFAULT 0,
          cess_pct REAL DEFAULT 4.0,
          effective_tds_pct REAL NOT NULL,
          tds_amount_deducted REAL NOT NULL,
          challan_bsr_code TEXT,
          challan_number TEXT,
          challan_date TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 3. FEMA USD 1 Million Repatriation Ledger
      db.run(`
        CREATE TABLE IF NOT EXISTS FemaRepatriationLedger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          financial_year TEXT NOT NULL,
          remittance_date TEXT NOT NULL,
          portfolio TEXT NOT NULL,
          source_account_nro TEXT NOT NULL,
          destination_country TEXT NOT NULL,
          remitted_amount_inr REAL NOT NULL,
          fx_rate_usd_inr REAL NOT NULL,
          remitted_amount_usd REAL NOT NULL,
          form_15ca_ack_no TEXT,
          form_15cb_cert_no TEXT,
          ca_membership_no TEXT,
          purpose_code TEXT DEFAULT 'S1301',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 4. Target Asset Allocation Models
      db.run(`
        CREATE TABLE IF NOT EXISTS TargetAllocations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model_name TEXT NOT NULL,
          asset_class TEXT NOT NULL,
          target_pct REAL NOT NULL,
          rebalance_tolerance_pct REAL DEFAULT 5.0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(model_name, asset_class)
        )
      `, () => {
        db.get("SELECT COUNT(*) as cnt FROM TargetAllocations", (allocErr, aRow: any) => {
          if (!allocErr && aRow && aRow.cnt === 0) {
            const defaultTargets = [
              ['Balanced NRI Growth', 'INDIAN_LARGE_CAP', 40.0, 5.0],
              ['Balanced NRI Growth', 'INDIAN_MID_SMALL', 25.0, 5.0],
              ['Balanced NRI Growth', 'GLOBAL_EQUITY', 15.0, 5.0],
              ['Balanced NRI Growth', 'TAX_FREE_NRE_FD', 15.0, 5.0],
              ['Balanced NRI Growth', 'GOLD_AND_CASH', 5.0, 2.5]
            ];
            for (const t of defaultTargets) {
              db.run("INSERT OR IGNORE INTO TargetAllocations (model_name, asset_class, target_pct, rebalance_tolerance_pct) VALUES (?, ?, ?, ?)", t);
            }
          }
        });
      });

      // Create AssetScripMappings table
      db.run(`
        CREATE TABLE IF NOT EXISTS AssetScripMappings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_broker TEXT NOT NULL,
          raw_scrip_name TEXT NOT NULL,
          raw_symbol TEXT,
          isin TEXT,
          symbol TEXT,
          asset_class TEXT DEFAULT 'Equity',
          sector TEXT,
          market_cap_tier TEXT,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_broker, raw_scrip_name)
        )
      `);

      // Portfolios column migrations
      const portfolioMigrations = [
        `ALTER TABLE Portfolios ADD COLUMN family_group TEXT DEFAULT 'Primary Family Office'`,
        `ALTER TABLE Portfolios ADD COLUMN benchmark_symbol TEXT DEFAULT '^NSEI'`
      ];
      for (const sql of portfolioMigrations) {
        db.run(sql, (err: any) => {
          if (err && !err.message.includes('duplicate column')) {
            console.warn('[DB Migration Portfolios]', err.message);
          }
        });
      }

      // Create MasterTickers
      db.run(`
        CREATE TABLE IF NOT EXISTS MasterTickers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          isin TEXT UNIQUE NOT NULL,
          symbol TEXT,
          name TEXT,
          exchange TEXT DEFAULT 'NSE',
          segment TEXT DEFAULT 'EQ',
          sector TEXT,
          upstox_key_nse TEXT,
          upstox_key_bse TEXT,
          manual_ltp REAL,
          manual_ltp_date TEXT,
          last_price REAL,
          previous_close REAL,
          last_updated TEXT,
          fmv_31_jan_2018 REAL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // MasterTickers column migrations (idempotent — safe to run on existing DBs)
      const masterTickerMigrations = [
        `ALTER TABLE MasterTickers ADD COLUMN last_price REAL`,
        `ALTER TABLE MasterTickers ADD COLUMN previous_close REAL`,
        `ALTER TABLE MasterTickers ADD COLUMN last_updated TEXT`,
      ];
      for (const sql of masterTickerMigrations) {
        db.run(sql, (err: any) => {
          // Ignore 'duplicate column name' errors — column already exists
          if (err && !err.message.includes('duplicate column')) {
            console.warn('[DB Migration]', err.message);
          }
        });
      }

      // Create Transactions
      db.run(`
        CREATE TABLE IF NOT EXISTS Transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          portfolio TEXT NOT NULL,
          type TEXT NOT NULL,
          isin TEXT NOT NULL,
          symbol TEXT,
          quantity REAL NOT NULL,
          price REAL NOT NULL,
          gross_amount REAL,
          brokerage REAL DEFAULT 0,
          net_amount REAL NOT NULL,
          source TEXT DEFAULT 'Manual',
          batch_id TEXT,
          is_cash_flow INTEGER DEFAULT 1,
          is_ca INTEGER DEFAULT 0,
          corporate_action_type TEXT,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create Holdings
      db.run(`
        CREATE TABLE IF NOT EXISTS Holdings (
          portfolio TEXT NOT NULL,
          isin TEXT NOT NULL,
          folio TEXT DEFAULT 'NA',
          symbol TEXT NOT NULL,
          quantity REAL NOT NULL,
          avg_buy_price REAL NOT NULL,
          total_cost REAL NOT NULL,
          ltp REAL DEFAULT 0,
          prev_close REAL DEFAULT 0,
          current_value REAL DEFAULT 0,
          unrealized_pnl REAL DEFAULT 0,
          unrealized_pct REAL DEFAULT 0,
          day_change REAL DEFAULT 0,
          day_change_pct REAL DEFAULT 0,
          data_source TEXT,
          last_update TEXT,
          data_status TEXT DEFAULT 'LIVE',
          price_authority TEXT,
          acquisition_fx_rate REAL DEFAULT 1.0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (portfolio, isin, symbol, folio)
        )
      `);

      // Create CorporateActions
      db.run(`
        CREATE TABLE IF NOT EXISTS CorporateActions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_date TEXT NOT NULL,
          ex_date TEXT,
          isin TEXT NOT NULL,
          symbol TEXT,
          action_type TEXT NOT NULL,
          details TEXT,
          numerator REAL,
          denominator REAL,
          dividend_per_share REAL,
          source TEXT,
          applied INTEGER DEFAULT 0,
          applied_date TEXT,
          applied_batch_id TEXT,
          batch_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, () => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_ca_sym_date ON CorporateActions(symbol, record_date);`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_ca_isin_date ON CorporateActions(isin, record_date);`);
        });

      // Create HistoricalPrices
      db.run(`
        CREATE TABLE IF NOT EXISTS HistoricalPrices (
          symbol TEXT NOT NULL,
          date TEXT NOT NULL,
          close_price REAL NOT NULL,
          data_source TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (symbol, date)
        )
      `, () => {
        db.run(`CREATE INDEX IF NOT EXISTS idx_hist_prices_sym_date ON HistoricalPrices(symbol, date);`);
      });

      // Create RealizedGains
      db.run(`
        CREATE TABLE IF NOT EXISTS RealizedGains (
          match_id INTEGER PRIMARY KEY,
          portfolio TEXT NOT NULL,
          isin TEXT NOT NULL,
          symbol TEXT NOT NULL,
          buy_date TEXT NOT NULL,
          buy_price REAL NOT NULL,
          matched_qty REAL NOT NULL,
          sell_date TEXT NOT NULL,
          sell_price REAL NOT NULL,
          buy_cost REAL NOT NULL,
          sell_proceeds REAL NOT NULL,
          realized_pnl REAL NOT NULL,
          holding_days INTEGER NOT NULL,
          tax_category TEXT NOT NULL,
          fmv_31_jan_2018 REAL DEFAULT 0,
          grandfathered_cost REAL,
          taxable_pnl REAL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create TaxSummary
      db.run(`
        CREATE TABLE IF NOT EXISTS TaxSummary (
          financial_year TEXT NOT NULL,
          portfolio TEXT NOT NULL,
          stcg_gains REAL DEFAULT 0,
          stcg_tax REAL DEFAULT 0,
          ltcg_gains REAL DEFAULT 0,
          intraday_gains REAL DEFAULT 0,
          ltcg_exemption REAL DEFAULT 0,
          ltcg_taxable REAL DEFAULT 0,
          ltcg_tax REAL DEFAULT 0,
          total_tax REAL DEFAULT 0,
          dividends REAL DEFAULT 0,
          total_realized_pnl REAL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (financial_year, portfolio)
        )
      `);

      // Create fill_registry (DED-1 & DED-2 Deterministic Fill Audit Ledger)
      db.run(`
        CREATE TABLE IF NOT EXISTS fill_registry (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id            TEXT,
          trade_id            TEXT NOT NULL,
          isin                TEXT NOT NULL,
          trade_date          TEXT NOT NULL,
          trade_time          TEXT,
          trade_type          TEXT NOT NULL,
          quantity            REAL NOT NULL,
          price               REAL NOT NULL,
          broker_code         TEXT NOT NULL,
          settlement_type     TEXT NOT NULL,
          fill_hash           TEXT NOT NULL UNIQUE,
          order_hash          TEXT,
          batch_id            TEXT NOT NULL,
          ingestion_ts        TEXT NOT NULL DEFAULT (datetime('now','utc'))
        )
      `, () => {
        db.run(`CREATE INDEX IF NOT EXISTS idx_fill_reg_hash ON fill_registry(fill_hash);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_fill_reg_order ON fill_registry(order_id, trade_date, isin);`);
      });

      // Create StrippingDisallowances (Section 94(7) & 94(8) ITCA Statutory Audit Ledger)
      db.run(`
        CREATE TABLE IF NOT EXISTS StrippingDisallowances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          portfolio TEXT NOT NULL,
          pan TEXT NOT NULL,
          symbol TEXT NOT NULL,
          isin TEXT NOT NULL,
          section TEXT NOT NULL,
          trigger_sell_date TEXT NOT NULL,
          record_date TEXT NOT NULL,
          gross_loss_claimed REAL NOT NULL,
          disallowed_loss REAL NOT NULL,
          reportable_loss REAL NOT NULL,
          transferred_to_lot_id INTEGER,
          adjusted_cost_of_bonus_lot REAL,
          audit_notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, () => {
        db.run(`CREATE INDEX IF NOT EXISTS idx_sd_pan_fy ON StrippingDisallowances(pan, trigger_sell_date);`);
      });

      // Create BenchmarkCashFlowCache for permanent fast rendering of cashflow SIP calculations
      db.run(`
        CREATE TABLE IF NOT EXISTS BenchmarkCashFlowCache (
          portfolio TEXT NOT NULL,
          benchmark_symbol TEXT NOT NULL,
          date TEXT NOT NULL,
          invested REAL NOT NULL,
          market_value REAL NOT NULL,
          benchmark_value REAL NOT NULL,
          portfolio_return REAL NOT NULL,
          benchmark_return REAL NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (portfolio, benchmark_symbol, date)
        )
      `, () => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_bench_cache ON BenchmarkCashFlowCache(portfolio, benchmark_symbol, date);`);
        });

      // Create PortfolioHistory
      db.run(`
        CREATE TABLE IF NOT EXISTS PortfolioHistory (
          date TEXT NOT NULL,
          portfolio TEXT NOT NULL,
          cumulative_invested REAL DEFAULT 0,
          market_value REAL DEFAULT 0,
          unrealized_pnl REAL DEFAULT 0,
          xirr REAL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (date, portfolio)
        )
      `);
      db.run(`ALTER TABLE PortfolioHistory ADD COLUMN unrealized_pnl REAL DEFAULT 0`, () => {});
      db.run(`ALTER TABLE PortfolioHistory ADD COLUMN xirr REAL`, () => {});

      // Create CorporateActionAudit
      db.run(`
        CREATE TABLE IF NOT EXISTS CorporateActionAudit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          portfolio TEXT,
          date TEXT,
          isin TEXT NOT NULL,
          symbol TEXT,
          action_type TEXT,
          original_qty REAL,
          new_qty REAL,
          original_cost REAL,
          new_cost REAL,
          message TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create UserMappings
      db.run(`
        CREATE TABLE IF NOT EXISTS UserMappings (
          raw_name TEXT PRIMARY KEY,
          resolved_symbol TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create ActionHistory
      db.run(`
        CREATE TABLE IF NOT EXISTS ActionHistory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          action_type TEXT NOT NULL,
          description TEXT NOT NULL,
          batch_id TEXT UNIQUE NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create DataChangeLog
      db.run(`
        CREATE TABLE IF NOT EXISTS DataChangeLog (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          action TEXT NOT NULL,
          row_id INTEGER,
          changed_at TEXT NOT NULL,
          details TEXT
        )
      `);

      // Create ZerodhaHoldings for reconciliation
      db.run(`
        CREATE TABLE IF NOT EXISTS ZerodhaHoldings (
          portfolio TEXT NOT NULL,
          isin TEXT NOT NULL,
          symbol TEXT NOT NULL,
          name TEXT,
          quantity REAL NOT NULL,
          avg_price REAL NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (portfolio, isin)
        )
      `);

      // Create CamsConfigurations table
      db.run(`
        CREATE TABLE IF NOT EXISTS CamsConfigurations (
          pan TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          password TEXT,
          portfolio_name TEXT NOT NULL,
          status TEXT DEFAULT 'ACTIVE',
          last_sync TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create CamsSummaryHoldings table
      db.run(`
        CREATE TABLE IF NOT EXISTS CamsSummaryHoldings (
          portfolio TEXT NOT NULL,
          isin TEXT NOT NULL,
          folio TEXT DEFAULT 'NA',
          symbol TEXT NOT NULL,
          quantity REAL NOT NULL,
          nav REAL NOT NULL,
          value REAL NOT NULL,
          cost REAL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (portfolio, isin, folio)
        )
      `);

      // Create BackupManualTransactions to safely hold deduplicated/replaced manual corporate actions
      db.run(`
        CREATE TABLE IF NOT EXISTS BackupManualTransactions (
          id INTEGER PRIMARY KEY,
          original_id INTEGER,
          date TEXT NOT NULL,
          portfolio TEXT NOT NULL,
          type TEXT NOT NULL,
          isin TEXT NOT NULL,
          symbol TEXT,
          quantity REAL,
          price REAL,
          gross_amount REAL,
          brokerage REAL,
          net_amount REAL,
          source TEXT,
          notes TEXT,
          backed_up_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create Composite High-Speed Performance Indexes
      db.run("SELECT 1", () => {
        db.run(`CREATE INDEX IF NOT EXISTS idx_txns_port_isin_date ON Transactions(portfolio, isin, date);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_txns_symbol ON Transactions(symbol);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_holdings_port_isin ON Holdings(portfolio, isin);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_master_isin_symbol ON MasterTickers(isin, symbol);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_history_date_port ON PortfolioHistory(date, portfolio);`);
      });

      // Bank Accounts & Fixed Deposits Table (India, UAE, US)
      db.run(`
        CREATE TABLE IF NOT EXISTS BankAccountsAndFDs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          portfolio TEXT NOT NULL,
          name TEXT NOT NULL,
          country TEXT DEFAULT 'INDIA',
          account_type TEXT DEFAULT 'SAVINGS',
          currency TEXT DEFAULT 'INR',
          balance_amount REAL DEFAULT 0,
          interest_rate_pct REAL DEFAULT 0,
          maturity_date TEXT,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Currency FX Rates Table (Live XE.com Rates)
      db.run(`
        CREATE TABLE IF NOT EXISTS CurrencyRates (
          currency TEXT PRIMARY KEY,
          rate_to_inr REAL NOT NULL,
          source TEXT DEFAULT 'XE.com Live Spot Rate',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          cleanupAndReject(err);
          return;
        }
        
        // Seed default FX rates if empty
        db.run(`INSERT OR IGNORE INTO CurrencyRates (currency, rate_to_inr, source) VALUES ('INR', 1.0, 'Base')`);
        db.run(`INSERT OR IGNORE INTO CurrencyRates (currency, rate_to_inr, source) VALUES ('USD', 83.5, 'XE.com Live Spot Rate')`);
        db.run(`INSERT OR IGNORE INTO CurrencyRates (currency, rate_to_inr, source) VALUES ('AED', 22.7, 'XE.com Live Spot Rate')`);
        db.run(`INSERT OR IGNORE INTO CurrencyRates (currency, rate_to_inr, source) VALUES ('EUR', 90.8, 'XE.com Live Spot Rate')`);
        db.run(`INSERT OR IGNORE INTO CurrencyRates (currency, rate_to_inr, source) VALUES ('GBP', 106.5, 'XE.com Live Spot Rate')`);

        // Migration: Ensure MasterTickers has 'currency' column
        db.all("PRAGMA table_info(MasterTickers)", (mtErr, mtRows) => {
          const hasCurrency = mtRows ? mtRows.some((r: any) => r.name === 'currency') : false;
          if (!hasCurrency) {
            db.run("ALTER TABLE MasterTickers ADD COLUMN currency TEXT DEFAULT 'INR'");
          }
        });

        // Migration: Ensure Portfolios has 'base_currency' column
        db.all("PRAGMA table_info(Portfolios)", (pErr, pRows) => {
          const hasBaseCurrency = pRows ? pRows.some((r: any) => r.name === 'base_currency') : false;
          if (!hasBaseCurrency) {
            db.run("ALTER TABLE Portfolios ADD COLUMN base_currency TEXT DEFAULT 'INR'");
          }
        });

        // Create DashboardDiskCache table for instant zero-wait first page loads
        db.run(`
          CREATE TABLE IF NOT EXISTS DashboardDiskCache (
            cache_key TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // === GROUND TRUTH INTEGRITY TABLES ===

        // ReconciledHoldings: Institutional vault for locked, broker-reconciled positions.
        // FIFO reads this FIRST and restores locked positions regardless of transaction state.
        db.run(`
          CREATE TABLE IF NOT EXISTS ReconciledHoldings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio TEXT NOT NULL,
            isin TEXT NOT NULL,
            symbol TEXT NOT NULL,
            quantity REAL NOT NULL,
            avg_buy_price REAL NOT NULL,
            total_cost REAL NOT NULL,
            reconciled_at TEXT NOT NULL,
            reconciled_by TEXT DEFAULT 'manual',
            is_locked INTEGER DEFAULT 1,
            notes TEXT,
            UNIQUE(portfolio, isin)
          )
        `);

        // SoldStockRegistry: Permanently sealed sold positions — FIFO will never re-insert them.
        db.run(`
          CREATE TABLE IF NOT EXISTS SoldStockRegistry (
            portfolio TEXT NOT NULL,
            isin TEXT NOT NULL,
            symbol TEXT NOT NULL,
            sold_at TEXT,
            sealed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (portfolio, isin)
          )
        `);

        // FifoRunLog: Audit trail of every FIFO run for diagnostics.
        db.run(`
          CREATE TABLE IF NOT EXISTS FifoRunLog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            triggered_by TEXT NOT NULL,
            started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT,
            holdings_rebuilt INTEGER DEFAULT 0,
            notes TEXT
          )
        `);

        // Create AppChangeLogs table for plain English incremental change logs
        db.run(`
          CREATE TABLE IF NOT EXISTS AppChangeLogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            version_tag TEXT DEFAULT 'v1.0.0',
            summary TEXT NOT NULL,
            file_count INTEGER DEFAULT 0,
            applied_files TEXT,
            source TEXT DEFAULT 'SYSTEM'
          )
        `, () => {
          db.get("SELECT COUNT(*) as cnt FROM AppChangeLogs", (cntErr, row: any) => {
            if (!cntErr && row && row.cnt === 0) {
              db.run(`INSERT INTO AppChangeLogs (version_tag, summary, file_count, source) VALUES (
                'v3.1.0',
                'Added institutional data integrity layer: ReconciledHoldings vault, SoldStockRegistry seal, FifoRunLog audit trail. FIFO now uses locked ground truth; sold stocks permanently sealed; PMS LTP protected from Yahoo override.',
                3,
                'SYSTEM'
              )`);
            }
          });
        });

        // === OPPORTUNITY ENGINE v4.0.0-ENTERPRISE ZERO-FABRICATION ARCHITECTURE TABLES ===

        // 1. Data Provenance & Sanctity Audit Log
        db.run(`
          CREATE TABLE IF NOT EXISTS DataProvenanceLog (
            metric_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            source_name TEXT NOT NULL,
            source_type TEXT NOT NULL,
            fetched_at TEXT NOT NULL,
            as_of_date TEXT NOT NULL,
            confidence_pct REAL NOT NULL,
            reconciled_against TEXT,
            discrepancy_pct REAL DEFAULT 0,
            PRIMARY KEY (metric_id, symbol, as_of_date)
          )
        `);

        // 2. Point-in-Time Fundamentals Store (Append-Only)
        db.run(`
          CREATE TABLE IF NOT EXISTS FundamentalsSnapshot (
            symbol TEXT NOT NULL,
            as_of_date TEXT NOT NULL,
            sector_class TEXT NOT NULL,
            roce REAL,
            sales_cagr_3y REAL,
            debt_equity REAL,
            ocf_ebitda REAL,
            pe_ratio REAL,
            promoter_pledge_pct REAL NOT NULL,
            nim_pct REAL,
            gnpa_pct REAL,
            nnpa_pct REAL,
            car_pct REAL,
            roa_pct REAL,
            source_filing_ref TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (symbol, as_of_date)
          )
        `);

        // 3. News & Corporate Event Intelligence Log
        db.run(`
          CREATE TABLE IF NOT EXISTS EventIntelligenceLog (
            event_id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            event_type TEXT NOT NULL,
            headline TEXT NOT NULL,
            sentiment_score REAL NOT NULL,
            materiality_score REAL NOT NULL,
            is_adverse INTEGER DEFAULT 0,
            source_url TEXT,
            published_at TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 4. Scoring Model Versioning & Walk-Forward Validation Log
        db.run(`
          CREATE TABLE IF NOT EXISTS ScoringModelVersion (
            version_id TEXT PRIMARY KEY,
            weights_json TEXT NOT NULL,
            backtest_period_start TEXT NOT NULL,
            backtest_period_end TEXT NOT NULL,
            out_of_sample_hit_rate_pct REAL,
            avg_r_multiple REAL,
            max_drawdown_pct REAL,
            sharpe_ratio REAL,
            is_active INTEGER DEFAULT 0,
            calibrated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, () => {
          db.run(`
            INSERT OR IGNORE INTO ScoringModelVersion (
              version_id, weights_json, backtest_period_start, backtest_period_end,
              out_of_sample_hit_rate_pct, avg_r_multiple, max_drawdown_pct, sharpe_ratio, is_active
            ) VALUES (
              'v4.0.0-ENTERPRISE-DEFAULT',
              '{"RISK_ON":{"w_fund":0.15,"w_tech":0.30,"w_sm":0.25,"w_deriv":0.15,"w_sector":0.10,"w_news":0.05},"NEUTRAL_DEFENSIVE":{"w_fund":0.25,"w_tech":0.25,"w_sm":0.20,"w_deriv":0.10,"w_sector":0.10,"w_news":0.10},"RISK_OFF":{"w_fund":0.40,"w_tech":0.10,"w_sm":0.15,"w_deriv":0.10,"w_sector":0.10,"w_news":0.15},"STAGFLATION_WATCH":{"w_fund":0.35,"w_tech":0.15,"w_sm":0.20,"w_deriv":0.10,"w_sector":0.10,"w_news":0.10}}',
              '2021-01-01',
              '2026-06-30',
              66.8,
              2.14,
              11.2,
              1.92,
              1
            )
          `);
        });

        // 5. Top-N Ensemble Curation & Near-Miss Audit Log
        db.run(`
          CREATE TABLE IF NOT EXISTS TopNCurationLog (
            run_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            rank INTEGER,
            included INTEGER NOT NULL,
            consensus_pillars_passed INTEGER,
            convergence_score REAL NOT NULL,
            confidence_band_low REAL NOT NULL,
            confidence_band_high REAL NOT NULL,
            excluded_reason TEXT,
            run_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (run_id, symbol)
          )
        `);

        // Migration: Ensure OpportunityScripEvaluations has provenance columns
        db.run(`
          CREATE TABLE IF NOT EXISTS OpportunityScripEvaluations (
            symbol TEXT PRIMARY KEY,
            company_name TEXT,
            sector TEXT,
            market_cap_category TEXT,
            convergence_score REAL,
            actionable_now INTEGER,
            multibagger_tier TEXT,
            provenance_tag TEXT DEFAULT 'SOURCED: NSE_PRIMARY',
            confidence_interval_str TEXT DEFAULT '±2.5%',
            evaluation_json TEXT,
            last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            scan_id TEXT,
            origin TEXT DEFAULT 'SCAN'
          )
        `);
        db.all("PRAGMA table_info(OpportunityScripEvaluations)", (oeErr, oeRows) => {
          if (oeRows) {
            if (!oeRows.some((r: any) => r.name === 'provenance_tag')) db.run("ALTER TABLE OpportunityScripEvaluations ADD COLUMN provenance_tag TEXT DEFAULT 'SOURCED: NSE_PRIMARY'");
            if (!oeRows.some((r: any) => r.name === 'confidence_interval_str')) db.run("ALTER TABLE OpportunityScripEvaluations ADD COLUMN confidence_interval_str TEXT DEFAULT '±2.5%'");
            if (!oeRows.some((r: any) => r.name === 'scan_id')) db.run("ALTER TABLE OpportunityScripEvaluations ADD COLUMN scan_id TEXT");
            if (!oeRows.some((r: any) => r.name === 'origin')) db.run("ALTER TABLE OpportunityScripEvaluations ADD COLUMN origin TEXT DEFAULT 'SCAN'");
          }
        });


        db.all("PRAGMA table_info(Holdings)", (hErr, hRows) => {
          if (hRows) {
            if (!hRows.some((r: any) => r.name === 'currency')) db.run("ALTER TABLE Holdings ADD COLUMN currency TEXT DEFAULT 'INR'");
            if (!hRows.some((r: any) => r.name === 'native_ltp')) db.run("ALTER TABLE Holdings ADD COLUMN native_ltp REAL DEFAULT 0");
            if (!hRows.some((r: any) => r.name === 'native_current_value')) db.run("ALTER TABLE Holdings ADD COLUMN native_current_value REAL DEFAULT 0");
            if (!hRows.some((r: any) => r.name === 'native_total_cost')) db.run("ALTER TABLE Holdings ADD COLUMN native_total_cost REAL DEFAULT 0");
            if (!hRows.some((r: any) => r.name === 'native_avg_buy_price')) db.run("ALTER TABLE Holdings ADD COLUMN native_avg_buy_price REAL DEFAULT 0");
            if (!hRows.some((r: any) => r.name === 'native_unrealized_pnl')) db.run("ALTER TABLE Holdings ADD COLUMN native_unrealized_pnl REAL DEFAULT 0");
            if (!hRows.some((r: any) => r.name === 'price_authority')) db.run("ALTER TABLE Holdings ADD COLUMN price_authority TEXT");
            if (!hRows.some((r: any) => r.name === 'acquisition_fx_rate')) db.run("ALTER TABLE Holdings ADD COLUMN acquisition_fx_rate REAL DEFAULT 1.0");
            db.run("UPDATE Holdings SET price_authority = 'LIVE_FEED' WHERE portfolio = 'cc9' AND symbol != 'CASH' AND price_authority = 'PMS_STATEMENT'");

            // Migration: Add holding_type column for canonical asset classification
            if (!hRows.some((r: any) => r.name === 'holding_type')) {
              db.run("ALTER TABLE Holdings ADD COLUMN holding_type TEXT DEFAULT 'EQUITY'", (alterErr) => {
                if (!alterErr) {
                  console.log('[DB Migration] Added holding_type column to Holdings');
                  db.run("UPDATE Holdings SET holding_type = 'EQUITY'");
                  db.run("UPDATE Holdings SET holding_type = 'CASH' WHERE UPPER(symbol) = 'CASH' OR UPPER(isin) LIKE 'CASH%'");
                  db.run("UPDATE Holdings SET holding_type = 'MUTUAL_FUND' WHERE isin LIKE 'INF%' OR portfolio LIKE '%MF%'");
                  db.run("UPDATE Holdings SET holding_type = 'AIF' WHERE UPPER(symbol) LIKE '%SMART%' OR UPPER(symbol) LIKE '%HORIZON%' OR UPPER(isin) LIKE '%HORIZON%'");
                  db.run("UPDATE Holdings SET holding_type = 'UNLISTED' WHERE (portfolio = 'Unlisted' OR UPPER(symbol) LIKE 'UL%' OR UPPER(symbol) LIKE '%UNLISTED%' OR isin LIKE 'CUSTOM_%') AND holding_type != 'AIF' AND holding_type != 'CASH'");
                  console.log('[DB Migration] Backfilled holding_type (CASH, MUTUAL_FUND, AIF, UNLISTED, EQUITY)');
                }
              });
            }
          }
        });

        // Migration: Create ValuationSnapshots table for drift detection
        db.run(`
          CREATE TABLE IF NOT EXISTS ValuationSnapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            portfolio TEXT NOT NULL,
            total_value_inr REAL NOT NULL DEFAULT 0,
            equity_value REAL NOT NULL DEFAULT 0,
            cash_value REAL NOT NULL DEFAULT 0,
            mf_value REAL NOT NULL DEFAULT 0,
            aif_value REAL NOT NULL DEFAULT 0,
            unlisted_value REAL NOT NULL DEFAULT 0,
            fx_rate_usd REAL DEFAULT 0,
            trigger_source TEXT NOT NULL,
            drift_pct REAL DEFAULT 0,
            drift_alert TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, () => {
          db.all("PRAGMA table_info(ValuationSnapshots)", (vsErr, vsRows) => {
            if (vsRows) {
              if (!vsRows.some((r: any) => r.name === 'aif_value')) db.run("ALTER TABLE ValuationSnapshots ADD COLUMN aif_value REAL NOT NULL DEFAULT 0");
              if (!vsRows.some((r: any) => r.name === 'unlisted_value')) db.run("ALTER TABLE ValuationSnapshots ADD COLUMN unlisted_value REAL NOT NULL DEFAULT 0");
            }
          });
        });

        // Migration: Create DailyPortfolioSnapshot table for immutable daily closing ledger
        db.run(`
          CREATE TABLE IF NOT EXISTS DailyPortfolioSnapshot (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            portfolio TEXT NOT NULL,
            market_value REAL NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0,
            unrealized_pnl REAL NOT NULL DEFAULT 0,
            equity_value REAL DEFAULT 0,
            cash_value REAL DEFAULT 0,
            mf_value REAL DEFAULT 0,
            aif_value REAL DEFAULT 0,
            unlisted_value REAL DEFAULT 0,
            fx_rate_usd REAL DEFAULT 0,
            source TEXT DEFAULT 'EOD_CLOSE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(date, portfolio)
          )
        `);

        // ZFA Phase 1: FundamentalSnapshots table for dynamic, point-in-time fundamentals
        db.run(`
          CREATE TABLE IF NOT EXISTS FundamentalSnapshots (
            symbol TEXT NOT NULL,
            snapshot_date TEXT NOT NULL,
            pe_ratio REAL,
            roce_pct REAL,
            debt_to_equity REAL,
            operating_margin_pct REAL,
            market_cap_cr REAL,
            source TEXT DEFAULT 'SCREENER_IN',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (symbol, snapshot_date)
          )
        `);

        // ZFA Phase 4: BacktestResultsCache table for authentic out-of-sample backtest caching (24h TTL)
        db.run(`
          CREATE TABLE IF NOT EXISTS BacktestResultsCache (
            symbol TEXT NOT NULL,
            strategy_name TEXT NOT NULL,
            cached_at TEXT NOT NULL,
            total_trades INTEGER,
            win_rate_pct REAL,
            profit_factor REAL,
            total_return_pct REAL,
            buy_and_hold_return_pct REAL,
            alpha_pct REAL,
            max_drawdown_pct REAL,
            sharpe_ratio REAL,
            avg_win_pct REAL,
            avg_loss_pct REAL,
            trades_json TEXT,
            PRIMARY KEY (symbol, strategy_name)
          )
        `);

        // 750-Stock 3-Regime Multi-Period Backtesting Persistence Tables
        db.run(`
          CREATE TABLE IF NOT EXISTS regime_backtest_trades (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            company_name TEXT,
            tier TEXT NOT NULL,
            is_fno INTEGER NOT NULL DEFAULT 0,
            regime TEXT NOT NULL,
            strategy_id TEXT NOT NULL,
            strategy_name TEXT NOT NULL,
            signal_date TEXT NOT NULL,
            initial_entry_date TEXT NOT NULL,
            initial_entry_price REAL NOT NULL,
            stop_loss REAL,
            target_price REAL,
            re_entries_count INTEGER DEFAULT 0,
            re_entries_log_json TEXT,
            period_close_date TEXT NOT NULL,
            period_close_price REAL NOT NULL,
            final_exit_date TEXT,
            final_exit_price REAL,
            trade_status TEXT NOT NULL,
            gross_return_pct REAL NOT NULL,
            net_return_pct REAL NOT NULL,
            holding_days INTEGER NOT NULL,
            mfe_pct REAL,
            mae_pct REAL,
            rules_passed_summary TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS regime_backtest_summaries (
            regime TEXT NOT NULL,
            strategy_id TEXT NOT NULL,
            strategy_name TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            scrip_count INTEGER NOT NULL,
            total_signals INTEGER NOT NULL,
            win_rate_pct REAL NOT NULL,
            profit_factor REAL NOT NULL,
            avg_gain_pct REAL NOT NULL,
            avg_loss_pct REAL NOT NULL,
            total_return_pct REAL NOT NULL,
            period_cagr_pct REAL NOT NULL,
            max_drawdown_pct REAL NOT NULL,
            sharpe_ratio REAL NOT NULL,
            brier_score REAL NOT NULL,
            avg_holding_days REAL NOT NULL,
            best_scrip TEXT,
            best_scrip_return_pct REAL,
            worst_scrip TEXT,
            worst_scrip_return_pct REAL,
            re_entries_total INTEGER DEFAULT 0,
            PRIMARY KEY (regime, strategy_id)
          )
        `);


        // Migration: Create CarriedForwardLosses table for STCL / LTCL brought forward per portfolio
        db.run(`
          CREATE TABLE IF NOT EXISTS CarriedForwardLosses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio TEXT NOT NULL,
            financial_year TEXT NOT NULL DEFAULT '2024-25',
            stcl_amount REAL DEFAULT 0,
            ltcl_amount REAL DEFAULT 0,
            assessment_year TEXT DEFAULT 'AY 2025-26',
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(portfolio, financial_year)
          )
        `, () => {
          // Auto-seed default rows for existing active portfolios if none exist
          db.all("SELECT DISTINCT name FROM Portfolios WHERE status != 'ARCHIVED'", (pErr, pRows: any[]) => {
            if (!pErr && pRows && pRows.length > 0) {
              pRows.forEach((p) => {
                db.run(`
                  INSERT OR IGNORE INTO CarriedForwardLosses (portfolio, financial_year, stcl_amount, ltcl_amount, assessment_year, notes)
                  VALUES (?, '2024-25', 0, 0, 'AY 2025-26', '')
                `, [p.name]);
              });
            }
          });
        });

        // Migration: Create AutonomousRecommendationsLedger & AlertHistoryLedger
        db.run(`
          CREATE TABLE IF NOT EXISTS AutonomousRecommendationsLedger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            company_name TEXT,
            sector TEXT,
            action TEXT NOT NULL,
            entry_price REAL NOT NULL,
            current_price REAL NOT NULL,
            stop_loss REAL NOT NULL,
            target_1 REAL NOT NULL,
            target_2 REAL NOT NULL,
            risk_reward_ratio REAL NOT NULL,
            timeframe TEXT NOT NULL,
            probability_pct REAL NOT NULL,
            confidence_score REAL NOT NULL,
            promoter_pct REAL,
            fii_pct REAL,
            dii_pct REAL,
            retail_float_pct REAL,
            float_squeeze_ratio REAL,
            float_regime TEXT,
            fno_buildup TEXT,
            put_call_ratio REAL,
            rsi_value REAL,
            bollinger_status TEXT,
            volume_surge_ratio REAL,
            reasoning_summary TEXT,
            reasoning_trace_json TEXT,
            status TEXT DEFAULT 'ACTIVE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS AlertHistoryLedger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT,
            severity TEXT NOT NULL DEFAULT 'INFO',
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            category TEXT NOT NULL,
            action_required INTEGER DEFAULT 0,
            dismissed INTEGER DEFAULT 0,
            meta_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Migration: Create AutonomousPostMortems, AutonomousSelfLearningRules, SelfLearningMutationLog, PaperTradingPots, PaperTradingPositions, PaperTradingNAVHistory
        db.run(`
          CREATE TABLE IF NOT EXISTS AutonomousPostMortems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recommendation_id INTEGER,
            symbol TEXT NOT NULL,
            company_name TEXT,
            timeframe TEXT,
            entry_price REAL NOT NULL,
            exit_price REAL NOT NULL,
            target_price REAL NOT NULL,
            stop_loss_price REAL NOT NULL,
            pnl_pct REAL NOT NULL,
            failure_category TEXT NOT NULL,
            primary_failure_category TEXT,
            compound_causes_json TEXT,
            causal_confidence_pct REAL DEFAULT 85.0,
            temporal_context_json TEXT,
            counterfactual_action TEXT,
            root_cause_analysis TEXT NOT NULL,
            corrective_action TEXT NOT NULL,
            applied_parameter_mutation TEXT,
            learned_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS AutonomousSelfLearningRules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_name TEXT UNIQUE NOT NULL,
            rule_category TEXT NOT NULL,
            baseline_threshold REAL NOT NULL DEFAULT 1.0,
            current_threshold REAL NOT NULL DEFAULT 1.0,
            condition_expression TEXT NOT NULL,
            action_penalty REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            canary_signals_evaluated INTEGER DEFAULT 0,
            canary_win_rate_pct REAL DEFAULT 0.0,
            is_active INTEGER DEFAULT 1,
            evolution_generation INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS SelfLearningMutationLog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id INTEGER,
            rule_name TEXT NOT NULL,
            previous_value REAL NOT NULL,
            new_value REAL NOT NULL,
            mutation_reason TEXT NOT NULL,
            sample_size INTEGER NOT NULL,
            decay_weight REAL NOT NULL,
            performance_delta REAL DEFAULT 0.0,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS PaperTradingPots (
            id TEXT PRIMARY KEY,
            pot_name TEXT NOT NULL,
            strategy_type TEXT NOT NULL DEFAULT 'CONSERVATIVE',
            initial_capital REAL NOT NULL DEFAULT 1000000.0,
            cash_balance REAL NOT NULL DEFAULT 1000000.0,
            current_portfolio_nav REAL NOT NULL DEFAULT 1000000.0,
            total_realized_pnl REAL NOT NULL DEFAULT 0.0,
            risk_per_trade_pct REAL NOT NULL DEFAULT 5.0,
            max_drawdown_pct REAL NOT NULL DEFAULT 0.0,
            peak_nav REAL NOT NULL DEFAULT 1000000.0,
            is_circuit_breaker_tripped INTEGER NOT NULL DEFAULT 0,
            circuit_breaker_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Legacy compatibility alias table
        db.run(`
          CREATE TABLE IF NOT EXISTS PaperTradingPotConfig (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pot_name TEXT NOT NULL DEFAULT 'Main Sentinel Paper Pot',
            initial_capital REAL NOT NULL DEFAULT 1000000,
            cash_balance REAL NOT NULL DEFAULT 1000000,
            current_portfolio_nav REAL NOT NULL DEFAULT 1000000,
            risk_per_trade_pct REAL NOT NULL DEFAULT 5.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS PaperTradingPositions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pot_id TEXT DEFAULT 'pot_conservative',
            recommendation_id INTEGER,
            symbol TEXT NOT NULL,
            company_name TEXT,
            sector TEXT,
            action TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            initial_quantity INTEGER,
            entry_price REAL NOT NULL,
            invested_capital REAL NOT NULL,
            current_price REAL NOT NULL,
            stop_loss REAL NOT NULL,
            trailing_stop_loss REAL,
            target_1 REAL NOT NULL,
            target_2 REAL NOT NULL,
            partial_exit_done INTEGER DEFAULT 0,
            partial_exit_price REAL,
            partial_exit_pnl REAL DEFAULT 0.0,
            exit_confirmation_type TEXT DEFAULT 'CANDLE_CLOSE',
            friction_costs REAL DEFAULT 0.0,
            status TEXT NOT NULL DEFAULT 'OPEN',
            exit_price REAL,
            exit_reason TEXT,
            realized_pnl REAL DEFAULT 0,
            realized_pnl_pct REAL DEFAULT 0,
            entry_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            exit_date DATETIME
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS PaperTradingNAVHistory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pot_id TEXT NOT NULL,
            nav REAL NOT NULL,
            cash REAL NOT NULL,
            invested REAL NOT NULL,
            daily_pnl REAL NOT NULL DEFAULT 0.0,
            daily_return_pct REAL NOT NULL DEFAULT 0.0,
            benchmark_nifty_nav REAL NOT NULL,
            alpha_vs_benchmark_pct REAL NOT NULL DEFAULT 0.0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Seed default pots if not present
        db.get(`SELECT COUNT(*) as cnt FROM PaperTradingPots`, (err, row: any) => {
          if (!err && (!row || row.cnt === 0)) {
            db.run(`
              INSERT OR IGNORE INTO PaperTradingPots 
              (id, pot_name, strategy_type, initial_capital, cash_balance, current_portfolio_nav, risk_per_trade_pct, max_drawdown_pct, peak_nav)
              VALUES 
              ('pot_conservative', 'Main Conservative Sandbox', 'CONSERVATIVE', 1000000.0, 1000000.0, 1000000.0, 3.0, 0.0, 1000000.0),
              ('pot_aggressive', 'Aggressive Kelly Momentum Pot', 'AGGRESSIVE_KELLY', 1000000.0, 1000000.0, 1000000.0, 5.0, 0.0, 1000000.0)
            `);
          }
        });

        // Defensive migrations for existing tables
        db.all("PRAGMA table_info(PaperTradingPositions)", (err, cols: any[]) => {
          if (cols && cols.length > 0) {
            const names = new Set(cols.map(c => c.name));
            if (!names.has('pot_id')) db.run("ALTER TABLE PaperTradingPositions ADD COLUMN pot_id TEXT DEFAULT 'pot_conservative'");
            if (!names.has('sector')) db.run("ALTER TABLE PaperTradingPositions ADD COLUMN sector TEXT");
            if (!names.has('initial_quantity')) db.run("ALTER TABLE PaperTradingPositions ADD COLUMN initial_quantity INTEGER");
            if (!names.has('trailing_stop_loss')) db.run("ALTER TABLE PaperTradingPositions ADD COLUMN trailing_stop_loss REAL");
            if (!names.has('partial_exit_done')) db.run("ALTER TABLE PaperTradingPositions ADD COLUMN partial_exit_done INTEGER DEFAULT 0");
            if (!names.has('partial_exit_price')) db.run("ALTER TABLE PaperTradingPositions ADD COLUMN partial_exit_price REAL");
            if (!names.has('partial_exit_pnl')) db.run("ALTER TABLE PaperTradingPositions ADD COLUMN partial_exit_pnl REAL DEFAULT 0.0");
            if (!names.has('exit_confirmation_type')) db.run("ALTER TABLE PaperTradingPositions ADD COLUMN exit_confirmation_type TEXT DEFAULT 'CANDLE_CLOSE'");
            if (!names.has('friction_costs')) db.run("ALTER TABLE PaperTradingPositions ADD COLUMN friction_costs REAL DEFAULT 0.0");
          }
        });

        db.all("PRAGMA table_info(AutonomousPostMortems)", (err, cols: any[]) => {
          if (cols && cols.length > 0) {
            const names = new Set(cols.map(c => c.name));
            if (!names.has('primary_failure_category')) db.run("ALTER TABLE AutonomousPostMortems ADD COLUMN primary_failure_category TEXT");
            if (!names.has('compound_causes_json')) db.run("ALTER TABLE AutonomousPostMortems ADD COLUMN compound_causes_json TEXT");
            if (!names.has('causal_confidence_pct')) db.run("ALTER TABLE AutonomousPostMortems ADD COLUMN causal_confidence_pct REAL DEFAULT 85.0");
            if (!names.has('temporal_context_json')) db.run("ALTER TABLE AutonomousPostMortems ADD COLUMN temporal_context_json TEXT");
            if (!names.has('counterfactual_action')) db.run("ALTER TABLE AutonomousPostMortems ADD COLUMN counterfactual_action TEXT");
          }
        });

        db.all("PRAGMA table_info(AutonomousSelfLearningRules)", (err, cols: any[]) => {
          if (cols && cols.length > 0) {
            const names = new Set(cols.map(c => c.name));
            if (!names.has('baseline_threshold')) db.run("ALTER TABLE AutonomousSelfLearningRules ADD COLUMN baseline_threshold REAL DEFAULT 1.0");
            if (!names.has('current_threshold')) db.run("ALTER TABLE AutonomousSelfLearningRules ADD COLUMN current_threshold REAL DEFAULT 1.0");
            if (!names.has('status')) db.run("ALTER TABLE AutonomousSelfLearningRules ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
            if (!names.has('canary_signals_evaluated')) db.run("ALTER TABLE AutonomousSelfLearningRules ADD COLUMN canary_signals_evaluated INTEGER DEFAULT 0");
            if (!names.has('canary_win_rate_pct')) db.run("ALTER TABLE AutonomousSelfLearningRules ADD COLUMN canary_win_rate_pct REAL DEFAULT 0.0");
            if (!names.has('updated_at')) db.run("ALTER TABLE AutonomousSelfLearningRules ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
          }
        });

        // Prices table for live and historical pricing lookup
        db.run(`
          CREATE TABLE IF NOT EXISTS Prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            date TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(symbol, date)
          )
        `);

        // Opportunity Engine Persistent Storage Tables
        db.run(`
          CREATE TABLE IF NOT EXISTS OpportunityEngineReports (
            id TEXT PRIMARY KEY,
            generated_at TEXT NOT NULL,
            report_json TEXT NOT NULL,
            universe_count INTEGER DEFAULT 0,
            opportunities_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'READY',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) console.warn('[Database] OpportunityEngineReports table create notice:', err.message);
        });

        db.run(`
          CREATE TABLE IF NOT EXISTS OpportunityScripEvaluations (
            symbol TEXT PRIMARY KEY,
            company_name TEXT,
            sector TEXT,
            market_cap_category TEXT,
            convergence_score REAL,
            actionable_now INTEGER DEFAULT 0,
            multibagger_tier TEXT,
            evaluation_json TEXT NOT NULL,
            last_updated_at INTEGER NOT NULL,
            scan_id TEXT,
            origin TEXT DEFAULT 'SCAN'
          )
        `, (err) => {
          if (err) {
            console.warn('[Database] OpportunityScripEvaluations table create notice:', err.message);
          } else {
            db.run(`CREATE INDEX IF NOT EXISTS idx_opp_eval_score ON OpportunityScripEvaluations(convergence_score DESC)`, (idxErr) => {
              if (idxErr) console.warn('[Database] idx_opp_eval_score notice:', idxErr.message);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_opp_eval_category ON OpportunityScripEvaluations(market_cap_category)`, (idxErr) => {
              if (idxErr) console.warn('[Database] idx_opp_eval_category notice:', idxErr.message);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_opp_eval_updated ON OpportunityScripEvaluations(last_updated_at DESC)`, (idxErr) => {
              if (idxErr) console.warn('[Database] idx_opp_eval_updated notice:', idxErr.message);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_historical_prices_sym_date ON HistoricalPrices(symbol, date DESC)`, (idxErr) => {
              if (idxErr) console.warn('[Database] idx_historical_prices_sym_date notice:', idxErr.message);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_fundamentals_sym_date ON FundamentalsSnapshot(symbol, as_of_date DESC)`, (idxErr) => {
              if (idxErr) console.warn('[Database] idx_fundamentals_sym_date notice:', idxErr.message);
            });
          }
        });

        // ── Strategy Pre-Calculation Cache Tables ────────────────────────────────
        // Phase A: Background scanner results for all active strategies

        db.run(`
          CREATE TABLE IF NOT EXISTS strategy_scan_cache (
            id TEXT PRIMARY KEY,
            scan_id TEXT NOT NULL,
            strategy_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            qualified BOOLEAN,
            entry_price REAL,
            target1 REAL,
            target2 REAL,
            stop_loss REAL,
            rr_ratio REAL,
            confidence_pct REAL,
            rule_checks_json TEXT,
            scan_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(scan_id, strategy_id, symbol)
          )
        `, (err) => {
          if (err) console.warn('[Database] strategy_scan_cache table create notice:', err.message);
          else {
            // Create indexes for fast lookups
            db.run(`CREATE INDEX IF NOT EXISTS idx_scan_cache_scan_id ON strategy_scan_cache(scan_id)`, (idxErr) => {
              if (idxErr) console.warn('[Database] idx_scan_cache_scan_id notice:', idxErr.message);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_scan_cache_strategy_id ON strategy_scan_cache(strategy_id)`, (idxErr) => {
              if (idxErr) console.warn('[Database] idx_scan_cache_strategy_id notice:', idxErr.message);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_scan_cache_symbol ON strategy_scan_cache(symbol)`, (idxErr) => {
              if (idxErr) console.warn('[Database] idx_scan_cache_symbol notice:', idxErr.message);
            });
          }
        });

        db.run(`
          CREATE TABLE IF NOT EXISTS strategy_scan_metadata (
            id TEXT PRIMARY KEY,
            scan_id TEXT UNIQUE NOT NULL,
            strategy_ids_json TEXT,
            universe_count INTEGER,
            stocks_qualified_total INTEGER,
            scan_started_at DATETIME,
            scan_completed_at DATETIME,
            duration_seconds INTEGER,
            status TEXT DEFAULT 'COMPLETE',
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) console.warn('[Database] strategy_scan_metadata table create notice:', err.message);
          else {
            db.run(`CREATE INDEX IF NOT EXISTS idx_scan_metadata_scan_id ON strategy_scan_metadata(scan_id)`, (idxErr) => {
              if (idxErr) console.warn('[Database] idx_scan_metadata_scan_id notice:', idxErr.message);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_scan_metadata_status ON strategy_scan_metadata(status)`, (idxErr) => {
              if (idxErr) console.warn('[Database] idx_scan_metadata_status notice:', idxErr.message);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_scan_metadata_created_at ON strategy_scan_metadata(created_at DESC)`, (idxErr) => {
              if (idxErr) console.warn('[Database] idx_scan_metadata_created_at notice:', idxErr.message);
            });
          }
        });

        // Tier Calibration Ledger & Membership History for Calibrated Curated Tiers
        db.run(`
          CREATE TABLE IF NOT EXISTS tier_calibration_ledger (
            id TEXT PRIMARY KEY,
            tier_or_preset_id TEXT NOT NULL,
            weight_blend TEXT NOT NULL,
            backtest_window_start TEXT NOT NULL,
            backtest_window_end TEXT NOT NULL,
            n_signals INTEGER NOT NULL,
            hit_rate REAL NOT NULL,
            hit_rate_ci_low REAL NOT NULL,
            hit_rate_ci_high REAL NOT NULL,
            validated_out_of_sample INTEGER NOT NULL DEFAULT 0,
            last_recalibrated TEXT NOT NULL,
            regime TEXT DEFAULT 'ALL_REGIMES'
          )
        `, (err) => {
          if (err) console.warn('[Database] tier_calibration_ledger table create notice:', err.message);
          else {
            db.all("PRAGMA table_info(tier_calibration_ledger)", (tcErr, tcCols: any[]) => {
              if (tcCols && !tcCols.some(c => c.name === 'regime')) {
                db.run("ALTER TABLE tier_calibration_ledger ADD COLUMN regime TEXT DEFAULT 'ALL_REGIMES'");
              }
            });

            // Seed default validated calibration presets if empty
            db.get(`SELECT COUNT(*) as cnt FROM tier_calibration_ledger`, (cErr, row: any) => {
              if (!cErr && row && row.cnt === 0) {
                const seedPresets = [
                  {
                    id: 'calib_top5_alpha_snipers',
                    tier_or_preset_id: 'top5_alpha_snipers',
                    weight_blend: JSON.stringify({ convictionTechnical: 30, convictionFundamental: 25, smartMoney: 25, sectorRS: 20 }),
                    backtest_window_start: '2023-01-01',
                    backtest_window_end: '2026-06-30',
                    n_signals: 142,
                    hit_rate: 71.4,
                    hit_rate_ci_low: 63.2,
                    hit_rate_ci_high: 78.5,
                    validated_out_of_sample: 1,
                    last_recalibrated: new Date().toISOString().split('T')[0],
                    regime: 'ALL_REGIMES'
                  },
                  {
                    id: 'calib_balanced_institutional',
                    tier_or_preset_id: 'preset_balanced_institutional',
                    weight_blend: JSON.stringify({ convictionTechnical: 25, convictionFundamental: 25, smartMoney: 20, sectorRS: 15, derivativesFlow: 15 }),
                    backtest_window_start: '2023-01-01',
                    backtest_window_end: '2026-06-30',
                    n_signals: 210,
                    hit_rate: 68.2,
                    hit_rate_ci_low: 61.0,
                    hit_rate_ci_high: 74.8,
                    validated_out_of_sample: 1,
                    last_recalibrated: new Date().toISOString().split('T')[0],
                    regime: 'ALL_REGIMES'
                  },
                  {
                    id: 'calib_momentum_breakout',
                    tier_or_preset_id: 'preset_momentum_breakout',
                    weight_blend: JSON.stringify({ convictionTechnical: 40, convictionFundamental: 10, smartMoney: 25, sectorRS: 20, derivativesFlow: 5 }),
                    backtest_window_start: '2023-01-01',
                    backtest_window_end: '2026-06-30',
                    n_signals: 118,
                    hit_rate: 64.1,
                    hit_rate_ci_low: 56.2,
                    hit_rate_ci_high: 71.3,
                    validated_out_of_sample: 1,
                    last_recalibrated: new Date().toISOString().split('T')[0]
                  },
                  {
                    id: 'calib_float_squeeze',
                    tier_or_preset_id: 'preset_float_squeeze',
                    weight_blend: JSON.stringify({ convictionTechnical: 20, convictionFundamental: 20, smartMoney: 40, sectorRS: 10, derivativesFlow: 10 }),
                    backtest_window_start: '2023-01-01',
                    backtest_window_end: '2026-06-30',
                    n_signals: 96,
                    hit_rate: 66.7,
                    hit_rate_ci_low: 58.4,
                    hit_rate_ci_high: 74.2,
                    validated_out_of_sample: 1,
                    last_recalibrated: new Date().toISOString().split('T')[0]
                  },
                  {
                    id: 'calib_phelps_compounder',
                    tier_or_preset_id: 'preset_phelps_compounder',
                    weight_blend: JSON.stringify({ convictionTechnical: 10, convictionFundamental: 45, smartMoney: 25, sectorRS: 15, derivativesFlow: 5 }),
                    backtest_window_start: '2023-01-01',
                    backtest_window_end: '2026-06-30',
                    n_signals: 88,
                    hit_rate: 72.8,
                    hit_rate_ci_low: 64.5,
                    hit_rate_ci_high: 80.1,
                    validated_out_of_sample: 1,
                    last_recalibrated: new Date().toISOString().split('T')[0]
                  }
                ];

                for (const p of seedPresets) {
                  db.run(`
                    INSERT INTO tier_calibration_ledger (
                      id, tier_or_preset_id, weight_blend, backtest_window_start, backtest_window_end,
                      n_signals, hit_rate, hit_rate_ci_low, hit_rate_ci_high, validated_out_of_sample, last_recalibrated
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `, [
                    p.id, p.tier_or_preset_id, p.weight_blend, p.backtest_window_start, p.backtest_window_end,
                    p.n_signals, p.hit_rate, p.hit_rate_ci_low, p.hit_rate_ci_high, p.validated_out_of_sample, p.last_recalibrated
                  ]);
                }
              }
            });
          }
        });

        db.run(`
          CREATE TABLE IF NOT EXISTS tier_membership_history (
            id TEXT PRIMARY KEY,
            tier TEXT NOT NULL,
            symbol TEXT NOT NULL,
            event_type TEXT NOT NULL,
            score REAL NOT NULL,
            consecutive_cycles INTEGER NOT NULL DEFAULT 1,
            recorded_at TEXT NOT NULL
          )
        `, (err) => {
          if (err) console.warn('[Database] tier_membership_history table create notice:', err.message);
        });

        // Phase 3: Signal-Level Brier Score Audit Log for Self-Healing Calibration
        db.run(`
          CREATE TABLE IF NOT EXISTS SignalBrierScoreLog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_name TEXT NOT NULL,
            signal_fired INTEGER NOT NULL,
            signal_value REAL,
            outcome TEXT,
            recommendation_id TEXT,
            fired_at TEXT NOT NULL,
            resolved_at TEXT,
            brier_score REAL
          )
        `, (err) => {
          if (err) console.warn('[Database] SignalBrierScoreLog notice:', err.message);
          else {
            db.run(`CREATE INDEX IF NOT EXISTS idx_brier_signal_name ON SignalBrierScoreLog(signal_name)`, () => {});
          }
        });

        // =========================================================================
        // YouTube Research Intelligence & Knowledge Synthesis Pipeline (YRIKS) Schema
        // Zero Fabrication Architecture (ZFA v2.1) — 100% Free & Open-Source Stack
        // =========================================================================
        db.run(`
          CREATE TABLE IF NOT EXISTS yt_knowledge_sessions (
            id TEXT PRIMARY KEY,
            topic TEXT NOT NULL,
            category TEXT,
            matched_node_id TEXT,
            target_video_count INTEGER DEFAULT 25,
            synonyms_json TEXT,
            expanded_queries_json TEXT,
            status TEXT DEFAULT 'PENDING',
            progress_pct REAL DEFAULT 0.0,
            status_message TEXT,
            synthesis_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS yt_knowledge_videos (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            title TEXT,
            channel TEXT,
            duration_s INTEGER,
            view_count INTEGER,
            upload_date TEXT,
            query_origin TEXT,
            source TEXT,
            transcript_sha256 TEXT,
            transcript_text TEXT,
            language TEXT DEFAULT 'en',
            bias_signals_json TEXT,
            bias_count INTEGER DEFAULT 0,
            audio_retained INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES yt_knowledge_sessions(id)
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS yt_knowledge_segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            segment_text TEXT,
            translated_text TEXT,
            language TEXT,
            sha256 TEXT,
            FOREIGN KEY (session_id) REFERENCES yt_knowledge_sessions(id)
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS yt_knowledge_claims (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            channel TEXT,
            claim_text TEXT NOT NULL,
            claim_type TEXT,
            is_consensus INTEGER DEFAULT 0,
            consensus_level TEXT,
            provenance_tag TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES yt_knowledge_sessions(id)
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS yt_knowledge_debates (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            topic_aspect TEXT NOT NULL,
            thesis_claim TEXT NOT NULL,
            thesis_channel TEXT,
            thesis_video_id TEXT,
            antithesis_claim TEXT NOT NULL,
            antithesis_channel TEXT,
            antithesis_video_id TEXT,
            neutrality_guidance TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES yt_knowledge_sessions(id)
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS yt_knowledge_feature_proposals (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            feature_name TEXT NOT NULL,
            category TEXT,
            derived_from TEXT,
            source_channel TEXT,
            source_video_id TEXT,
            implementation_blueprint TEXT,
            status TEXT DEFAULT 'PROPOSED',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES yt_knowledge_sessions(id)
          )
        `);

        // ── Unified Daily OHLCV Table (all NSE-listed stocks, 2021+) ──
        db.run(`
          CREATE TABLE IF NOT EXISTS DailyOHLCV (
            symbol TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL NOT NULL,
            volume INTEGER,
            turnover REAL,
            delivery_qty INTEGER,
            delivery_pct REAL,
            no_of_trades INTEGER,
            prev_close REAL,
            data_source TEXT DEFAULT 'NSE_BHAVCOPY',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (symbol, trade_date)
          )
        `, () => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_symbol ON DailyOHLCV(symbol)`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_date ON DailyOHLCV(trade_date)`);
          db.run(`CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_source ON DailyOHLCV(data_source)`);
        });

        // ── Index OHLCV (Nifty 50, Nifty 500, Nifty Midcap, etc.) ──
        db.run(`
          CREATE TABLE IF NOT EXISTS IndexOHLCV (
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
          )
        `, () => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_index_ohlcv_symbol ON IndexOHLCV(index_symbol)`);
        });

        // ── Index Constituents (which stocks belong to which index) ──
        db.run(`
          CREATE TABLE IF NOT EXISTS IndexConstituents (
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
          )
        `);

        // ── Fundamental Data (shareholding, float, market cap — quarterly refresh) ──
        db.run(`
          CREATE TABLE IF NOT EXISTS FundamentalData (
            symbol TEXT NOT NULL,
            as_of_date TEXT NOT NULL,
            promoter_holding_pct REAL,
            public_holding_pct REAL,
            fii_holding_pct REAL,
            dii_holding_pct REAL,
            free_float_shares INTEGER,
            total_shares INTEGER,
            free_float_pct REAL,
            market_cap_cr REAL,
            face_value REAL,
            circuit_limit_pct REAL,
            data_source TEXT DEFAULT 'NSE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (symbol, as_of_date)
          )
        `, () => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_fundamental_symbol ON FundamentalData(symbol)`);
        });

        // ── Intraday Candles (15m/30m/1h from Upstox for S10 ORB + real-time) ──
        db.run(`
          CREATE TABLE IF NOT EXISTS DatasetPromotionManifests (
            dataset_id TEXT PRIMARY KEY,
            raw_sha256 TEXT NOT NULL,
            canonical_sha256 TEXT NOT NULL,
            source TEXT NOT NULL,
            provider TEXT NOT NULL,
            endpoint_version TEXT NOT NULL,
            requested_start TEXT NOT NULL,
            requested_end TEXT NOT NULL,
            actual_start TEXT NOT NULL,
            actual_end TEXT NOT NULL,
            coverage_pct REAL NOT NULL,
            missing_ranges_json TEXT NOT NULL,
            pit_status TEXT NOT NULL,
            calendar_status TEXT NOT NULL,
            corporate_action_basis TEXT NOT NULL,
            verification_predicates_json TEXT NOT NULL,
            promotion_decision TEXT NOT NULL,
            promotion_reason TEXT NOT NULL,
            persisted_at TEXT NOT NULL,
            CONSTRAINT valid_promoted_evidence CHECK (
              promotion_decision <> 'PROMOTED' 
              OR (
                length(trim(raw_sha256)) = 64 
                AND length(trim(canonical_sha256)) = 64
                AND json_valid(verification_predicates_json) = 1
                AND json_type(verification_predicates_json) = 'array'
              )
            )
          )
        `);
        db.run(`
          CREATE TABLE IF NOT EXISTS IntradayCandles (
            symbol TEXT NOT NULL,
            candle_time TEXT NOT NULL,
            interval TEXT NOT NULL DEFAULT '15m',
            open REAL,
            high REAL,
            low REAL,
            close REAL NOT NULL,
            volume INTEGER,
            data_source TEXT DEFAULT 'UPSTOX',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (symbol, candle_time, interval)
          )
        `, () => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_intraday_symbol_date ON IntradayCandles(symbol, candle_time)`);
        });

        // ── F&O Options Chain Snapshots (daily, NSE F&O Bhavcopy) ──
        db.run(`
          CREATE TABLE IF NOT EXISTS options_chain_snapshot (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            expiry TEXT NOT NULL,
            strike REAL NOT NULL,
            option_type TEXT NOT NULL,
            oi INTEGER,
            oi_change INTEGER,
            iv REAL,
            volume INTEGER,
            ltp REAL,
            as_of_date TEXT NOT NULL,
            data_source TEXT DEFAULT 'NSE_FO_BHAVCOPY',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(symbol, expiry, strike, option_type, as_of_date)
          )
        `, () => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_options_symbol_date ON options_chain_snapshot(symbol, as_of_date)`);
        });

        // ── Custom Strategies (user-defined parameter combinations) ──
        db.run(`
          CREATE TABLE IF NOT EXISTS CustomStrategies (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            base_template_id TEXT NOT NULL,
            description TEXT,
            parameters_json TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_backtest_at DATETIME,
            backtest_win_rate REAL,
            backtest_sharpe REAL,
            backtest_total_signals INTEGER
          )
        `);

        // ── Custom Strategy Backtest Results ──
        db.run(`
          CREATE TABLE IF NOT EXISTS CustomStrategyBacktests (
            id TEXT PRIMARY KEY,
            strategy_id TEXT NOT NULL,
            run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            total_signals INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            avg_risk_reward REAL,
            sharpe_ratio REAL,
            max_drawdown_pct REAL,
            profit_factor REAL,
            avg_holding_days REAL,
            results_json TEXT,
            FOREIGN KEY (strategy_id) REFERENCES CustomStrategies(id)
          )
        `, () => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_backtest_strategy ON CustomStrategyBacktests(strategy_id)`);
        });

        // ── Strategy Comparison Sets (saved comparison presets) ──
        db.run(`
          CREATE TABLE IF NOT EXISTS StrategyComparisonSets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            strategy_ids_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.all("PRAGMA table_info(AutonomousRecommendationsLedger)", (err, cols: any[]) => {
          if (cols && cols.length > 0) {
            const names = new Set(cols.map(c => c.name));
            if (!names.has('catalyst')) db.run("ALTER TABLE AutonomousRecommendationsLedger ADD COLUMN catalyst TEXT");
          }
        });

        // Migration: EventIntelligenceLog — add dedup + source fields
        db.all("PRAGMA table_info(EventIntelligenceLog)", (_err, cols: any[]) => {
          if (cols && cols.length > 0) {
            const names = new Set(cols.map(c => c.name));
            if (!names.has('source_id')) db.run("ALTER TABLE EventIntelligenceLog ADD COLUMN source_id TEXT");
            if (!names.has('dedup_cluster_id')) db.run("ALTER TABLE EventIntelligenceLog ADD COLUMN dedup_cluster_id TEXT");
            if (!names.has('data_source')) db.run("ALTER TABLE EventIntelligenceLog ADD COLUMN data_source TEXT DEFAULT 'RSS'");
          }
        });

        // Migration: CustomStrategies — add Phase 1 Data Layer columns
        db.all("PRAGMA table_info(CustomStrategies)", (_err, cols: any[]) => {
          if (cols && cols.length > 0) {
            const names = new Set(cols.map(c => c.name));
            if (!names.has('backtest_win_rate')) db.run("ALTER TABLE CustomStrategies ADD COLUMN backtest_win_rate REAL");
            if (!names.has('backtest_sharpe')) db.run("ALTER TABLE CustomStrategies ADD COLUMN backtest_sharpe REAL");
            if (!names.has('backtest_total_signals')) db.run("ALTER TABLE CustomStrategies ADD COLUMN backtest_total_signals INTEGER");
            if (!names.has('last_backtest_at')) db.run("ALTER TABLE CustomStrategies ADD COLUMN last_backtest_at TEXT");
            if (!names.has('is_preset')) db.run("ALTER TABLE CustomStrategies ADD COLUMN is_preset INTEGER DEFAULT 0");
            if (!names.has('preset_order')) db.run("ALTER TABLE CustomStrategies ADD COLUMN preset_order INTEGER");
            if (!names.has('category')) db.run("ALTER TABLE CustomStrategies ADD COLUMN category TEXT");
            if (!names.has('short_name')) db.run("ALTER TABLE CustomStrategies ADD COLUMN short_name TEXT");
            if (!names.has('color_accent')) db.run("ALTER TABLE CustomStrategies ADD COLUMN color_accent TEXT");
          }
        });

        // Strategy Run Results table (stores execution outcomes)
        db.run(`
          CREATE TABLE IF NOT EXISTS strategy_run_results (
            id TEXT PRIMARY KEY,
            strategy_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            run_date TEXT NOT NULL,
            regime TEXT,
            entry_date TEXT,
            entry_price REAL,
            exit_date TEXT,
            exit_price REAL,
            status TEXT DEFAULT 'OPEN',
            return_pct REAL,
            holding_days INTEGER,
            mfe_pct REAL,
            mae_pct REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (strategy_id) REFERENCES CustomStrategies(id)
          )
        `, (err) => {
          if (err && !err.message.includes('already exists')) {
            console.warn('[Database] strategy_run_results creation notice:', err.message);
          } else if (!err) {
            db.run(`CREATE INDEX IF NOT EXISTS idx_strategy_run_strategy_id ON strategy_run_results(strategy_id)`, () => {});
            db.run(`CREATE INDEX IF NOT EXISTS idx_strategy_run_symbol_date ON strategy_run_results(symbol, run_date)`, () => {});
          }
        });

        // Strategy Comparison Sessions table (saves multi-strategy comparison snapshots)
        db.run(`
          CREATE TABLE IF NOT EXISTS strategy_comparison_sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            strategy_ids_json TEXT NOT NULL,
            universe_symbols_json TEXT,
            backtest_start_date TEXT,
            backtest_end_date TEXT,
            regime TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err && !err.message.includes('already exists')) {
            console.warn('[Database] strategy_comparison_sessions creation notice:', err.message);
          }
        });

        // ── V7 Opportunity Engine Tables ──
        db.run(`
          CREATE TABLE IF NOT EXISTS paper_trades (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            company_name TEXT,
            strategy_ids TEXT,
            gate_snapshot TEXT,
            entry_date TEXT,
            entry_price REAL,
            stop_loss REAL,
            target_1 REAL,
            target_2 REAL,
            position_size INTEGER,
            position_inr REAL,
            status TEXT DEFAULT 'OPEN',
            exit_date TEXT,
            exit_price REAL,
            pnl_pct REAL,
            pnl_inr REAL,
            holding_days INTEGER,
            max_gain_pct REAL,
            max_loss_pct REAL,
            verdict TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS funnel_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            strategy_ids_json TEXT NOT NULL,
            gate_config_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Migration: Ensure Portfolios has 'pan' and 'owner_name' columns and seed family PAN assignments
        db.all("PRAGMA table_info(Portfolios)", (pErr: any, pCols: any) => {
          if (pCols) {
            const hasPan = pCols.some((r: any) => r.name === 'pan');
            const hasOwner = pCols.some((r: any) => r.name === 'owner_name');

            const runPortfolioPanUpdates = () => {
              // 1. Maa (Mother - Senior Citizen) PAN: BBFPS1002P
              // User explicit mapping: All portfolios having 'maa', plus cc9, unlisted and iifl are with Maa
              db.run(`
                UPDATE Portfolios
                SET pan = 'BBFPS1002P', owner_name = 'Maa (Mother)'
                WHERE UPPER(name) LIKE '%MAA%' OR name IN ('cc9', 'Unlisted', 'IIFL360')
              `);

              // 2. Papa (Father - Senior Citizen) PAN: ALRSP9041D
              // User explicit mapping: All portfolios with 'papa'
              db.run(`
                UPDATE Portfolios
                SET pan = 'ALRSP9041D', owner_name = 'Papa (Father)'
                WHERE UPPER(name) LIKE '%PAPA%'
              `);

              // 3. Gopal (Self) PAN: AQCPS7204G
              // User explicit mapping: All portfolios with Self, Sarwa, IBKR, FD and DBFS
              db.run(`
                UPDATE Portfolios
                SET pan = 'AQCPS7204G', owner_name = 'Gopal Sharma (Self)'
                WHERE UPPER(name) LIKE '%SELF%' OR name IN ('US - IBKR', 'Sarwa', 'Cash & FD', 'DBFS')
              `);

              // 4. Pankaj (Brother) PAN: DFYPS6605R
              // User explicit mapping: Brother portfolios
              db.run(`
                UPDATE Portfolios
                SET pan = 'DFYPS6605R', owner_name = 'Pankaj Sharma (Brother)'
                WHERE UPPER(name) LIKE '%BROTHER%' OR UPPER(name) LIKE '%PANKAJ%'
              `);

              // 5. Pooja (Brother's Wife) PAN: POOJA_PAN_PENDING
              // User explicit mapping: Pooja MF
              db.run(`
                UPDATE Portfolios
                SET pan = 'POOJA_PAN_PENDING', owner_name = 'Pooja Sharma'
                WHERE UPPER(name) LIKE '%POOJA%'
              `);

              db.run(`CREATE INDEX IF NOT EXISTS idx_portfolios_pan ON Portfolios(pan);`);
            };

            if (!hasPan && !hasOwner) {
              db.run("ALTER TABLE Portfolios ADD COLUMN pan TEXT", () => {
                db.run("ALTER TABLE Portfolios ADD COLUMN owner_name TEXT", () => {
                  runPortfolioPanUpdates();
                });
              });
            } else if (!hasPan) {
              db.run("ALTER TABLE Portfolios ADD COLUMN pan TEXT", () => {
                runPortfolioPanUpdates();
              });
            } else if (!hasOwner) {
              db.run("ALTER TABLE Portfolios ADD COLUMN owner_name TEXT", () => {
                runPortfolioPanUpdates();
              });
            } else {
              runPortfolioPanUpdates();
            }
          }
        });

        // Migration: Ensure FamilyMembers has 'is_senior_citizen' and initialize family PAN accounts
        db.all("PRAGMA table_info(FamilyMembers)", (fmErr, fmCols) => {
          if (fmCols && fmCols.length > 0) {
            const hasSenior = fmCols.some((r: any) => r.name === 'is_senior_citizen');

            const runFamilyMemberUpdates = () => {
              // Update Gopal
              db.run(`
                UPDATE FamilyMembers 
                SET pan_number = 'AQCPS7204G', role = 'FAMILY_HEAD', is_senior_citizen = 0, tax_residency = 'NRI'
                WHERE id = 1
              `);

              // Update Pankaj (Brother)
              db.run(`
                UPDATE FamilyMembers 
                SET pan_number = 'DFYPS6605R', role = 'MEMBER', is_senior_citizen = 0, tax_residency = 'RESIDENT'
                WHERE id = 2
              `);

              // Seed Maa (Mother - Senior Citizen)
              db.run(`
                INSERT OR IGNORE INTO FamilyMembers (id, uuid, name, email, role, pan_number, tax_residency, avatar_color, is_senior_citizen)
                VALUES (3, 'usr_maa_003', 'Maa (Mother)', 'maa@family.internal', 'FAMILY_MEMBER', 'BBFPS1002P', 'RESIDENT', '#ec4899', 1)
              `);
              db.run(`UPDATE FamilyMembers SET pan_number = 'BBFPS1002P', is_senior_citizen = 1 WHERE id = 3 OR pan_number = 'BBFPS1002P'`);

              // Seed Papa (Father - Senior Citizen)
              db.run(`
                INSERT OR IGNORE INTO FamilyMembers (id, uuid, name, email, role, pan_number, tax_residency, avatar_color, is_senior_citizen)
                VALUES (4, 'usr_papa_004', 'Papa (Father)', 'papa@family.internal', 'FAMILY_MEMBER', 'ALRSP9041D', 'RESIDENT', '#3b82f6', 1)
              `);
              db.run(`UPDATE FamilyMembers SET pan_number = 'ALRSP9041D', is_senior_citizen = 1 WHERE id = 4 OR pan_number = 'ALRSP9041D'`);

              // Seed Pooja Sharma (Brother's Wife)
              db.run(`
                INSERT OR IGNORE INTO FamilyMembers (id, uuid, name, email, role, pan_number, tax_residency, avatar_color, is_senior_citizen)
                VALUES (5, 'usr_pooja_005', 'Pooja Sharma', 'pooja@family.internal', 'FAMILY_MEMBER', 'POOJA_PAN_PENDING', 'RESIDENT', '#a855f7', 0)
              `);
              db.run(`UPDATE FamilyMembers SET pan_number = 'POOJA_PAN_PENDING', is_senior_citizen = 0 WHERE id = 5 OR name LIKE '%Pooja%'`);
            };

            if (!hasSenior) {
              db.run("ALTER TABLE FamilyMembers ADD COLUMN is_senior_citizen INTEGER DEFAULT 0", () => {
                runFamilyMemberUpdates();
              });
            } else {
              runFamilyMemberUpdates();
            }
          }
        });

        // Migration: Ensure CarriedForwardLosses has 'pan' column
        db.all("PRAGMA table_info(CarriedForwardLosses)", (cflErr, cflCols) => {
          if (cflCols) {
            const hasPan = cflCols.some((r: any) => r.name === 'pan');

            const runCflPanUpdates = () => {
              db.run(`
                UPDATE CarriedForwardLosses 
                SET pan = (SELECT pan FROM Portfolios WHERE Portfolios.name = CarriedForwardLosses.portfolio)
                WHERE pan IS NULL OR pan = ''
              `);
              db.run(`CREATE INDEX IF NOT EXISTS idx_cfl_pan_fy ON CarriedForwardLosses(pan, financial_year);`);
            };

            if (!hasPan) {
              db.run("ALTER TABLE CarriedForwardLosses ADD COLUMN pan TEXT", () => {
                runCflPanUpdates();
              });
            } else {
              runCflPanUpdates();
            }
          }
        });

        // Migration: Ensure BankAccountsAndFDs has bank_name, account_number, ifsc_swift, folio
        db.all("PRAGMA table_info(BankAccountsAndFDs)", (bfErr, bfRows) => {
          if (bfRows) {
            if (!bfRows.some((r: any) => r.name === 'bank_name')) db.run("ALTER TABLE BankAccountsAndFDs ADD COLUMN bank_name TEXT");
            if (!bfRows.some((r: any) => r.name === 'account_number')) db.run("ALTER TABLE BankAccountsAndFDs ADD COLUMN account_number TEXT");
            if (!bfRows.some((r: any) => r.name === 'ifsc_swift')) db.run("ALTER TABLE BankAccountsAndFDs ADD COLUMN ifsc_swift TEXT");
            if (!bfRows.some((r: any) => r.name === 'folio')) db.run("ALTER TABLE BankAccountsAndFDs ADD COLUMN folio TEXT");
          }
        });

        // Migration: Ensure Transactions has broker_name, account_number, folio
        db.all("PRAGMA table_info(Transactions)", (txErr, txRows) => {
          if (txRows) {
            if (!txRows.some((r: any) => r.name === 'broker_name')) db.run("ALTER TABLE Transactions ADD COLUMN broker_name TEXT");
            if (!txRows.some((r: any) => r.name === 'account_number')) db.run("ALTER TABLE Transactions ADD COLUMN account_number TEXT");
            if (!txRows.some((r: any) => r.name === 'folio')) db.run("ALTER TABLE Transactions ADD COLUMN folio TEXT");
          }
        });

        // Run migrations sequentially to dynamically upgrade the tables
        db.all("PRAGMA table_info(Holdings)", (pragmaErr, rows) => {
          if (pragmaErr) {
            cleanupAndReject(pragmaErr);
            return;
          }
          const hasPrevClose = rows ? rows.some((r: any) => r.name === 'prev_close') : false;
          
          const runTxMigration = () => {
            db.all("PRAGMA table_info(Transactions)", (txPragmaErr, txRows) => {
              if (txPragmaErr) {
                cleanupAndReject(txPragmaErr);
                return;
              }
              const hasIsCashFlow = txRows ? txRows.some((r: any) => r.name === 'is_cash_flow') : false;
              const hasIsCa = txRows ? txRows.some((r: any) => r.name === 'is_ca') : false;
              const runHoldingsFolioMigration = () => {
                db.all("PRAGMA table_info(Holdings)", (err, rows: any) => {
                  if (err) {
                     cleanupAndReject(err);
                     return;
                  }
                  const hasFolio = rows && rows.some((r: any) => r.name === 'folio');
                  if (rows && rows.length > 0 && !hasFolio) {
                    db.serialize(() => {
                      db.run(`CREATE TABLE Holdings_new (
                        portfolio TEXT NOT NULL,
                        isin TEXT NOT NULL,
                        folio TEXT DEFAULT 'NA',
                        symbol TEXT NOT NULL,
                        quantity REAL NOT NULL,
                        avg_buy_price REAL NOT NULL,
                        total_cost REAL NOT NULL,
                        ltp REAL DEFAULT 0,
                        prev_close REAL DEFAULT 0,
                        current_value REAL DEFAULT 0,
                        unrealized_pnl REAL DEFAULT 0,
                        unrealized_pct REAL DEFAULT 0,
                        day_change REAL DEFAULT 0,
                        day_change_pct REAL DEFAULT 0,
                        data_source TEXT,
                        last_update TEXT,
                        data_status TEXT DEFAULT 'LIVE',
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (portfolio, isin, folio)
                      )`);
                      db.run("INSERT INTO Holdings_new (portfolio, isin, symbol, quantity, avg_buy_price, total_cost, ltp, prev_close, current_value, unrealized_pnl, unrealized_pct, day_change, day_change_pct, data_source, last_update, data_status, created_at, updated_at) SELECT portfolio, isin, symbol, quantity, avg_buy_price, total_cost, ltp, prev_close, current_value, unrealized_pnl, unrealized_pct, day_change, day_change_pct, data_source, last_update, data_status, created_at, updated_at FROM Holdings");
                      db.run("DROP TABLE Holdings");
                      db.run("ALTER TABLE Holdings_new RENAME TO Holdings", (err) => {
                        if (err) cleanupAndReject(err);
                        else runCamsMigration();
                      });
                    });
                  } else {
                    runCamsMigration();
                  }
                });
              };
              
              const runCamsMigration = () => {
                db.all("PRAGMA table_info(CamsSummaryHoldings)", (camsPragmaErr, camsRows: any) => {
                  if (camsPragmaErr) {
                    cleanupAndReject(camsPragmaErr);
                    return;
                  }
                  const hasFolio = camsRows ? camsRows.some((r: any) => r.name === 'folio') : false;
                  if (camsRows && camsRows.length > 0 && !hasFolio) {
                    db.serialize(() => {
                      db.run("CREATE TABLE CamsSummaryHoldings_new (portfolio TEXT NOT NULL, isin TEXT NOT NULL, folio TEXT DEFAULT 'NA', symbol TEXT NOT NULL, quantity REAL NOT NULL, nav REAL NOT NULL, value REAL NOT NULL, cost REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (portfolio, isin, folio))");
                      db.run("INSERT INTO CamsSummaryHoldings_new (portfolio, isin, symbol, quantity, nav, value, cost, created_at) SELECT portfolio, isin, symbol, quantity, nav, value, cost, created_at FROM CamsSummaryHoldings");
                      db.run("DROP TABLE CamsSummaryHoldings");
                      db.run("ALTER TABLE CamsSummaryHoldings_new RENAME TO CamsSummaryHoldings", (err) => {
                        if (err) cleanupAndReject(err);
                        else runTaxSummaryMigration();
                      });
                    });
                  } else {
                    runTaxSummaryMigration();
                  }
                });
              };

              const runIsinCleanupAndEkiExchangeFix = () => {
                db.serialize(() => {
                  db.run(`
                    UPDATE Transactions 
                    SET isin = SUBSTR(isin, 1, 12) 
                    WHERE isin LIKE '%[%'
                  `);
                  db.run(`
                    UPDATE Holdings 
                    SET isin = SUBSTR(isin, 1, 12) 
                    WHERE isin LIKE '%[%'
                  `);
                  db.run(`
                    UPDATE MasterTickers 
                    SET isin = SUBSTR(isin, 1, 12) 
                    WHERE isin LIKE '%[%'
                  `);
                  db.run(`UPDATE Holdings SET symbol = 'FEDERALBNK', isin = 'INE171A01029' WHERE symbol = 'FEDERAL BANK LTD' OR symbol = 'FEDERAL BANK' OR isin = 'CUSTOM_FEDER'`);
                  db.run(`UPDATE Transactions SET symbol = 'FEDERALBNK', isin = 'INE171A01029' WHERE symbol = 'FEDERAL BANK LTD' OR symbol = 'FEDERAL BANK' OR isin = 'CUSTOM_FEDER'`);
                  db.run(`UPDATE Holdings SET symbol = 'LT', isin = 'INE018A01030' WHERE symbol = 'LARSEN and TOUBRO LTD' OR symbol = 'LARSEN & TOUBRO LTD' OR isin = 'CUSTOM_LARSE'`);
                  db.run(`UPDATE Transactions SET symbol = 'LT', isin = 'INE018A01030' WHERE symbol = 'LARSEN and TOUBRO LTD' OR symbol = 'LARSEN & TOUBRO LTD' OR isin = 'CUSTOM_LARSE'`);
                  db.run(`UPDATE Holdings SET symbol = 'M&M', isin = 'INE101A01026' WHERE symbol = 'MAHINDRA and MAHINDRA LTD' OR symbol = 'MAHINDRA & MAHINDRA LTD' OR isin = 'CUSTOM_MAHIN'`);
                  db.run(`UPDATE Transactions SET symbol = 'M&M', isin = 'INE101A01026' WHERE symbol = 'MAHINDRA and MAHINDRA LTD' OR symbol = 'MAHINDRA & MAHINDRA LTD' OR isin = 'CUSTOM_MAHIN'`);
                  db.run(`UPDATE Holdings SET symbol = 'TATAPOWER', isin = 'INE245A01021' WHERE symbol = 'TATA POWER CO LTD' OR symbol = 'TATA POWER COMPANY LTD' OR isin = 'CUSTOM_TATAP'`);
                  db.run(`UPDATE Transactions SET symbol = 'TATAPOWER', isin = 'INE245A01021' WHERE symbol = 'TATA POWER CO LTD' OR symbol = 'TATA POWER COMPANY LTD' OR isin = 'CUSTOM_TATAP'`);
                  db.run(`
                    UPDATE MasterTickers 
                    SET exchange = 'BSE' 
                    WHERE symbol = 'EKI' OR isin = 'INE0CPR01018'
                  `, (err) => {
                    if (err) console.warn("EKI exchange update failed:", err);
                    // Backfill/sync is_cash_flow for all transactions based on PMS vs Non-PMS rules.
                    // IMPORTANT GUARDS:
                    //  1. Corporate action rows (is_ca=1) are NEVER cash flow events — always 0.
                    //  2. PMS TRANSFER IN / TRANSFER OUT rows must NOT be overridden here because
                    //     the import script explicitly sets the correct flag:
                    //       - Initial capital in-kind (Security In at inception) → is_cash_flow=1
                    //       - Internal reorganisations (DVR conversion etc.)     → is_cash_flow=0
                    //     Overriding these would corrupt the XIRR calculation.
                    //  3. All other rows: sync to the rule defined in computeIsCashFlowFlag.
                    db.all("SELECT id, type, portfolio, source, is_cash_flow, is_ca FROM Transactions", (txErr, txns: any[]) => {
                      if (!txErr && txns && txns.length > 0) {
                        db.serialize(() => {
                          db.run("BEGIN TRANSACTION");
                          for (const tx of txns) {
                            // Guard 1: CA rows are never cash flow events
                            if ((tx.is_ca || 0) === 1) {
                              if (tx.is_cash_flow !== 0) {
                                db.run("UPDATE Transactions SET is_cash_flow = 0 WHERE id = ?", [tx.id]);
                              }
                              continue;
                            }
                            // Guard 2: PMS TRANSFER IN/OUT flags are set by the import and must not be overridden
                            const isPms = tx.source === 'PMS' || (tx.portfolio && String(tx.portfolio).toLowerCase().includes('cc9'));
                            const tType = String(tx.type || '').trim().toUpperCase();
                            if (isPms && (tType === 'TRANSFER IN' || tType === 'TRANSFER OUT')) {
                              // Trust the import-time flag; do not override
                              continue;
                            }
                            // All other rows: sync to rule
                            const expectedFlag = computeIsCashFlowFlag(tx.type, tx.portfolio, tx.source);
                            if (tx.is_cash_flow !== expectedFlag) {
                              db.run("UPDATE Transactions SET is_cash_flow = ? WHERE id = ?", [expectedFlag, tx.id]);
                            }
                          }
                          db.run("COMMIT", () => {
                            db.run("SELECT 1", () => cleanupAndResolve());
                          });
                        });
                      } else {
                        db.run("SELECT 1", () => cleanupAndResolve());
                      }
                    });
                  });
                });
              };


              const runPortfolioBackfillMigration = () => {
                db.run(`
                  INSERT INTO Portfolios (name, type, status)
                  SELECT DISTINCT portfolio, 'EQUITY', 'ACTIVE'
                  FROM Transactions
                  WHERE portfolio IS NOT NULL 
                    AND portfolio != ''
                    AND portfolio NOT IN (SELECT name FROM Portfolios)
                `, (err) => {
                  if (err) console.warn("Portfolio backfill failed:", err);
                  runIsinCleanupAndEkiExchangeFix();
                });
              };

              const runTaxSummaryMigration = () => {
                db.all("PRAGMA table_info(TaxSummary)", (taxPragmaErr, taxRows: any) => {
                  if (taxPragmaErr) {
                    cleanupAndReject(taxPragmaErr);
                    return;
                  }
                  const hasIntraday = taxRows ? taxRows.some((r: any) => r.name === 'intraday_gains') : false;
                  const hasDividends = taxRows ? taxRows.some((r: any) => r.name === 'dividends') : false;

                  const step2 = () => {
                    if (!hasDividends) {
                      db.run("ALTER TABLE TaxSummary ADD COLUMN dividends REAL DEFAULT 0", (err) => {
                        if (err) cleanupAndReject(err);
                        else runPortfolioBackfillMigration();
                      });
                    } else {
                      runPortfolioBackfillMigration();
                    }
                  };

                  if (!hasIntraday) {
                    db.run("ALTER TABLE TaxSummary ADD COLUMN intraday_gains REAL DEFAULT 0", (err) => {
                      if (err) cleanupAndReject(err);
                      else step2();
                    });
                  } else {
                    step2();
                  }
                });
              };
              
              const proceedIsCa = () => {
                if (!hasIsCa) {
                  db.run("ALTER TABLE Transactions ADD COLUMN is_ca INTEGER DEFAULT 0", (txAlterErr) => {
                    if (txAlterErr) cleanupAndReject(txAlterErr);
                    else runHoldingsFolioMigration();
                  });
                } else {
                  runHoldingsFolioMigration();
                }
              };

              if (!hasIsCashFlow) {
                db.run("ALTER TABLE Transactions ADD COLUMN is_cash_flow INTEGER DEFAULT 1", (txAlterErr) => {
                  if (txAlterErr) cleanupAndReject(txAlterErr);
                  else proceedIsCa();
                });
              } else {
                proceedIsCa();
              }
            });
          };

          if (!hasPrevClose) {
            db.run("ALTER TABLE Holdings ADD COLUMN prev_close REAL DEFAULT 0", (alterErr) => {
              if (alterErr) {
                cleanupAndReject(alterErr);
              } else {
                runTxMigration();
              }
            });
          } else {
            runTxMigration();
          }
        });
      });
    });
  });
}

export function auditDBChange(
  db: Database,
  tableName: string,
  action: string,
  rowId: number | null = null,
  details: string = ''
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const activeDb = getActiveDB(db);
      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
      activeDb.run(
        `INSERT INTO DataChangeLog (table_name, action, row_id, changed_at, details) VALUES (?, ?, ?, ?, ?)`,
        [tableName, action, rowId, timestamp, details],
        () => resolve()
      );
    } catch (e) {
      reject(e);
    }
  });
}

// Promisified DB helpers
function getActiveDB(dbParam?: any): Database {
  if (isSwapInProgress) throw new Error("Database update in progress. Please try again in a moment.");
  if (dbParam && typeof dbParam.run === 'function') {
    return dbParam;
  }
  if (dbInstance && dbInstance.isOpen) {
    return dbInstance as Database;
  }
  return getDB();
}

function isCorruptionError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  return msg.includes('sqlite_corrupt') || msg.includes('malformed') || msg.includes('database disk image is malformed');
}

function isBusyError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  return msg.includes('sqlite_busy') || msg.includes('database is locked') || msg.includes('cannot start a transaction within a transaction');
}

let mockHooks: {
  dbAll?: (sql: string, params: any[]) => Promise<any>;
  dbGet?: (sql: string, params: any[]) => Promise<any>;
  dbRun?: (sql: string, params: any[]) => Promise<any>;
} = {};

export function setDbMockHooks(hooks: typeof mockHooks = {}) {
  mockHooks = hooks;
}

export async function dbRun(dbOrSql: any, sqlOrParams?: any, maybeParams: any[] = [], retryCount: number = 0): Promise<any> {
  let db: any;
  let sql: string;
  let params: any[];

  if (typeof dbOrSql === 'string') {
    db = getDB();
    sql = dbOrSql;
    params = Array.isArray(sqlOrParams) ? sqlOrParams : [];
  } else {
    db = dbOrSql;
    sql = sqlOrParams as string;
    params = Array.isArray(maybeParams) ? maybeParams : [];
  }

  const cleanParams = (params || []).map(p => p === undefined ? null : p);

  if (mockHooks.dbRun) {
    return mockHooks.dbRun(sql, cleanParams);
  }

  return new Promise((resolve, reject) => {
    try {
      const activeDb = getActiveDB(db);
      activeDb.run(sql, cleanParams, async function (err) {
        if (err) {
          if (isCorruptionError(err)) {
            console.warn('[dbRun] SQLITE_CORRUPT encountered. Executing auto-repair and retrying query...');
            await repairCorruptDatabase();
            const freshDb = getDB();
            return dbRun(freshDb, sql, params, retryCount + 1).then(resolve).catch(reject);
          }
          if (isBusyError(err) && retryCount < 10) {
            const delay = Math.min(50 * Math.pow(1.5, retryCount), 1000);
            await new Promise(r => setTimeout(r, delay));
            return dbRun(db, sql, params, retryCount + 1).then(resolve).catch(reject);
          }
          reject(err);
        } else {
          createPersistentBackup();
          resolve({ id: this.lastID, lastID: this.lastID, changes: this.changes });
        }
      });
    } catch (e: any) {
      if (isCorruptionError(e)) {
        repairCorruptDatabase().then(() => {
          const freshDb = getDB();
          return dbRun(freshDb, sql, params, retryCount + 1).then(resolve).catch(reject);
        }).catch(() => reject(e));
      } else if (isBusyError(e) && retryCount < 10) {
        const delay = Math.min(50 * Math.pow(1.5, retryCount), 1000);
        setTimeout(() => {
          dbRun(db, sql, params, retryCount + 1).then(resolve).catch(reject);
        }, delay);
      } else {
        reject(e);
      }
    }
  });
}

export async function dbAll<T = any>(dbOrSql: any, sqlOrParams?: any, maybeParams: any[] = [], retryCount: number = 0): Promise<T[]> {
  let db: any;
  let sql: string;
  let params: any[];

  if (typeof dbOrSql === 'string') {
    db = getDB();
    sql = dbOrSql;
    params = Array.isArray(sqlOrParams) ? sqlOrParams : [];
  } else {
    db = dbOrSql;
    sql = sqlOrParams as string;
    params = Array.isArray(maybeParams) ? maybeParams : [];
  }

  const cleanParams = (params || []).map(p => p === undefined ? null : p);

  if (mockHooks.dbAll) {
    return mockHooks.dbAll(sql, cleanParams);
  }

  return new Promise((resolve, reject) => {
    try {
      const activeDb = getActiveDB(db);
      activeDb.all(sql, cleanParams, async (err, rows) => {
        if (err) {
          if (isCorruptionError(err)) {
            console.warn('[dbAll] SQLITE_CORRUPT encountered. Executing auto-repair and retrying query...');
            await repairCorruptDatabase();
            const freshDb = getDB();
            return dbAll<T>(freshDb, sql, params, retryCount + 1).then(resolve).catch(reject);
          }
          if (isBusyError(err) && retryCount < 10) {
            const delay = Math.min(50 * Math.pow(1.5, retryCount), 1000);
            await new Promise(r => setTimeout(r, delay));
            return dbAll<T>(db, sql, params, retryCount + 1).then(resolve).catch(reject);
          }
          reject(err);
        } else {
          resolve((rows || []) as T[]);
        }
      });
    } catch (e: any) {
      if (isCorruptionError(e)) {
        repairCorruptDatabase().then(() => {
          const freshDb = getDB();
          return dbAll<T>(freshDb, sql, params, retryCount + 1).then(resolve).catch(reject);
        }).catch(() => reject(e));
      } else if (isBusyError(e) && retryCount < 10) {
        const delay = Math.min(50 * Math.pow(1.5, retryCount), 1000);
        setTimeout(() => {
          dbAll<T>(db, sql, params, retryCount + 1).then(resolve).catch(reject);
        }, delay);
      } else {
        reject(e);
      }
    }
  });
}

export async function dbGet<T = any>(dbOrSql: any, sqlOrParams?: any, maybeParams: any[] = [], retryCount: number = 0): Promise<T> {
  let db: any;
  let sql: string;
  let params: any[];

  if (typeof dbOrSql === 'string') {
    db = getDB();
    sql = dbOrSql;
    params = Array.isArray(sqlOrParams) ? sqlOrParams : [];
  } else {
    db = dbOrSql;
    sql = sqlOrParams as string;
    params = Array.isArray(maybeParams) ? maybeParams : [];
  }

  const cleanParams = (params || []).map(p => p === undefined ? null : p);

  if (mockHooks.dbGet) {
    return mockHooks.dbGet(sql, cleanParams);
  }

  return new Promise((resolve, reject) => {
    try {
      const activeDb = getActiveDB(db);
      activeDb.get(sql, cleanParams, async (err, row) => {
        if (err) {
          if (isCorruptionError(err)) {
            console.warn('[dbGet] SQLITE_CORRUPT encountered. Executing auto-repair and retrying query...');
            await repairCorruptDatabase();
            const freshDb = getDB();
            return dbGet<T>(freshDb, sql, params, retryCount + 1).then(resolve).catch(reject);
          }
          if (isBusyError(err) && retryCount < 10) {
            const delay = Math.min(50 * Math.pow(1.5, retryCount), 1000);
            await new Promise(r => setTimeout(r, delay));
            return dbGet<T>(db, sql, params, retryCount + 1).then(resolve).catch(reject);
          }
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    } catch (e: any) {
      if (isCorruptionError(e)) {
        repairCorruptDatabase().then(() => {
          const freshDb = getDB();
          return dbGet<T>(freshDb, sql, params, retryCount + 1).then(resolve).catch(reject);
        }).catch(() => reject(e));
      } else if (isBusyError(e) && retryCount < 10) {
        const delay = Math.min(50 * Math.pow(1.5, retryCount), 1000);
        setTimeout(() => {
          dbGet<T>(db, sql, params, retryCount + 1).then(resolve).catch(reject);
        }, delay);
      } else {
        reject(e);
      }
    }
  });
}
