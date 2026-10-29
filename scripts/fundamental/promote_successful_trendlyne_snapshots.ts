#!/usr/bin/env tsx
/**
 * Deterministically reconcile successful Trendlyne snapshots into company_facts.
 *
 * This is intentionally non-acquisitive: it reads only durable SUCCESS rows,
 * promotes them through the shared canonical writer, and checkpoints every
 * symbol. It is safe to rerun because canonical fact IDs are idempotent.
 */
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { CanonicalFactIngestionService } from '../../src/server/services/CanonicalFactIngestionService.js';

const root = process.cwd();
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const checkpointPath = path.resolve(process.argv[process.argv.indexOf('--checkpoint') + 1] || path.join(root, 'reports', 'trendlyne_mirror', 'promotion_checkpoint.json'));
const maxSymbolsArg = process.argv.indexOf('--max-symbols');
const maxSymbols = maxSymbolsArg >= 0 ? Math.max(0, Number(process.argv[maxSymbolsArg + 1])) : 0;

type Row = { symbol: string };
const all = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<Row[]>((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve((rows || []) as Row[])),
);
const close = (db: sqlite3.Database) => new Promise<void>(resolve => db.close(() => resolve()));

const db = new sqlite3.Database(dbPath);
db.configure('busyTimeout', 10000);
const writer = new CanonicalFactIngestionService(db);
const saved = fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) : { completed: [] };
const completed = new Set<string>((saved.completed || []).map((s: unknown) => String(s).toUpperCase()));
const rows = await all(db, `
  SELECT DISTINCT UPPER(symbol) AS symbol
  FROM fundamental_endpoint_snapshots
  WHERE provider='TRENDLYNE_MCP' AND status='SUCCESS'
    AND (endpoint LIKE 'pack:%' OR endpoint IN ('parameters','get_stock_parameter_values','statement_history_parameters','quarterly_profit_history'))
  ORDER BY UPPER(symbol)
`);
const symbols = rows.map(r => r.symbol).filter(Boolean).filter(s => !completed.has(s)).slice(0, maxSymbols || undefined);
let promoted = 0;
let failed = 0;
for (const symbol of symbols) {
  try {
    promoted += await writer.ingestForSymbol(symbol);
    completed.add(symbol);
  } catch (error) {
    failed++;
    console.warn(`[Trendlyne promotion] ${symbol} failed: ${String(error)}`);
  }
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.writeFileSync(checkpointPath, JSON.stringify({ updatedAt: new Date().toISOString(), completed: [...completed].sort(), failed }, null, 2) + '\n');
}
await close(db);
console.log(JSON.stringify({ selected: symbols.length, promoted, failed, checkpoint: checkpointPath, mcpUsed: false }, null, 2));
