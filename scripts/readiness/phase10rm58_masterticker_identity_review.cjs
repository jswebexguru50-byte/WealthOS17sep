#!/usr/bin/env node
'use strict';
/**
 * STEP 5 — PHASE10RM58_MASTERTICKER_IDENTITY_REVIEW
 * Re-examines all 37 duplicate-symbol findings using fresh portfolio.db evidence.
 * Does NOT modify MasterTickers.
 * Produces proposed correction set (no automatic application).
 */
const fs       = require('node:fs');
const path     = require('node:path');
const Database = require('better-sqlite3');

const ROOT      = process.cwd();
const READINESS = path.join(ROOT, 'reports/readiness');
const PORTFOLIO = path.join(ROOT, 'portfolio.db');
const MT_IN     = path.join(READINESS, 'PHASE10RM5_MASTERTICKER_COLLISIONS.json');

console.log('[STEP 5] MasterTicker identity review of 37 duplicate symbols...\n');

const source = JSON.parse(fs.readFileSync(MT_IN, 'utf8'));
const findings = source.findings || [];
if (findings.length !== 37) {
  console.error(`FAIL: Expected 37 findings, found ${findings.length}`);
  process.exit(1);
}
console.log(`  Loaded ${findings.length} collision findings.`);

// ── Load MasterTickers from portfolio.db ──────────────────────────────────────
const pdb = new Database(PORTFOLIO, { readonly: true });
const tables  = pdb.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
const mtTable = tables.find(t => /masterticker|master_ticker|instruments/i.test(t));
console.log(`  MasterTickers table: ${mtTable || 'NOT_FOUND'}`);

let allMasterTickers = [];
let mtCols = [];
if (mtTable) {
  mtCols = pdb.prepare(`PRAGMA table_info("${mtTable}")`).all().map(r => r.name);
  allMasterTickers = pdb.prepare(`SELECT * FROM "${mtTable}"`).all();
  console.log(`  Total MasterTicker rows: ${allMasterTickers.length}, columns: ${mtCols.join(', ')}`);
}

// Detect key columns
const symCol  = mtCols.find(c => /^symbol$/i.test(c)) || 'symbol';
const isinCol = mtCols.find(c => /^isin$/i.test(c)) || 'isin';
const exchCol = mtCols.find(c => /exchange/i.test(c)) || 'exchange';
const segCol  = mtCols.find(c => /segment/i.test(c)) || 'segment';
const pkCol   = mtCols.find(c => /provider_key|providerkey/i.test(c)) || 'provider_key';

// Build symbol → [records] map from DB
const dbBySymbol = new Map();
for (const r of allMasterTickers) {
  const sym = r[symCol];
  if (!dbBySymbol.has(sym)) dbBySymbol.set(sym, []);
  dbBySymbol.get(sym).push(r);
}

// ── Load OHLCV table for historical evidence ──────────────────────────────────
const ohlcTable = tables.find(t => /daily|ohlc|candle|market_data/i.test(t));
const ohlcCols  = ohlcTable ? pdb.prepare(`PRAGMA table_info("${ohlcTable}")`).all().map(r => r.name) : [];
const dateColO  = ohlcCols.find(c => /trade_date|date$/i.test(c)) || 'trade_date';
const pkColO    = ohlcCols.find(c => /provider_key|providerkey/i.test(c));

function getHistoricalRange(providerKey) {
  if (!ohlcTable || !pkColO) return null;
  try {
    return pdb.prepare(
      `SELECT MIN("${dateColO}") min_d, MAX("${dateColO}") max_d, COUNT(*) cnt FROM "${ohlcTable}" WHERE "${pkColO}"=?`
    ).get(providerKey);
  } catch(e) { return null; }
}

// ── Classify each duplicate symbol ───────────────────────────────────────────
const classCounts = {
  VALID_DISTINCT_INSTRUMENTS: 0,
  IDENTITY_REVIEW:            0,
  PROPOSED_CORRECTION:        0,
  UNRESOLVED:                 0
};
const reviewed = [];
const proposedCorrections = [];

