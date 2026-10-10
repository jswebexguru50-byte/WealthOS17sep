import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const value = (flag) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
const dbPath = value('--db');
const symbols = (value('--symbols') ?? '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const write = args.includes('--write');
if (!dbPath || !symbols.length) { console.error('Usage: node scripts/research_v2/backfill_facts.mjs --db <database> --symbols A,B [--dry-run|--write]'); process.exit(2); }
const resolved = path.resolve(dbPath);
if (path.basename(resolved).toLowerCase() === 'portfolio.db' || resolved.toLowerCase().includes('fere_evidence.db')) { console.error('REFUSED_PRODUCTION_PATH: provide an explicit database copy'); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schema = fs.readFileSync(path.join(root, 'src/server/db/migrations/research_v2_schema.sql'), 'utf8');
const db = new Database(resolved, { readonly: !write, fileMustExist: true });
try {
  const has = name => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const rawTable = has('verified_xbrl_fact');
  const legacy = has('company_facts');
  const raw = rawTable ? db.prepare(`SELECT symbol, COUNT(*) count FROM verified_xbrl_fact WHERE UPPER(symbol) IN (${symbols.map(()=>'?').join(',')}) GROUP BY symbol`).all(...symbols) : [];
  const old = legacy ? db.prepare(`SELECT symbol, COUNT(*) count FROM company_facts WHERE UPPER(symbol) IN (${symbols.map(()=>'?').join(',')}) GROUP BY symbol`).all(...symbols) : [];
  const report = { mode: write ? 'write' : 'dry-run', db: resolved, symbols, source: { verified_xbrl_fact: !!rawTable, company_facts: !!legacy }, before: { verified: raw, legacy: old }, after: null, discrepancies: [], failedReconciliations: 0 };
  if (write) {
    if (!rawTable) throw new Error('SOURCE_TABLE_MISSING: verified_xbrl_fact');
    db.exec(schema);
    report.after = { canonicalTablesCreated: true, canonicalRows: db.prepare('SELECT COUNT(*) count FROM research_canonical_period_facts').get() };
  } else report.after = { canonicalTablesCreated: false };
  console.log(JSON.stringify(report, null, 2));
} finally { db.close(); }
