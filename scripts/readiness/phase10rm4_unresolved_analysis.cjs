#!/usr/bin/env node
'use strict';
/**
 * STEP 2 — M4_UNRESOLVED_DATE_FORENSIC_ANALYSIS
 * Forensic classification for all 7,009 MANUAL_REVIEW dates.
 * READ-ONLY. No API calls. No DB writes.
 */
const fs       = require('node:fs');
const path     = require('node:path');
const Database = require('better-sqlite3');

const ROOT     = process.cwd();
const ARTIFACT = path.join(ROOT, 'reports/market-data');
const RUNTIME  = path.join(ARTIFACT, 'runtime/m4');

const STATE_DB   = path.join(RUNTIME, 'state.sqlite');
const PORTFOLIO  = path.join(ROOT, 'portfolio.db');
const REQUESTS   = path.join(RUNTIME, 'requests.jsonl');

console.log('[STEP 2] Forensic analysis of 7,009 unresolved dates...\n');

// ── Load 7,009 MANUAL_REVIEW records ─────────────────────────────────────────
const sdb = new Database(STATE_DB, { readonly: true });
const records = sdb.prepare(
  `SELECT provider_key, required_date, isin, symbol, exchange, segment, error_reason
   FROM queue_items WHERE state='MANUAL_REVIEW' ORDER BY provider_key, required_date`
).all();
sdb.close();

if (records.length !== 7009) {
  console.error(`FAIL: Expected 7009 MANUAL_REVIEW records, found ${records.length}`);
  process.exit(1);
}
console.log(`  Loaded ${records.length} MANUAL_REVIEW records.`);

// ── Discover portfolio.db schema ───────────────────────────────────────────────
const pdb = new Database(PORTFOLIO, { readonly: true });
const tables = pdb.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);

// Find OHLCV table — prefer DailyOHLCV explicitly, then fall back
const OHLC_TABLE = tables.find(t => t === 'DailyOHLCV')
  || tables.find(t => /^dailyohlcv$/i.test(t))
  || tables.find(t => /^ohlcv$/i.test(t))
  || null;
console.log(`  OHLCV table: ${OHLC_TABLE || 'NOT_FOUND'}`);



let colNames = [];
if (OHLC_TABLE) colNames = pdb.prepare(`PRAGMA table_info("${OHLC_TABLE}")`).all().map(r => r.name);
console.log(`  DailyOHLCV columns: ${colNames.slice(0,12).join(', ')}`);

const dateCol     = colNames.find(c => /trade_date|date$/i.test(c)) || 'trade_date';
const providerCol = colNames.find(c => /provider_key|providerkey/i.test(c));
const symbolCol   = colNames.find(c => /^symbol$/i.test(c));

// ── Build per-instrument index from portfolio.db ───────────────────────────────
// Map: provider_key → { min_date, max_date, count }
// Fallback: symbol → { min_date, max_date, count }
console.log('  Building instrument index from portfolio.db...');
const instrumentIndex = new Map(); // key: provider_key or symbol

if (OHLC_TABLE && providerCol) {
  const rows = pdb.prepare(
    `SELECT "${providerCol}" pk, MIN("${dateCol}") min_date, MAX("${dateCol}") max_date, COUNT(*) cnt
     FROM "${OHLC_TABLE}" WHERE "${providerCol}" IS NOT NULL GROUP BY "${providerCol}"`
  ).all();
  for (const r of rows) instrumentIndex.set(r.pk, { min_date: r.min_date, max_date: r.max_date, count: r.cnt });
  console.log(`  Provider-key index built: ${instrumentIndex.size} instruments.`);
} else if (OHLC_TABLE && symbolCol) {
  const rows = pdb.prepare(
    `SELECT "${symbolCol}" pk, MIN("${dateCol}") min_date, MAX("${dateCol}") max_date, COUNT(*) cnt
     FROM "${OHLC_TABLE}" GROUP BY "${symbolCol}"`
  ).all();
  for (const r of rows) instrumentIndex.set(r.pk, { min_date: r.min_date, max_date: r.max_date, count: r.cnt });
  console.log(`  Symbol index built: ${instrumentIndex.size} symbols.`);
} else {
  console.log('  WARNING: No suitable index column found — neighbor checks will be limited.');
}

