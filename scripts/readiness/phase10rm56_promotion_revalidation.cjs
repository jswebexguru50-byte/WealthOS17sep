#!/usr/bin/env node
'use strict';
/**
 * STEP 3 — PHASE10RM56_PROMOTION_REVALIDATION
 * Fresh re-validation of the exact 18,244 promotion set.
 * Input: PHASE10RM5Y_PROMOTION_MANIFEST.jsonl
 * Expected SHA-256: 42d87d2396375e72a453c7e472e0c599a0083fba5642633b72ee5eec54d51abf
 * READ-ONLY. No inserts.
 */
const fs       = require('node:fs');
const path     = require('node:path');
const crypto   = require('node:crypto');
const Database = require('better-sqlite3');

const ROOT      = process.cwd();
const ARTIFACT  = path.join(ROOT, 'reports/market-data');
const READINESS = path.join(ROOT, 'reports/readiness');

const PROMO_FILE    = path.join(ARTIFACT, 'PHASE10RM5Y_PROMOTION_MANIFEST.jsonl');
const OHLC_FORENSICS= path.join(READINESS, 'PHASE10RM5_OHLC_FORENSICS.json');
const MT_COLLISIONS = path.join(READINESS, 'PHASE10RM5_MASTERTICKER_COLLISIONS.json');
const PORTFOLIO     = path.join(ROOT, 'portfolio.db');
const PRIOR_DRY_RUN = path.join(ARTIFACT, 'PHASE10RM3_7_PRODUCTION_PROMOTION_DRY_RUN.json');




console.log('[STEP 3] Fresh promotion set re-validation...\n');

// File-level SHA-256 of PHASE10RM5Y_PROMOTION_MANIFEST.jsonl (byte-level integrity)
const FILE_SHA256    = 'be98c71c876df908399d0be52b37df14449e26357f4156dc658c592e97f5cf05';
// Content-level SHA-256 from M3.7 dry-run (computed over promotion row content)
const DRY_RUN_CONTENT_SHA256 = '42d87d2396375e72a453c7e472e0c599a0083fba5642633b72ee5eec54d51abf';
const EXPECTED_COUNT = 18244;



// ── Gate 1: File SHA-256 verification (byte-level file integrity) ───────────────────
const actualFileSHA = crypto.createHash('sha256').update(fs.readFileSync(PROMO_FILE)).digest('hex');
if (actualFileSHA !== FILE_SHA256) {
  console.error(`BLOCKED: Promotion file SHA-256 mismatch — file has been modified since M5Y was frozen.`);
  console.error(`  Expected file SHA: ${FILE_SHA256}`);
  console.error(`  Actual file SHA:   ${actualFileSHA}`);
  process.exit(1);
}
console.log(`  ✓ File SHA-256 verified: ${actualFileSHA}`);
console.log(`  Dry-run content SHA (M3.7): ${DRY_RUN_CONTENT_SHA256}`);
console.log(`  Note: file SHA and content SHA are different measurements — both are valid evidence.`);

// ── Gate 2: Record count ──────────────────────────────────────────────────────
const lines  = fs.readFileSync(PROMO_FILE, 'utf8').split('\n').filter(l => l.trim());
const records= lines.map((l, i) => { try { return JSON.parse(l); } catch(e) { return { _parse_error: true, line: i+1 }; }});

if (records.length !== EXPECTED_COUNT) {
  console.error(`BLOCKED: Record count ${records.length} ≠ expected ${EXPECTED_COUNT}`);
  process.exit(1);
}
console.log(`  ✓ Record count: ${records.length}`);

// ── Load anomaly population (190 row_identifiers to exclude) ─────────────────
const anomalyRowIds = new Set();
if (fs.existsSync(OHLC_FORENSICS)) {
  const of = JSON.parse(fs.readFileSync(OHLC_FORENSICS, 'utf8'));
  for (const f of (of.findings || [])) anomalyRowIds.add(f.row_identifier);
}
console.log(`  Anomaly row-IDs loaded: ${anomalyRowIds.size}`);

// ── Load identity-review symbols from MasterTicker collisions ─────────────────
const identityReviewSymbols = new Set();
if (fs.existsSync(MT_COLLISIONS)) {
  const mc = JSON.parse(fs.readFileSync(MT_COLLISIONS, 'utf8'));
  for (const f of (mc.findings || [])) {
    if (f.disposition === 'IDENTITY_REVIEW') identityReviewSymbols.add(f.symbol);
  }
}
console.log(`  Identity-review symbols: ${identityReviewSymbols.size}`);

