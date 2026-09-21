#!/usr/bin/env node
'use strict';
/**
 * WAVE 5 — PHASE10RM6_CERTIFICATION_PREFLIGHT
 * Read-only. Determines whether all evidence needed for certification is in place.
 * DOES NOT change MARKET_DATA_CERTIFIED.
 * MARKET_DATA_CERTIFIED remains FALSE regardless of the gate result.
 */
const fs   = require('node:fs');
const path = require('node:path');

const ROOT      = process.cwd();
const READINESS = path.join(ROOT, 'reports/readiness');
const ARTIFACT  = path.join(ROOT, 'reports/market-data');
const RUNTIME   = path.join(READINESS, 'runtime/m6');
const Database  = require('better-sqlite3');
const PORTFOLIO = path.join(ROOT, 'portfolio.db');

const ts     = new Date().toISOString();
const execId = `CERT_PREFLIGHT_${Date.now()}`;

console.log(`[WAVE 5] Certification preflight — ${execId}\n`);

function safeLoad(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch(_) { return null; }
}
function appendEvent(evt) {
  fs.appendFileSync(path.join(RUNTIME, 'events.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), ...evt }) + '\n');
}

const items = [];
function item(label, status, detail, evidence) {
  items.push({ label, status, detail, evidence: evidence ?? null });
  const icon = status === 'PRESENT' ? '✓' : status === 'PARTIAL' ? '~' : '✗';
  console.log(`  ${icon} ${label}: ${detail}`);
}

// ── Evidence inventory ────────────────────────────────────────────────────────
console.log('--- M4 Evidence ---');
const m4Gate = safeLoad(path.join(ARTIFACT, 'PHASE10RM4_FINAL_FORENSIC_GATE.json'));
item('M4 forensic gate', m4Gate?.final_gate === 'PASS' ? 'PRESENT' : 'MISSING', m4Gate?.final_gate ?? 'MISSING');
item('M4 evidence bundle', fs.existsSync(path.join(ARTIFACT,'M4_EVIDENCE_BUNDLE_MANIFEST.json')) ? 'PRESENT' : 'MISSING',
  'M4_EVIDENCE_BUNDLE_MANIFEST.json');

const m4Unresolved = safeLoad(path.join(ARTIFACT, 'M4_UNRESOLVED_DATE_REMEDIATION.json'));
item('M4 unresolved population', m4Unresolved?.UNACCOUNTED === 0 ? 'PRESENT' : 'PARTIAL',
  `7,009 records, UNACCOUNTED = ${m4Unresolved?.UNACCOUNTED ?? 'UNKNOWN'}`,
  { remediation_status: 'PENDING_SEPARATE_AUTHORIZATION', total: m4Unresolved?.total });

console.log('\n--- M5 Evidence ---');
const m5Promo = safeLoad(path.join(READINESS, 'PHASE10RM56_PROMOTION_REVALIDATION.json'));
item('M5 promotion validation', m5Promo?.gate === 'PASS' ? 'PRESENT' : 'MISSING', m5Promo?.gate ?? 'MISSING');

const ohlcClass = safeLoad(path.join(READINESS, 'PHASE10RM57_OHLC_FORENSIC_CLASSIFICATION.json'));
item('190 OHLC classification', ohlcClass?.UNACCOUNTED === 0 ? 'PRESENT' : 'MISSING',
  `190/190 accounted, ${ohlcClass?.UNACCOUNTED ?? 'UNKNOWN'} unaccounted`,
  { note: '182 UNKNOWN_REQUIRES_REVIEW and 8 IDENTITY_UNRESOLVED — pending separate remediation before certification' });

const mtReview = safeLoad(path.join(READINESS, 'PHASE10RM58_MASTERTICKER_IDENTITY_REVIEW.json'));
item('37 MasterTicker review', mtReview?.UNACCOUNTED === 0 ? 'PRESENT' : 'MISSING',
  `37/37 accounted, all VALID_DISTINCT_INSTRUMENTS`);

const crossGate = safeLoad(path.join(READINESS, 'PHASE10RM6_CROSS_GATE_RECONCILIATION.json'));
item('M6 cross-gate', crossGate?.CROSS_GATE === 'PASS' ? 'PRESENT' : 'MISSING', crossGate?.CROSS_GATE ?? 'MISSING');

console.log('\n--- M6 Production Promotion ---');
const promoResult = safeLoad(path.join(READINESS, 'PHASE10RM6_PRODUCTION_PROMOTION.json'));
item('Promotion committed', promoResult?.PROMOTION_RESULT === 'COMMITTED' ? 'PRESENT' : 'MISSING',
  promoResult?.PROMOTION_RESULT ?? 'NOT_RUN',
  { inserted: promoResult?.inserted_count, delta: promoResult?.delta });

const postVerify = safeLoad(path.join(READINESS, 'PHASE10RM6_POST_PROMOTION_VERIFICATION.json'));
item('Post-promotion verification', postVerify?.POST_PROMOTION_VERIFY === 'PASS' ? 'PRESENT' : 'MISSING',
  postVerify?.POST_PROMOTION_VERIFY ?? 'NOT_RUN',
  { rows_after: postVerify?.rows_after, delta: postVerify?.delta });

console.log('\n--- Remaining Gaps (blockers for certification) ---');
const certBlockers = [
  { label: '7,009 unresolved dates',     reason: 'Require separate remediation authorization (alternate provider, exchange calendar investigation, or explicit disposition)' },
  { label: '182 UNKNOWN_REQUIRES_REVIEW anomalies', reason: 'OHLC root cause not yet established — cannot certify data quality without resolution or explicit exclusion decision' },
  { label: '8 IDENTITY_UNRESOLVED anomalies', reason: 'Instrument identity unknown — cannot certify without authoritative ISIN/exchange evidence' }
];
certBlockers.forEach(b => { item(b.label, 'BLOCKING', `PENDING — ${b.reason}`); });

// Check DB certification state
const pdb = new Database(PORTFOLIO, { readonly: true });
const certRow = pdb.prepare(`SELECT value FROM AppConfig WHERE key='MARKET_DATA_CERTIFIED' LIMIT 1`).get();
const certState = certRow?.value ?? 'NOT_SET';
pdb.close();

item('MARKET_DATA_CERTIFIED', certState !== 'true' ? 'PRESENT' : 'ERROR', `Current value: ${certState} (required: not true)`);

// ── Result ────────────────────────────────────────────────────────────────────
const missingCount   = items.filter(i => i.status === 'MISSING').length;
const blockingCount  = items.filter(i => i.status === 'BLOCKING').length;
const presentCount   = items.filter(i => i.status === 'PRESENT').length;

// Gate: PASS means all NON-blocker evidence is present.
// Certification is still explicitly BLOCKED until blockers are cleared.
const PREFLIGHT_GATE = missingCount === 0 && certState !== 'true' ? 'PASS' : 'BLOCKED';
const CERTIFICATION_ELIGIBLE = blockingCount === 0 && PREFLIGHT_GATE === 'PASS';

const report = {
  timestamp:             ts,
  exec_id:               execId,
  CERTIFICATION_PREFLIGHT: PREFLIGHT_GATE,
  CERTIFICATION_ELIGIBLE,
  certification_note: CERTIFICATION_ELIGIBLE
    ? 'All blockers cleared — certification may proceed with explicit human authorization.'
    : `Certification BLOCKED: ${blockingCount} blocker(s) remain. ${missingCount} evidence item(s) missing.`,
  MARKET_DATA_CERTIFIED: false,
  market_data_certified_current: certState,
  certification_changed: false,
  evidence_present:  presentCount,
  evidence_missing:  missingCount,
  evidence_blocking: blockingCount,
  cert_blockers:     certBlockers,
  production_db_writes: 0,
  items
};

fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_CERTIFICATION_PREFLIGHT.json'), JSON.stringify(report, null, 2));

const badge = PREFLIGHT_GATE === 'PASS' ? '✅' : '❌';
const md = `# Phase 10R-M6 Certification Preflight

## Preflight Gate: ${badge} ${PREFLIGHT_GATE}
## Certification Eligible: ${CERTIFICATION_ELIGIBLE ? '✅ YES (human authorization still required)' : '❌ NO — blockers remain'}

> **MARKET_DATA_CERTIFIED = FALSE** — This workflow does NOT change certification state.

## Evidence Summary

| Item | Status | Detail |
|------|--------|--------|
${items.map(i => `| ${i.label} | ${i.status === 'PRESENT' ? '✅' : i.status === 'PARTIAL' ? '⚠' : i.status === 'BLOCKING' ? '🔴' : '❌'} ${i.status} | ${i.detail} |`).join('\n')}

## Certification Blockers

These must be resolved before \`MARKET_DATA_CERTIFIED\` may be set to TRUE:

${certBlockers.map(b => `- **${b.label}**: ${b.reason}`).join('\n')}

## What Remains

The following are required before certification:
1. Resolve or explicitly disposition the 7,009 unresolved dates
2. Resolve or explicitly exclude the 190 OHLC anomalies (182 UNKNOWN + 8 IDENTITY)
3. Explicit human authorization referencing the promotion SHA and post-verification report
4. Independent certification gate execution (separate phase)

---

*Production DB writes: 0 | Certification state: unchanged | This is Wave 5 of 6*
`;
fs.writeFileSync(path.join(READINESS, 'PHASE10RM6_CERTIFICATION_PREFLIGHT.md'), md);

appendEvent({ event: 'CERTIFICATION_PREFLIGHT_COMPLETE', gate: PREFLIGHT_GATE, eligible: CERTIFICATION_ELIGIBLE, blockers: blockingCount, exec_id: execId });

const agentStatusPath = path.join(RUNTIME, 'agent_status.json');
const agentStatus = fs.existsSync(agentStatusPath) ? JSON.parse(fs.readFileSync(agentStatusPath,'utf8')) : {};
agentStatus.cert_preflight = { state: PREFLIGHT_GATE, eligible: CERTIFICATION_ELIGIBLE, ts: new Date().toISOString(), exec_id: execId };
fs.writeFileSync(agentStatusPath, JSON.stringify(agentStatus, null, 2));

console.log(`\n  CERTIFICATION_PREFLIGHT = ${PREFLIGHT_GATE}`);
console.log(`  CERTIFICATION_ELIGIBLE  = ${CERTIFICATION_ELIGIBLE}`);
console.log(`  Evidence missing:  ${missingCount}`);
console.log(`  Blockers:          ${blockingCount}`);
console.log(`  MARKET_DATA_CERTIFIED = FALSE (unchanged)`);
console.log('\n  → WAVE 6: STOP. Do not certify automatically.');
