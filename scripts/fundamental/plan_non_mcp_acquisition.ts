#!/usr/bin/env tsx
/** Build a deterministic, source-grouped acquisition plan from the preflight ledger. */
import fs from 'node:fs';
import path from 'node:path';
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const input = arg('--ledger');
if (!input) throw new Error('--ledger is required');
const ledger = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
const groups: Record<string, Array<{ symbol: string; field: string; fallbackOrder: string[] }>> = {};
for (const row of ledger.rows || []) for (const [field, value] of Object.entries<any>(row.fields || {})) {
  if (value.status !== 'GAP') continue;
  const source = String(value.fallbackOrder?.[0] || 'CACHE');
  (groups[source] ||= []).push({ symbol: row.symbol, field, fallbackOrder: value.fallbackOrder || [] });
}
for (const key of Object.keys(groups)) groups[key].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.field.localeCompare(b.field));
const plan = { generatedAt: new Date().toISOString(), mcpUsed: false, symbols: ledger.symbolCount, gapCount: Object.values(groups).reduce((n, x) => n + x.length, 0), groups };
const out = arg('--out') || path.join(process.cwd(), 'reports', 'non_mcp', 'acquisition_plan.json');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(path.resolve(out), JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({ out, symbols: plan.symbols, gapCount: plan.gapCount, sources: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])) }, null, 2));