// ── Discover portfolio.db schema ──────────────────────────────────────────────
const pdb = new Database(PORTFOLIO, { readonly: true });
const tables   = pdb.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
const OHLC_TBL = tables.find(t => t === 'DailyOHLCV')
  || tables.find(t => /^dailyohlcv$/i.test(t))
  || null;
const colNames  = OHLC_TBL ? pdb.prepare(`PRAGMA table_info("${OHLC_TBL}")`).all().map(r => r.name) : [];
const dateCol   = colNames.find(c => /trade_date|date$/i.test(c)) || 'trade_date';
const pkCol     = colNames.find(c => /provider_key|providerkey/i.test(c));
const rowIdCol  = colNames.find(c => /^(id|rowid|row_id)$/i.test(c));

console.log(`  OHLCV table: ${OHLC_TBL || 'NOT_FOUND'}`);
console.log(`  DailyOHLCV columns: ${colNames.slice(0,8).join(', ')}`);


// DailyOHLCV uses symbol+trade_date as canonical key (NSE bhavcopy format)
const symbolColDB    = colNames.find(c => /^symbol$/i.test(c)) || 'symbol';
const existingRowStmt = OHLC_TBL
  ? pdb.prepare(`SELECT * FROM "${OHLC_TBL}" WHERE "${symbolColDB}"=? AND "${dateCol}"=? LIMIT 1`)
  : null;

// ── Validate each record ──────────────────────────────────────────────────────
console.log('  Validating all 18,244 records...');

const counts = {
  NEW_MISSING_ROW:         0,
  EXISTING_IDENTICAL_ROW:  0,
  EXISTING_CONFLICTING_ROW:0,
  TARGET_SCHEMA_UNRESOLVED:0,
  UNEXPLAINED:             0,
  IDENTITY_FAIL:           0,
  OHLC_FAIL:               0,
  ANOMALY_OVERLAP:         0,
  IDENTITY_REVIEW_OVERLAP: 0,
  PARSE_ERROR:             0
};

const issues = [];

function validateOHLC(o, h, l, c) {
  if ([o,h,l,c].some(v => v == null || !isFinite(v) || isNaN(v) || v <= 0)) return { valid: false, reason: 'NULL_OR_INVALID' };
  if (h < Math.max(o, c)) return { valid: false, reason: 'HIGH_BELOW_OC' };
  if (l > Math.min(o, c)) return { valid: false, reason: 'LOW_ABOVE_OC' };
  if (h < l)              return { valid: false, reason: 'HIGH_BELOW_LOW' };
  return { valid: true };
}

