#!/usr/bin/env tsx
/** Verify that acquired facts reached the canonical company_facts table. */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const manifestPath = arg('--manifest');
const minFacts = Math.max(1, Number(arg('--min-facts') || '29'));
if (!manifestPath) throw new Error('--manifest is required');
const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
const entries = Array.isArray(manifest) ? manifest : (manifest.entries || manifest.symbols || []);
const symbols = [...new Set(entries.map((e: any) => typeof e === 'string' ? e : e.symbol || e.ticker || e.listings?.[0]?.symbol).filter(Boolean).map((s: string) => s.toUpperCase()))];
const db = new Database(path.join(root, 'portfolio.db'), { readonly: true });
const statement = db.prepare(`SELECT COUNT(*) count, COUNT(DISTINCT metric) metrics, MAX(availableAt) latest FROM company_facts WHERE UPPER(symbol)=?`);
const rows = symbols.map(symbol => { const r: any = statement.get(symbol); const facts = Number(r?.count || 0); return { symbol, facts, metrics: Number(r?.metrics || 0), latest: r?.latest || null, status: facts >= minFacts ? 'PROMOTED' : 'NOT_PROMOTED' }; });
db.close();
const failed = rows.filter(r => r.status !== 'PROMOTED');
const result = { generatedAt: new Date().toISOString(), minFacts, symbols: rows.length, promoted: rows.length - failed.length, failed: failed.length, rows };
const out = arg('--out') || path.join(root, 'reports', 'non_mcp', 'promotion_verification.json');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(path.resolve(out), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ out, symbols: rows.length, promoted: result.promoted, failed: result.failed }, null, 2));
if (failed.length) process.exitCode = 2;
