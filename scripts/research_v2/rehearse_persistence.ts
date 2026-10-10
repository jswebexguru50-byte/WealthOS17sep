#!/usr/bin/env node
/** Copy-only persistence rehearsal. Never writes the supplied source database. */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { applyResearchV2Schema } from '../../src/server/db/migrations/research_v2_migration.js';
import { assertSafeWrite, DbGuardError, openForWrite } from '../../src/server/research_v2/db/dbGuard.js';
const source = process.argv[2] || process.env.WEALTHOS_REHEARSAL_SOURCE;
if (!source) { console.error('Usage: tsx scripts/research_v2/rehearse_persistence.ts <source.db>'); process.exit(2); }
const sourcePath = path.resolve(source); if (!fs.existsSync(sourcePath)) { console.error(`Source database not found: ${sourcePath}`); process.exit(2); }
const digest = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); const before = digest(sourcePath);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wealthos-rehearsal-')); const copy = path.join(dir, 'research-copy.sqlite'); const backup = path.join(dir, 'research-copy.backup.sqlite');
fs.copyFileSync(sourcePath, copy); fs.copyFileSync(sourcePath, backup); let rolledBack = false;
openForWrite({ dbPath: copy }, db => { applyResearchV2Schema(db); db.exec('CREATE TABLE IF NOT EXISTS rehearsal_marker (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL)'); db.prepare('INSERT INTO rehearsal_marker(created_at) VALUES (?)').run(new Date().toISOString()); });
try { openForWrite({ dbPath: copy }, db => { db.exec('CREATE TABLE rehearsal_rollback_probe (id INTEGER)'); throw new Error('rollback probe'); }); } catch (e) { if ((e as Error).message === 'rollback probe') rolledBack = true; else throw e; }
const check = new Database(copy, { readonly: true }); const tables = check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'research_%'").all(); const markerCount = (check.prepare('SELECT COUNT(*) AS n FROM rehearsal_marker').get() as { n: number }).n; const rollbackAbsent = (check.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='rehearsal_rollback_probe'").get() as { n: number }).n === 0; check.close();
let productionRefused = false; try { assertSafeWrite({ dbPath: sourcePath }); } catch (e) { productionRefused = e instanceof DbGuardError && e.code === 'PRODUCTION_WRITE_NOT_ALLOWED'; }
const result = { source: sourcePath, copy, backup, sourceUnchanged: before === digest(sourcePath), productionRefused, rolledBack, markerCount, rollbackAbsent, researchTables: tables.length }; process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (!result.sourceUnchanged || !result.productionRefused || !result.rolledBack || !result.rollbackAbsent) process.exitCode = 1;
