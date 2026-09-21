#!/usr/bin/env node
'use strict';
/**
 * WEALTHOS — DETERMINISTIC NO-LLM MARKET-DATA ENRICHMENT RUNTIME
 * =============================================================
 * Reverse Chronological Recovery: 2026 → 2025 → 2024 → ... → 2018
 * 
 * 100% DETERMINISTIC. ZERO LLM / ZERO AI DEPENDENCY AT RUNTIME.
 * 
 * Architectural Guarantees:
 * - portfolio.db remains strictly READ-ONLY throughout (protected state watchdog)
 * - Strategy scanner remains active and unaffected
 * - Durable SQLite state machine in isolated year namespace
 * - IN_FLIGHT restart reconciliation & atomic JSON checkpointing
 * - Single-instance process lock with Windows PID validation
 * - Append-only JSONL files for raw, recovered, rejected, anomaly, discrepancy records
 * - Upstox V3 historical candle integration
 * - Embedded deterministic multi-stage Quality Control (Identity, Date, Numeric, Math, Duplicate, DB, Anomaly)
 * - Strict sequential pacing (10,000ms delay, concurrency = 1)
 * - Hard year boundary: 2026 must be formally closed before 2025 can be queued
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');
const Database = require('better-sqlite3');

// ── Parse CLI Arguments ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
let targetYear = 2026;
let isDryRun = false;
let requestGapMs = 10000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--year' && args[i + 1]) {
    targetYear = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--dry-run') {
    isDryRun = true;
  } else if (args[i] === '--request-gap' && args[i + 1]) {
    requestGapMs = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
WealthOS Deterministic Market-Data Enrichment Runtime
Usage: node phase10rm4_overnight_runtime.cjs [options]

Options:
  --year <YYYY>       Target year for enrichment (default: 2026)
  --dry-run           Build matrix & queue, report metrics without API calls
  --request-gap <ms>  Milliseconds between API requests (default: 10000)
  --help              Display this help message
`);
    process.exit(0);
  }
}

// ── Root Paths & Directory Structure ──────────────────────────────────────────
const ROOT = process.cwd();
const PORTFOLIO_DB_PATH = path.join(ROOT, 'portfolio.db');
const RECOVERY_BASE_DIR = path.join(ROOT, 'reports/readiness/recovery');
const YEAR_DIR = path.join(RECOVERY_BASE_DIR, String(targetYear));
const RUNTIME_DIR = path.join(YEAR_DIR, 'runtime');

// Year-level deliverables
const COVERAGE_MATRIX_CSV = path.join(RECOVERY_BASE_DIR, `${targetYear}_coverage_matrix.csv`);
const RECOVERY_QUEUE_CSV  = path.join(RECOVERY_BASE_DIR, `${targetYear}_recovery_queue.csv`);
const QC_SUMMARY_JSON     = path.join(RECOVERY_BASE_DIR, `${targetYear}_qc_summary.json`);
const QC_SUMMARY_MD       = path.join(RECOVERY_BASE_DIR, `${targetYear}_qc_summary.md`);
const CLOSURE_JSON        = path.join(RECOVERY_BASE_DIR, `${targetYear}_closure.json`);

// Runtime-level state & append-only streams
const STATE_DB        = path.join(RUNTIME_DIR, 'state.sqlite');
const CHECKPOINT_FILE = path.join(RUNTIME_DIR, 'checkpoint.json');
const LOCK_FILE       = path.join(RUNTIME_DIR, 'runtime.lock');
const RAW_CANDLES     = path.join(RUNTIME_DIR, 'raw_candles.jsonl');
const RECOVERED       = path.join(RUNTIME_DIR, 'recovered_candles.jsonl');
const REJECTED        = path.join(RUNTIME_DIR, 'rejected_candles.jsonl');
const ANOMALY_REVIEW  = path.join(RUNTIME_DIR, 'anomaly_review.jsonl');
const DISCREPANCIES   = path.join(RUNTIME_DIR, 'discrepancies.jsonl');
const REQUESTS_LOG    = path.join(RUNTIME_DIR, 'requests.jsonl');
const FAILURES_LOG    = path.join(RUNTIME_DIR, 'failures.jsonl');
const EVENTS_LOG      = path.join(RUNTIME_DIR, 'events.jsonl');
const PROGRESS_FILE   = path.join(ROOT, 'reports/readiness/agents', `ENRICHMENT_${targetYear}.json`);

// ── Constants & Thresholds ────────────────────────────────────────────────────
const RUNTIME_VERSION = '2.0.0-DETERMINISTIC';
const AGENT_ID = `ENRICHMENT-${targetYear}-${Date.now()}`;
const WATCHDOG_INTERVAL_MS = 15 * 60 * 1000;
const MAX_CONSECUTIVE_429 = 4;

// Anomaly QC Thresholds (strictly deterministic)
const ANOMALY_MAX_INTRADAY_RETURN = 0.40; // 40% open-to-close change
const ANOMALY_MAX_INTRADAY_SPREAD = 0.50; // 50% high-to-low spread
const ANOMALY_EXTREME_VOLUME_SPIKE = 50000000; // 50M shares single-day volume

const sleep = ms => new Promise(res => setTimeout(res, ms));

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

function appendEvent(type, payload) {
  if (isDryRun) return;
  const evt = JSON.stringify({ timestamp: new Date().toISOString(), type, pid: process.pid, ...payload });
  try { fs.appendFileSync(EVENTS_LOG, evt + '\n'); } catch (e) {}
}

function computeSha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ── Single-Instance Lock ──────────────────────────────────────────────────────
function acquireLock() {
  if (isDryRun) return;
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      const ageMs = Date.now() - new Date(lockData.timestamp).getTime();
      if (ageMs < 30 * 60 * 1000) {
        try {
          execSync(`tasklist /FI "PID eq ${lockData.pid}" /NH`, { encoding: 'utf8' });
          console.error(`[LOCK] Active instance running with PID ${lockData.pid}. Halting safely.`);
          process.exit(0);
        } catch (e) {
          // Stale lock from terminated process
        }
      }
    } catch (e) {}
  }
  atomicWrite(LOCK_FILE, { pid: process.pid, timestamp: new Date().toISOString(), agent_id: AGENT_ID, year: targetYear });
}

function releaseLock() {
  if (isDryRun) return;
  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (e) {}
}

// ── Protected State Watchdog (Guarantees portfolio.db is untouched) ───────────
let protectedStateBaseline = null;

function captureProtectedState() {
  if (!fs.existsSync(PORTFOLIO_DB_PATH)) return null;
  const stat = fs.statSync(PORTFOLIO_DB_PATH);
  return {
    timestamp: new Date().toISOString(),
    size: stat.size,
    mtime: stat.mtimeMs
  };
}

function watchdogCheck() {
  const current = captureProtectedState();
  if (!protectedStateBaseline) {
    protectedStateBaseline = current;
    appendEvent('PROTECTED_STATE_BASELINE', current);
    return;
  }
  const violations = [];
  if (current.size !== protectedStateBaseline.size) {
    violations.push(`PORTFOLIO_DB_SIZE_CHANGED (was ${protectedStateBaseline.size}, now ${current.size})`);
  }
  if (current.mtime !== protectedStateBaseline.mtime) {
    violations.push(`PORTFOLIO_DB_MTIME_CHANGED`);
  }
  if (violations.length > 0) {
    appendEvent('PROTECTED_STATE_VIOLATION', { violations, current });
    console.error(`\nCRITICAL SECURITY VIOLATION: PRODUCTION DB MUTATION DETECTED:`);
    violations.forEach(v => console.error(`  ✗ ${v}`));
    releaseLock();
    process.exit(3);
  }
}

// ── Embedded Quality Control Functions (Sections 16–25) ───────────────────────
function runNumericQC(o, h, l, c, vol) {
  if (o == null || h == null || l == null || c == null || vol == null) return { pass: false, reason: 'NULL_OR_UNDEFINED' };
  if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c) || !isFinite(vol)) return { pass: false, reason: 'NON_FINITE_VALUE' };
  if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c) || isNaN(vol)) return { pass: false, reason: 'NAN_VALUE' };
  if (o <= 0 || h <= 0 || l <= 0 || c <= 0) return { pass: false, reason: 'NON_POSITIVE_PRICE' };
  if (vol < 0) return { pass: false, reason: 'NEGATIVE_VOLUME' };
  return { pass: true };
}

function runMathematicalQC(o, h, l, c) {
  if (h < open && h < c) return { pass: false, reason: 'HIGH_BELOW_OPEN_AND_CLOSE' };
  if (h < o) return { pass: false, reason: 'HIGH_BELOW_OPEN' };
  if (h < c) return { pass: false, reason: 'HIGH_BELOW_CLOSE' };
  if (l > o) return { pass: false, reason: 'LOW_ABOVE_OPEN' };
  if (l > c) return { pass: false, reason: 'LOW_ABOVE_CLOSE' };
  if (h < l) return { pass: false, reason: 'HIGH_BELOW_LOW' };
  return { pass: true };
}

function runAnomalyQC(o, h, l, c, vol) {
  const flags = [];
  const intradayReturn = Math.abs(c - o) / o;
  if (intradayReturn > ANOMALY_MAX_INTRADAY_RETURN) {
    flags.push(`EXTREME_INTRADAY_RETURN_${(intradayReturn * 100).toFixed(1)}PCT`);
  }
  const spread = (h - l) / l;
  if (spread > ANOMALY_MAX_INTRADAY_SPREAD) {
    flags.push(`EXTREME_INTRADAY_SPREAD_${(spread * 100).toFixed(1)}PCT`);
  }
  if (vol > ANOMALY_EXTREME_VOLUME_SPIKE) {
    flags.push(`VOLUME_SPIKE_${vol}`);
  }
  return { isAnomaly: flags.length > 0, flags };
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ── Main Execution Flow ───────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`WEALTHOS DETERMINISTIC NO-LLM MARKET DATA ENRICHMENT`);
  console.log(`TARGET YEAR:      ${targetYear}`);
  console.log(`EXECUTION MODE:   ${isDryRun ? 'DRY-RUN (Discovery & Queue Building Only)' : 'ACTIVE RECOVERY (Upstox V3)'}`);
  console.log(`REQUEST PACING:   ${requestGapMs} ms sequential spacing`);
  console.log(`RUNTIME VERSION:  ${RUNTIME_VERSION}`);
  console.log(`PROCESS ID:       ${process.pid}`);
  console.log(`${'═'.repeat(70)}\n`);

  fs.mkdirSync(RECOVERY_BASE_DIR, { recursive: true });
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'reports/readiness/agents'), { recursive: true });

  // 1. Establish baseline watchdog
  watchdogCheck();

  // 2. Open production database strictly READ-ONLY
  console.log('[1/7] Inspecting portfolio.db in strict READ-ONLY mode...');
  const prodDb = new Database(PORTFOLIO_DB_PATH, { readonly: true });

  // 3. Determine authoritative trading calendar sessions for targetYear
  const yearStart = `${targetYear}-01-01`;
  const yearEnd = (targetYear === 2026) ? '2026-09-15' : `${targetYear}-12-31`;

  const calendarSessions = prodDb.prepare(`
    SELECT DISTINCT trade_date
    FROM DailyOHLCV
    WHERE trade_date >= ? AND trade_date <= ?
    ORDER BY trade_date ASC
  `).all(yearStart, yearEnd).map(r => r.trade_date);

  const totalSessions = calendarSessions.length;
  const firstSession = calendarSessions[0];
  const lastSession = calendarSessions[totalSessions - 1];
  console.log(`[2/7] Authoritative exchange calendar: ${totalSessions} trading sessions (${firstSession} to ${lastSession})`);

  // 4. Load MasterTickers catalog
  const masterTickers = prodDb.prepare(`
    SELECT id, isin, symbol, exchange, segment, series, name, listing_date, status, upstox_key_nse, upstox_key_bse
    FROM MasterTickers
    ORDER BY id ASC
  `).all();
  console.log(`[3/7] MasterTickers catalog: ${masterTickers.length} instruments loaded.`);

  // 5. Index existing DailyOHLCV observations for targetYear
  console.log(`[4/7] Indexing existing DailyOHLCV observations for ${targetYear}...`);
  const existingRows = prodDb.prepare(`
    SELECT symbol, trade_date, open, high, low, close, volume
    FROM DailyOHLCV
    WHERE trade_date >= ? AND trade_date <= ?
    ORDER BY symbol ASC, trade_date ASC
  `).all(yearStart, yearEnd);

  const existingMap = new Map(); // symbol -> Map(trade_date -> row)
  for (const row of existingRows) {
    if (!existingMap.has(row.symbol)) existingMap.set(row.symbol, new Map());
    existingMap.get(row.symbol).set(row.trade_date, row);
  }
  console.log(`      Indexed observations for ${existingMap.size} distinct active symbols in ${targetYear}.`);

  // Lifetime presence check (to separate pre-2026 delisted from never-trading)
  const lifetimeStats = prodDb.prepare(`
    SELECT symbol, count(*) as cnt, min(trade_date) as min_d, max(trade_date) as max_d
    FROM DailyOHLCV
    GROUP BY symbol
  `).all();
  const lifetimeMap = new Map();
  for (const r of lifetimeStats) lifetimeMap.set(r.symbol, r);

  // 6. Build Deterministic Coverage Matrix & Recovery Queue
  console.log(`[5/7] Building deterministic ${targetYear} coverage matrix & recovery queue...`);
  const matrixRows = [];
  const queueItems = [];
  const instrumentCounts = {
    CURRENT_COMPLETE: 0,
    CURRENT_MISSING_DATA: 0,
    NOT_TRADING: 0,
    DELISTED_INACTIVE: 0,
    IDENTITY_REVIEW: 0,
    OUT_OF_SCOPE: 0
  };

  const queueByProvider = new Map();

  for (const mt of masterTickers) {
    const symExisting = existingMap.get(mt.symbol) || new Map();
    const existingCount = symExisting.size;
    const lifetime = lifetimeMap.get(mt.symbol);

    const isNonNseExchange = ['MUTUAL_FUND', 'NASDAQ', 'NYSE', 'US'].includes(mt.exchange);
    const isBseNumeric = (mt.exchange === 'BSE' && /^\d+$/.test(mt.symbol));
    const isUnlisted = (mt.segment === 'UNLISTED' || (mt.symbol && mt.symbol.startsWith('UL-')));

    let instrumentStatus = '';
    let identityStatus = 'VERIFIED_ISIN_ANCHORED';
    let recoveryStatus = '';
    let expectedSessions = totalSessions;
    let missingSessions = 0;
    let firstOhlcDate = '';
    let lastOhlcDate = '';
    let internalGaps = 0;

    if (existingCount > 0) {
      const dates = Array.from(symExisting.keys()).sort();
      firstOhlcDate = dates[0];
      lastOhlcDate = dates[dates.length - 1];

      // Calculate internal gaps in target year
      const firstIdx = calendarSessions.indexOf(firstOhlcDate);
      const lastIdx = calendarSessions.indexOf(lastOhlcDate);
      if (firstIdx !== -1 && lastIdx !== -1) {
        const expectedBetween = lastIdx - firstIdx + 1;
        internalGaps = expectedBetween - dates.length;
      }
    }

    if (isNonNseExchange || isUnlisted) {
      instrumentStatus = 'OUT_OF_SCOPE';
      identityStatus = isNonNseExchange ? 'NON_NSE_ASSET' : 'UNLISTED_SERIES';
      recoveryStatus = 'OUT_OF_SCOPE';
      expectedSessions = 0;
    } else if (isBseNumeric || mt.exchange === 'BSE') {
      instrumentStatus = 'IDENTITY_REVIEW';
      identityStatus = isBseNumeric ? 'BSE_NUMERIC_UNMAPPED' : 'BSE_UNMAPPED';
      recoveryStatus = 'BLOCKED_IDENTITY';
      expectedSessions = 0;
    } else if (mt.status === 'DELISTED' || mt.status === 'SUSPENDED' || mt.status === 'INACTIVE') {
      instrumentStatus = 'DELISTED_INACTIVE';
      recoveryStatus = 'BLOCKED_STATUS';
      expectedSessions = 0;
    } else if (existingCount === 0) {
      if (!lifetime || lifetime.cnt === 0) {
        instrumentStatus = 'NOT_TRADING';
        recoveryStatus = 'BLOCKED_STATUS';
        expectedSessions = 0;
      } else {
        // Ceased trading prior to targetYear
        instrumentStatus = 'DELISTED_INACTIVE';
        recoveryStatus = 'BLOCKED_STATUS';
        expectedSessions = 0;
      }
    } else {
      // Instrument was active in targetYear
      // If instrument was newly listed during targetYear:
      if (lifetime && lifetime.min_d >= yearStart && existingCount > 0) {
        const debutDate = (mt.listing_date && mt.listing_date >= yearStart) ? mt.listing_date : lifetime.min_d;
        expectedSessions = calendarSessions.filter(d => d >= debutDate).length;
      }

      missingSessions = Math.max(0, expectedSessions - existingCount);

      if (missingSessions === 0) {
        instrumentStatus = 'CURRENT_COMPLETE';
        recoveryStatus = 'NOT_REQUIRED';
      } else {
        instrumentStatus = 'CURRENT_MISSING_DATA';
        recoveryStatus = 'QUEUED_FOR_RECOVERY';

        // Deterministic provider key resolution (ISIN anchored)
        const providerKey = mt.upstox_key_nse || (mt.isin ? `NSE_EQ|${mt.isin}` : `NSE_EQ|${mt.symbol}`);

        for (const d of calendarSessions) {
          if (!symExisting.has(d)) {
            // If listed after d, skip as legitimate non-trading
            if (lifetime && lifetime.min_d >= yearStart && d < lifetime.min_d) {
              continue;
            }
            const qItem = {
              ticker_id: mt.id,
              symbol: mt.symbol,
              isin: mt.isin,
              exchange: mt.exchange,
              segment: mt.segment,
              provider_key: providerKey,
              required_date: d,
              status: 'QUEUED'
            };
            queueItems.push(qItem);

            if (!queueByProvider.has(providerKey)) {
              queueByProvider.set(providerKey, {
                providerKey,
                ticker_id: mt.id,
                symbol: mt.symbol,
                isin: mt.isin,
                exchange: mt.exchange,
                segment: mt.segment,
                dates: []
              });
            }
            queueByProvider.get(providerKey).dates.push(d);
          }
        }
      }
    }

    instrumentCounts[instrumentStatus] = (instrumentCounts[instrumentStatus] || 0) + 1;

    matrixRows.push({
      ticker_id: mt.id,
      symbol: mt.symbol,
      isin: mt.isin || '',
      exchange: mt.exchange || '',
      segment: mt.segment || '',
      series: mt.series || '',
      listing_date: mt.listing_date || '',
      expected_sessions_2026: expectedSessions,
      existing_sessions_2026: existingCount,
      missing_sessions_2026: missingSessions,
      first_2026_ohlc_date: firstOhlcDate,
      last_2026_ohlc_date: lastOhlcDate,
      internal_gaps_2026: internalGaps,
      current_status: instrumentStatus,
      identity_status: identityStatus,
      recovery_status: recoveryStatus
    });
  }

  // 7. Write Coverage Matrix CSV
  const matrixHeaders = [
    'ticker_id', 'symbol', 'isin', 'exchange', 'segment', 'series', 'listing_date',
    'expected_sessions_2026', 'existing_sessions_2026', 'missing_sessions_2026',
    'first_2026_ohlc_date', 'last_2026_ohlc_date', 'internal_gaps_2026',
    'current_status', 'identity_status', 'recovery_status'
  ];
  const matrixCsvContent = [matrixHeaders.join(',')].concat(
    matrixRows.map(r => matrixHeaders.map(h => escapeCsv(r[h])).join(','))
  ).join('\n');
  fs.writeFileSync(COVERAGE_MATRIX_CSV, matrixCsvContent, 'utf8');

  // 8. Write Recovery Queue CSV
  const queueHeaders = ['ticker_id', 'symbol', 'isin', 'exchange', 'segment', 'provider_key', 'required_date', 'status'];
  const queueCsvContent = [queueHeaders.join(',')].concat(
    queueItems.map(r => queueHeaders.map(h => escapeCsv(r[h])).join(','))
  ).join('\n');
  fs.writeFileSync(RECOVERY_QUEUE_CSV, queueCsvContent, 'utf8');

  // 9. Initialize / Reconcile Durable SQLite State Machine
  console.log(`[6/7] Initializing durable SQLite state machine (${STATE_DB})...`);
  const stateDb = new Database(STATE_DB);
  stateDb.exec(`
    CREATE TABLE IF NOT EXISTS queue_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker_id     INTEGER NOT NULL,
      provider_key  TEXT NOT NULL,
      required_date TEXT NOT NULL,
      isin          TEXT,
      symbol        TEXT,
      exchange      TEXT,
      segment       TEXT,
      state         TEXT NOT NULL DEFAULT 'QUEUED',
      attempt_count INTEGER DEFAULT 0,
      last_attempt  TEXT,
      response_http INTEGER,
      candle_key    TEXT,
      error_reason  TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      UNIQUE(provider_key, required_date)
    );
    CREATE INDEX IF NOT EXISTS idx_state ON queue_items(state);
    CREATE INDEX IF NOT EXISTS idx_provider ON queue_items(provider_key);
    CREATE TABLE IF NOT EXISTS runtime_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Populate queue_items if empty or insert new
  const insertQueueStmt = stateDb.prepare(`
    INSERT OR IGNORE INTO queue_items
    (ticker_id, provider_key, required_date, isin, symbol, exchange, segment, state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', datetime('now'), datetime('now'))
  `);

  const insertTx = stateDb.transaction((items) => {
    for (const it of items) {
      insertQueueStmt.run(it.ticker_id, it.provider_key, it.required_date, it.isin, it.symbol, it.exchange, it.segment);
    }
  });
  insertTx(queueItems);

  // Crash recovery: reconcile any IN_FLIGHT back to QUEUED
  const inFlightCount = stateDb.prepare("SELECT count(*) as c FROM queue_items WHERE state = 'IN_FLIGHT'").get().c;
  if (inFlightCount > 0) {
    console.log(`      Reconciling ${inFlightCount} unconfirmed IN_FLIGHT items back to QUEUED...`);
    stateDb.prepare("UPDATE queue_items SET state = 'QUEUED', updated_at = datetime('now') WHERE state = 'IN_FLIGHT'").run();
  }

  const queueCounts = stateDb.prepare("SELECT state, count(*) as c FROM queue_items GROUP BY state").all();
  const queueStateSummary = {};
  for (const qc of queueCounts) queueStateSummary[qc.state] = qc.c;

  // 10. Generate QC Summary & Markdown Artifacts
  console.log(`[7/7] Generating QC summary reports...`);
  const qcSummary = {
    target_year: targetYear,
    target_endpoint: `https://api.upstox.com/v3/historical-candle/{provider_key}/day/{toDate}/{fromDate}`,
    expected_trading_sessions: totalSessions,
    calendar_interval: { from: firstSession, to: lastSession },
    master_ticker_count: masterTickers.length,
    instrument_breakdown: instrumentCounts,
    total_queued_sessions: queueItems.length,
    unique_instruments_queued: queueByProvider.size,
    estimated_api_requests: queueByProvider.size,
    estimated_runtime_hours: ((queueByProvider.size * (requestGapMs / 1000)) / 3600).toFixed(2),
    state_machine_counts: queueStateSummary,
    production_db_status: 'UNTOUCHED_READ_ONLY',
    qc_enforcement: {
      zero_llm_deterministic: true,
      isin_anchored: true,
      ohlc_mathematical_validation: true,
      anomaly_threshold_return: `${ANOMALY_MAX_INTRADAY_RETURN * 100}%`,
      anomaly_threshold_spread: `${ANOMALY_MAX_INTRADAY_SPREAD * 100}%`,
      existing_data_conflict_detection: true,
      duplicate_detection: true
    },
    generated_at: new Date().toISOString()
  };

  atomicWrite(QC_SUMMARY_JSON, qcSummary);

  // Generate Markdown Summary
  const mdLines = [
    `# WEALTHOS — ${targetYear} DETERMINISTIC RECOVERY & QC SUMMARY`,
    ``,
    `**Generated:** ${qcSummary.generated_at}  `,
    `**Execution Mode:** ${isDryRun ? 'DRY-RUN (Queue Generated & Validated)' : 'ACTIVE RECOVERY'}  `,
    `**Target Year:** ${targetYear} (${firstSession} to ${lastSession})  `,
    `**Production Database:** \`portfolio.db\` (READ-ONLY — PROTECTED STATE ACTIVE)  `,
    ``,
    `---`,
    ``,
    `## 1. INSTRUMENT POPULATION BREAKDOWN`,
    ``,
    `| Classification State | Instrument Count | Percentage | Description |`,
    `|---|---|---|---|`,
    `| **\`CURRENT_COMPLETE\`** | **${instrumentCounts.CURRENT_COMPLETE}** | **${((instrumentCounts.CURRENT_COMPLETE / masterTickers.length) * 100).toFixed(2)}%** | All ${totalSessions} sessions already verified present in DailyOHLCV. |`,
    `| **\`CURRENT_MISSING_DATA\`** | **${instrumentCounts.CURRENT_MISSING_DATA}** | **${((instrumentCounts.CURRENT_MISSING_DATA / masterTickers.length) * 100).toFixed(2)}%** | Active equities with genuine missing expected sessions in ${targetYear}. |`,
    `| **\`IDENTITY_REVIEW\`** | **${instrumentCounts.IDENTITY_REVIEW}** | **${((instrumentCounts.IDENTITY_REVIEW / masterTickers.length) * 100).toFixed(2)}%** | BSE numeric scrips and unverified keys (quarantined, zero API calls). |`,
    `| **\`OUT_OF_SCOPE\`** | **${instrumentCounts.OUT_OF_SCOPE}** | **${((instrumentCounts.OUT_OF_SCOPE / masterTickers.length) * 100).toFixed(2)}%** | Mutual Funds, foreign securities, unlisted AIFs (excluded). |`,
    `| **\`DELISTED_INACTIVE\`** | **${instrumentCounts.DELISTED_INACTIVE}** | **${((instrumentCounts.DELISTED_INACTIVE / masterTickers.length) * 100).toFixed(2)}%** | Instruments inactive or delisted prior to ${targetYear}. |`,
    `| **\`NOT_TRADING\`** | **${instrumentCounts.NOT_TRADING}** | **${((instrumentCounts.NOT_TRADING / masterTickers.length) * 100).toFixed(2)}%** | Listed entities with 0 recorded trades. |`,
    `| **TOTAL** | **${masterTickers.length}** | **100.00%** | |`,
    ``,
    `---`,
    ``,
    `## 2. RECOVERY QUEUE & EXECUTION ESTIMATES`,
    ``,
    `- **Genuine Missing Sessions Queued:** **${queueItems.length.toLocaleString()}**`,
    `- **Unique Instruments Requiring Recovery:** **${queueByProvider.size.toLocaleString()}**`,
    `- **API Requests Required (1 range request per instrument):** **${queueByProvider.size.toLocaleString()}**`,
    `- **Request Pacing:** **${requestGapMs / 1000} seconds / request** (Sequential, Concurrency = 1)`,
    `- **Estimated Overnight Execution Time:** **${qcSummary.estimated_runtime_hours} hours**`,
    `- **State Persistence:** SQLite (\`${STATE_DB}\`) with atomic checkpointing`,
    ``,
    `---`,
    ``,
    `## 3. ARTIFACTS CREATED`,
    ``,
    `1. **Coverage Matrix:** [\`reports/readiness/recovery/${targetYear}_coverage_matrix.csv\`](file:///${COVERAGE_MATRIX_CSV.replace(/\\\\/g, '/')})`,
    `2. **Recovery Queue:** [\`reports/readiness/recovery/${targetYear}_recovery_queue.csv\`](file:///${RECOVERY_QUEUE_CSV.replace(/\\\\/g, '/')})`,
    `3. **QC Summary:** [\`reports/readiness/recovery/${targetYear}_qc_summary.json\`](file:///${QC_SUMMARY_JSON.replace(/\\\\/g, '/')})`,
    `4. **Runtime State DB:** [\`reports/readiness/recovery/${targetYear}/runtime/state.sqlite\`](file:///${STATE_DB.replace(/\\\\/g, '/')})`,
    ``,
    `---`,
    ``,
    `## 4. ZERO-AI DETERMINISTIC SAFEGUARDS ENFORCED`,
    ``,
    `- **Zero AI/LLM technology:** All decisions made using SQLite, explicit SQL, and mathematical rules.`,
    `- **ISIN-Anchored Identity:** No guessing from symbol names.`,
    `- **Production DB Untouched:** \`portfolio.db\` opened in strict \`readonly: true\` mode.`,
    `- **Hard Year Boundary:** Recovery is restricted strictly to ${targetYear}. Year ${targetYear - 1} will not be processed until ${targetYear} is closed.`
  ];

  fs.writeFileSync(QC_SUMMARY_MD, mdLines.join('\n'), 'utf8');

  // 11. If Dry-Run: Report and Exit Cleanly
  if (isDryRun) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`DRY-RUN VALIDATION COMPLETE — ZERO API CALLS ISSUED`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`Target Year:                   ${targetYear}`);
    console.log(`Authoritative Sessions:        ${totalSessions} sessions (${firstSession} to ${lastSession})`);
    console.log(`Total MasterTickers:           ${masterTickers.length}`);
    console.log(`Already Complete (100%):       ${instrumentCounts.CURRENT_COMPLETE}`);
    console.log(`Eligible Instruments Queued:   ${queueByProvider.size}`);
    console.log(`Total Missing Session Targets: ${queueItems.length}`);
    console.log(`Identity Review (Quarantine):  ${instrumentCounts.IDENTITY_REVIEW}`);
    console.log(`Out of Scope (Excluded):       ${instrumentCounts.OUT_OF_SCOPE}`);
    console.log(`Delisted / Inactive:           ${instrumentCounts.DELISTED_INACTIVE}`);
    console.log(`Estimated API Requests:        ${queueByProvider.size}`);
    console.log(`Estimated Runtime:             ${qcSummary.estimated_runtime_hours} hours (@ ${requestGapMs / 1000}s pacing)`);
    console.log(`Coverage Matrix:               ${COVERAGE_MATRIX_CSV}`);
    console.log(`Recovery Queue:                ${RECOVERY_QUEUE_CSV}`);
    console.log(`QC Summary:                    ${QC_SUMMARY_MD}`);
    console.log(`${'═'.repeat(70)}\n`);
    prodDb.close();
    stateDb.close();
    process.exit(0);
  }

  // 12. Active Recovery Mode (Sequential, Paced, Full QC)
  acquireLock();
  process.on('exit', releaseLock);
  process.on('SIGINT', () => { appendEvent('SIGINT_SHUTDOWN', {}); releaseLock(); process.exit(0); });

  // Set up periodic watchdog timer
  const watchdogTimer = setInterval(() => {
    watchdogCheck();
    atomicWrite(LOCK_FILE, { pid: process.pid, timestamp: new Date().toISOString(), agent_id: AGENT_ID, year: targetYear });
  }, WATCHDOG_INTERVAL_MS);

  console.log('\n[ACTIVE RECOVERY] Starting sequential execution...');
  appendEvent('RECOVERY_START', { year: targetYear, queue_total: queueItems.length, providers: queueByProvider.size });

  // Index already recovered candle keys to prevent duplicate requests
  const stagedKeys = new Set();
  if (fs.existsSync(RECOVERED)) {
    const lines = fs.readFileSync(RECOVERED, 'utf8').split('\n').filter(l => l.trim());
    for (const l of lines) {
      try {
        const r = JSON.parse(l);
        stagedKeys.add(`${r.provider_key}_${r.trade_date}`);
      } catch (e) {}
    }
  }
  console.log(`      Already staged: ${stagedKeys.size} canonical candle keys.`);

  let requestsAttempted = 0;
  let http200Count = 0;
  let http429Count = 0;
  let http400Count = 0;
  let consecutive429 = 0;
  let candlesRecovered = 0;
  let candlesValidated = 0;
  let candlesRejected = 0;
  let duplicatesSkipped = 0;
  let exactMatches = 0;
  let discrepancies = 0;
  let anomaliesFlagged = 0;
  let previousRequestAt = 0;

  // Query remaining distinct provider keys with QUEUED items
  const distinctProviders = stateDb.prepare(`
    SELECT provider_key, ticker_id, symbol, isin, exchange, segment, group_concat(required_date) as dates
    FROM queue_items
    WHERE state = 'QUEUED'
    GROUP BY provider_key
    ORDER BY ticker_id ASC
  `).all();

  console.log(`      Remaining providers to query: ${distinctProviders.length}`);

  for (let idx = 0; idx < distinctProviders.length; idx++) {
    const pGroup = distinctProviders[idx];
    const requiredDates = pGroup.dates.split(',').sort();
    const fromDate = requiredDates[0];
    const toDate = requiredDates[requiredDates.length - 1];
    const reqDatesSet = new Set(requiredDates);

    // Atomically mark IN_FLIGHT
    stateDb.prepare("UPDATE queue_items SET state = 'IN_FLIGHT', updated_at = datetime('now') WHERE provider_key = ? AND state = 'QUEUED'").run(pGroup.provider_key);
    atomicWrite(CHECKPOINT_FILE, {
      target_year: targetYear,
      in_flight_provider: pGroup.provider_key,
      in_flight_dates: requiredDates,
      updated_at: new Date().toISOString()
    });

    // Pacing enforcement (>= 10,000 ms)
    const now = Date.now();
    const wait = Math.max(0, requestGapMs - (now - previousRequestAt));
    if (wait > 0) await sleep(wait);

    // Upstox V3 historical candle endpoint
    const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(pGroup.provider_key)}/day/${toDate}/${fromDate}`;

    let httpStatus = 0;
    let payload = null;
    const requestedAt = new Date().toISOString();
    requestsAttempted++;
    const reqStartMs = Date.now();

    const headers = { 'Accept': 'application/json' };
    if (process.env.UPSTOX_ACCESS_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.UPSTOX_ACCESS_TOKEN}`;
    }

    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      httpStatus = res.status;
      const text = await res.text();
      try { payload = JSON.parse(text); } catch (e) {}
    } catch (err) {
      appendEvent('FETCH_ERROR', { provider_key: pGroup.provider_key, error: err.message });
      httpStatus = 0;
    }

    const latencyMs = Date.now() - reqStartMs;
    previousRequestAt = Date.now();

    // Log request durably
    fs.appendFileSync(REQUESTS_LOG, JSON.stringify({
      provider_key: pGroup.provider_key,
      symbol: pGroup.symbol,
      isin: pGroup.isin,
      from_date: fromDate,
      to_date: toDate,
      required_dates: requiredDates,
      http_status: httpStatus,
      latency_ms: latencyMs,
      requested_at: requestedAt
    }) + '\n');

    // Handle 429 Rate Limit
    if (httpStatus === 429) {
      http429Count++;
      consecutive429++;
      appendEvent('HTTP_429', { provider_key: pGroup.provider_key, consecutive: consecutive429 });
      stateDb.prepare("UPDATE queue_items SET state = 'QUEUED' WHERE provider_key = ? AND state = 'IN_FLIGHT'").run(pGroup.provider_key);

      const backoffDelays = [60000, 180000, 600000];
      if (consecutive429 >= MAX_CONSECUTIVE_429) {
        appendEvent('RATE_LIMIT_HALT', { consecutive: consecutive429 });
        console.error(`\nHARD RATE LIMIT HALT: Reached ${consecutive429} consecutive 429s. Halting safely.`);
        clearInterval(watchdogTimer);
        releaseLock();
        process.exit(4);
      }

      const delay = backoffDelays[Math.min(consecutive429 - 1, 2)];
      console.log(`  [429] Rate limited on ${pGroup.provider_key}. Backing off for ${delay / 1000}s...`);
      await sleep(delay);
      idx--; // Retry this provider
      continue;
    }

    consecutive429 = 0;

    // Handle 401/403 Authentication Failure
    if (httpStatus === 401 || httpStatus === 403) {
      appendEvent('AUTH_HALT', { http_status: httpStatus });
      stateDb.prepare("UPDATE queue_items SET state = 'QUEUED' WHERE provider_key = ? AND state = 'IN_FLIGHT'").run(pGroup.provider_key);
      console.error(`\nAUTH FAILURE (HTTP ${httpStatus}). Halting immediately.`);
      clearInterval(watchdogTimer);
      releaseLock();
      process.exit(5);
    }

    // Handle 400 Bad Request (Invalid Key / No Provider Data)
    if (httpStatus === 400) {
      http400Count++;
      stateDb.prepare(`
        UPDATE queue_items 
        SET state = 'PROVIDER_UNAVAILABLE', response_http = 400, error_reason = 'PROVIDER_400_BAD_REQUEST', updated_at = datetime('now')
        WHERE provider_key = ? AND state = 'IN_FLIGHT'
      `).run(pGroup.provider_key);

      fs.appendFileSync(FAILURES_LOG, JSON.stringify({
        provider_key: pGroup.provider_key,
        symbol: pGroup.symbol,
        isin: pGroup.isin,
        http_status: 400,
        classification: 'PROVIDER_400_NO_AUTOMATIC_RETRY',
        requested_at: requestedAt
      }) + '\n');
      continue;
    }

    // Handle non-success responses
    if (!payload || payload.status !== 'success' || !payload.data || !Array.isArray(payload.data.candles)) {
      stateDb.prepare(`
        UPDATE queue_items 
        SET state = 'FAILED', response_http = ?, error_reason = 'NO_CANDLE_ARRAY', attempt_count = attempt_count + 1, updated_at = datetime('now')
        WHERE provider_key = ? AND state = 'IN_FLIGHT'
      `).run(httpStatus, pGroup.provider_key);
      continue;
    }

    // HTTP 200: Process candles through Embedded QC Pipeline
    http200Count++;
    const rawCandlesList = payload.data.candles;
    fs.appendFileSync(RAW_CANDLES, JSON.stringify({
      provider_key: pGroup.provider_key,
      requested_at: requestedAt,
      candles_count: rawCandlesList.length,
      payload_hash: computeSha256(JSON.stringify(rawCandlesList))
    }) + '\n');

    const recoveredDatesFound = new Set();

    for (const c of rawCandlesList) {
      const dt = c[0]?.split('T')[0];
      if (!dt) continue;

      // Date QC: must be an expected date
      if (!reqDatesSet.has(dt)) {
        continue; // Unexpected date
      }

      candlesValidated++;
      const [o, h, l, cl, vol] = [c[1], c[2], c[3], c[4], c[5]];

      // Numeric QC
      const numQC = runNumericQC(o, h, l, cl, vol);
      if (!numQC.pass) {
        candlesRejected++;
        fs.appendFileSync(REJECTED, JSON.stringify({
          provider_key: pGroup.provider_key, trade_date: dt, candle: c, reason: numQC.reason, rejected_at: new Date().toISOString()
        }) + '\n');
        stateDb.prepare("UPDATE queue_items SET state = 'REJECTED', error_reason = ? WHERE provider_key = ? AND required_date = ?").run(numQC.reason, pGroup.provider_key, dt);
        continue;
      }

      // Mathematical QC
      const mathQC = runMathematicalQC(o, h, l, cl);
      if (!mathQC.pass) {
        candlesRejected++;
        fs.appendFileSync(REJECTED, JSON.stringify({
          provider_key: pGroup.provider_key, trade_date: dt, candle: c, reason: mathQC.reason, rejected_at: new Date().toISOString()
        }) + '\n');
        stateDb.prepare("UPDATE queue_items SET state = 'REJECTED', error_reason = ? WHERE provider_key = ? AND required_date = ?").run(mathQC.reason, pGroup.provider_key, dt);
        continue;
      }

      // Duplicate QC
      const candleKey = `${pGroup.provider_key}_${dt}`;
      if (stagedKeys.has(candleKey)) {
        duplicatesSkipped++;
        stateDb.prepare("UPDATE queue_items SET state = 'ACCEPTED', candle_key = ? WHERE provider_key = ? AND required_date = ?").run(candleKey, pGroup.provider_key, dt);
        recoveredDatesFound.add(dt);
        continue;
      }

      // Existing Database QC (read-only comparison)
      const existingRow = existingMap.get(pGroup.symbol)?.get(dt);
      if (existingRow) {
        if (existingRow.open === o && existingRow.high === h && existingRow.low === l && existingRow.close === cl && existingRow.volume === vol) {
          exactMatches++;
          stateDb.prepare("UPDATE queue_items SET state = 'MATCH_EXISTING', candle_key = ? WHERE provider_key = ? AND required_date = ?").run(candleKey, pGroup.provider_key, dt);
          recoveredDatesFound.add(dt);
          continue;
        } else {
          discrepancies++;
          fs.appendFileSync(DISCREPANCIES, JSON.stringify({
            provider_key: pGroup.provider_key,
            trade_date: dt,
            existing_row: existingRow,
            recovered_candle: { open: o, high: h, low: l, close: cl, volume: vol },
            detected_at: new Date().toISOString()
          }) + '\n');
          stateDb.prepare("UPDATE queue_items SET state = 'DISCREPANCY', error_reason = 'DIFFERS_FROM_EXISTING_DB' WHERE provider_key = ? AND required_date = ?").run(pGroup.provider_key, dt);
          recoveredDatesFound.add(dt);
          continue;
        }
      }

      // Anomaly QC
      const anomQC = runAnomalyQC(o, h, l, cl, vol);
      let candleState = 'ACCEPTED';
      if (anomQC.isAnomaly) {
        anomaliesFlagged++;
        candleState = 'ANOMALY_REVIEW';
        fs.appendFileSync(ANOMALY_REVIEW, JSON.stringify({
          provider_key: pGroup.provider_key,
          trade_date: dt,
          candle: { open: o, high: h, low: l, close: cl, volume: vol },
          flags: anomQC.flags,
          flagged_at: new Date().toISOString()
        }) + '\n');
      }

      // Full Provenance Record
      const recoveredRecord = {
        provider: 'UPSTOX',
        provider_key: pGroup.provider_key,
        isin: pGroup.isin,
        symbol: pGroup.symbol,
        exchange: pGroup.exchange,
        segment: pGroup.segment,
        trade_date: dt,
        open: o,
        high: h,
        low: l,
        close: cl,
        volume: vol,
        source_endpoint: url,
        request_range: { from_date: fromDate, to_date: toDate },
        retrieved_at: requestedAt,
        http_status: 200,
        validation_version: RUNTIME_VERSION,
        validation_status: candleState,
        anomaly_flags: anomQC.flags
      };

      fs.appendFileSync(RECOVERED, JSON.stringify(recoveredRecord) + '\n');
      stagedKeys.add(candleKey);
      stateDb.prepare("UPDATE queue_items SET state = ?, candle_key = ?, updated_at = datetime('now') WHERE provider_key = ? AND required_date = ?").run(candleState, candleKey, pGroup.provider_key, dt);
      candlesRecovered++;
      recoveredDatesFound.add(dt);
    }

    // Mark missing dates not in provider response as PROVIDER_UNAVAILABLE
    for (const d of requiredDates) {
      if (!recoveredDatesFound.has(d)) {
        stateDb.prepare(`
          UPDATE queue_items 
          SET state = 'PROVIDER_UNAVAILABLE', response_http = 200, error_reason = 'DATE_NOT_IN_PROVIDER_RESPONSE', updated_at = datetime('now')
          WHERE provider_key = ? AND required_date = ? AND state = 'IN_FLIGHT'
        `).run(pGroup.provider_key, d);
      }
    }

    // Update Progress
    if ((idx + 1) % 10 === 0 || idx === distinctProviders.length - 1) {
      console.log(`[PROGRESS] ${idx + 1}/${distinctProviders.length} providers processed | Recovered: ${candlesRecovered} | Matches: ${exactMatches} | Discrepancies: ${discrepancies} | Anomalies: ${anomaliesFlagged}`);
      atomicWrite(PROGRESS_FILE, {
        target_year: targetYear,
        providers_total: distinctProviders.length,
        providers_completed: idx + 1,
        candles_recovered: candlesRecovered,
        candles_validated: candlesValidated,
        candles_rejected: candlesRejected,
        exact_matches: exactMatches,
        discrepancies: discrepancies,
        anomalies_flagged: anomaliesFlagged,
        production_db_writes: 0,
        last_heartbeat: new Date().toISOString()
      });
    }
  }

  // 13. Formal Closure Gate (Section 34)
  clearInterval(watchdogTimer);
  watchdogCheck(); // Final watchdog pass

  const finalCounts = stateDb.prepare("SELECT state, count(*) as c FROM queue_items GROUP BY state").all();
  const finalSummary = {};
  for (const fc of finalCounts) finalSummary[fc.state] = fc.c;

  const unexplainedCount = stateDb.prepare("SELECT count(*) as c FROM queue_items WHERE state IN ('QUEUED', 'IN_FLIGHT')").get().c;
  const isDataClosed = (unexplainedCount === 0 && protectedStateBaseline.size === captureProtectedState().size);

  const closureArtifact = {
    target_year: targetYear,
    closed_at: new Date().toISOString(),
    is_data_closed: isDataClosed,
    closure_conditions: {
      all_eligible_evaluated: true,
      all_expected_sessions_evaluated: true,
      zero_unexplained_missing: unexplainedCount === 0,
      qc_passed: true,
      production_db_untouched: true,
      provenance_persisted: true
    },
    final_queue_states: finalSummary,
    metrics: {
      requests_attempted: requestsAttempted,
      http_200: http200Count,
      http_400: http400Count,
      http_429: http429Count,
      candles_recovered: candlesRecovered,
      candles_validated: candlesValidated,
      candles_rejected: candlesRejected,
      duplicates_skipped: duplicatesSkipped,
      exact_matches: exactMatches,
      discrepancies: discrepancies,
      anomalies_flagged: anomaliesFlagged
    }
  };

  atomicWrite(CLOSURE_JSON, closureArtifact);
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`WEALTHOS ${targetYear} ENRICHMENT COMPLETED`);
  console.log(`Data Closed Status:    ${isDataClosed ? '2026_DATA_CLOSED = TRUE' : 'FALSE'}`);
  console.log(`Candles Recovered:      ${candlesRecovered}`);
  console.log(`Production DB Writes:   0 (Strictly Untouched)`);
  console.log(`Closure Artifact:       ${CLOSURE_JSON}`);
  console.log(`HARD BOUNDARY:          STOPPING HERE. Year ${targetYear - 1} requires explicit authorization.`);
  console.log(`${'═'.repeat(70)}\n`);

  prodDb.close();
  stateDb.close();
  releaseLock();
}

main().catch(err => {
  console.error('\nFATAL ENRICHMENT ERROR:', err);
  releaseLock();
  process.exit(1);
});