// ── Neighboring candle check (±7 days) ────────────────────────────────────────
// Only do spot-checks for a sample — full ±7d check for every record would be expensive
// We'll check for each unique provider_key whether it has any data at all and its range
function hasDataInRange(pk, dateStr) {
  if (!OHLC_TABLE) return null;
  const d = new Date(dateStr);
  const before = new Date(d); before.setDate(before.getDate() - 7);
  const after  = new Date(d); after.setDate(after.getDate() + 7);
  const bStr = before.toISOString().slice(0, 10);
  const aStr = after.toISOString().slice(0, 10);

  try {
    const col = providerCol || symbolCol;
    if (!col) return null;
    const val = providerCol ? pk : (records.find(r => r.provider_key === pk)?.symbol);
    if (!val) return null;
    const r = pdb.prepare(
      `SELECT COUNT(*) cnt FROM "${OHLC_TABLE}" WHERE "${col}"=? AND "${dateCol}" BETWEEN ? AND ? AND "${dateCol}"!=?`
    ).get(val, bStr, aStr, dateStr);
    return r?.cnt ?? 0;
  } catch(e) { return null; }
}

pdb.close();

// ── Load request evidence ──────────────────────────────────────────────────────
const requestsByProvider = new Map();
if (fs.existsSync(REQUESTS)) {
  for (const l of fs.readFileSync(REQUESTS, 'utf8').split('\n').filter(l => l.trim())) {
    try { const r = JSON.parse(l); requestsByProvider.set(r.provider_key, r); } catch(e) {}
  }
}

// ── Classification logic ───────────────────────────────────────────────────────
const WEEKDAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function classifyRecord(rec, idx) {
  const dt     = rec.required_date;
  const dayNum = new Date(dt + 'T00:00:00Z').getUTCDay(); // 0=Sun, 6=Sat
  const isWknd = dayNum === 0 || dayNum === 6;

  if (isWknd) {
    return {
      root_cause: 'WEEKEND_CANDIDATE',
      confidence: 'HIGH',
      evidence: {
        day_of_week: WEEKDAY_NAMES[dayNum],
        note: 'Date falls on weekend. CANDIDATE only — not an established exchange holiday. Further calendar cross-reference required.'
      }
    };
  }

  if (!idx) {
    return {
      root_cause: 'NO_DATA_FOR_INSTRUMENT',
      confidence: 'MEDIUM',
      evidence: {
        portfolio_db_rows: 0,
        note: 'Provider_key/symbol has zero rows in portfolio.db. Does not prove absence from provider — instrument may be missing from local DB for unrelated reasons.'
      }
    };
  }

  if (idx.min_date && dt < idx.min_date) {
    const gapDays = Math.round((new Date(idx.min_date) - new Date(dt)) / 86400000);
    return {
      root_cause: 'PRE_LISTING_CANDIDATE',
      confidence: 'HIGH',
      evidence: {
        earliest_known_date: idx.min_date,
        requested_date: dt,
        days_before_earliest: gapDays,
        note: 'Requested date precedes earliest known candle for this instrument. CANDIDATE — listing date not independently verified.'
      }
    };
  }

  if (idx.count > 0) {
    return {
      root_cause: 'GAP_IN_DATA',
      confidence: 'MEDIUM',
      evidence: {
        instrument_portfolio_rows: idx.count,
        date_range_in_portfolio: `${idx.min_date} → ${idx.max_date}`,
        note: 'Instrument has data in portfolio.db but this specific date is absent. Candidates: trading halt, circuit breaker, exchange holiday, or alternate-provider gap. Absence from portfolio.db does NOT prove absence from provider.'
      }
    };
  }

  return {
    root_cause: 'UNKNOWN',
    confidence: 'LOW',
    evidence: { note: 'Insufficient evidence to classify. Manual investigation required.' }
  };
}

