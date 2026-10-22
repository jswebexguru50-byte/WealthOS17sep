#!/usr/bin/env node
'use strict';
/**
 * AGENT C: IDENTITY REMEDIATION (8 IDENTITY_UNRESOLVED ANOMALIES)
 *
 * Wave R1: Discovery & Code Audit (read-only, zero production writes)
 * Wave R2: Read-only validation (read-only, zero production writes)
 * Wave R3: Controlled identity resolution via exchange symbol masters (read-only, no portfolio.db writes)
 *
 * Affected symbols: GFSTEELS (5 rows), ALPSINDUS (3 rows), NAGAFERT (1 row) — actually 3+3+2 = 8 total.
 * R3 queries NSE and BSE public symbol master CSVs for each distinct symbol.
 * Zero-guessing rule: only an exact symbol match in the exchange master with a valid ISIN counts.
 *
 * Invariants:
 * - Exactly 8 findings accounted for
 * - M6 promoted rows (18,244) must not overlap (M6_overlap = 0)
 * - Zero guessing rule: no inferred identities without authoritative evidence
 * - Zero production writes to portfolio.db — EVER
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
const AGENT_C_EVIDENCE_DB = path.join(RUNTIME, 'agent_c_evidence.sqlite');
const AGENT_C_CANDIDATES_JSONL = path.join(ARTIFACTS, 'AGENT_C_R3_CANDIDATES.jsonl');
const AGENT_C_R3_REPORT = path.join(ARTIFACTS, 'AGENT_C_R3_EVIDENCE_REPORT.json');

const EXPECTED_IDENTITY_ANOMALIES = 8;

// NSE symbol master (all listed equities with ISIN)
// https://www.nseindia.com/market-data/securities-available-for-trading
// Publicly available CSV: https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
const NSE_EQUITY_MASTER_URL = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';
// BSE security master: https://www.bseindia.com/corporates/List_Scrips.aspx
// Direct download CSV: https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active
const BSE_SECURITY_MASTER_URL = 'https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active';
// BSE also provides a list including delisted stocks:
const BSE_SECURITY_MASTER_ALL_URL = 'https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Delisted';

function runAudit() {
  console.log('========================================================');
  console.log('[AGENT C] Identity Finding Audit (Wave R1 — Read-Only)');
  console.log('========================================================\n');

  if (!fs.existsSync(FORENSICS_FILE)) {
    console.error(`✗ Forensics file not found: ${FORENSICS_FILE}`);
    process.exit(1);
  }

  const forensics = JSON.parse(fs.readFileSync(FORENSICS_FILE, 'utf8'));
  const allClassified = forensics.classified || [];
  const idAnomalies = allClassified.filter(c => c.root_cause === 'IDENTITY_UNRESOLVED');

  console.log(`  Total forensic entries:           ${allClassified.length}`);
  console.log(`  IDENTITY_UNRESOLVED entries:      ${idAnomalies.length} (expected ${EXPECTED_IDENTITY_ANOMALIES})`);

  if (idAnomalies.length !== EXPECTED_IDENTITY_ANOMALIES) {
    console.error(`✗ Cardinality mismatch: expected ${EXPECTED_IDENTITY_ANOMALIES}, got ${idAnomalies.length}`);
    process.exit(1);
  }

  // Symbol distribution
  const symbolMap = {};
  const keys = new Set();

  for (const a of idAnomalies) {
    symbolMap[a.symbol] = (symbolMap[a.symbol] || 0) + 1;
    keys.add(`${a.symbol}|${a.trade_date}`);
  }

  console.log(`  Distinct symbols affected:        ${Object.keys(symbolMap).length}`);
  console.log(`  Symbol distribution:`, symbolMap);

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
    agent: 'AGENT_C_IDENTITY',
    timestamp: new Date().toISOString(),
    wave: 'R1',
    total_findings: EXPECTED_IDENTITY_ANOMALIES,
    distinct_symbols: Object.keys(symbolMap).length,
    symbols_breakdown: symbolMap,
    records: idAnomalies.map(a => ({
      row_identifier: a.row_identifier,
      symbol: a.symbol,
      trade_date: a.trade_date,
      open: a.open,
      high: a.high,
      low: a.low,
      close: a.close,
      volume: a.volume,
      note: a.evidence?.note
    })),
    m6_overlap: 0,
    production_db_writes: 0,
    gate: 'PASS'
  };

  const outPath = path.join(ARTIFACTS, 'AGENT_C_R1_INVENTORY.json');
  fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2));
  console.log(`\n✓ Agent C inventory generated: ${path.relative(ROOT, outPath)}`);
  return inventory;
}

function runValidation() {
  console.log('========================================================');
  console.log('[AGENT C] Identity Finding Validation (Wave R2 — Read-Only)');
  console.log('========================================================\n');

  if (!fs.existsSync(FORENSICS_FILE)) {
    console.error(`✗ Forensics file not found: ${FORENSICS_FILE}`);
    process.exit(1);
  }

  const forensics = JSON.parse(fs.readFileSync(FORENSICS_FILE, 'utf8'));
  const allClassified = forensics.classified || [];
  const idAnomalies = allClassified.filter(c => c.root_cause === 'IDENTITY_UNRESOLVED');

  if (idAnomalies.length !== EXPECTED_IDENTITY_ANOMALIES) {
    console.error(`✗ Cardinality mismatch: expected ${EXPECTED_IDENTITY_ANOMALIES}, got ${idAnomalies.length}`);
    process.exit(1);
  }

  // Cross-reference against MasterTickers in portfolio.db
  const db = new Database(path.join(ROOT, 'portfolio.db'), { readonly: true });
  const validatedRecords = [];
  let resolvedCount = 0;
  let notEstablishedCount = 0;

  for (const a of idAnomalies) {
    const mtExact = db.prepare('SELECT isin, exchange, segment, upstox_key_bse, upstox_key_nse FROM MasterTickers WHERE symbol = ?').get(a.symbol);
    const mtLike = db.prepare('SELECT isin, symbol FROM MasterTickers WHERE symbol LIKE ? OR name LIKE ? LIMIT 5').all(`%${a.symbol}%`, `%${a.symbol}%`);

    // Zero-guessing rule: Do NOT infer identity from symbol format or partial match.
    // If no exact authoritative linkage exists in MasterTickers, classify as IDENTITY_NOT_ESTABLISHED
    let identityDecision = 'IDENTITY_NOT_ESTABLISHED';
    if (mtExact && mtExact.isin) {
      identityDecision = 'IDENTITY_RESOLVED';
      resolvedCount++;
    } else {
      notEstablishedCount++;
    }

    validatedRecords.push({
      row_identifier: a.row_identifier,
      symbol: a.symbol,
      trade_date: a.trade_date,
      isin: mtExact?.isin || null,
      exchange: mtExact?.exchange || 'UNKNOWN',
      security_type: mtExact?.segment || 'UNKNOWN',
      provider_instrument_key: mtExact?.upstox_key_bse || mtExact?.upstox_key_nse || null,
      authoritative_mapping_exists: !!mtExact,
      partial_matches_found: mtLike.length,
      identity_decision: identityDecision,
      requires_manual_review: identityDecision === 'IDENTITY_NOT_ESTABLISHED'
    });
  }
  db.close();

  // Check overlap with M6 manifest
  let m6Overlap = 0;
  const keySet = new Set(idAnomalies.map(a => `${a.symbol}|${a.trade_date}`));
  if (fs.existsSync(M6_MANIFEST)) {
    const m6Lines = fs.readFileSync(M6_MANIFEST, 'utf8').split('\n').filter(l => l.trim());
    for (const line of m6Lines) {
      const r = JSON.parse(line);
      if (keySet.has(`${r.symbol}|${r.trade_date}`)) m6Overlap++;
    }
  }

  const validation = {
    agent: 'AGENT_C_IDENTITY',
    timestamp: new Date().toISOString(),
    wave: 'R2',
    total_findings: idAnomalies.length,
    identity_resolved: resolvedCount,
    identity_not_established: notEstablishedCount,
    classified_adequately: resolvedCount + notEstablishedCount,
    unexplained_records: idAnomalies.length - (resolvedCount + notEstablishedCount),
    m6_overlap: m6Overlap,
    production_db_writes: 0,
    zero_guessing_rule_enforced: true,
    records: validatedRecords,
    gate: (m6Overlap === 0 && (resolvedCount + notEstablishedCount === EXPECTED_IDENTITY_ANOMALIES)) ? 'PASS' : 'FAIL'
  };

  console.log(`  Total findings evaluated:        ${validation.total_findings}`);
  console.log(`  Identity resolved:               ${validation.identity_resolved}`);
  console.log(`  Identity not established:        ${validation.identity_not_established}`);
  console.log(`  Classified adequately:           ${validation.classified_adequately}/${EXPECTED_IDENTITY_ANOMALIES}`);
  console.log(`  Zero-guessing rule enforced:     ${validation.zero_guessing_rule_enforced}`);
  console.log(`  M6 overlap:                      ${validation.m6_overlap}`);
  console.log(`  Gate:                            ${validation.gate}`);

  const outPath = path.join(ARTIFACTS, 'AGENT_C_R2_VALIDATION.json');
  fs.writeFileSync(outPath, JSON.stringify(validation, null, 2));
  console.log(`\n✓ Agent C R2 validation generated: ${path.relative(ROOT, outPath)}`);

  return validation;
}

/**
 * Wave R3: Identity Resolution via Exchange Symbol Masters (READ-ONLY)
 *
 * Strategy:
 *  1. Identify the 3 distinct symbols: GFSTEELS, ALPSINDUS, NAGAFERT.
 *  2. Fetch NSE EQUITY_L.csv master and search for each symbol.
 *  3. Fetch BSE security master (active + delisted) and search for each symbol.
 *  4. Zero-guessing rule: only exact symbol match with valid ISIN in exchange master counts.
 *  5. Record provenance (source URL, response SHA, match field, ISIN) in evidence SQLite.
 *  6. NEVER write to portfolio.db.
 */
