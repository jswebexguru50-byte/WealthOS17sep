Warning: truncated output (original token count: 34393)
Total output lines: 3462

import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { MasterTickerService } from './services/MasterTickerService.js';
import { computeIsCashFlowFlag } from './xirr.js';
import { Migrator } from './db/migrator.js';
import { canonicalMigrations } from './db/migrations/index.js';


export let isTransactionActive = false;
const transactionDepth = new WeakMap<object, number>();
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

export function getEffectiveDbPath(): string {
  return process.env.DATABASE_URL || path.join(process.cwd(), 'portfolio.db');
}
const getDbFile = getEffectiveDbPath;
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
      if (fs.existsSync(getDbFile())) {
        const stat = await fs.promises.stat(getDbFile());
        if (stat.size > 8192) {
          await fs.promises.copyFile(getDbFile(), PERSISTENT_BACKUP_PATH);
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
    const dbPath = getDbFile();
    const dbExists = fs.existsSync(dbPath);
    let currentDbValid = dbExists && fs.statSync(dbPath).size >= 8192;
    
    if (currentDbValid) {
      const checkVal = getDatabaseTxCountSync(dbPath);
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
      if (candidate === dbPath) continue;
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
      if (fs.existsSync(dbPath)) {
        try { fs.unlinkSync(dbPath); } catch {}
      }
      fs.copyFileSync(bestBackupPath, dbPath);
      console.log(`[PersistentBackup] Successfully restored database from ${path.basename(bestBackupPath)}!`);
    }
  } catch (e) {
    console.warn('[PersistentBackup] Error during restore check:', e);
  }
}

const stmtCache = new WeakMap<BetterSqlite3.Database, Map<string, BetterSqlite3.Statement>>();
function getCachedStmt(db: BetterSqlite3.Database, sql: string): BetterSqlite3.Statement {
  let m = stmtCache.get(db);
  if (!m) {
    m = new Map();
    stmtCache.set(db, m);
  }
  if (m.size > 500) m.clear();
  let s = m.get(sql);
  if (!s) {
    s = db.prepare(sql);
    m.set(sql, s);
  }
  return s;
}

function patchDbCompatibility(db: BetterSqlite3.Database): any {
  Object.assign(db, EventEmitter.prototype);
  EventEmitter.call(db);

  const origClose = db.close.bind(db);
  (db as any).isOpen = true;

  (db as any).run = function (sql: string, ...args: any[]) {
    let cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    let params = args.length > 0 ? (Array.isArray(args[0]) ? args[0] : args) : [];
    const cleanParams = normalizeSqliteParams(params);
    try {
      let info: BetterSqlite3.RunResult;
      try {
        const stmt = getCachedStmt(db, sql);
        info = cleanParams.length > 0 ? stmt.run(cleanParams) : stmt.run();
      } catch (e: any) {
        if (e.message && e.message.includes('more than one statement')) {
          db.exec(sql);
          info = { changes: 0, lastInsertRowid: 0 };
        } else {
          throw e;
        }
      }
      const ctx = { lastID: Number(info.lastInsertRowid), changes: info.changes };
      if (cb) cb.call(ctx, null, ctx);
      return ctx;
    } catch (e) {
      if (cb) cb(e);
      else throw e;
    }
  };

  (db as any).all = function (sql: string, ...args: any[]) {
    let cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    let params = args.length > 0 ? (Array.isArray(args[0]) ? args[0] : args) : [];
    const cleanParams = normalizeSqliteParams(params);
    try {
      const stmt = getCachedStmt(db, sql);
      const rows = cleanParams.length > 0 ? stmt.all(cleanParams) : stmt.all();
      if (cb) cb(null, rows);
      return rows;
    } catch (e) {
      if (cb) cb(e);
      else throw e;
    }
  };

  (db as any).get = function (sql: string, ...args: any[]) {
    let cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    let params = args.length > 0 ? (Array.isArray(args[0]) ? args[0] : args) : [];
    const cleanParams = normalizeSqliteParams(params);
    try {
      const stmt = getCachedStmt(db, sql);
      const row = cleanParams.length > 0 ? stmt.get(cleanParams) : stmt.get();
      if (cb) cb(null, row);
      return row;
    } catch (e) {
      if (cb) cb(e);
      else throw e;
    }
  };

  (db as any).serialize = function (fn?: () => void) {
    if (fn) fn();
  };

  (db as any).parallelize = function (fn?: () => void) {
    if (fn) fn();
  };

  (db as any).close = function (cb?: (err: Error | null) => void) {
    try {
      (db as any).isOpen = false;
      origClose();
      if (cb) cb(null);
    } catch (e: any) {
      if (cb) cb(e);
      else throw e;
    }
  };

  return db;
}

let dbInstance: any = null;
let isSwapInProgress = false;