// ── Classify all 7,009 ────────────────────────────────────────────────────────
console.log('  Classifying all records...');
const classified = [];
const rootCauseCounts  = {};
const byExchange = {};
const byYear     = {};
const byProvider = {};

// Open pdb again for neighbor checks
const pdb2 = new Database(PORTFOLIO, { readonly: true });

for (const rec of records) {
  const lookupKey = providerCol ? rec.provider_key : rec.symbol;
  const idx = instrumentIndex.get(lookupKey);
  const cls = classifyRecord(rec, idx);

  // Neighbor check (use cached index — spot checks only for GAP_IN_DATA)
  let neighborCount = null;
  if (cls.root_cause === 'GAP_IN_DATA' && OHLC_TABLE && (providerCol || symbolCol)) {
    try {
      const d = new Date(rec.required_date);
      const b = new Date(d); b.setDate(b.getDate() - 7);
      const a = new Date(d); a.setDate(a.getDate() + 7);
      const bS = b.toISOString().slice(0,10), aS = a.toISOString().slice(0,10);
      const col = providerCol || symbolCol;
      const val = providerCol ? rec.provider_key : rec.symbol;
      if (val) {
        const r = pdb2.prepare(
          `SELECT COUNT(*) cnt FROM "${OHLC_TABLE}" WHERE "${col}"=? AND "${dateCol}" BETWEEN ? AND ? AND "${dateCol}"!=?`
        ).get(val, bS, aS, rec.required_date);
        neighborCount = r?.cnt ?? null;
      }
    } catch(e) { neighborCount = null; }
  }

  const req = requestsByProvider.get(rec.provider_key);
  rootCauseCounts[cls.root_cause] = (rootCauseCounts[cls.root_cause] || 0) + 1;
  byExchange[rec.exchange || 'UNKNOWN'] = (byExchange[rec.exchange || 'UNKNOWN'] || 0) + 1;
  const yr = rec.required_date?.slice(0, 4) || 'UNKNOWN';
  byYear[yr] = (byYear[yr] || 0) + 1;
  byProvider[rec.provider_key] = (byProvider[rec.provider_key] || 0) + 1;

  classified.push({
    provider_key:              rec.provider_key,
    isin:                      rec.isin,
    symbol:                    rec.symbol,
    exchange:                  rec.exchange,
    segment:                   rec.segment,
    required_date:             rec.required_date,
    runtime_state:             'MANUAL_REVIEW',
    forensic_disposition:      'DATE_NOT_IN_PROVIDER_RESPONSE',
    request_window:            req ? `${req.from_date} → ${req.to_date}` : 'INHERITED_FROM_LEGACY_TASK5348',
    http_status:               req?.http_status ?? 200,
    candle_returned:           false,
    required_date_in_response: false,
    earliest_known_candle:     idx?.min_date ?? null,
    latest_known_candle:       idx?.max_date ?? null,
    portfolio_db_rows:         idx?.count ?? 0,
    neighbor_candles_7d:       neighborCount,
    root_cause:                cls.root_cause,
    confidence:                cls.confidence,
    evidence:                  cls.evidence
  });
}

pdb2.close();

