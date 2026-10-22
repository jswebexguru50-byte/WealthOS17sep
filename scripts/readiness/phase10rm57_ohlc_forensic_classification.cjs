#!/usr/bin/env node
'use strict';
/**
 * STEP 4 — PHASE10RM57_OHLC_FORENSIC_CLASSIFICATION
 * Forensic root-cause classification for the 190 existing OHLC anomalies.
 * Does NOT modify any database row.
 * Does NOT repair any value.
 */
const fs       = require('node:fs');
const path     = require('node:path');
const Database = require('better-sqlite3');

const ROOT      = process.cwd();
const READINESS = path.join(ROOT, 'reports/readiness');
const PORTFOLIO = path.join(ROOT, 'portfolio.db');
const OHLC_IN   = path.join(READINESS, 'PHASE10RM5_OHLC_FORENSICS.json');

console.log('[STEP 4] OHLC forensic classification of 190 anomalies...\n');

const source = JSON.parse(fs.readFileSync(OHLC_IN, 'utf8'));
const anomalies = source.findings || [];
if (anomalies.length !== 190) {
  console.error(`FAIL: Expected 190 anomalies, found ${anomalies.length}`);
  process.exit(1);
}
console.log(`  Loaded ${anomalies.length} anomalies.`);

// ── Load MasterTickers from DB for identity resolution ────────────────────────
const pdb = new Database(PORTFOLIO, { readonly: true });
const tables = pdb.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
const mtTable = tables.find(t => /masterticker|master_ticker|instruments/i.test(t));
console.log(`  MasterTickers table: ${mtTable || 'NOT_FOUND'}`);

const mtBySymbol = new Map();
if (mtTable) {
  const mtCols = pdb.prepare(`PRAGMA table_info("${mtTable}")`).all().map(r => r.name);
  const symCol  = mtCols.find(c => /^symbol$/i.test(c)) || 'symbol';
  const isinCol = mtCols.find(c => /^isin$/i.test(c)) || 'isin';
  const rows = pdb.prepare(`SELECT "${symCol}" sym, "${isinCol}" isin, * FROM "${mtTable}"`).all();
  for (const r of rows) {
    if (!mtBySymbol.has(r.sym)) mtBySymbol.set(r.sym, []);
    mtBySymbol.get(r.sym).push(r);
  }
  console.log(`  MasterTickers loaded: ${mtBySymbol.size} distinct symbols.`);
}
pdb.close();

// ── Float-precision artifact detector ────────────────────────────────────────
// A float-precision artifact requires:
// 1. The violation is in the LAST significant digit(s) only
// 2. Within a defensible epsilon (1e-6 of the magnitude)
// 3. The violation magnitude is consistent with float32→float64 widening error
function isFloatPrecisionArtifact(o, h, l, c) {
  // Max absolute violation
  const violations = [
    { pair: 'H_vs_O', delta: h - Math.max(o, c) },   // negative = violation
    { pair: 'L_vs_OC', delta: Math.min(o, c) - l },  // negative = violation
    { pair: 'H_vs_L', delta: h - l }
  ];
  const magnitude = Math.max(Math.abs(o), Math.abs(h), Math.abs(l), Math.abs(c));
  const FLOAT32_EPSILON = magnitude * 1.2e-7 * 10; // float32 ulp at this magnitude × safety factor

  for (const v of violations) {
    if (v.delta < 0 && Math.abs(v.delta) <= FLOAT32_EPSILON) {
      return { is_artifact: true, violation_pair: v.pair, violation_magnitude: v.delta, epsilon: FLOAT32_EPSILON };
    }
  }
  return { is_artifact: false };
}

// ── Check OHLC invariants ─────────────────────────────────────────────────────
function checkOHLC(o, h, l, c) {
  const violations = [];
  if (h < o)  violations.push(`high(${h}) < open(${o})`);
  if (h < c)  violations.push(`high(${h}) < close(${c})`);
  if (l > o)  violations.push(`low(${l}) > open(${o})`);
  if (l > c)  violations.push(`low(${l}) > close(${c})`);
  if (h < l)  violations.push(`high(${h}) < low(${l})`);
  return violations;
}

// ── Classify each anomaly ─────────────────────────────────────────────────────
const classified = [];
const classCounts = {};

