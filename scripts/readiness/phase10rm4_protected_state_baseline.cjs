#!/usr/bin/env node
'use strict';
/**
 * PHASE10RM4_PROTECTED_STATE_BASELINE — Step 8
 * Captures SHA-256 / size / mtime for all protected artifacts before live work.
 * Re-runs as watchdog every 15 minutes.
 * NO PRODUCTION WRITES.
 */

const fs   = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const ROOT = process.cwd();
const READINESS = path.join(ROOT, 'reports/readiness');
fs.mkdirSync(READINESS, { recursive: true });

function hashFile(p) {
  if (!fs.existsSync(p)) return null;
  const stat = fs.statSync(p);
  if (stat.size > 2 * 1024 * 1024 * 1024) {
    try {
      const out = execSync(`powershell -Command "(Get-FileHash -Algorithm SHA256 '${p}').Hash"`, { encoding: 'utf8' });
      return out.trim().toLowerCase();
    } catch(e) { return `HASH_ERROR:${e.message}`; }
  }
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function stat(p) {
  if (!fs.existsSync(p)) return null;
  const s = fs.statSync(p);
  return { size: s.size, mtime: s.mtime.toISOString() };
}

// Strategy file expected hashes (from handover contract)
const FROZEN_STRATEGY_HASHES = {
  'PureTechnicalStrategiesEngine.ts':   '825FA6C067CF26AB28E15451ABEA80E1015EA15A8F24145102F7FC054977A2A3'.toLowerCase(),
  'StrategyParameterConfig.ts':         '901CA7A27B2EB4E09183426C9E0DFD7B812AEEBF84472B49B9F829661FE7194B'.toLowerCase(),
  'SignalQualityOverlay.ts':            'C41CDDB152C150BEA932A8B9BD8FCC6EA01A03A2BA030A723789AAADA5C17452'.toLowerCase(),
  'CapitalProtectionEngine.ts':         '63B8317889F5A60E9462F883E89ACB57FE99E819935EC8F7B30036ECFE4ED753'.toLowerCase(),
  'NewTechnicalStrategiesEngine.ts':    '78415BA3C74CA6A9CC2FCC96D2E54BA871E9BCA73FC6E078570C412781B1D354'.toLowerCase(),
  'UpstoxIntradayIngestor.ts':          '0F1C96D0E0C704672517F378990E17FACDCED7BFBF359DAF9C6F37333BE1B151'.toLowerCase(),
};
const TRADE_LEDGER_HASH = '035D8867F1F8DBC65F9FE35EA45263F20F9FEE00A48D3D7F48807C24A2AFD485'.toLowerCase();

// Locate strategy files
function findStrategyFile(filename) {
  const candidates = [
    path.join(ROOT, 'src', filename),
    path.join(ROOT, 'src', 'strategies', filename),
    path.join(ROOT, 'src', 'lib', filename),
    path.join(ROOT, filename),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

const M4_QUEUE = path.join(ROOT, 'reports/market-data/PHASE10RM3_9_REMAINING_COVERAGE_RECOVERY_QUEUE.jsonl');
const CHECKPOINT = path.join(ROOT, 'reports/market-data/PHASE10RM4_RECOVERY_CHECKPOINT.json');
const PORTFOLIO_DB = path.join(ROOT, 'portfolio.db');
const MASTER_TICKERS_FILE = path.join(READINESS, 'PHASE10RM5_MASTERTICKER_COLLISIONS.json');
const CERT_FILE = path.join(READINESS, 'CERTIFICATION_STATE.json');

const baseline = {
  timestamp: new Date().toISOString(),
  mode: process.argv[2] || 'BASELINE',
  portfolio_db: { ...stat(PORTFOLIO_DB), sha256: hashFile(PORTFOLIO_DB) },
  master_tickers: { sha256: hashFile(MASTER_TICKERS_FILE), ...stat(MASTER_TICKERS_FILE) },
  m4_queue: { sha256: hashFile(M4_QUEUE), ...stat(M4_QUEUE) },
  m4_checkpoint: { sha256: hashFile(CHECKPOINT), ...stat(CHECKPOINT) },
  certification: fs.existsSync(CERT_FILE) ? JSON.parse(fs.readFileSync(CERT_FILE,'utf8')) : { MARKET_DATA_CERTIFIED: false },
  strategy_integrity: {},
  trade_ledger: null,
  violations: []
};

// Strategy files
for (const [filename, expectedHash] of Object.entries(FROZEN_STRATEGY_HASHES)) {
  const filePath = findStrategyFile(filename);
  const actual = filePath ? hashFile(filePath) : null;
  const match = actual ? actual.toLowerCase() === expectedHash.toLowerCase() : null;
  baseline.strategy_integrity[filename] = {
    found: !!filePath,
    sha256: actual,
    expected: expectedHash,
    match: match,
    status: match === null ? 'NOT_FOUND' : (match ? 'VERIFIED' : 'HASH_MISMATCH')
  };
  if (match === false) {
    baseline.violations.push({ type: 'STRATEGY_HASH_MISMATCH', file: filename });
  }
}

// Trade ledger
const ledgerPath = path.join(ROOT, 'data', 'v6.3_REAL_trade_identity_ledger.jsonl');
if (fs.existsSync(ledgerPath)) {
  const actual = hashFile(ledgerPath);
  const match = actual?.toLowerCase() === TRADE_LEDGER_HASH;
  baseline.trade_ledger = { sha256: actual, expected: TRADE_LEDGER_HASH, match, status: match ? 'VERIFIED' : 'HASH_MISMATCH' };
  if (!match) baseline.violations.push({ type: 'TRADE_LEDGER_HASH_MISMATCH' });
}

// Load previous baseline for watchdog comparison
const BASELINE_FILE = path.join(READINESS, 'PHASE10RM4_PROTECTED_STATE_BASELINE.json');
if (baseline.mode !== 'BASELINE' && fs.existsSync(BASELINE_FILE)) {
  const prev = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  
  // Portfolio.db must not change
  if (prev.portfolio_db?.sha256 && baseline.portfolio_db.sha256 !== prev.portfolio_db.sha256) {
    baseline.violations.push({ type: 'PORTFOLIO_DB_MUTATED', prev: prev.portfolio_db.sha256, current: baseline.portfolio_db.sha256 });
  }
  // Queue must not change
  if (prev.m4_queue?.sha256 && baseline.m4_queue.sha256 !== prev.m4_queue.sha256) {
    baseline.violations.push({ type: 'M4_QUEUE_MUTATED', prev: prev.m4_queue.sha256, current: baseline.m4_queue.sha256 });
  }
  // MasterTickers must not change
  if (prev.master_tickers?.sha256 && baseline.master_tickers.sha256 !== prev.master_tickers.sha256) {
    baseline.violations.push({ type: 'MASTERTICKER_MUTATED' });
  }
}

if (baseline.mode === 'BASELINE') {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
}

const watchdogFile = path.join(READINESS, `PHASE10RM4_WATCHDOG_${Date.now()}.json`);
fs.writeFileSync(watchdogFile, JSON.stringify(baseline, null, 2));

const violation = baseline.violations.length > 0;
console.log(`[PROTECTED STATE] Mode: ${baseline.mode} | Violations: ${baseline.violations.length}`);
for (const v of baseline.violations) console.error(`  ⚠ ${v.type}`);
if (violation) {
  console.error('PROTECTED STATE VIOLATION DETECTED');
  process.exit(2);
}
console.log('  ✓ Protected state verified. No unauthorized mutations.');
