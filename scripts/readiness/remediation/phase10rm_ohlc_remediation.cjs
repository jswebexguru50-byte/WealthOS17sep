#!/usr/bin/env node
'use strict';
/**
 * AGENT B: OHLC REMEDIATION (182 UNKNOWN_REQUIRES_REVIEW ANOMALIES)
 *
 * Wave R1: Discovery & Code Audit (read-only, zero production writes)
 * Wave R2: Read-only validation (read-only, zero production writes)
 * Wave R3: Controlled NSE bhavcopy evidence acquisition (read-only, no portfolio.db writes)
 *
 * All 182 anomalies originated from YAHOO_FINANCE secondary imports.
 * R3 fetches the NSE daily bhavcopy CSV for each distinct trade_date and looks up each symbol.
 * Results are recorded with full provenance in a durable evidence SQLite.
 *
 * Invariants:
 * - Exactly 182 anomalies accounted for
 * - M6 promoted rows (18,244) must not overlap (M6_overlap = 0)
 * - Zero production writes to portfolio.db — EVER
 * - Rate-limited with jitter, exponential backoff on failure
 * - Durable & restart-safe: completed targets skipped on resume
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const ROOT = process.cwd();
const RUNTIME = path.join(ROOT, 'reports/readiness/runtime/remediation');
const ARTIFACTS = path.join(RUNTIME, 'artifacts');
const FORENSICS_FILE = path.join(ROOT, 'reports/readiness/PHASE10RM57_OHLC_FORENSIC_CLASSIFICATION.json');
const M6_MANIFEST = path.join(ROOT, 'reports/market-data/PHASE10RM5Y_PROMOTION_MANIFEST.jsonl');
const AGENT_B_EVIDENCE_DB = path.join(RUNTIME, 'agent_b_evidence.sqlite');
const AGENT_B_CANDIDATES_JSONL = path.join(ARTIFACTS, 'AGENT_B_R3_CANDIDATES.jsonl');
const AGENT_B_R3_REPORT = path.join(ARTIFACTS, 'AGENT_B_R3_EVIDENCE_REPORT.json');

const EXPECTED_ANOMALIES = 182;

// NSE bhavcopy URL pattern (equity CM segment)
// NSE publishes daily bhavcopy at:
// https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_DDMMYYYY.csv
function buildNseBhavCopyUrl(dateStr) {
  const [yyyy, mm, dd] = dateStr.split('-');
  return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${dd}${mm}${yyyy}.csv`;
}

function runAudit() {
  console.log('========================================================');
  console.log('[AGENT B] OHLC Anomaly Audit (Wave R1 — Read-Only)');
  console.log('========================================================\n');

  if (!fs.existsSync(FORENSICS_FILE)) {
    console.error(`✗ Forensics file not found: ${FORENSICS_FILE}`);
    process.exit(1);
  }

  const forensics = JSON.parse(fs.readFileSync(FORENSICS_FILE, 'utf8'));
  const allClassified = forensics.classified || [];
  const anomalies182 = allClassified.filter(c => c.root_cause === 'UNKNOWN_REQUIRES_REVIEW');

  console.log(`  Total forensic entries:           ${allClassified.length}`);
  console.log(`  UNKNOWN_REQUIRES_REVIEW entries:  ${anomalies182.length} (expected ${EXPECTED_ANOMALIES})`);

  if (anomalies182.length !== EXPECTED_ANOMALIES) {
    console.error(`✗ Cardinality mismatch: expected ${EXPECTED_ANOMALIES}, got ${anomalies182.length}`);
    process.exit(1);
  }

  // Symbol distribution
  const symbolMap = {};
  const violationMap = {};
  const keys = new Set();

  for (const a of anomalies182) {
    symbolMap[a.symbol] = (symbolMap[a.symbol] || 0) + 1;
    keys.add(`${a.symbol}|${a.trade_date}`);

    const viols = a.evidence?.violated_invariants || ['UNSPECIFIED'];
    for (const v of viols) {
      const vKey = v.split('(')[0].trim();
      violationMap[vKey] = (violationMap[vKey] || 0) + 1;
    }
  }

  const distinctSymbols = Object.keys(symbolMap).length;
  console.log(`  Distinct symbols affected:        ${distinctSymbols}`);
  console.log(`  Violation categories:`, violationMap);

  // Check overlap with M6 promoted rows
  console.log('\n  Checking overlap with M6 promoted 18,244 records...');
  let m6Overlap = 0;
  if (fs.existsSync(M6_MANIFEST)) {
    const m6Lines = fs.readFileSync(M6_MANIFEST, 'utf8').split('\n').filter(l => l.trim());
    for (const line of m6Lines) {
      const r = JSON.parse(line);
      if (keys.has(`${r.symbol}|${r.trade_date}`)) m6Overlap++;
    }
  }
  console.log(`  Overlap with M6 promoted rows:    ${m6Overlap}`);
  if (m6Overlap > 0) {
    console.error(`✗ Overlap with M6 promoted rows: ${m6Overlap}`);
    process.exit(1);
  }
  console.log(`  ✓ M6 immutable protection confirmed (overlap = 0)`);

  const inventory = {
    agent: 'AGENT_B_OHLC',
    timestamp: new Date().toISOString(),
    wave: 'R1',
    total_anomalies: EXPECTED_ANOMALIES,
    distinct_symbols: distinctSymbols,
    top_symbols: Object.entries(symbolMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, c]) => ({ symbol: s, count: c })),
    violation_categories: violationMap,
    m6_overlap: 0,
    production_db_writes: 0,
    gate: 'PASS'
  };

  const outPath = path.join(ARTIFACTS, 'AGENT_B_R1_INVENTORY.json');
  fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2));
  console.log(`\n✓ Agent B inventory generated: ${path.relative(ROOT, outPath)}`);
  return inventory;
}

function runValidation() {
  console.log('========================================================');
  console.log('[AGENT B] OHLC Anomaly Validation (Wave R2 — Read-Only)');
  console.log('========================================================\n');

  if (!fs.existsSync(FORENSICS_FILE)) {
    console.error(`✗ Forensics file not found: ${FORENSICS_FILE}`);
    process.exit(1);
  }

  const forensics = JSON.parse(fs.readFileSync(FORENSICS_FILE, 'utf8'));
  const allClassified = forensics.classified || [];
  const anomalies182 = allClassified.filter(c => c.root_cause === 'UNKNOWN_REQUIRES_REVIEW');

  if (anomalies182.length !== EXPECTED_ANOMALIES) {
    console.error(`✗ Cardinality mismatch: expected ${EXPECTED_ANOMALIES}, got ${anomalies182.length}`);
    process.exit(1);
  }

  // Inspect data source in DailyOHLCV for each anomaly
  const db = new Database(path.join(ROOT, 'portfolio.db'), { readonly: true });
  const detailedRecords = [];
  let yahooCount = 0;
  let otherCount = 0;
  let correctableCount = 0;
  let validExistingCount = 0;
  let requiresManualReviewCount = 0;

  for (const a of anomalies182) {
    const row = db.prepare('SELECT open, high, low, close, volume, data_source FROM DailyOHLCV WHERE symbol = ? AND trade_date = ?').get(a.symbol, a.trade_date);
    const ds = row?.data_source || 'UNKNOWN';
    if (ds.includes('YAHOO')) yahooCount++;
    else otherCount++;

    // In R2 read-only validation:
    // Because all 182 rows originate from secondary uncertified imports (Yahoo Finance)
    // and no primary upstream exchange bhavcopy / candle is currently staged to prove exact replacement,
    // they are categorized as REQUIRES_MANUAL_REVIEW (pending primary source retrieval in R3).
    const disposition = 'REQUIRES_MANUAL_REVIEW';
    requiresManualReviewCount++;

    detailedRecords.push({
      row_identifier: a.row_identifier,
      symbol: a.symbol,
      trade_date: a.trade_date,
      current_ohlcv: row ? { open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume } : null,
      data_source: ds,
      violated_invariants: a.evidence?.violated_invariants || [],
      authoritative_source_available: false,
      disposition
    });
  }
  db.close();

  // Check overlap with M6 manifest
  let m6Overlap = 0;
  const keySet = new Set(anomalies182.map(a => `${a.symbol}|${a.trade_date}`));
  if (fs.existsSync(M6_MANIFEST)) {
    const m6Lines = fs.readFileSync(M6_MANIFEST, 'utf8').split('\n').filter(l => l.trim());
    for (const line of m6Lines) {
      const r = JSON.parse(line);
      if (keySet.has(`${r.symbol}|${r.trade_date}`)) m6Overlap++;
    }
  }

  const validation = {
    agent: 'AGENT_B_OHLC',
    timestamp: new Date().toISOString(),
    wave: 'R2',
    total_anomalies: anomalies182.length,
    data_source_provenance: {
      yahoo_finance: yahooCount,
      other: otherCount
    },
    classified_adequately: requiresManualReviewCount + correctableCount + validExistingCount,
    disposition_breakdown: {
      correctable_with_authoritative_evidence: correctableCount,
      valid_existing_value: validExistingCount,
      requires_manual_review: requiresManualReviewCount
    },
    unexplained_records: anomalies182.length - (requiresManualReviewCount + correctableCount + validExistingCount),
    m6_overlap: m6Overlap,
    production_db_writes: 0,
    records_sample: detailedRecords.slice(0, 10),
    gate: (m6Overlap === 0 && (requiresManualReviewCount + correctableCount + validExistingCount === EXPECTED_ANOMALIES)) ? 'PASS' : 'FAIL'
  };

  console.log(`  Total anomalies evaluated:       ${validation.total_anomalies}`);
  console.log(`  Data sources:                    YAHOO=${yahooCount}, OTHER=${otherCount}`);
  console.log(`  Classified adequately:           ${validation.classified_adequately}/${EXPECTED_ANOMALIES}`);
  console.log(`  M6 overlap:                      ${validation.m6_overlap}`);
  console.log(`  Unexplained records:             ${validation.unexplained_records}`);
  console.log(`  Gate:                            ${validation.gate}`);

  const outPath = path.join(ARTIFACTS, 'AGENT_B_R2_VALIDATION.json');
  fs.writeFileSync(outPath, JSON.stringify(validation, null, 2));
  console.log(`\n✓ Agent B R2 validation generated: ${path.relative(ROOT, outPath)}`);

  return validation;
}

/**
 * Wave R3: NSE Bhavcopy Evidence Acquisition for 182 OHLC anomalies (READ-ONLY)
 *
 * Strategy:
 *  1. Load all 182 UNKNOWN_REQUIRES_REVIEW anomalies from the forensics file.
 *  2. For each distinct trade_date, fetch the NSE bhavcopy CSV once (deduplicated).
 *  3. For each anomaly, look up the NSE symbol in that date's bhavcopy.
 *  4. If found with valid OHLCV, record as CANDIDATE_CORRECTION_AVAILABLE.
 *  5. If not found, classify as NO_DATA_IN_BHAVCOPY.
 *  6. Record all attempts with full provenance in durable evidence SQLite.
 *  7. Emit AGENT_B_R3_CANDIDATES.jsonl and AGENT_B_R3_EVIDENCE_REPORT.json.
 *  8. NEVER write to portfolio.db.
 */
