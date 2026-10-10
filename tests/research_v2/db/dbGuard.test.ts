import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  DbGuardError, assertSafeWrite, isGuardedHandle, isProductionPath, openForWrite,
} from '../../../src/server/research_v2/db/dbGuard.js';
import { FactStore } from '../../../src/server/research_v2/facts/factStore.js';
import { applyResearchV2Schema } from '../../../src/server/db/migrations/research_v2_migration.js';
import { fact } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dbguard-'));
}

/** Create a SQLite file padded to roughly `rows` rows. */
function makeDb(file: string, rows = 200): string {
  const db = new Database(file);
  db.pragma('journal_mode = DELETE');
  db.exec('CREATE TABLE t (x TEXT)');
  const insert = db.prepare('INSERT INTO t VALUES (?)');
  for (let i = 0; i < rows; i += 1) insert.run('x'.repeat(200));
  db.close();
  return file;
}

function refusal(opts: Parameters<typeof assertSafeWrite>[0]): string {
  try {
    assertSafeWrite(opts);
  } catch (error) {
    assert.ok(error instanceof DbGuardError);
    return error.code;
  }
  return 'NO_ERROR';
}

test('isProductionPath: basename portfolio.db, configured paths, never memory', () => {
  const dir = tempDir();
  assert.equal(isProductionPath(path.join(dir, 'portfolio.db')), true);
  assert.equal(isProductionPath(path.join(dir, 'PORTFOLIO.DB')), process.platform === 'win32');
  assert.equal(isProductionPath(path.join(dir, 'scratch.db')), false);
  assert.equal(isProductionPath(':memory:'), false);
  const configured = path.join(dir, 'live.sqlite');
  assert.equal(isProductionPath(configured), false);
  assert.equal(isProductionPath(configured, [configured]), true);
});

test('isProductionPath follows a hard link to a configured production file', () => {
  const dir = tempDir();
  const live = makeDb(path.join(dir, 'live.sqlite'));
  const link = path.join(dir, 'innocent.db');
  fs.linkSync(live, link);
  assert.equal(isProductionPath(link, [live]), true);
});

test('isProductionPath follows a symlink named innocently to portfolio.db', (t) => {
  const dir = tempDir();
  const real = makeDb(path.join(dir, 'portfolio.db'));
  const link = path.join(dir, 'copy.db');
  try {
    fs.symlinkSync(real, link);
  } catch {
    t.skip('symlinks not permitted on this machine');
    return;
  }
  assert.equal(isProductionPath(link), true);
});

test('an explicit dbPath is always required', () => {
  for (const dbPath of [undefined, '', '   ']) assert.equal(refusal({ dbPath }), 'DB_PATH_REQUIRED');
});

test('non-production targets and :memory: need no backup', () => {
  const dir = tempDir();
  assert.equal(assertSafeWrite({ dbPath: ':memory:' }).production, false);
  const decision = assertSafeWrite({ dbPath: path.join(dir, 'research_copy.db') });
  assert.equal(decision.production, false);
});

test('production write is refused without allowProduction, even with a backup', () => {
  const dir = tempDir();
  const prod = makeDb(path.join(dir, 'portfolio.db'));
  const backup = makeDb(path.join(dir, 'backup.db'));
  assert.equal(refusal({ dbPath: prod, backupPath: backup }), 'PRODUCTION_WRITE_NOT_ALLOWED');
  assert.equal(refusal({ dbPath: prod, backupPath: backup, allowProduction: false }), 'PRODUCTION_WRITE_NOT_ALLOWED');
  const truthy = { dbPath: prod, backupPath: backup, allowProduction: 'true' as never };
  assert.equal(refusal(truthy), 'PRODUCTION_WRITE_NOT_ALLOWED');
});

test('production write with allowProduction but no backup is refused', () => {
  const prod = makeDb(path.join(tempDir(), 'portfolio.db'));
  assert.equal(refusal({ dbPath: prod, allowProduction: true }), 'BACKUP_REQUIRED');
});