for (const a of anomalies) {
  const { row_identifier, symbol, trade_date, open: o, high: h, low: l, close: c, volume, classification, disposition } = a;

  const violations = checkOHLC(o, h, l, c);
  const mtRecords  = mtBySymbol.get(symbol);
  const identityResolved = mtRecords && mtRecords.length > 0;

  let rootCause, confidence, evidence, unresolvedQuestions = [];

  // ── Already classified IDENTITY_UNRESOLVED by prior M5 step ─────────────────
  if (classification === 'IDENTITY_UNRESOLVED') {
    // Check whether this symbol is now resolvable via MasterTickers
    if (!identityResolved) {
      rootCause  = 'IDENTITY_UNRESOLVED';
      confidence = 'HIGH';
      evidence   = {
        violated_invariants: violations,
        isin_in_record: a.ISIN,
        masterticker_match: null,
        note: 'Symbol not found in MasterTickers. Cannot resolve provider_key or ISIN. Identity remains unresolved — no correction possible without authoritative source evidence.'
      };
      unresolvedQuestions = ['What is the authoritative ISIN for this symbol?', 'Is this instrument listed on a known exchange?'];
    } else {
      // Symbol IS in MasterTickers — check if OHLC violation is a float artifact
      const fpTest = isFloatPrecisionArtifact(o, h, l, c);
      if (fpTest.is_artifact) {
        rootCause  = 'FLOAT_PRECISION_ARTIFACT';
        confidence = 'MEDIUM';
        evidence   = {
          violated_invariants: violations,
          violation_magnitude: fpTest.violation_magnitude,
          float32_epsilon: fpTest.epsilon,
          violation_pair: fpTest.violation_pair,
          masterticker_records: mtRecords.length,
          note: 'Violation magnitude is within float32→float64 widening tolerance. Identity now resolvable via MasterTickers. However — DO NOT repair values automatically. Float artifact classification requires human confirmation.'
        };
        unresolvedQuestions = ['Was this data stored as float32 originally?', 'Is rounding the appropriate correction or should the source be re-fetched?'];
      } else {
        // Identity resolvable but OHLC violation is substantive
        rootCause  = 'OHLC_RELATIONSHIP_VIOLATION';
        confidence = 'MEDIUM';
        evidence   = {
          violated_invariants: violations,
          masterticker_records: mtRecords.length,
          isin_from_masterticker: mtRecords[0]?.isin || null,
          note: 'OHLC invariant violated beyond float precision tolerance. Identity partially resolved via MasterTickers. Root cause of OHLC violation is not yet determined.'
        };
        unresolvedQuestions = ['Is this a split/adjustment artifact?', 'Was the source data correct?', 'Is this an import schema issue?'];
      }
    }
  } else if (violations.length > 0) {
    // Classify OHLC violations not already labeled IDENTITY_UNRESOLVED
    const fpTest = isFloatPrecisionArtifact(o, h, l, c);
    if (fpTest.is_artifact) {
      rootCause  = 'FLOAT_PRECISION_ARTIFACT';
      confidence = 'MEDIUM';
      evidence   = { violated_invariants: violations, violation_magnitude: fpTest.violation_magnitude, float32_epsilon: fpTest.epsilon, note: 'Violation within float32 precision tolerance.' };
      unresolvedQuestions = ['Confirm float storage format before any repair.'];
    } else {
      // Check split candidate: if open ≈ 2×high or similar ratio
      const ratio = h > 0 ? o / h : 0;
      if (ratio > 1.8 && ratio < 2.2) {
        rootCause  = 'SPLIT_ADJUSTMENT_CANDIDATE';
        confidence = 'LOW';
        evidence   = { violated_invariants: violations, open_to_high_ratio: ratio.toFixed(3), note: 'Open/high ratio near 2:1 — possible unadjusted split. CANDIDATE only — requires price history and corporate action evidence.' };
        unresolvedQuestions = ['Was there a 2:1 stock split near this date?', 'Are post-split values available?'];
      } else {
        rootCause  = 'UNKNOWN_REQUIRES_REVIEW';
        confidence = 'LOW';
        evidence   = { violated_invariants: violations, note: 'Cannot classify without additional evidence. Insufficient data to distinguish data-entry error, schema issue, or corporate action.' };
        unresolvedQuestions = ['What is the upstream source for this candle?', 'What was the correct OHLCV for this date?'];
      }
    }
  } else {
    // No OHLC violations detected (anomaly may be flagged for other reasons)
    rootCause  = 'UNKNOWN_REQUIRES_REVIEW';
    confidence = 'LOW';
    evidence   = { violated_invariants: [], note: 'No OHLC invariant violations detected in current data. Anomaly may have been flagged for a different reason in M5.' };
    unresolvedQuestions = ['Why was this row originally classified as anomalous?'];
  }

  classCounts[rootCause] = (classCounts[rootCause] || 0) + 1;

  classified.push({
    row_identifier,
    symbol,
    trade_date,
    open: o, high: h, low: l, close: c, volume,
    prior_classification: classification,
    prior_disposition:    disposition,
    root_cause:           rootCause,
    confidence,
    evidence,
    unresolved_questions: unresolvedQuestions,
    modification_applied: false,
    production_db_written: false
  });
}