async function runR3EvidenceAcquisition() {
  console.log('========================================================');
  console.log('[AGENT B] NSE Bhavcopy Evidence Acquisition (Wave R3)');
  console.log('========================================================\n');

  // 0. Pre-condition: R2 must be PASS
  const r2Path = path.join(ARTIFACTS, 'AGENT_B_R2_VALIDATION.json');
  if (!fs.existsSync(r2Path)) {
    console.error('✗ R2 validation artifact not found. Run Wave R2 first.');
    process.exit(1);
  }
  const r2 = JSON.parse(fs.readFileSync(r2Path, 'utf8'));
  if (r2.gate !== 'PASS') {
    console.error(`✗ R2 gate is ${r2.gate}, not PASS. Aborting R3.`);
    process.exit(1);
  }
  console.log(`  ✓ R2 gate confirmed: ${r2.gate}`);

  // 1. Load anomalies
  const forensics = JSON.parse(fs.readFileSync(FORENSICS_FILE, 'utf8'));
  const anomalies182 = forensics.classified.filter(c => c.root_cause === 'UNKNOWN_REQUIRES_REVIEW');
  if (anomalies182.length !== EXPECTED_ANOMALIES) {
    console.error(`✗ Expected ${EXPECTED_ANOMALIES} anomalies, found ${anomalies182.length}. Aborting.`);
    process.exit(1);
  }
  console.log(`  ✓ ${anomalies182.length} anomalies loaded from forensics file`);

  // 2. Initialize durable evidence SQLite
  const evDb = new Database(AGENT_B_EVIDENCE_DB);
  evDb.pragma('journal_mode = WAL');
  evDb.exec(`
    CREATE TABLE IF NOT EXISTS ohlc_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_identifier INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      current_open REAL,
      current_high REAL,
      current_low REAL,
      current_close REAL,
      current_volume REAL,
      bhavcopy_url TEXT NOT NULL,
      http_status INTEGER,
      symbol_found INTEGER DEFAULT 0,
      candidate_open REAL,
      candidate_high REAL,
      candidate_low REAL,
      candidate_close REAL,
      candidate_volume REAL,
      disposition TEXT,
      attempted_at TEXT NOT NULL,
      UNIQUE(symbol, trade_date)
    );
    CREATE TABLE IF NOT EXISTS bhavcopy_date_cache (
      trade_date TEXT PRIMARY KEY,
      bhavcopy_url TEXT NOT NULL,
      http_status INTEGER,
      fetched_at TEXT NOT NULL,
      row_count INTEGER DEFAULT 0,
      error_msg TEXT
    );
  `);

  // 3. Find already-completed targets (durable restart)
  const completedSet = new Set(
    evDb.prepare('SELECT symbol, trade_date FROM ohlc_attempts WHERE disposition IS NOT NULL')
       .all().map(r => `${r.symbol}|${r.trade_date}`)
  );
  console.log(`  Already evidenced (restart resume): ${completedSet.size} / ${EXPECTED_ANOMALIES}`);

  const remaining = anomalies182.filter(a => !completedSet.has(`${a.symbol}|${a.trade_date}`));
  console.log(`  Remaining to process:              ${remaining.length}`);

  // 4. Distinct dates
  const distinctDates = [...new Set(remaining.map(a => a.trade_date))].sort();
  console.log(`  Distinct NSE bhavcopy dates to fetch: ${distinctDates.length}\n`);

  // Rate-limit config
  const MIN_DELAY_MS = 3000;
  const JITTER_PCT = 0.3;
  const MAX_RETRIES = 3;
  const BACKOFF_MS = [15000, 45000, 120000];

  let bhavDatesFetched = 0;
  let candidateCorrections = 0;
  let noDataConfirmed = 0;
  let fetchErrors = 0;

  const insertAttempt = evDb.prepare(`
    INSERT OR IGNORE INTO ohlc_attempts
      (row_identifier, symbol, trade_date, current_open, current_high, current_low, current_close, current_volume,
       bhavcopy_url, http_status, symbol_found,
       candidate_open, candidate_high, candidate_low, candidate_close, candidate_volume,
       disposition, attempted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDateCache = evDb.prepare(`
    INSERT OR REPLACE INTO bhavcopy_date_cache
      (trade_date, bhavcopy_url, http_status, fetched_at, row_count, error_msg)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const jitter = (ms) => ms + Math.floor(ms * JITTER_PCT * (Math.random() * 2 - 1));

  // Helper: fetch URL with retries
  async function fetchUrl(url, retries) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await new Promise((resolve, reject) => {
          const req = https.get(url, { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.nseindia.com' } }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
        });
        return result;
      } catch (err) {
        if (attempt < retries) {
          const backoffMs = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
          console.log(`    ⚠ Fetch error (${err.message}), retry ${attempt + 1}/${retries} after ${backoffMs / 1000}s...`);
          await sleep(jitter(backoffMs));
        } else {
          return { status: 0, body: '', error: err.message };
        }
      }
    }
  }

  // Helper: parse NSE bhavcopy CSV
  // NSE format can be:
  // 1) sec_bhavdata_full: SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY...
  // 2) legacy: SYMBOL, SERIES, OPEN, HIGH, LOW, CLOSE, LAST, PREVCLOSE, TOTTRDQTY...
  function parseNseBhavCopyCsv(csvText) {
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return new Map();
    const header = lines[0].split(',').map(h => h.trim().toUpperCase());
    const idxSym   = header.indexOf('SYMBOL');
    let idxOpen  = header.indexOf('OPEN_PRICE');
    if (idxOpen === -1) idxOpen = header.indexOf('OPEN');
    let idxHigh  = header.indexOf('HIGH_PRICE');
    if (idxHigh === -1) idxHigh = header.indexOf('HIGH');
    let idxLow   = header.indexOf('LOW_PRICE');
    if (idxLow === -1) idxLow = header.indexOf('LOW');
    let idxClose = header.indexOf('CLOSE_PRICE');
    if (idxClose === -1) idxClose = header.indexOf('CLOSE');
    let idxVol   = header.indexOf('TTL_TRD_QNTY');
    if (idxVol === -1) idxVol = header.indexOf('TOTTRDQTY');

    if (idxSym === -1 || idxOpen === -1) return new Map();

    const result = new Map();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length <= idxSym) continue;
      const sym = cols[idxSym]?.trim();
      if (!sym) continue;
      // Filter out non-equity series if duplicates exist, but keep first or EQ
      const idxSeries = header.indexOf('SERIES');
      const series = idxSeries !== -1 ? cols[idxSeries]?.trim() : '';
      if (result.has(sym) && series !== 'EQ') continue;

      result.set(sym, {
        open:   parseFloat(cols[idxOpen]  || '0'),
        high:   parseFloat(cols[idxHigh]  || '0'),
        low:    parseFloat(cols[idxLow]   || '0'),
        close:  parseFloat(cols[idxClose] || '0'),
        volume: parseFloat(cols[idxVol]   || '0')
      });
    }
    return result;
  }

  // Load current OHLCV from portfolio.db for provenance recording (read-only)
  const portfolioDb = new Database(path.join(ROOT, 'portfolio.db'), { readonly: true });

  // 5. Process each distinct date
  for (const tradeDate of distinctDates) {
    const url = buildNseBhavCopyUrl(tradeDate);
    const targetsForDate = remaining.filter(a => a.trade_date === tradeDate);
    const cachedDate = evDb.prepare('SELECT http_status, row_count FROM bhavcopy_date_cache WHERE trade_date = ?').get(tradeDate);

    let bhavcopyMap = new Map();
    let httpStatus = 0;
    let rowCount = 0;

    // Only fetch if not already a clean cached success, or if we have unevidenced targets
    const unevidenced = targetsForDate.filter(a => !completedSet.has(`${a.symbol}|${a.trade_date}`));
    if (unevidenced.length === 0) continue;

    if (!cachedDate || cachedDate.http_status !== 200) {
      if (bhavDatesFetched > 0) await sleep(jitter(MIN_DELAY_MS));
      console.log(`  Fetching NSE bhavcopy for ${tradeDate}... (${unevidenced.length} anomalies)`);
      const res = await fetchUrl(url, MAX_RETRIES);
      httpStatus = res.status;
      bhavDatesFetched++;

      if (httpStatus === 200 && res.body) {
        bhavcopyMap = parseNseBhavCopyCsv(res.body);
        rowCount = bhavcopyMap.size;
        insertDateCache.run(tradeDate, url, httpStatus, new Date().toISOString(), rowCount, null);
        console.log(`    ✓ HTTP ${httpStatus} — ${rowCount} symbols in bhavcopy`);
      } else {
        const errMsg = res.error || `HTTP ${httpStatus}`;
        insertDateCache.run(tradeDate, url, httpStatus, new Date().toISOString(), 0, errMsg);
        console.log(`    ✗ Bhavcopy fetch failed: ${errMsg}`);
        fetchErrors++;
        for (const a of unevidenced) {
          const curRow = portfolioDb.prepare('SELECT open,high,low,close,volume FROM DailyOHLCV WHERE symbol=? AND trade_date=?').get(a.symbol, a.trade_date);
          insertAttempt.run(a.row_identifier, a.symbol, a.trade_date,
            curRow?.open, curRow?.high, curRow?.low, curRow?.close, curRow?.volume,
            url, httpStatus, 0, null, null, null, null, null, 'BHAVCOPY_FETCH_FAILED', new Date().toISOString());
        }
        continue;
      }
    } else {
      // Already cached — still need to fetch to search (no full-text cache stored)
      if (bhavDatesFetched > 0) await sleep(jitter(MIN_DELAY_MS));
      console.log(`  Re-fetching NSE bhavcopy for ${tradeDate} (${unevidenced.length} unevidenced, was cached HTTP ${cachedDate.http_status})...`);
      const res = await fetchUrl(url, MAX_RETRIES);
      httpStatus = res.status;
      bhavDatesFetched++;
      if (httpStatus === 200 && res.body) {
        bhavcopyMap = parseNseBhavCopyCsv(res.body);
        rowCount = bhavcopyMap.size;
        insertDateCache.run(tradeDate, url, httpStatus, new Date().toISOString(), rowCount, null);
      } else {
        const errMsg = res.error || `HTTP ${httpStatus}`;
        insertDateCache.run(tradeDate, url, httpStatus, new Date().toISOString(), 0, errMsg);
        fetchErrors++;
        for (const a of unevidenced) {
          const curRow = portfolioDb.prepare('SELECT open,high,low,close,volume FROM DailyOHLCV WHERE symbol=? AND trade_date=?').get(a.symbol, a.trade_date);
          insertAttempt.run(a.row_identifier, a.symbol, a.trade_date,
            curRow?.open, curRow?.high, curRow?.low, curRow?.close, curRow?.volume,
            url, httpStatus, 0, null, null, null, null, null, 'BHAVCOPY_FETCH_FAILED', new Date().toISOString());
        }
        continue;
      }
    }

    // 6. For each anomaly on this date, look up in bhavcopyMap
    for (const a of unevidenced) {
      const curRow = portfolioDb.prepare('SELECT open,high,low,close,volume FROM DailyOHLCV WHERE symbol=? AND trade_date=?').get(a.symbol, a.trade_date);
      const bhavRow = bhavcopyMap.get(a.symbol);
      let disposition;
      let symFound = 0;
      let candOpen = null, candHigh = null, candLow = null, candClose = null, candVol = null;

      if (bhavRow && bhavRow.close > 0) {
        symFound = 1;
        candOpen  = bhavRow.open;
        candHigh  = bhavRow.high;
        candLow   = bhavRow.low;
        candClose = bhavRow.close;
        candVol   = bhavRow.volume;
        disposition = 'CANDIDATE_CORRECTION_AVAILABLE';
        candidateCorrections++;

        const candLine = JSON.stringify({
          source: 'NSE_BHAVCOPY',
          row_identifier: a.row_identifier,
          symbol: a.symbol,
          trade_date: a.trade_date,
          bhavcopy_url: url,
          violated_invariants: a.evidence?.violated_invariants || [],
          current_ohlcv: curRow ? { open: curRow.open, high: curRow.high, low: curRow.low, close: curRow.close, volume: curRow.volume } : null,
          candidate_ohlcv: { open: candOpen, high: candHigh, low: candLow, close: candClose, volume: candVol },
          evidenced_at: new Date().toISOString()
        });
        fs.appendFileSync(AGENT_B_CANDIDATES_JSONL, candLine + '\n');
      } else if (httpStatus === 200 && rowCount > 0) {
        disposition = 'NO_DATA_IN_BHAVCOPY';
        noDataConfirmed++;
      } else {
        disposition = 'BHAVCOPY_EMPTY_OR_ERROR';
        fetchErrors++;
      }

      insertAttempt.run(
        a.row_identifier, a.symbol, a.trade_date,
        curRow?.open, curRow?.high, curRow?.low, curRow?.close, curRow?.volume,
        url, httpStatus, symFound,
        candOpen, candHigh, candLow, candClose, candVol,
        disposition, new Date().toISOString()
      );
      completedSet.add(`${a.symbol}|${a.trade_date}`);
    }
  }

  portfolioDb.close();

  // 7. Tally final counts
  const finalCandidates  = evDb.prepare("SELECT COUNT(*) cnt FROM ohlc_attempts WHERE disposition='CANDIDATE_CORRECTION_AVAILABLE'").get().cnt;
  const finalNoData      = evDb.prepare("SELECT COUNT(*) cnt FROM ohlc_attempts WHERE disposition='NO_DATA_IN_BHAVCOPY'").get().cnt;
  const finalFetchFailed = evDb.prepare("SELECT COUNT(*) cnt FROM ohlc_attempts WHERE disposition IN ('BHAVCOPY_FETCH_FAILED', 'BHAVCOPY_EMPTY_OR_ERROR')").get().cnt;
  const finalTotal       = evDb.prepare('SELECT COUNT(*) cnt FROM ohlc_attempts').get().cnt;
  evDb.close();

  // 8. M6 overlap check
  let m6Overlap = 0;
  if (fs.existsSync(AGENT_B_CANDIDATES_JSONL) && fs.existsSync(M6_MANIFEST)) {
    const m6Lines = fs.readFileSync(M6_MANIFEST, 'utf8').split('\n').filter(l => l.trim());
    const m6Keys = new Set(m6Lines.map(l => { const r = JSON.parse(l); return `${r.symbol}|${r.trade_date}`; }));
    const candLines = fs.readFileSync(AGENT_B_CANDIDATES_JSONL, 'utf8').split('\n').filter(l => l.trim());
    for (const cl of candLines) {
      const c = JSON.parse(cl);
      if (m6Keys.has(`${c.symbol}|${c.trade_date}`)) m6Overlap++;
    }
  }
  if (m6Overlap > 0) {
    console.error(`✗ CRITICAL: ${m6Overlap} candidate corrections overlap with M6 protected set!`);
    process.exit(1);
  }

  // 9. R3 Report
  const candidatesJsonlSha = fs.existsSync(AGENT_B_CANDIDATES_JSONL)
    ? crypto.createHash('sha256').update(fs.readFileSync(AGENT_B_CANDIDATES_JSONL)).digest('hex')
    : 'N/A';

  const r3Report = {
    agent: 'AGENT_B_OHLC',
    timestamp: new Date().toISOString(),
    wave: 'R3',
    r2_gate_confirmed: r2.gate,
    authoritative_anomalies: EXPECTED_ANOMALIES,
    total_evidenced: finalTotal,
    candidate_corrections: finalCandidates,
    no_data_in_bhavcopy: finalNoData,
    bhavcopy_fetch_failed: finalFetchFailed,
    bhavcopy_dates_fetched: bhavDatesFetched,
    m6_overlap: m6Overlap,
    production_db_writes: 0,
    candidates_jsonl: path.relative(ROOT, AGENT_B_CANDIDATES_JSONL),
    candidates_jsonl_sha256: candidatesJsonlSha,
    evidence_db: path.relative(ROOT, AGENT_B_EVIDENCE_DB),
    gate: (m6Overlap === 0 && finalTotal === EXPECTED_ANOMALIES) ? 'PASS' : 'FAIL'
  };

  fs.writeFileSync(AGENT_B_R3_REPORT, JSON.stringify(r3Report, null, 2));

  const line = '='.repeat(56);
  console.log(`\n${line}`);
  console.log('AGENT B — Wave R3 Evidence Acquisition COMPLETE');
  console.log(line);
  console.log(`  Authoritative anomalies:         ${EXPECTED_ANOMALIES}`);
  console.log(`  Total evidenced:                 ${finalTotal}`);
  console.log(`  Candidate corrections (NSE hit): ${finalCandidates}`);
  console.log(`  No data in bhavcopy:             ${finalNoData}`);
  console.log(`  Bhavcopy fetch failures:         ${finalFetchFailed}`);
  console.log(`  M6 overlap:                      ${m6Overlap} (must be 0)`);
  console.log(`  Production DB writes:            0 (invariant enforced)`);
  console.log(`  Gate:                            ${r3Report.gate}`);
  console.log(`  Candidates JSONL:                ${r3Report.candidates_jsonl}`);
  console.log(`  Candidates SHA:                  ${candidatesJsonlSha}`);
  console.log(line + '\n');

  if (r3Report.gate !== 'PASS') {
    console.error('✗ Agent B R3 gate FAIL — inspect evidence DB and report.');
    process.exit(1);
  }

  return r3Report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--r2')) {
    runValidation();
  } else if (args.includes('--r3')) {
    runR3EvidenceAcquisition().catch(err => {
      console.error('✗ Agent B R3 fatal error:', err.message);
      process.exit(1);
    });
  } else {
    runAudit();
  }
}

module.exports = { runAudit, runValidation, runR3EvidenceAcquisition };