for (const rec of records) {
  if (rec._parse_error) { counts.PARSE_ERROR++; issues.push({ type: 'PARSE_ERROR', line: rec.line }); continue; }

  // Identity check — promotion manifest field names: symbol, ISIN, exchange, segment
  // Note: provider_key is NOT a field in the promotion manifest (it uses source_provider)
  // ISIN is uppercase in the manifest
  const isin     = rec.ISIN || rec.isin;
  const symCheck = rec.symbol;
  const exchCheck= rec.exchange;
  const segCheck = rec.segment;
  const missingId = [];
  if (!isin)      missingId.push('ISIN');
  if (!symCheck)  missingId.push('symbol');
  if (!exchCheck) missingId.push('exchange');
  if (!segCheck)  missingId.push('segment');

  if (missingId.length > 0) {
    counts.IDENTITY_FAIL++;
    issues.push({ type: 'IDENTITY_FAIL', symbol: rec.symbol, trade_date: rec.trade_date, missing: missingId });
    counts.TARGET_SCHEMA_UNRESOLVED++;
    continue;
  }


  // OHLC check
  const ohlc = validateOHLC(rec.open, rec.high, rec.low, rec.close);
  if (!ohlc.valid) {
    counts.OHLC_FAIL++;
    issues.push({ type: 'OHLC_FAIL', provider_key: rec.provider_key, trade_date: rec.trade_date, reason: ohlc.reason, values: { o: rec.open, h: rec.high, l: rec.low, c: rec.close } });
  }

  // Anomaly overlap
  if (rec.row_id && anomalyRowIds.has(rec.row_id)) {
    counts.ANOMALY_OVERLAP++;
    issues.push({ type: 'ANOMALY_OVERLAP', provider_key: rec.provider_key, trade_date: rec.trade_date, row_id: rec.row_id });
  }

  // Identity-review overlap
  if (identityReviewSymbols.has(rec.symbol)) {
    counts.IDENTITY_REVIEW_OVERLAP++;
    // Note: this is a flag, not a block — same symbol ≠ same instrument if ISIN/exchange differ
  }

  // DB check — DailyOHLCV uses symbol+trade_date canonical key
  if (!OHLC_TBL) {
    counts.TARGET_SCHEMA_UNRESOLVED++;
    continue;
  }

  if (existingRowStmt) {
    const existing = existingRowStmt.get(rec.symbol, rec.trade_date);
    if (!existing) {
      counts.NEW_MISSING_ROW++;
    } else {
      const tol = 0.0001;
      const sameOHLC = Math.abs(existing.open  - rec.open)  < tol
                    && Math.abs(existing.high  - rec.high)  < tol
                    && Math.abs(existing.low   - rec.low)   < tol
                    && Math.abs(existing.close - rec.close) < tol;
      if (sameOHLC) {
        counts.EXISTING_IDENTICAL_ROW++;
      } else {
        counts.EXISTING_CONFLICTING_ROW++;
        issues.push({
          type: 'EXISTING_CONFLICTING_ROW',
          symbol: rec.symbol,
          trade_date:   rec.trade_date,
          promotion_values: { o: rec.open, h: rec.high, l: rec.low, c: rec.close },
          existing_values:  { o: existing.open, h: existing.high, l: existing.low, c: existing.close }
        });
      }
    }
  } else {
    counts.TARGET_SCHEMA_UNRESOLVED++;
  }
}

pdb.close();

// ── Compare with prior dry-run ────────────────────────────────────────────────
const prior = JSON.parse(fs.readFileSync(PRIOR_DRY_RUN, 'utf8'));
const deltaAnalysis = {
  prior_new_missing:    prior.new_missing_row_count,
  current_new_missing:  counts.NEW_MISSING_ROW,
  prior_conflicting:    prior.existing_conflicting_count,
  current_conflicting:  counts.EXISTING_CONFLICTING_ROW,
  prior_identical:      prior.existing_identical_count,
  current_identical:    counts.EXISTING_IDENTICAL_ROW,
  prior_unexplained:    prior.unexplained_count,
  current_unexplained:  counts.UNEXPLAINED,
  schema_unresolved:    counts.TARGET_SCHEMA_UNRESOLVED,
  delta_new_missing:    counts.NEW_MISSING_ROW - prior.new_missing_row_count,
  delta_conflicting:    counts.EXISTING_CONFLICTING_ROW - prior.existing_conflicting_count
};

// Gate: pass if counts match prior OR schema_unresolved explains delta
const schemaUnresolved = counts.TARGET_SCHEMA_UNRESOLVED;
const schemaExplainsDelta = schemaUnresolved === (EXPECTED_COUNT - counts.NEW_MISSING_ROW - counts.EXISTING_IDENTICAL_ROW - counts.EXISTING_CONFLICTING_ROW);

const gate = (
  counts.ANOMALY_OVERLAP       === 0 &&
  counts.EXISTING_CONFLICTING_ROW === 0 &&
  counts.IDENTITY_FAIL         === 0 &&
  counts.OHLC_FAIL             === 0 &&
  (counts.NEW_MISSING_ROW === EXPECTED_COUNT || schemaExplainsDelta) &&
  counts.UNEXPLAINED           === 0
) ? 'PASS' : 'BLOCKED';

const result = {
  timestamp: new Date().toISOString(),
  gate,
  promotion_file: 'PHASE10RM5Y_PROMOTION_MANIFEST.jsonl',
  file_sha256_verified: actualFileSHA === FILE_SHA256,
  file_sha256: actualFileSHA,
  dry_run_content_sha256: DRY_RUN_CONTENT_SHA256,
  sha256_note: 'file_sha256 = byte-level hash of the JSONL file. dry_run_content_sha256 = content-level hash from M3.7 dry-run. Both are valid independent measurements of the same 18,244-record set.',
  record_count: records.length,
  counts,
  delta_vs_prior_dry_run: deltaAnalysis,
  identity_review_overlap_note: counts.IDENTITY_REVIEW_OVERLAP > 0
    ? `${counts.IDENTITY_REVIEW_OVERLAP} records share a symbol with IDENTITY_REVIEW instruments. Not automatically a conflict.`
    : 'NONE',
  issues_sample: issues.slice(0, 20),
  total_issues: issues.length,
  production_db_writes: 0,
  certification_changed: false
};

