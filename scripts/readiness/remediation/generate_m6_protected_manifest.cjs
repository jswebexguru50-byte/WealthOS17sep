#!/usr/bin/env node
'use strict';
/**
 * GENERATE IMMUTABLE M6 PROTECTED-SET MANIFEST
 * 
 * Reads all 18,244 records promoted in M6 from portfolio.db (DailyOHLCV),
 * verifies exact correspondence with PHASE10RM5Y_PROMOTION_MANIFEST.jsonl,
 * formats each record canonically, computes a deterministic compound SHA-256,
 * and writes:
 * - M6_PROTECTED_SET_MANIFEST.jsonl
 * - M6_PROTECTED_SET_METADATA.json
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const ROOT = process.cwd();
const RUNTIME_ARTIFACTS = path.join(ROOT, 'reports/readiness/runtime/remediation/artifacts');
const PROMO_MANIFEST = path.join(ROOT, 'reports/market-data/PHASE10RM5Y_PROMOTION_MANIFEST.jsonl');
const PORTFOLIO_DB = path.join(ROOT, 'portfolio.db');

const OUT_JSONL = path.join(RUNTIME_ARTIFACTS, 'M6_PROTECTED_SET_MANIFEST.jsonl');
const OUT_META = path.join(RUNTIME_ARTIFACTS, 'M6_PROTECTED_SET_METADATA.json');

const EXPECTED_COUNT = 18244;
const PROMO_MANIFEST_SHA = 'be98c71c876df908399d0be52b37df14449e26357f4156dc658c592e97f5cf05';

function generateM6ProtectedManifest() {
  console.log('========================================================');
  console.log('Generating Immutable M6 Protected-Set Manifest');
  console.log('========================================================\n');

  // 1. Verify promotion manifest SHA
  const manifestData = fs.readFileSync(PROMO_MANIFEST);
  const actualManifestSHA = crypto.createHash('sha256').update(manifestData).digest('hex');
  if (actualManifestSHA !== PROMO_MANIFEST_SHA) {
    throw new Error(`PROMO_MANIFEST_SHA_MISMATCH: expected ${PROMO_MANIFEST_SHA}, got ${actualManifestSHA}`);
  }
  console.log(`  ✓ Source promotion manifest SHA verified: ${actualManifestSHA}`);

  // 2. Load keys from promotion manifest
  const manifestLines = manifestData.toString('utf8').split('\n').filter(l => l.trim());
  if (manifestLines.length !== EXPECTED_COUNT) {
    throw new Error(`PROMO_MANIFEST_COUNT_MISMATCH: expected ${EXPECTED_COUNT}, got ${manifestLines.length}`);
  }

  const promoKeys = manifestLines.map(l => {
    const r = JSON.parse(l);
    return { symbol: r.symbol, trade_date: r.trade_date };
  });

  // Sort canonically by symbol, trade_date
  promoKeys.sort((a, b) => {
    if (a.symbol < b.symbol) return -1;
    if (a.symbol > b.symbol) return 1;
    if (a.trade_date < b.trade_date) return -1;
    if (a.trade_date > b.trade_date) return 1;
    return 0;
  });

  // 3. Query all 18,244 rows from portfolio.db
  const db = new Database(PORTFOLIO_DB, { readonly: true });
  const stmt = db.prepare(`
    SELECT symbol, trade_date, open, high, low, close, volume, turnover, data_source
    FROM DailyOHLCV
    WHERE symbol = ? AND trade_date = ?
  `);

  const protectedRecords = [];
  for (const k of promoKeys) {
    const row = stmt.get(k.symbol, k.trade_date);
    if (!row) {
      db.close();
      throw new Error(`MISSING_M6_ROW_IN_PORTFOLIO: ${k.symbol}|${k.trade_date}`);
    }
    protectedRecords.push({
      canonical_key: `${row.symbol}|${row.trade_date}`,
      symbol: row.symbol,
      trade_date: row.trade_date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      turnover: row.turnover,
      data_source: row.data_source
    });
  }
  db.close();
  console.log(`  ✓ All ${protectedRecords.length} records retrieved from portfolio.db`);

  // 4. Write M6_PROTECTED_SET_MANIFEST.jsonl
  const jsonlContent = protectedRecords.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(OUT_JSONL, jsonlContent, 'utf8');

  // 5. Compute compound SHA-256
  const compoundSHA = crypto.createHash('sha256').update(jsonlContent).digest('hex');
  console.log(`  ✓ Compound SHA-256: ${compoundSHA}`);

  // 6. Write Metadata
  const metadata = {
    timestamp: new Date().toISOString(),
    protected_set_name: 'M6_PROMOTED_ROWS_PROTECTED_SET',
    total_records: protectedRecords.length,
    compound_sha256: compoundSHA,
    source_promotion_manifest: path.relative(ROOT, PROMO_MANIFEST),
    source_promotion_manifest_sha256: PROMO_MANIFEST_SHA,
    production_db: path.relative(ROOT, PORTFOLIO_DB),
    invariants: [
      'M6_overlap must remain exactly 0 across all remediation operations',
      'No remediation writer may modify any row matching canonical_key in this set without explicit separate authorization'
    ]
  };

  fs.writeFileSync(OUT_META, JSON.stringify(metadata, null, 2));
  console.log(`  ✓ Metadata written to: ${path.relative(ROOT, OUT_META)}`);

  return { total_records: protectedRecords.length, compound_sha256: compoundSHA };
}

if (require.main === module) {
  generateM6ProtectedManifest();
}

module.exports = { generateM6ProtectedManifest };