test('backup must exist, be SQLite, be large enough, fresh and a different file', () => {
  const dir = tempDir();
  const prod = makeDb(path.join(dir, 'portfolio.db'), 400);
  const base = { dbPath: prod, allowProduction: true };
  assert.equal(refusal({ ...base, backupPath: path.join(dir, 'nope.db') }), 'BACKUP_MISSING');
  assert.equal(refusal({ ...base, backupPath: prod }), 'BACKUP_IS_DATABASE');
  const text = path.join(dir, 'text.db');
  fs.writeFileSync(text, 'x'.repeat(fs.statSync(prod).size + 10));
  assert.equal(refusal({ ...base, backupPath: text }), 'BACKUP_NOT_SQLITE');
  const small = makeDb(path.join(dir, 'small.db'), 50);
  assert.equal(refusal({ ...base, backupPath: small }), 'BACKUP_TOO_SMALL');
  const stale = makeDb(path.join(dir, 'stale.db'), 400);
  const old = new Date(Date.now() - 2 * DAY);
  fs.utimesSync(stale, old, old);
  assert.equal(refusal({ ...base, backupPath: stale }), 'BACKUP_STALE');
});

test('a backup is accepted when sqlite, >= 90% size, fresh, and passes quick_check', () => {
  const dir = tempDir();
  const prod = makeDb(path.join(dir, 'portfolio.db'), 400);
  const backup = path.join(dir, 'portfolio_backup.db');
  fs.copyFileSync(prod, backup);
  const decision = assertSafeWrite({ dbPath: prod, allowProduction: true, backupPath: backup, quickCheckBackup: true });
  assert.equal(decision.production, true);
  assert.equal(decision.backupPath, path.resolve(backup));
});

test('a corrupt backup fails quick_check', () => {
  const dir = tempDir();
  const prod = makeDb(path.join(dir, 'portfolio.db'), 400);
  const backup = path.join(dir, 'corrupt.db');
  const bytes = fs.readFileSync(prod);
  for (let i = 4096; i < bytes.length; i += 97) bytes[i] = 0xff;
  fs.writeFileSync(backup, bytes);
  const opts = { dbPath: prod, allowProduction: true, backupPath: backup };
  assert.equal(refusal({ ...opts, quickCheckBackup: true }), 'BACKUP_INTEGRITY_FAILED');
  // without the optional integrity check the same backup passes the cheap checks
  assert.equal(refusal(opts), 'NO_ERROR');
});

test('the clock is injectable: a backup is stale relative to the supplied now', () => {
  const dir = tempDir();
  const prod = makeDb(path.join(dir, 'portfolio.db'), 100);
  const backup = path.join(dir, 'b.db');
  fs.copyFileSync(prod, backup);
  const later = () => Date.now() + 2 * DAY;
  assert.equal(refusal({ dbPath: prod, allowProduction: true, backupPath: backup, now: later }), 'BACKUP_STALE');
});

test('openForWrite applies pragmas, commits in one transaction, and marks the handle guarded', () => {
  const dir = tempDir();
  const file = path.join(dir, 'copy.db');
  let handle: Database.Database | undefined;
  openForWrite({ dbPath: file }, (db) => {
    handle = db;
    assert.equal(db.pragma('busy_timeout', { simple: true }), 30000);
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(db.inTransaction, true);
    applyResearchV2Schema(db);
    new FactStore(db).writeFact(fact());
  });
  assert.ok(handle && isGuardedHandle(handle));
  const check = new Database(file, { readonly: true });
  const count = check.prepare('SELECT COUNT(*) AS n FROM research_canonical_period_facts').get() as { n: number };
  assert.equal(count.n, 1);
  check.close();
});

test('openForWrite rolls everything back when the work throws', () => {
  const file = path.join(tempDir(), 'copy.db');
  assert.throws(() => openForWrite({ dbPath: file }, (db) => {
    applyResearchV2Schema(db);
    new FactStore(db).writeFact(fact());
    throw new Error('abort');
  }), /abort/);
  const check = new Database(file, { readonly: true });
  const tables = check.prepare("SELECT name FROM sqlite_master WHERE name = 'research_canonical_period_facts'").all();
  assert.equal(tables.length, 0);
  check.close();
});

test('openForWrite refuses a production path before opening anything', () => {
  const dir = tempDir();
  const prod = path.join(dir, 'portfolio.db');
  assert.throws(() => openForWrite({ dbPath: prod }, () => 1), DbGuardError);
  assert.equal(fs.existsSync(prod), false);
  assert.throws(() => openForWrite({ dbPath: undefined }, () => 1), /DB_PATH_REQUIRED/);
});

test('openForWrite writes to a production-named file only with allowProduction and a verified backup', () => {
  const dir = tempDir();
  const prod = makeDb(path.join(dir, 'portfolio.db'), 100);
  const backup = path.join(dir, 'backup.db');
  fs.copyFileSync(prod, backup);
  const result = openForWrite({ dbPath: prod, allowProduction: true, backupPath: backup }, (db) => {
    new FactStore(db);
    return 'done';
  });
  assert.equal(result, 'done');
});
