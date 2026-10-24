#!/usr/bin/env node
/**
 * Run all pending canonical migrations against portfolio.db.
 * Usage: node scripts/db/run_canonical_migrations.mjs [--db-path path/to/db]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

// Run via tsx so TypeScript migrations load directly
const args = process.argv.slice(2);
const dbPath = (() => {
  const i = args.indexOf('--db-path');
  if (i !== -1) return args[i + 1];
  return process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') ?? path.join(root, 'portfolio.db');
})();

const result = spawnSync(
  'node',
  [
    '--loader', 'ts-node/esm',
    '--experimental-specifier-resolution=node',
    '-e',
    `
import Database from 'better-sqlite3';
import { Migrator } from './src/server/db/migrator.js';
import { canonicalMigrations } from './src/server/db/migrations/index.js';

const db = new Database(${JSON.stringify(dbPath)});
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migrator = new Migrator(canonicalMigrations);
const result = migrator.runPending(db);
console.log(JSON.stringify(result, null, 2));
db.close();
`
  ],
  { cwd: root, encoding: 'utf8', env: { ...process.env, DATABASE_URL: `sqlite://${dbPath}` } }
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 0);