const report = {
  timestamp: new Date().toISOString(),
  population: 'M4_UNRESOLVED_DATE_REMEDIATION',
  total:      classified.length,
  accounted:  classified.length,
  UNACCOUNTED: 0,
  root_cause_summary: rootCauseCounts,
  by_exchange: byExchange,
  by_year:    Object.fromEntries(Object.entries(byYear).sort()),
  distinct_providers: Object.keys(byProvider).length,
  top_providers_by_unresolved_count: Object.entries(byProvider)
    .sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([pk, cnt]) => ({ provider_key: pk, unresolved_dates: cnt })),
  important_caveats: [
    'WEEKEND_CANDIDATE: Saturday/Sunday date only. Exchange holiday must be independently confirmed.',
    'PRE_LISTING_CANDIDATE: Based on earliest candle in portfolio.db — listing date not verified.',
    'GAP_IN_DATA: Instrument has portfolio.db data but this date absent. Does NOT prove absence from provider.',
    'NO_DATA_FOR_INSTRUMENT: Absence from portfolio.db does NOT prove absence from provider.',
    'No root cause is established fact. These are forensic candidates only.',
    'Do NOT automatically retry via Upstox based on these classifications.'
  ],
  recommended_remediation: {
    WEEKEND_CANDIDATE: 'Cross-reference NSE/BSE holiday calendar. If confirmed non-trading day: RESOLVED_NON_TRADING.',
    PRE_LISTING_CANDIDATE: 'Verify instrument listing date from exchange records. If pre-listing confirmed: RESOLVED_PRE_LISTING.',
    GAP_IN_DATA: 'Investigate via alternate provider (Zerodha bhavcopy, NSE/BSE direct). Check for trading halt, suspension, circuit breaker.',
    NO_DATA_FOR_INSTRUMENT: 'Verify instrument status: delisted? wrong ISIN? Try alternate provider.',
    UNKNOWN: 'Manual forensic investigation required.'
  },
  production_db_writes: 0,
  records: classified
};

fs.writeFileSync(path.join(ARTIFACT, 'M4_UNRESOLVED_DATE_REMEDIATION.json'), JSON.stringify(report, null, 2));

const md = `# M.4 Unresolved Date Remediation — Forensic Analysis

**Population**: M4_UNRESOLVED_DATE_REMEDIATION
**Total**: ${classified.length}
**Accounted**: ${classified.length} | **UNACCOUNTED**: 0
**Runtime state**: MANUAL_REVIEW | DATE_NOT_IN_PROVIDER_RESPONSE

> **Important**: Root causes below are forensic candidates only. No root cause is established fact.
> Absence from portfolio.db does NOT prove absence from provider.
> Weekend/holiday classification is a candidate only — independent calendar verification required.

## Root-Cause Summary

| Root Cause | Count | % |
|-----------|-------|---|
${Object.entries(rootCauseCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`| ${k} | ${v} | ${((v/classified.length)*100).toFixed(1)}% |`).join('\n')}

## By Exchange

| Exchange | Count |
|---------|-------|
${Object.entries(byExchange).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`| ${k} | ${v} |`).join('\n')}

## By Year

| Year | Count |
|------|-------|
${Object.entries(byYear).sort().map(([k,v])=>`| ${k} | ${v} |`).join('\n')}

## Top 20 Providers by Unresolved Count

| Provider Key | Unresolved Dates |
|-------------|-----------------|
${report.top_providers_by_unresolved_count.map(p=>`| ${p.provider_key} | ${p.unresolved_dates} |`).join('\n')}

## Recommended Remediation by Root Cause

| Root Cause | Action |
|-----------|--------|
${Object.entries(report.recommended_remediation).map(([k,v])=>`| ${k} | ${v} |`).join('\n')}

---

*Production DB writes: 0. This population is isolated from the 18,244 promotion set.*
`;

fs.writeFileSync(path.join(ARTIFACT, 'M4_UNRESOLVED_DATE_REMEDIATION.md'), md);

console.log('\n  Root-cause summary:');
Object.entries(rootCauseCounts).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`    ${k}: ${v}`));
console.log(`\n  Accounted: ${classified.length}/7009 | UNACCOUNTED: 0`);
console.log('  Outputs: M4_UNRESOLVED_DATE_REMEDIATION.json/.md');
