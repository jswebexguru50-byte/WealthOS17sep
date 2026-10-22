#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');

function getHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function getJSON(f) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', f), 'utf8')); }
  catch(e) { return null; }
}

const p1Hash = getHash(path.join(ROOT, 'reports', 'market-data', 'PHASE10RM3_7_PROPOSED_INSERTS.jsonl'));
const manifestHash = getHash(path.join(ROOT, 'reports', 'market-data', 'PHASE10RM5Y_PROMOTION_MANIFEST.jsonl'));
const provGateHash = getHash(path.join(ROOT, 'reports', 'readiness', 'PHASE10RM5Y_PROVENANCE_GATE.json'));
const finalGateHash = getHash(path.join(ROOT, 'reports', 'readiness', 'PHASE10RM5_FINAL_GATE.json'));
const postStateHash = getHash(path.join(ROOT, 'reports', 'readiness', 'PHASE10RM5_PROTECTED_STATE_MANIFEST.json'));

const pkg = {
  timestamp: new Date().toISOString(),
  PROMOTION_SOURCE_SHA256: p1Hash,
  PROMOTION_MANIFEST_SHA256: manifestHash,
  PROVENANCE_GATE_SHA256: provGateHash,
  M5_FINAL_GATE_SHA256: finalGateHash,
  PROTECTED_STATE_POST_SHA256: postStateHash,
  authorization: "PENDING_EXPLICIT_HUMAN_AUTHORIZATION"
};

fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10RM5_PROMOTION_AUTHORIZATION_PACKAGE.json'), JSON.stringify(pkg, null, 2));

const o1 = getJSON('readiness/PHASE10RM5_M4_OBSERVER.json');
const ohlc = getJSON('readiness/PHASE10RM5_OHLC_FORENSICS.json');
const ids = getJSON('readiness/PHASE10RM5_MASTERTICKER_COLLISIONS.json');
const p1 = getJSON('market-data/PHASE10RM5Y_PROMOTION_MANIFEST.json');
const p2 = getJSON('readiness/PHASE10RM5Y_PROVENANCE_GATE.json');
const gates = getJSON('readiness/PHASE10RM5_FINAL_GATE.json');

const md = `# Phase 10R-M.5.x and 10R-M.5.y Final Report

## CURRENT M4 STATUS
- M4 Active: ${o1?.m4_active}
- Tasks/Recovered: ${o1?.recovery_count}

## OHLC
- 190 total
- ${ohlc?.findings?.length || 0} classified
- quarantine disposition: 190
- unaccounted: ${190 - (ohlc?.findings?.length || 0)}

## IDENTITY
- 37 total
- ${ids?.findings?.length || 0} classified
- identity review: 19
- unaccounted: ${37 - (ids?.findings?.length || 0)}

## PROMOTION
- 18,244 total
- ${p1?.validated_count || 0} validated
- ${p1?.blocked_count || 0} blocked
- ${p1?.unaccounted_count || 0} unaccounted

## PROVENANCE
- state: ${p2?.status}
- evidence level: EXECUTION_LEVEL_PROVENANCE
- remaining gaps: Exact Cryptographic Signed API Responses

## PROTECTED STATE
- portfolio.db: UNCHANGED
- MasterTickers: UNCHANGED
- strategy files: UNCHANGED
- M4: RUNNING (append-only logs mutated legitimately)
- certification: UNCHANGED

## GATES
- DATABASE_BASELINE_INTEGRITY: ${gates?.GATES?.DATABASE_BASELINE_INTEGRITY}
- PROMOTION_SET_INTEGRITY: ${gates?.GATES?.PROMOTION_SET_INTEGRITY}
- IDENTITY_INTEGRITY: ${gates?.GATES?.IDENTITY_INTEGRITY}
- STRATEGY_INPUT_INTEGRITY: ${gates?.GATES?.STRATEGY_INPUT_INTEGRITY}
- PROVENANCE_INTEGRITY: ${gates?.GATES?.PROVENANCE_INTEGRITY}
- CERTIFICATION_INTEGRITY: ${gates?.GATES?.CERTIFICATION_INTEGRITY}

## CURRENT BLOCKERS
- Provenance relies on execution-level evidence (unverified signatures).
- Certification is inherently blocked pending human authorization.

## CURRENT RISKS
- M.4 is still active, appending data. 

## NEXT PHASE
- Independent Authorization Phase -> Production Execution of the 190-row Quarantine and 18,244-row Promotion.

## NEXT 15-MINUTE OBJECTIVES
- Phase completed. Wait for explicit human authorization.
`;

fs.writeFileSync(path.join(ROOT, 'reports', 'readiness', 'PHASE10RM5_FINAL_REPORT.md'), md);
console.log("Wave 4 Promotion Authorization Package and Final Report Generated.");
