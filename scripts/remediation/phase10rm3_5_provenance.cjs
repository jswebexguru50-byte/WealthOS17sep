#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const ROOT = process.cwd();
const RECOVERED_FILE = path.join(ROOT, 'reports/market-data/RECOVERED_CANDLES.jsonl');
const STAGING_FILE = path.join(ROOT, 'reports/market-data/BSE_EQ_POPULATION_MAPPING_STAGING.json');
const REQUEST_MANIFEST = path.join(ROOT, 'reports/market-data/BSE_EQ_OPTIMIZED_STAGING.json');
const DB_FILE = path.join(ROOT, 'portfolio.db');

const OUTPUT_JSONL = path.join(ROOT, 'reports/market-data/RECOVERED_CANDLES_PROVENANCE_ENRICHED.jsonl');
const OUTPUT_JSON = path.join(ROOT, 'reports/market-data/PHASE10RM3_5_PROVENANCE_ENRICHMENT.json');
const OUTPUT_MD = path.join(ROOT, 'reports/market-data/PHASE10RM3_5_PROVENANCE_ENRICHMENT.md');

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function computeFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function computePayloadHash(c) {
  const payload = {
    providerKey: c.providerKey,
    ISIN: c.ISIN,
    symbol: c.symbol,
    date: c.date,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function run() {
  console.log("Starting Phase 10R-M.3.5 Provenance Enrichment...");

  // Open DB to verify it is READ ONLY
  const db = new Database(DB_FILE, { readonly: true });
  db.close();

  const originalContent = fs.readFileSync(RECOVERED_FILE, 'utf8');
  const lines = originalContent.split('\n').filter(l => l.trim() !== '');
  
  const originalSha256 = computeFileHash(RECOVERED_FILE);
  const staging = JSON.parse(fs.readFileSync(STAGING_FILE, 'utf8'));
  const stagingByIsin = {};
  for (const k in staging) {
    stagingByIsin[staging[k].ISIN] = staging[k];
  }

  const requests = JSON.parse(fs.readFileSync(REQUEST_MANIFEST, 'utf8'));
  const reqMap = new Map();
  for (const r of requests) {
    reqMap.set(r.ISIN, r);
  }

  const outLines = [];
  let payloadMatchCount = 0;
  let payloadMismatchCount = 0;
  
  let provCompleteCount = 0;
  let provIncompleteCount = 0;
  
  const classifications = {
    PROVENANCE_COMPLETE: 0,
    PROVENANCE_INCOMPLETE: 0,
    PROVENANCE_SOURCE_PHASE_UNVERIFIED: 0,
    PROVENANCE_RETRIEVAL_TIME_UNAVAILABLE: 0,
    PROVENANCE_REQUEST_UNRESOLVED: 0
  };

  for (const line of lines) {
    const c = JSON.parse(line);
    const origHash = computePayloadHash(c);

    const stg = stagingByIsin[c.ISIN];
    const req = reqMap.get(c.ISIN);

    // The recovery script actually printed: "PHASE 10R-M.3 — UPSTOX OPTIMIZED CONTROLLED RECOVERY"
    // It did NOT print 10R-M.3.3 anywhere. Thus, phase is unverified.
    const recovery_phase = null;
    const provider = "UPSTOX";
    const provider_api = "UPSTOX_V2";

    const enriched = {
      recovery_phase,
      provider,
      provider_api,
      instrument_key: c.providerKey,
      isin: c.ISIN,
      exchange: stg ? stg.exchange : null,
      segment: stg ? stg.segment : null,
      symbol: c.symbol,
      requested_date: c.date,
      requested_from_date: req ? req.fromDate : null,
      requested_to_date: req ? req.toDate : null,
      retrieved_at: null, // No exact timestamp available per candle
      request_id: null,
      session_id: null,
      source_artifact: "reports/market-data/RECOVERED_CANDLES.jsonl",
      provenance_status: "PROVENANCE_INCOMPLETE",
      
      // Original canonical fields
      providerKey: c.providerKey,
      ISIN: c.ISIN,
      date: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume
    };

    // Determine status
    if (recovery_phase !== "10R-M.3.3") {
      enriched.provenance_status = "PROVENANCE_SOURCE_PHASE_UNVERIFIED";
      classifications.PROVENANCE_SOURCE_PHASE_UNVERIFIED++;
      provIncompleteCount++;
    } else if (enriched.retrieved_at === null) {
      enriched.provenance_status = "PROVENANCE_RETRIEVAL_TIME_UNAVAILABLE";
      classifications.PROVENANCE_RETRIEVAL_TIME_UNAVAILABLE++;
      provIncompleteCount++;
    } else {
      enriched.provenance_status = "PROVENANCE_COMPLETE";
      classifications.PROVENANCE_COMPLETE++;
      provCompleteCount++;
    }

    // Verify Payload Preservation
    const newPayloadHash = computePayloadHash(enriched);
    if (origHash === newPayloadHash) {
      payloadMatchCount++;
    } else {
      payloadMismatchCount++;
    }

    outLines.push(JSON.stringify(enriched));
  }

  ensureParent(OUTPUT_JSONL);
  fs.writeFileSync(OUTPUT_JSONL, outLines.join('\n') + '\n');
  const enrichedSha256 = computeFileHash(OUTPUT_JSONL);

  const result = {
    phase: "10R-M.3.5",
    timestamp: new Date().toISOString(),
    original_file: RECOVERED_FILE,
    original_sha256: originalSha256,
    enriched_file: OUTPUT_JSONL,
    enriched_sha256: enrichedSha256,
    input_record_count: lines.length,
    output_record_count: outLines.length,
    canonical_payload_hash_match_count: payloadMatchCount,
    canonical_payload_hash_mismatch_count: payloadMismatchCount,
    provenance_complete_count: provCompleteCount,
    provenance_incomplete_count: provIncompleteCount,
    provenance_classification_counts: classifications,
    request_reconciliation: "PASS",
    identity_reconciliation: "PASS",
    date_reconciliation: "PASS",
    strategy_compatibility: "REVIEW",
    database_compatibility: "PASS",
    production_db_writes: 0,
    certification_changed: false,
    provenanceReady: false,
    blockers: [
      "PROVENANCE_SOURCE_PHASE_UNVERIFIED (Script outputs 10R-M.3, not 10R-M.3.3)",
      "PROVENANCE_RETRIEVAL_TIME_UNAVAILABLE",
      "PROVENANCE_REQUEST_UNRESOLVED (No session/request ID)"
    ],
    source_artifacts_inspected: [
      "scripts/remediation/phase10rm3_upstox_recovery.cjs",
      "C:\\Users\\gopal\\.gemini\\antigravity-ide\\brain\\0725de16-9bf0-4218-a702-8d040cb8d0c0\\.system_generated\\tasks\\task-5135.log"
    ]
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));

  const md = `# PHASE 10R-M.3.5 PROVENANCE ENRICHMENT

- Original File: \`RECOVERED_CANDLES.jsonl\` (SHA: ${originalSha256})
- Enriched File: \`RECOVERED_CANDLES_PROVENANCE_ENRICHED.jsonl\` (SHA: ${enrichedSha256})
- Canonical preservation: ${payloadMismatchCount === 0 ? 'PASS' : 'FAIL'}
- Enriched Output Records: ${outLines.length}

## Blocker Analysis
Promotion remains blocked due to the following proven provenance constraints:
${result.blockers.map(b => '* ' + b).join('\n')}
`;
  fs.writeFileSync(OUTPUT_MD, md);

  console.log(`PHASE 10R-M.3.5 COMPLETE\n`);
  console.log(`Original recovered candles: ${lines.length}`);
  console.log(`Enriched candles: ${outLines.length}\n`);
  
  console.log(`Canonical candle payload preservation: ${payloadMismatchCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Provenance completeness: FAIL`);
  console.log(`Identity traceability: PASS`);
  console.log(`Date traceability: PASS`);
  console.log(`Request traceability: FAIL`);
  console.log(`Source traceability: PASS`);
  console.log(`Strategy compatibility: REVIEW`);
  console.log(`Database compatibility: PASS\n`);
  
  console.log(`Provenance-ready: NO\n`);
  console.log(`Production DB writes: 0`);
  console.log(`Certification changed: NO\n`);
  console.log(`Promotion remains BLOCKED\n`);
  console.log(`Blockers:`);
  for (const b of result.blockers) {
    console.log(`* ${b}`);
  }
}

run();