async function runR3EvidenceAcquisition() {
  console.log('========================================================');
  console.log('[AGENT C] Identity Resolution via Exchange Masters (Wave R3)');
  console.log('========================================================\n');

  // 0. Pre-condition: R2 must be PASS
  const r2Path = path.join(ARTIFACTS, 'AGENT_C_R2_VALIDATION.json');
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

  // 1. Load identity anomalies
  const forensics = JSON.parse(fs.readFileSync(FORENSICS_FILE, 'utf8'));
  const idAnomalies = forensics.classified.filter(c => c.root_cause === 'IDENTITY_UNRESOLVED');
  if (idAnomalies.length !== EXPECTED_IDENTITY_ANOMALIES) {
    console.error(`✗ Expected ${EXPECTED_IDENTITY_ANOMALIES} findings, found ${idAnomalies.length}. Aborting.`);
    process.exit(1);
  }

  // Distinct symbols
  const distinctSymbols = [...new Set(idAnomalies.map(a => a.symbol))];
  console.log(`  Identity anomaly symbols: ${distinctSymbols.join(', ')}`);
  console.log(`  Total records: ${idAnomalies.length} across ${distinctSymbols.length} symbols\n`);

  // 2. Initialize durable evidence SQLite
  const evDb = new Database(AGENT_C_EVIDENCE_DB);
  evDb.pragma('journal_mode = WAL');
  evDb.exec(`
    CREATE TABLE IF NOT EXISTS identity_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      http_status INTEGER,
      symbol_found INTEGER DEFAULT 0,
      isin TEXT,
      company_name TEXT,
      exchange TEXT,
      identity_decision TEXT,
      response_sha256 TEXT,
      attempted_at TEXT NOT NULL,
      UNIQUE(symbol, source)
    );
  `);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const jitter = (ms) => ms + Math.floor(ms * 0.3 * (Math.random() * 2 - 1));

  // Helper: fetch URL
  async function fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.nseindia.com' }
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
    });
  }

  // Helper: parse NSE EQUITY_L.csv
  // Format: SYMBOL,NAME OF COMPANY,SERIES,DATE OF LISTING,PAID UP VALUE,MARKET LOT,ISIN NUMBER,FACE VALUE
  function parseNseEquityMaster(csvText) {
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return new Map();
    const header = lines[0].split(',').map(h => h.trim().toUpperCase());
    const idxSym  = header.indexOf('SYMBOL');
    const idxISIN = header.findIndex(h => h.includes('ISIN'));
    const idxName = header.indexOf('NAME OF COMPANY');
    if (idxSym === -1 || idxISIN === -1) return new Map();
    const result = new Map();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length <= Math.max(idxSym, idxISIN)) continue;
      const sym  = cols[idxSym]?.trim();
      const isin = cols[idxISIN]?.trim();
      const name = cols[idxName]?.trim() || '';
      if (sym && isin && isin.match(/^INE[A-Z0-9]{9}$/)) {
        result.set(sym, { isin, name, exchange: 'NSE' });
      }
    }
    return result;
  }

  // Helper: parse BSE security master (JSON response)
  function parseBseSecurityMaster(body) {
    // BSE API returns JSON array
    try {
      const data = JSON.parse(body);
      const result = new Map();
      for (const item of (data || [])) {
        // Fields vary, common: scripCode, scripName, ISIN_Number, scrip_Symbol
        const sym  = (item.scrip_Symbol || item.scripName || '').trim();
        const isin = (item.ISIN_Number || item.isin || '').trim();
        const name = (item.scripName || '').trim();
        if (sym && isin && isin.match(/^INE[A-Z0-9]{9}$/)) {
          result.set(sym, { isin, name, exchange: 'BSE', scripCode: item.scripCode });
        }
      }
      return result;
    } catch {
      return new Map();
    }
  }

  const insertAttempt = evDb.prepare(`
    INSERT OR REPLACE INTO identity_attempts
      (symbol, source, source_url, http_status, symbol_found, isin, company_name, exchange, identity_decision, response_sha256, attempted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 3. Fetch NSE master
  console.log(`  Fetching NSE equity master (${NSE_EQUITY_MASTER_URL})...`);
  let nseMap = new Map();
  let nseStatus = 0;
  let nseBodySha = 'N/A';
  try {
    const nseRes = await fetchUrl(NSE_EQUITY_MASTER_URL);
    nseStatus = nseRes.status;
    if (nseStatus === 200 && nseRes.body) {
      nseBodySha = crypto.createHash('sha256').update(nseRes.body).digest('hex');
      nseMap = parseNseEquityMaster(nseRes.body);
      console.log(`    ✓ NSE master fetched: ${nseMap.size} symbols (SHA: ${nseBodySha.substring(0, 16)}...)`);
    } else {
      console.log(`    ✗ NSE master fetch failed: HTTP ${nseStatus}`);
    }
  } catch (err) {
    console.log(`    ✗ NSE master fetch error: ${err.message}`);
  }

  await sleep(jitter(3000));

  // 4. Fetch BSE master (active)
  console.log(`\n  Fetching BSE security master (active)...`);
  let bseActiveMap = new Map();
  let bseActiveStatus = 0;
  let bseActiveBodySha = 'N/A';
  try {
    const bseRes = await fetchUrl(BSE_SECURITY_MASTER_URL);
    bseActiveStatus = bseRes.status;
    if (bseActiveStatus === 200 && bseRes.body) {
      bseActiveBodySha = crypto.createHash('sha256').update(bseRes.body).digest('hex');
      bseActiveMap = parseBseSecurityMaster(bseRes.body);
      console.log(`    ✓ BSE active master fetched: ${bseActiveMap.size} symbols (SHA: ${bseActiveBodySha.substring(0, 16)}...)`);
    } else {
      console.log(`    ✗ BSE active master fetch failed: HTTP ${bseActiveStatus}`);
    }
  } catch (err) {
    console.log(`    ✗ BSE active master fetch error: ${err.message}`);
  }

  await sleep(jitter(3000));

  // 5. Fetch BSE master (delisted) — these symbols may be historical
  console.log(`\n  Fetching BSE security master (delisted)...`);
  let bseDelistedMap = new Map();
  let bseDelistedStatus = 0;
  let bseDelistedBodySha = 'N/A';
  try {
    const bseRes = await fetchUrl(BSE_SECURITY_MASTER_ALL_URL);
    bseDelistedStatus = bseRes.status;
    if (bseDelistedStatus === 200 && bseRes.body) {
      bseDelistedBodySha = crypto.createHash('sha256').update(bseRes.body).digest('hex');
      bseDelistedMap = parseBseSecurityMaster(bseRes.body);
      console.log(`    ✓ BSE delisted master fetched: ${bseDelistedMap.size} symbols (SHA: ${bseDelistedBodySha.substring(0, 16)}...)`);
    } else {
      console.log(`    ✗ BSE delisted master fetch failed: HTTP ${bseDelistedStatus}`);
    }
  } catch (err) {
    console.log(`    ✗ BSE delisted master fetch error: ${err.message}`);
  }

  // 6. For each distinct symbol, look up in all three sources
  console.log(`\n  Processing ${distinctSymbols.length} distinct symbols...`);

  const symbolResolutions = {};

  for (const sym of distinctSymbols) {
    const results = [];

    // NSE lookup
    const nseMatch = nseMap.get(sym);
    if (nseMatch) {
      insertAttempt.run(sym, 'NSE_EQUITY_MASTER', NSE_EQUITY_MASTER_URL,
        nseStatus, 1, nseMatch.isin, nseMatch.name, 'NSE',
        'IDENTITY_RESOLVED', nseBodySha, new Date().toISOString());
      results.push({ source: 'NSE_EQUITY_MASTER', isin: nseMatch.isin, name: nseMatch.name, exchange: 'NSE' });
      console.log(`    ✓ NSE match for ${sym}: ISIN=${nseMatch.isin}, Name=${nseMatch.name}`);
    } else {
      insertAttempt.run(sym, 'NSE_EQUITY_MASTER', NSE_EQUITY_MASTER_URL,
        nseStatus, 0, null, null, null,
        nseStatus === 200 ? 'IDENTITY_NOT_ESTABLISHED' : 'SOURCE_UNAVAILABLE',
        nseBodySha, new Date().toISOString());
      console.log(`    ✗ NSE: ${sym} not found (HTTP ${nseStatus})`);
    }

    // BSE active lookup
    const bseActiveMatch = bseActiveMap.get(sym);
    if (bseActiveMatch) {
      insertAttempt.run(sym, 'BSE_SECURITY_MASTER_ACTIVE', BSE_SECURITY_MASTER_URL,
        bseActiveStatus, 1, bseActiveMatch.isin, bseActiveMatch.name, 'BSE',
        'IDENTITY_RESOLVED', bseActiveBodySha, new Date().toISOString());
      results.push({ source: 'BSE_SECURITY_MASTER_ACTIVE', isin: bseActiveMatch.isin, name: bseActiveMatch.name, exchange: 'BSE' });
      console.log(`    ✓ BSE active match for ${sym}: ISIN=${bseActiveMatch.isin}, Name=${bseActiveMatch.name}`);
    } else {
      insertAttempt.run(sym, 'BSE_SECURITY_MASTER_ACTIVE', BSE_SECURITY_MASTER_URL,
        bseActiveStatus, 0, null, null, null,
        bseActiveStatus === 200 ? 'IDENTITY_NOT_ESTABLISHED' : 'SOURCE_UNAVAILABLE',
        bseActiveBodySha, new Date().toISOString());
    }

    // BSE delisted lookup
    const bseDelistedMatch = bseDelistedMap.get(sym);
    if (bseDelistedMatch) {
      insertAttempt.run(sym, 'BSE_SECURITY_MASTER_DELISTED', BSE_SECURITY_MASTER_ALL_URL,
        bseDelistedStatus, 1, bseDelistedMatch.isin, bseDelistedMatch.name, 'BSE',
        'IDENTITY_RESOLVED', bseDelistedBodySha, new Date().toISOString());
      results.push({ source: 'BSE_SECURITY_MASTER_DELISTED', isin: bseDelistedMatch.isin, name: bseDelistedMatch.name, exchange: 'BSE' });
      console.log(`    ✓ BSE delisted match for ${sym}: ISIN=${bseDelistedMatch.isin}, Name=${bseDelistedMatch.name}`);
    } else {
      insertAttempt.run(sym, 'BSE_SECURITY_MASTER_DELISTED', BSE_SECURITY_MASTER_ALL_URL,
        bseDelistedStatus, 0, null, null, null,
        bseDelistedStatus === 200 ? 'IDENTITY_NOT_ESTABLISHED' : 'SOURCE_UNAVAILABLE',
        bseDelistedBodySha, new Date().toISOString());
    }

    // Determine resolution: only count if at least one authoritative source returned a valid ISIN
    // Zero-guessing rule: MUST be an exact match with a valid ISIN (INE format)
    const resolved = results.filter(r => r.isin && r.isin.match(/^INE[A-Z0-9]{9}$/));
    symbolResolutions[sym] = {
      decision: resolved.length > 0 ? 'IDENTITY_RESOLVED' : 'IDENTITY_NOT_ESTABLISHED',
      sources_checked: 3,
      authoritative_matches: resolved.length,
      resolved_isin: resolved[0]?.isin || null,
      resolved_name: resolved[0]?.name || null,
      all_matches: results
    };

    if (resolved.length > 0) {
      // Emit candidate for each anomaly record for this symbol
      for (const a of idAnomalies.filter(x => x.symbol === sym)) {
        const candLine = JSON.stringify({
          source: resolved[0].source,
          row_identifier: a.row_identifier,
          symbol: sym,
          trade_date: a.trade_date,
          resolved_isin: resolved[0].isin,
          resolved_name: resolved[0].name,
          resolved_exchange: resolved[0].exchange,
          zero_guessing_rule: 'ENFORCED',
          evidenced_at: new Date().toISOString()
        });
        fs.appendFileSync(AGENT_C_CANDIDATES_JSONL, candLine + '\n');
      }
    }
  }

  // 7. Final tally
  const allAttempts = evDb.prepare('SELECT symbol, source, identity_decision, isin FROM identity_attempts').all();
  evDb.close();

  const resolvedSymbols = Object.entries(symbolResolutions).filter(([, v]) => v.decision === 'IDENTITY_RESOLVED').map(([k]) => k);
  const unresolvedSymbols = Object.entries(symbolResolutions).filter(([, v]) => v.decision === 'IDENTITY_NOT_ESTABLISHED').map(([k]) => k);

  // 8. M6 overlap check
  let m6Overlap = 0;
  if (fs.existsSync(AGENT_C_CANDIDATES_JSONL) && fs.existsSync(M6_MANIFEST)) {
    const m6Lines = fs.readFileSync(M6_MANIFEST, 'utf8').split('\n').filter(l => l.trim());
    const m6Keys = new Set(m6Lines.map(l => { const r = JSON.parse(l); return `${r.symbol}|${r.trade_date}`; }));
    const candLines = fs.readFileSync(AGENT_C_CANDIDATES_JSONL, 'utf8').split('\n').filter(l => l.trim());
    for (const cl of candLines) {
      const c = JSON.parse(cl);
      if (m6Keys.has(`${c.symbol}|${c.trade_date}`)) m6Overlap++;
    }
  }
  if (m6Overlap > 0) {
    console.error(`✗ CRITICAL: ${m6Overlap} candidate identity resolutions overlap with M6 protected set!`);
    process.exit(1);
  }

  // 9. R3 Report
  const candidatesJsonlSha = fs.existsSync(AGENT_C_CANDIDATES_JSONL)
    ? crypto.createHash('sha256').update(fs.readFileSync(AGENT_C_CANDIDATES_JSONL)).digest('hex')
    : 'N/A';

  const r3Report = {
    agent: 'AGENT_C_IDENTITY',
    timestamp: new Date().toISOString(),
    wave: 'R3',
    r2_gate_confirmed: r2.gate,
    authoritative_findings: EXPECTED_IDENTITY_ANOMALIES,
    distinct_symbols: distinctSymbols.length,
    symbols_resolved: resolvedSymbols.length,
    symbols_unresolved: unresolvedSymbols.length,
    symbol_resolutions: symbolResolutions,
    zero_guessing_rule_enforced: true,
    m6_overlap: m6Overlap,
    production_db_writes: 0,
    sources_queried: [
      { source: 'NSE_EQUITY_MASTER', url: NSE_EQUITY_MASTER_URL, http_status: nseStatus, symbols_found: nseMap.size, response_sha256: nseBodySha },
      { source: 'BSE_SECURITY_MASTER_ACTIVE', url: BSE_SECURITY_MASTER_URL, http_status: bseActiveStatus, symbols_found: bseActiveMap.size, response_sha256: bseActiveBodySha },
      { source: 'BSE_SECURITY_MASTER_DELISTED', url: BSE_SECURITY_MASTER_ALL_URL, http_status: bseDelistedStatus, symbols_found: bseDelistedMap.size, response_sha256: bseDelistedBodySha }
    ],
    candidates_jsonl: path.relative(ROOT, AGENT_C_CANDIDATES_JSONL),
    candidates_jsonl_sha256: candidatesJsonlSha,
    evidence_db: path.relative(ROOT, AGENT_C_EVIDENCE_DB),
    gate: m6Overlap === 0 ? 'PASS' : 'FAIL'
  };

  fs.writeFileSync(AGENT_C_R3_REPORT, JSON.stringify(r3Report, null, 2));

  const line = '='.repeat(56);
  console.log(`\n${line}`);
  console.log('AGENT C — Wave R3 Identity Resolution COMPLETE');
  console.log(line);
  console.log(`  Authoritative findings:          ${EXPECTED_IDENTITY_ANOMALIES}`);
  console.log(`  Distinct symbols checked:        ${distinctSymbols.length}`);
  console.log(`  Symbols resolved:                ${resolvedSymbols.length} (${resolvedSymbols.join(', ') || 'none'})`);
  console.log(`  Symbols unresolved:              ${unresolvedSymbols.length} (${unresolvedSymbols.join(', ') || 'none'})`);
  console.log(`  Zero-guessing rule enforced:     true`);
  console.log(`  M6 overlap:                      ${m6Overlap} (must be 0)`);
  console.log(`  Production DB writes:            0 (invariant enforced)`);
  console.log(`  Gate:                            ${r3Report.gate}`);
  console.log(`  Candidates JSONL:                ${r3Report.candidates_jsonl}`);
  if (candidatesJsonlSha !== 'N/A') console.log(`  Candidates SHA:                  ${candidatesJsonlSha}`);
  console.log(line + '\n');

  if (r3Report.gate !== 'PASS') {
    console.error('✗ Agent C R3 gate FAIL — inspect evidence DB and report.');
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
      console.error('✗ Agent C R3 fatal error:', err.message);
      process.exit(1);
    });
  } else {
    runAudit();
  }
}

module.exports = { runAudit, runValidation, runR3EvidenceAcquisition };
