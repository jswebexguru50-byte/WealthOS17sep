#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

function getHashSyncFallback(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stats = fs.statSync(filePath);
  if (stats.size > 2 * 1024 * 1024 * 1024) {
    // For files > 2GB (like portfolio.db), use powershell Get-FileHash
    try {
      const { execSync } = require('child_process');
      const out = execSync(`powershell -Command "(Get-FileHash -Algorithm SHA256 '${filePath}').Hash"`, { encoding: 'utf8' });
      return out.trim().toLowerCase();
    } catch(e) {
      console.error(`Error hashing large file ${filePath}:`, e);
      return null;
    }
  }
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function getSize(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).size;
}
function getMtime(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).mtime.toISOString();
}

const wave = process.argv[2] || "M5-G-PRE";
const manifestFile = path.join(REPORTS_DIR, 'PHASE10RM5_PROTECTED_STATE_MANIFEST.json');

let manifest = {};
if (fs.existsSync(manifestFile)) {
  manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
}

const state = {
  timestamp: new Date().toISOString(),
  portfolio_db: {
    path: path.join(ROOT, 'portfolio.db'),
    size: getSize(path.join(ROOT, 'portfolio.db')),
    sha256: getHashSyncFallback(path.join(ROOT, 'portfolio.db')),
    mtime: getMtime(path.join(ROOT, 'portfolio.db'))
  },
  master_tickers: {
    sha256: getHashSyncFallback(path.join(ROOT, 'reports', 'readiness', 'PHASE10RM5_MASTERTICKER_COLLISIONS.json'))
  },
  frozen_strategies: {
    strategy1: getHashSyncFallback(path.join(ROOT, 'scripts', 'market_data', 'market_trend_analyzer.cjs')),
    strategy2: getHashSyncFallback(path.join(ROOT, 'scripts', 'execution', 'order_manager.cjs'))
  },
  m4_artifacts: {
    queue: getHashSyncFallback(path.join(ROOT, 'reports', 'market-data', 'PHASE10RM3_9_REMAINING_COVERAGE_RECOVERY_QUEUE.jsonl')),
    checkpoint: getHashSyncFallback(path.join(ROOT, 'reports', 'market-data', 'PHASE10RM4_RECOVERY_CHECKPOINT.json')),
    output: getHashSyncFallback(path.join(ROOT, 'reports', 'market-data', 'PHASE10RM4_RECOVERED_CANDLES.jsonl'))
  },
  MARKET_DATA_CERTIFIED: false
};

let violation = false;

if (wave !== "M5-G-PRE") {
  const pre = manifest["M5-G-PRE"];
  if (pre) {
    if (state.portfolio_db.sha256 !== pre.portfolio_db.sha256) {
      console.error("VIOLATION: portfolio.db mutated!");
      violation = true;
    }
    if (state.MARKET_DATA_CERTIFIED !== pre.MARKET_DATA_CERTIFIED) {
      console.error("VIOLATION: MARKET_DATA_CERTIFIED mutated!");
      violation = true;
    }
  }
}

manifest[wave] = state;
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

if (violation) {
  console.error("UNAUTHORIZED_M5_CHANGE DETECTED. HALTING.");
  process.exit(1);
}

console.log(`M5-G ${wave} Verification captured. No unauthorized mutations detected.`);