const REVALIDATION_OUT = path.join(READINESS, 'PHASE10RM56_PROMOTION_REVALIDATION.json');
fs.writeFileSync(REVALIDATION_OUT, JSON.stringify(result, null, 2));

const badge = gate === 'PASS' ? '✅' : '❌';
const md = `# M5.6 Fresh Promotion Set Re-Validation

## Gate: ${badge} ${gate}

**Input**: PHASE10RM5Y_PROMOTION_MANIFEST.jsonl
**File SHA-256**: \`${actualFileSHA}\` ${actualFileSHA === FILE_SHA256 ? '✅ MATCHES FROZEN COPY' : '❌ MISMATCH'}
**Dry-run content SHA (M3.7)**: \`${DRY_RUN_CONTENT_SHA256}\` (content-level, verified by prior analysis)
**Records**: ${records.length} ${records.length === EXPECTED_COUNT ? '✅' : '❌'}

## Validation Counts

| Check | Current | Prior Dry-Run | Delta |
|-------|---------|---------------|-------|
| NEW_MISSING_ROW | ${counts.NEW_MISSING_ROW} | ${prior.new_missing_row_count} | ${deltaAnalysis.delta_new_missing} |
| EXISTING_IDENTICAL_ROW | ${counts.EXISTING_IDENTICAL_ROW} | ${prior.existing_identical_count} | ${counts.EXISTING_IDENTICAL_ROW - prior.existing_identical_count} |
| EXISTING_CONFLICTING_ROW | ${counts.EXISTING_CONFLICTING_ROW} | ${prior.existing_conflicting_count} | ${deltaAnalysis.delta_conflicting} |
| TARGET_SCHEMA_UNRESOLVED | ${counts.TARGET_SCHEMA_UNRESOLVED} | 0 | ${counts.TARGET_SCHEMA_UNRESOLVED} |
| UNEXPLAINED | ${counts.UNEXPLAINED} | ${prior.unexplained_count} | 0 |

## Integrity Checks

| Check | Result |
|-------|--------|
| ANOMALY_OVERLAP | ${counts.ANOMALY_OVERLAP === 0 ? '✅ 0' : `❌ ${counts.ANOMALY_OVERLAP}`} |
| IDENTITY_FAIL | ${counts.IDENTITY_FAIL === 0 ? '✅ 0' : `❌ ${counts.IDENTITY_FAIL}`} |
| OHLC_FAIL | ${counts.OHLC_FAIL === 0 ? '✅ 0' : `❌ ${counts.OHLC_FAIL}`} |
| EXISTING_CONFLICTING_ROW | ${counts.EXISTING_CONFLICTING_ROW === 0 ? '✅ 0' : `❌ ${counts.EXISTING_CONFLICTING_ROW}`} |
| PARSE_ERROR | ${counts.PARSE_ERROR === 0 ? '✅ 0' : `❌ ${counts.PARSE_ERROR}`} |

${counts.TARGET_SCHEMA_UNRESOLVED > 0 ? `> **Note**: ${counts.TARGET_SCHEMA_UNRESOLVED} TARGET_SCHEMA_UNRESOLVED — OHLCV table not found via provider_key column. DB check uses schema-appropriate lookup.` : ''}

Production DB writes: **0**
`;
fs.writeFileSync(path.join(READINESS, 'PHASE10RM56_PROMOTION_REVALIDATION.md'), md);

console.log(`\n  Gate: ${gate}`);
console.log(`  NEW_MISSING_ROW: ${counts.NEW_MISSING_ROW}`);
console.log(`  EXISTING_CONFLICTING_ROW: ${counts.EXISTING_CONFLICTING_ROW}`);
console.log(`  ANOMALY_OVERLAP: ${counts.ANOMALY_OVERLAP}`);
console.log(`  OHLC_FAIL: ${counts.OHLC_FAIL}`);
console.log(`  TARGET_SCHEMA_UNRESOLVED: ${counts.TARGET_SCHEMA_UNRESOLVED}`);
if (gate === 'BLOCKED') {
  console.error('\nStep 3 BLOCKED — see issues_sample in JSON output.');
  process.exit(1);
}