const accounted   = classified.length;
const unaccounted = 190 - accounted;

const report = {
  timestamp: new Date().toISOString(),
  source_file: 'PHASE10RM5_OHLC_FORENSICS.json',
  total_anomalies: 190,
  accounted,
  UNACCOUNTED: unaccounted,
  root_cause_summary: classCounts,
  no_modifications_applied: true,
  production_db_writes: 0,
  important_caveats: [
    'FLOAT_PRECISION_ARTIFACT requires human confirmation before any repair.',
    'SPLIT_ADJUSTMENT_CANDIDATE requires corporate action evidence — not established fact.',
    'OHLC_RELATIONSHIP_VIOLATION root cause is not yet determined — do not repair.',
    'IDENTITY_UNRESOLVED records cannot be corrected without authoritative identity evidence.',
    'No row has been modified. All values are read-only observations.',
    'These 190 rows have ZERO overlap with the 18,244 promotion set (verified by prior M5 analysis).'
  ],
  classified
};

const OUT_JSON = path.join(READINESS, 'PHASE10RM57_OHLC_FORENSIC_CLASSIFICATION.json');
const OUT_MD   = path.join(READINESS, 'PHASE10RM57_OHLC_FORENSIC_CLASSIFICATION.md');
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

const md = `# Phase 10R-M5.7 OHLC Forensic Classification

**Source**: PHASE10RM5_OHLC_FORENSICS.json
**Total anomalies**: 190 | **Accounted**: ${accounted} | **UNACCOUNTED**: ${unaccounted}
**DB modifications applied**: NONE

> All root causes are forensic candidates based on available evidence.
> No value has been modified. Do not repair any row based solely on this classification.

## Root-Cause Summary

| Root Cause | Count | Notes |
|-----------|-------|-------|
${Object.entries(classCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`| ${k} | ${v} | |`).join('\n')}

## Classification Approach

| Classification | Criterion |
|---------------|-----------|
| IDENTITY_UNRESOLVED | Symbol not in MasterTickers; no ISIN/provider_key available |
| FLOAT_PRECISION_ARTIFACT | Violation ≤ float32 epsilon (1.2e-6 of magnitude) AND MasterTicker resolvable. **Requires human confirmation.** |
| OHLC_RELATIONSHIP_VIOLATION | Substantive violation beyond float tolerance; identity may be resolvable |
| SPLIT_ADJUSTMENT_CANDIDATE | Open/high ratio near 2:1 — **low confidence, candidate only** |
| UNKNOWN_REQUIRES_REVIEW | Insufficient evidence for any other classification |

## Key Constraints

- No anomaly overlaps with the 18,244 promotion set (confirmed by prior M5 analysis)
- No row has been modified
- Production DB writes: **0**
`;
fs.writeFileSync(OUT_MD, md);

console.log('\n  Root-cause breakdown:');
Object.entries(classCounts).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`    ${k}: ${v}`));
console.log(`\n  Accounted: ${accounted}/190 | UNACCOUNTED: ${unaccounted}`);
if (unaccounted !== 0) { console.error('FAIL: UNACCOUNTED > 0'); process.exit(1); }
console.log('  Outputs: PHASE10RM57_OHLC_FORENSIC_CLASSIFICATION.json/.md');
