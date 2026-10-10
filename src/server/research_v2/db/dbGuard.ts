import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/** Basename of the live WealthOS database. Any file with this name is treated as production. */
export const PRODUCTION_DB_BASENAME = 'portfolio.db';
/** Environment variable that may carry extra production paths (path.delimiter separated). */
export const PRODUCTION_PATHS_ENV = 'WEALTHOS_PRODUCTION_DB_PATHS';
/** A backup smaller than this fraction of the database is rejected as truncated. */
export const MIN_BACKUP_SIZE_RATIO = 0.9;
/** A backup older than this is rejected as stale. */
export const MAX_BACKUP_AGE_MS = 24 * 60 * 60 * 1000;
export const BUSY_TIMEOUT_MS = 30000;

const SQLITE_MAGIC = 'SQLite format 3\u0000';
const MEMORY_PATH = ':memory:';

export type DbGuardCode =
  | 'DB_PATH_REQUIRED'
  | 'PRODUCTION_WRITE_NOT_ALLOWED'
  | 'BACKUP_REQUIRED'
  | 'BACKUP_MISSING'
  | 'BACKUP_NOT_SQLITE'
  | 'BACKUP_TOO_SMALL'
  | 'BACKUP_STALE'
  | 'BACKUP_IS_DATABASE'
  | 'BACKUP_INTEGRITY_FAILED';

/** Raised for every refusal so callers and tests can match on a stable code. */
export class DbGuardError extends Error {
  constructor(public readonly code: DbGuardCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'DbGuardError';
  }
}

export interface WriteGuardOptions {
  /** Explicit target database. Required; there is no default. ':memory:' is always safe. */
  dbPath: string | undefined;
  /** Must be exactly true to write to a production database. */
  allowProduction?: boolean;
  /** Verified backup of the database; required for production writes. */
  backupPath?: string;
  /** Additional paths to treat as production (besides portfolio.db and the environment list). */
  productionPaths?: string[];
  /** Run PRAGMA quick_check on the backup (slow on a 1+ GB file). Default false. */
  quickCheckBackup?: boolean;
  /** Clock override for tests. */
  now?: () => number;
}

export interface GuardDecision {
  dbPath: string;
  production: boolean;
  backupPath?: string;
}

const guardedHandles = new WeakSet<object>();

/** True when the handle was opened by openForWrite (and therefore passed the guard). */
export function isGuardedHandle(db: object): boolean {
  return guardedHandles.has(db);
}

function canonical(target: string): string {
  const absolute = path.resolve(target);
  try {
    return fs.realpathSync.native(absolute);
  } catch {
    // Not created yet: resolve the parent so a symlinked directory is still detected.
    try {
      return path.join(fs.realpathSync.native(path.dirname(absolute)), path.basename(absolute));
    } catch {
      return absolute;
    }
  }
}

function comparable(target: string): string {
  const value = canonical(target);
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function configuredProductionPaths(extra: string[] = []): string[] {
  const fromEnv = (process.env[PRODUCTION_PATHS_ENV] ?? '').split(path.delimiter).filter(Boolean);
  return [...extra, ...fromEnv];
}

function sameInode(a: string, b: string): boolean {
  try {
    const left = fs.statSync(a);
    const right = fs.statSync(b);
    return left.ino !== 0 && left.ino === right.ino && left.dev === right.dev;
  } catch {
    return false;
  }
}

/**
 * True when the path is, or resolves (symlink, junction, hard link) to, a production database:
 * basename portfolio.db, or equal to a configured production path.
 */
export function isProductionPath(dbPath: string, productionPaths: string[] = []): boolean {
  if (!dbPath || dbPath === MEMORY_PATH) return false;
  const target = comparable(dbPath);
  if (path.basename(target).toLowerCase() === PRODUCTION_DB_BASENAME) return true;
  return configuredProductionPaths(productionPaths).some(
    (candidate) => comparable(candidate) === target || sameInode(candidate, dbPath),
  );
}

function readMagic(file: string): string {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(SQLITE_MAGIC.length);
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.toString('latin1');
  } finally {
    fs.closeSync(fd);
  }
}

function quickCheck(file: string): boolean {
  let db: Database.Database | undefined;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    return db.pragma('quick_check', { simple: true }) === 'ok';
  } catch {
    return false; // a corrupt file may throw instead of reporting
  } finally {
    db?.close();
  }
}

function assertBackup(opts: WriteGuardOptions, dbFile: string): string {
  if (!opts.backupPath) throw new DbGuardError('BACKUP_REQUIRED', 'a verified backup path is required');
  const backup = path.resolve(opts.backupPath);
  if (!fs.existsSync(backup) || !fs.statSync(backup).isFile()) {
    throw new DbGuardError('BACKUP_MISSING', `backup file not found: ${backup}`);
  }
  if (comparable(backup) === comparable(dbFile) || sameInode(backup, dbFile)) {
    throw new DbGuardError('BACKUP_IS_DATABASE', 'the backup must be a separate file from the database');
  }
  if (readMagic(backup) !== SQLITE_MAGIC) {
    throw new DbGuardError('BACKUP_NOT_SQLITE', `backup is not a SQLite file: ${backup}`);
  }
  const stat = fs.statSync(backup);
  const dbSize = fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0;
  if (stat.size < dbSize * MIN_BACKUP_SIZE_RATIO) {
    throw new DbGuardError('BACKUP_TOO_SMALL', `backup ${stat.size} bytes is under 90% of database ${dbSize}`);
  }
  const now = (opts.now ?? Date.now)();
  if (now - stat.mtimeMs > MAX_BACKUP_AGE_MS) {
    throw new DbGuardError('BACKUP_STALE', 'backup was modified more than 24 hours ago');
  }
  if (opts.quickCheckBackup && !quickCheck(backup)) {
    throw new DbGuardError('BACKUP_INTEGRITY_FAILED', 'PRAGMA quick_check failed on the backup');
  }
  return backup;
}

/**
 * Refuse unsafe writes. A production database needs allowProduction === true plus a verified backup
 * (existing SQLite file, >= 90% of the database size, modified within 24h, optional quick_check).
 * @throws DbGuardError on every refusal.
 */
export function assertSafeWrite(opts: WriteGuardOptions): GuardDecision {
  if (typeof opts.dbPath !== 'string' || opts.dbPath.trim() === '') {
    throw new DbGuardError('DB_PATH_REQUIRED', 'an explicit dbPath is required; there is no default database');
  }
  if (opts.dbPath === MEMORY_PATH) return { dbPath: MEMORY_PATH, production: false };
  const dbFile = canonical(opts.dbPath);
  if (!isProductionPath(dbFile, opts.productionPaths)) return { dbPath: dbFile, production: false };
  if (opts.allowProduction !== true) {
    throw new DbGuardError(
      'PRODUCTION_WRITE_NOT_ALLOWED', `${dbFile} is a production database; pass --allow-production`,
    );
  }
  return { dbPath: dbFile, production: true, backupPath: assertBackup(opts, dbFile) };
}

/**
 * Open a database for writing after the guard passes, run `work` inside ONE transaction
 * (BEGIN IMMEDIATE ... COMMIT, ROLLBACK on throw) and close the connection.
 * Applies busy_timeout 30000, WAL and foreign_keys.
 */
export function openForWrite<T>(opts: WriteGuardOptions, work: (db: Database.Database) => T): T {
  const decision = assertSafeWrite(opts);
  const db = new Database(decision.dbPath);
  guardedHandles.add(db);
  try {
    db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db.transaction(() => work(db)).immediate();
  } finally {
    db.close();
  }
}
