#!/usr/bin/env tsx
/** Promote safe, explicitly mapped Upstox ratio snapshots into company_facts. */
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const db = new Database(path.join(root, 'portfolio.db'));
const now = new Date().toISOString();
const mappings: Record<string, { metric: string; unit: string }> = {
  'P/E': { metric: 'pe_ratio', unit: 'RATIO' },
  'P/B': { metric: 'pb_ratio', unit: 'RATIO' },
  'ROE': { metric: 'roe_pct', unit: 'PERCENT' },
  'ROCE': { metric: 'roce_reported', unit: 'PERCENT' },
  'Quick Ratio': { metric: 'quick_ratio', unit: 'RATIO' },
};
const rows = db.prepare(`
  SELECT s.symbol, s.isin, s.fetched_at, s.response_json
  FROM fundamental_endpoint_snapshots s
  WHERE s.provider='UPSTOX_FUNDAMENTALS' AND s.endpoint='key-ratios' AND s.status='SUCCESS'
`).all() as any[];
const insert = db.prepare(`
  INSERT OR REPLACE INTO company_facts
  (factId, companyId, symbol, isin, metric, value, unit, currency, periodType,
   periodStart, periodEnd, asOfDate, reportedAt, factType, sourceType, scope,
   provider, sourceDocumentId, sourceUrl, evidenceText, verificationStatus,
   availabilityStatus, fetchedAt, freshnessTtlDays, providerToken,
   exactProviderLabel, availableAt, publishedAt)
  VALUES (@factId,@companyId,@symbol,@isin,@metric,@value,@unit,NULL,'LATEST',
   NULL,@periodEnd,@periodEnd,@periodEnd,'REPORTED','BROKER_API','CONSOLIDATED',
   'UPSTOX_FUNDAMENTALS',@sourceDocumentId,@sourceUrl,@evidenceText,
   'VERIFIED_PARTIAL','AVAILABLE',@fetchedAt,7,@providerToken,@label,@availableAt,@periodEnd)
`);
let inserted = 0;
const tx = db.transaction(() => {
  for (const row of rows) {
    let payload: any;
    try { payload = JSON.parse(String(row.response_json)); } catch { continue; }
    const list = payload?.data;
    if (!Array.isArray(list)) continue;
    const periodEnd = String(row.fetched_at).slice(0, 10);
    for (const item of list) {
      const mapping = mappings[String(item?.name || '').trim()];
      if (!mapping) continue;
      const raw = String(item?.company_value ?? '').replace(/%/g, '').replace(/,/g, '').trim();
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const token = String(item.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const sourceDocumentId = `UPSTOX_FUNDAMENTALS:${row.symbol}:key-ratios:${row.fetched_at}`;
      insert.run({
        factId: crypto.createHash('sha256').update(`${sourceDocumentId}:${mapping.metric}`).digest('hex'),
        companyId: row.isin || row.symbol, symbol: row.symbol, isin: row.isin || null,
        metric: mapping.metric, value, unit: mapping.unit, periodEnd,
        sourceDocumentId, sourceUrl: `https://api.upstox.com/v2/fundamentals/${encodeURIComponent(row.isin || row.symbol)}/key-ratios`,
        evidenceText: JSON.stringify({ name: item.name, company_value: item.company_value, sector_value: item.sector_value }),
        fetchedAt: row.fetched_at, providerToken: token, label: item.name, availableAt: row.fetched_at,
      });
      inserted++;
    }
  }
});
tx();
db.close();
console.log(JSON.stringify({ provider: 'UPSTOX_FUNDAMENTALS', snapshots: rows.length, factsInserted: inserted, mcpUsed: false }, null, 2));