export function setSwapInProgress(val: boolean) {
  isSwapInProgress = val;
}

export function getDB(): any {
  if (isSwapInProgress) throw new Error("Database update in progress.");
  if (!dbInstance || !dbInstance.isOpen) {
    restorePersistentBackupIfNeeded();
  }
  if (dbInstance && dbInstance.isOpen) return dbInstance;

  const rawDb = new BetterSqlite3(getDbFile(), { timeout: 30000 });
  rawDb.pragma('journal_mode = WAL');
  rawDb.pragma('synchronous = NORMAL');
  rawDb.pragma('temp_store = MEMORY');
  rawDb.pragma('cache_size = -64000');
  rawDb.pragma('mmap_size = 268435456');
  rawDb.pragma('wal_autocheckpoint = 4000');
  rawDb.pragma('optimize = 0x10002');

  const db = patchDbCompatibility(rawDb);
  dbInstance = db;
  return db;
}

export function closeDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      resolve();
      return;
    }
    try {
      dbInstance.isOpen = false;
      dbInstance.close();
      dbInstance = null;
      resolve();
    } catch (err) {
      dbInstance = null;
      reject(err);
    }
  });
}

export async function repairCorruptDatabase(): Promise<boolean> {
  console.warn('[DB Recovery] Initiating self-healing repair for corrupt database file...');
  const dbPath = getDbFile();
  try {
    await closeDB();
    if (!fs.existsSync(dbPath)) {
      console.log('[DB Recovery] DB_FILE does not exist, nothing to repair.');
      return false;
    }

    const timestamp = Date.now();
    const backupCorruptFile = `${dbPath}.corrupt.${timestamp}`;
    const cleanFile = `${dbPath}.clean.${timestamp}`;

    if (fs.existsSync(cleanFile)) fs.unlinkSync(cleanFile);

    const srcDb = new sqlite3.Database(dbPath);
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
    try { fs.copyFileSync(dbPath, backupCorruptFile); } catch {}
    if (fs.existsSync(`${dbPath}-wal`)) try { fs.unlinkSync(`${dbPath}-wal`); } catch {}
    if (fs.existsSync(`${dbPath}-shm`)) try { fs.unlinkSync(`${dbPath}-shm`); } catch {}
    if (fs.existsSync(dbPath)) try { fs.unlinkSync(dbPath); } catch {}

    if (fs.existsSync(cleanFile) && tables.length > 0) {
      fs.renameSync(cleanFile, dbPath);
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
      'CREATE INDEX IF NOT EXISTS idx_hist_shp_sym ON Hi…24393 tokens truncated…e TEXT DEFAULT 'NSE_FO_BHAVCOPY',
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
        db.run("SELECT 1", (err) => {
          if (err) cleanupAndReject(err);
          else cleanupAndResolve();
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

let sqliteParameterCoercionCount = 0;
let lastSqliteCoercionLogAt = 0;
export function getSqliteParameterCoercionCount(): number {
  return sqliteParameterCoercionCount;
}

function recordSqliteParameterCoercion(value: unknown, replacement: unknown): void {
  sqliteParameterCoercionCount += 1;
  const now = Date.now();
  // Keep the signal visible without logging every row in a large import.
  if (now - lastSqliteCoercionLogAt >= 60_000) {
    lastSqliteCoercionLogAt = now;
    console.warn('[SQLite] coerced unsupported bound parameter', {
      count: sqliteParameterCoercionCount,
      inputType: value === null ? 'null' : typeof value,
      replacementType: replacement === null ? 'null' : typeof replacement
    });
  }
}

function normalizeSqliteParams(params: any[] = []): any[] {
  return params.map(value => {
    if (value === undefined) { recordSqliteParameterCoercion(value, null); return null; }
    if (value === null) return null;
    if (value instanceof Date) {
      const replacement = Number.isNaN(value.getTime()) ? null : value.toISOString();
      if (replacement === null) recordSqliteParameterCoercion(value, replacement);
      return replacement;
    }
    if (typeof value === 'number') {
      const replacement = Number.isFinite(value) ? value : null;
      if (replacement === null) recordSqliteParameterCoercion(value, replacement);
      return replacement;
    }
    if (typeof value === 'string' || typeof value === 'bigint' || Buffer.isBuffer(value)) return value;
    const replacement = String(value);
    recordSqliteParameterCoercion(value, replacement);
    return replacement;
  });
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

export type QueryProfileEvent = {
  type: 'all' | 'get' | 'run';
  sql: string;
  durationMs: number;
};
let queryProfiler: ((event: QueryProfileEvent) => void) | null = null;
export function setQueryProfiler(profiler: ((event: QueryProfileEvent) => void) | null) {
  queryProfiler = profiler;
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

  const cleanParams = normalizeSqliteParams(params || []);

  if (mockHooks.dbRun) {
    return mockHooks.dbRun(sql, cleanParams);
  }

  const qStart = queryProfiler ? performance.now() : 0;
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
          if (queryProfiler) queryProfiler({ type: 'run', sql, durationMs: performance.now() - qStart });
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

/**
 * Execute a callback within an explicit SQLite transaction (BEGIN IMMEDIATE ... COMMIT).
 * Rolls back automatically on error. Prevents per-row fsync overhead during batch writes.
 * Supports re-entrancy and nested transactions safely via SQLite SAVEPOINTs.
 */
export async function withTx<T>(db: any, fn: () => Promise<T>): Promise<T> {
  const targetDb = db || getDB();
  const rawDb = targetDb?.db || targetDb;
  const transactionKey = rawDb && typeof rawDb === 'object' ? rawDb : targetDb;
  const depth = transactionKey && typeof transactionKey === 'object' ? (transactionDepth.get(transactionKey) || 0) : 0;
  const isNested = depth > 0;
  let savepointName: string | null = null;

  if (isNested) {
    savepointName = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await dbRun(targetDb, `SAVEPOINT ${savepointName}`);
  } else {
    await dbRun(targetDb, 'BEGIN IMMEDIATE');
  }
  if (transactionKey && typeof transactionKey === 'object') transactionDepth.set(transactionKey, depth + 1);

  try {
    const result = await fn();
    if (savepointName) {
      await dbRun(targetDb, `RELEASE SAVEPOINT ${savepointName}`);
    } else {
      await dbRun(targetDb, 'COMMIT');
    }
    return result;
  } catch (err) {
    if (savepointName) {
      try {
        await dbRun(targetDb, `ROLLBACK TO SAVEPOINT ${savepointName}`);
        await dbRun(targetDb, `RELEASE SAVEPOINT ${savepointName}`);
      } catch {
        // ignore failure if savepoint was already invalidated
      }
    } else {
      try {
        await dbRun(targetDb, 'ROLLBACK');
      } catch {
        // ignore rollback failure if transaction already aborted
      }
    }
    throw err;
  } finally {
    if (transactionKey && typeof transactionKey === 'object') {
      if (depth === 0) transactionDepth.delete(transactionKey);
      else transactionDepth.set(transactionKey, depth);
    }
  }
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

  const cleanParams = normalizeSqliteParams(params || []);

  if (mockHooks.dbAll) {
    return mockHooks.dbAll(sql, cleanParams);
  }

  const qStart = queryProfiler ? performance.now() : 0;
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
          if (queryProfiler) queryProfiler({ type: 'all', sql, durationMs: performance.now() - qStart });
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

  const cleanParams = normalizeSqliteParams(params || []);

  if (mockHooks.dbGet) {
    return mockHooks.dbGet(sql, cleanParams);
  }

  const qStart = queryProfiler ? performance.now() : 0;
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
          if (queryProfiler) queryProfiler({ type: 'get', sql, durationMs: performance.now() - qStart });
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

export async function recordValuationSnapshot(db: sqlite3.Database, payload: {
  portfolio: string;
  total_value_inr: number;
  equity_value: number;
  cash_value: number;
  mf_value: number;
  aif_value: number;
  unlisted_value: number;
  fx_rate_usd: number;
  trigger_source: string;
  drift_pct: number;
  drift_alert: string | null;
  observationDate?: string;
  observationTimestamp?: string;
}) {
  if (!payload.observationDate && !payload.observationTimestamp) {
    throw new Error("REJECTED: MISSING_OBSERVATION_TIMESTAMP");
  }

  let obsDate = null;
  let obsTimestamp = null;
  let precision = 'NONE';

  if (payload.observationTimestamp) {
    obsTimestamp = payload.observationTimestamp;
    obsDate = payload.observationTimestamp.split('T')[0];
    precision = 'EXACT';
  } else if (payload.observationDate) {
    obsDate = payload.observationDate;
    obsTimestamp = null;
    precision = 'DAY';
  }

  await dbRun(db, `
    INSERT INTO ValuationSnapshots (
      timestamp, portfolio, total_value_inr, equity_value, cash_value, 
      mf_value, aif_value, unlisted_value, fx_rate_usd, trigger_source, 
      drift_pct, drift_alert, observationDate, observationTimestamp, timestampPrecision
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    obsTimestamp || obsDate, // legacy timestamp column
    payload.portfolio, payload.total_value_inr, payload.equity_value, payload.cash_value,
    payload.mf_value, payload.aif_value, payload.unlisted_value, payload.fx_rate_usd,
    payload.trigger_source, payload.drift_pct, payload.drift_alert,
    obsDate, obsTimestamp, precision
  ]);
}

