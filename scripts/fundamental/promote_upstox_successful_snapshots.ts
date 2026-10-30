#!/usr/bin/env tsx
/**
 * Non-acquisitive Upstox promotion reconciler.
 * Reads only durable SUCCESS endpoint snapshots and promotes explicit cells.
 * Safe to rerun: fact IDs are deterministic and writes are idempotent.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import sqlite3 from 'sqlite3';

const root = path.resolve(process.cwd());
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');
const all = (db: sqlite3.Database, sql: string, p: unknown[] = []) => new Promise<any[]>((resolve, reject) => db.all(sql, p, (e, rows) => e ? reject(e) : resolve(rows || [])));
const run = (db: sqlite3.Database, sql: string, p: unknown[] = []) => new Promise<void>((resolve, reject) => db.run(sql, p, e => e ? reject(e) : resolve()));
const close = (db: sqlite3.Database) => new Promise<void>(resolve => db.close(() => resolve()));
const periodEnd = (period: unknown): string | null => {
  const m = String(period ?? '').match(/^([A-Za-z]{3})\s+(\d{4})$/); if (!m) return null;
  const month = new Map([['Mar', '03'], ['Jun', '06'], ['Sep', '09'], ['Dec', '12']]).get(m[1]); if (!month) return null;
  const last = new Date(Date.UTC(Number(m[2]), Number(month), 0)).getUTCDate();
  return `${m[2]}-${month}-${String(last).padStart(2, '0')}`;
};
const endpointMap: Record<string, Record<string, string>> = {
  'income-statement': { revenue: 'revenue', operating_profit: 'operating_profit', net_profit: 'pat' },
  'cash-flow': { operating: 'cfo', investing: 'cfi', financing: 'cff' },
  'share-holdings': { promoters: 'promoter_holding', fii: 'fii_holding', mutual_funds: 'mf_holding', other_dii: 'dii_holding' },
};
const unitFor = (endpoint: string) => endpoint === 'share-holdings' ? 'PERCENT' : 'INR_CR';
const keyRatioMap: Record<string, { metric: string; unit: string }> = {
  'P/E': { metric: 'pe_ratio', unit: 'RATIO' },
  'P/B': { metric: 'pb_ratio', unit: 'RATIO' },
  ROE: { metric: 'roe_pct', unit: 'PERCENT' },
  ROCE: { metric: 'roce_reported', unit: 'PERCENT' },
  'Quick Ratio': { metric: 'quick_ratio', unit: 'RATIO' },
};

const db = new sqlite3.Database(dbPath); db.configure('busyTimeout', 10000);
let selected = 0, promoted = 0, skipped = 0, failed = 0;
try {
  const rows = await all(db, `SELECT symbol,isin,endpoint,fetched_at,response_json
    FROM fundamental_endpoint_snapshots
    WHERE provider='UPSTOX_FUNDAMENTALS' AND status='SUCCESS'
      AND endpoint IN ('income-statement','cash-flow','share-holdings','key-ratios')
    ORDER BY UPPER(symbol), endpoint, fetched_at`);
  const latest = new Map<string, any>();
  for (const row of rows) latest.set(`${String(row.symbol).toUpperCase()}:${row.endpoint}`, row);
  selected = latest.size;
  for (const row of latest.values()) {
    try {
      const payload = JSON.parse(String(row.response_json || '{}'));
      const values: Array<{ metric: string; value: number; periodEnd: string }> = [];
      if (row.endpoint === 'key-ratios') {
        // Upstox returns ratios as a latest snapshot rather than a history.
        // Keep the fetched date as the period so the fact remains freshness-aware.
        const latestDate = String(row.fetched_at).slice(0, 10);
        for (const item of (payload?.data || [])) {
          const mapping = keyRatioMap[String(item?.name || '').trim()];
          const value = Number(String(item?.company_value ?? '').replace(/[% ,]/g, ''));
          if (mapping && Number.isFinite(value)) values.push({ metric: mapping.metric, value, periodEnd: latestDate });
        }
      } else if (row.endpoint === 'share-holdings') {
        for (const category of (payload?.data || [])) for (const h of (category.history || [])) {
          const metric = endpointMap[row.endpoint]?.[String(category.category)]; const date = periodEnd(h.period); const value = Number(h.value);
          if (metric && date && Number.isFinite(value)) values.push({ metric, value, periodEnd: date });
        }
      } else {
        const key = row.endpoint === 'income-statement' ? 'income_statement' : 'cash_flow';
        for (const category of (payload?.data?.[key] || [])) for (const h of (category.history || [])) {
          const metric = endpointMap[row.endpoint]?.[String(category.category)]; const date = periodEnd(h.period); const value = Number(h.value);
          if (metric && date && Number.isFinite(value)) values.push({ metric, value, periodEnd: date });
        }
      }
      if (!values.length) { skipped++; continue; }
      const sourceId = `UPSTOX_FUNDAMENTALS:${row.symbol}:${row.endpoint}:${row.fetched_at}`;
      for (const item of values) {
        const factId = crypto.createHash('sha256').update(`${sourceId}:${item.metric}:${item.periodEnd}`).digest('hex');
        await run(db, `INSERT OR REPLACE INTO company_facts
          (factId,companyId,symbol,isin,metric,value,unit,currency,periodType,periodStart,periodEnd,asOfDate,reportedAt,factType,sourceType,scope,provider,sourceDocumentId,sourceUrl,evidenceText,verificationStatus,availabilityStatus,fetchedAt,freshnessTtlDays,providerToken,exactProviderLabel,availableAt,publishedAt)
          VALUES(?,?,?,?,?,?,?,NULL,?,NULL,?,?,?,'REPORTED','BROKER_API','CONSOLIDATED','UPSTOX_FUNDAMENTALS',?,?,?,'VERIFIED_PARTIAL','AVAILABLE',?,365,?,?,?,?)`,
          [factId, row.isin || row.symbol, row.symbol, row.isin || null, item.metric, item.value,
            row.endpoint === 'key-ratios' ? (keyRatioMap[Object.keys(keyRatioMap).find(k => keyRatioMap[k].metric === item.metric) || '']?.unit || 'RATIO') : unitFor(row.endpoint),
            'ANNUAL', item.periodEnd, item.periodEnd, item.periodEnd, sourceId,
            `https://api.upstox.com/v2/fundamentals/${encodeURIComponent(String(row.isin || row.symbol))}/${row.endpoint}`,
            JSON.stringify({ endpoint: row.endpoint, periodEnd: item.periodEnd }), row.fetched_at, row.endpoint, item.metric, row.fetched_at, item.periodEnd]);
        promoted++;
      }
    } catch (error) { failed++; console.warn(`[Upstox promotion] ${row.symbol}/${row.endpoint}: ${String(error)}`); }
  }
} finally { await close(db); }
console.log(JSON.stringify({ selected, promoted, skipped, failed, mcpUsed: false, db: dbPath }, null, 2));