for (const finding of findings) {
  const sym     = finding.symbol;
  const dbRecs  = dbBySymbol.get(sym) || [];

  if (dbRecs.length === 0) {
    classCounts.UNRESOLVED++;
    reviewed.push({
      symbol: sym,
      prior_disposition: finding.disposition,
      current_classification: 'UNRESOLVED',
      reason: 'Symbol not found in live MasterTickers table',
      records: [],
      evidence: { db_records: 0 }
    });
    continue;
  }

  // Extract identity dimensions for each record
  const identities = dbRecs.map(r => ({
    symbol:       r[symCol],
    isin:         r[isinCol] || null,
    exchange:     r[exchCol] || null,
    segment:      r[segCol]  || null,
    provider_key: r[pkCol]   || null,
    historical:   r[pkCol] ? getHistoricalRange(r[pkCol]) : null
  }));

  // Check uniqueness along identity dimensions
  const isins     = [...new Set(identities.map(i => i.isin).filter(Boolean))];
  const exchanges = [...new Set(identities.map(i => i.exchange).filter(Boolean))];
  const segments  = [...new Set(identities.map(i => i.segment).filter(Boolean))];
  const pkeys     = [...new Set(identities.map(i => i.provider_key).filter(Boolean))];

  let classification, reason, proposed = null;

  if (isins.length > 1) {
    // Different ISINs → definitely distinct instruments sharing a symbol
    classification = 'VALID_DISTINCT_INSTRUMENTS';
    reason = `${dbRecs.length} records share symbol "${sym}" but have ${isins.length} distinct ISINs (${isins.join(', ')}). Different ISINs = different legal instruments. No correction needed.`;
  } else if (isins.length === 1 && (exchanges.length > 1 || segments.length > 1)) {
    // Same ISIN, different exchange/segment → same instrument listed on multiple venues
    classification = 'VALID_DISTINCT_INSTRUMENTS';
    reason = `Same ISIN (${isins[0]}) but listed on ${exchanges.length > 1 ? exchanges.join('/') : segments.join('/')} — same instrument, different venue. No correction needed.`;
  } else if (isins.length === 1 && exchanges.length === 1 && segments.length === 1 && pkeys.length > 1) {
    // Same ISIN + same exchange + same segment but multiple provider keys
    classification = 'IDENTITY_REVIEW';
    reason = `Same ISIN (${isins[0]}), exchange (${exchanges[0]}), segment (${segments[0]}) but ${pkeys.length} distinct provider_keys. Possible duplicate record. Requires identity investigation.`;
    proposed = {
      issue: 'DUPLICATE_PROVIDER_KEY_FOR_SAME_INSTRUMENT',
      candidate_keys: pkeys,
      recommended_action: 'Investigate which provider_key is authoritative. Proposed: retain the key with greater historical coverage.',
      authoritative_key: identities.sort((a,b)=>((b.historical?.cnt||0)-(a.historical?.cnt||0)))[0]?.provider_key,
      confidence: 'LOW',
      note: 'DO NOT apply automatically. Human review required.'
    };
    proposedCorrections.push({ symbol: sym, ...proposed });
  } else if (isins.length === 0) {
    classification = 'UNRESOLVED';
    reason = 'No ISIN data available for any record — cannot resolve by identity.';
  } else {
    // Same everything — possible true duplicate
    classification = 'IDENTITY_REVIEW';
    reason = `All identity dimensions match (ISIN: ${isins[0]}, exchange: ${exchanges[0]}, segment: ${segments[0]}). Records appear identical — possible import duplicate.`;
  }

  classCounts[classification]++;
  reviewed.push({
    symbol:                 sym,
    prior_disposition:      finding.disposition,
    current_classification: classification,
    reason,
    record_count:           dbRecs.length,
    identities,
    proposed_correction:    proposed
  });
}

pdb.close();

const accounted   = reviewed.length;
const unaccounted = 37 - accounted;

const report = {
  timestamp: new Date().toISOString(),
  total_duplicate_symbols: 37,
  accounted,
  UNACCOUNTED: unaccounted,
  classification_summary: classCounts,
  proposed_corrections_count: proposedCorrections.length,
  masterticker_modified: false,
  production_db_writes:  0,
  important_caveats: [
    'No MasterTicker records have been modified.',
    'Proposed corrections are candidates only — require explicit human authorization.',
    'VALID_DISTINCT_INSTRUMENTS: different ISINs or venues confirm these are legitimately separate instruments.',
    'IDENTITY_REVIEW: same identity dimensions found — requires human investigation.',
    'Provider_key selection from historical coverage is a heuristic suggestion only.'
  ],
  findings: reviewed,
  proposed_corrections: proposedCorrections
};

const OUT_JSON = path.join(READINESS, 'PHASE10RM58_MASTERTICKER_IDENTITY_REVIEW.json');
const OUT_MD   = path.join(READINESS, 'PHASE10RM58_MASTERTICKER_IDENTITY_REVIEW.md');
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

const md = `# Phase 10R-M5.8 MasterTicker Identity Review

**Total duplicate-symbol findings**: 37
**Accounted**: ${accounted} | **UNACCOUNTED**: ${unaccounted}
**MasterTicker modifications applied**: NONE

## Classification Summary

| Classification | Count |
|---------------|-------|
${Object.entries(classCounts).map(([k,v])=>`| ${k} | ${v} |`).join('\n')}

## Methodology

Resolution order:
1. symbol → distinct ISIN? → VALID_DISTINCT_INSTRUMENTS
2. same ISIN → distinct exchange/segment? → VALID_DISTINCT_INSTRUMENTS
3. same ISIN + same exchange + same segment + multiple provider_keys → IDENTITY_REVIEW
4. no ISIN data → UNRESOLVED

## Proposed Corrections (${proposedCorrections.length})

${proposedCorrections.length === 0 ? 'None.' : proposedCorrections.map(p=>`- **${p.symbol}**: ${p.issue} — authoritative key candidate: \`${p.authoritative_key}\` (${p.confidence} confidence)\n  > ${p.note}`).join('\n')}

> **No corrections have been applied. All proposed corrections require explicit human authorization.**

Production DB writes: **0** | MasterTicker writes: **0**
`;
fs.writeFileSync(OUT_MD, md);

console.log('\n  Classification summary:');
Object.entries(classCounts).forEach(([k,v])=>console.log(`    ${k}: ${v}`));
console.log(`  Proposed corrections: ${proposedCorrections.length}`);
console.log(`  Accounted: ${accounted}/37 | UNACCOUNTED: ${unaccounted}`);
if (unaccounted !== 0) { console.error('FAIL: UNACCOUNTED > 0'); process.exit(1); }
console.log('  Outputs: PHASE10RM58_MASTERTICKER_IDENTITY_REVIEW.json/.md');
