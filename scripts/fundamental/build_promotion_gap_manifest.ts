#!/usr/bin/env tsx
/** Emit only symbols that failed canonical promotion verification. */
import fs from 'node:fs';
import path from 'node:path';
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const input = arg('--verification');
if (!input) throw new Error('--verification is required');
const report = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
const rows = (report.rows || []).filter((r: any) => r.status !== 'PROMOTED');
const symbols = [...new Set(rows.map((r: any) => String(r.symbol).toUpperCase()))];
const out = arg('--out') || path.join(process.cwd(), 'reports', 'non_mcp', 'promotion_gap_manifest.json');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(path.resolve(out), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), source: 'promotion_verification', entries: symbols.map(symbol => ({ symbol })) }, null, 2) + '\n');
console.log(JSON.stringify({ out, symbols: symbols.length }, null, 2));
