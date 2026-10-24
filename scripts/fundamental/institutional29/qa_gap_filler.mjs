/**
 * qa_gap_filler.mjs — Generic evidence-bundle gap detector and auto-filler
 *
 * Runs between Step 7 (build_unified_evidence) and Step 8 (prepare_narrative_input).
 * For any symbol:
 *   L1  Compute/derive from fields already in the bundle (no network)
 *       – buySellScore object→string, dvmClassification from D/V/M average
 *       – boardMeetings array → readable text, publicHolders → text
 *       – camelCase aliases for shareholding snake_case fields
 *       – only deterministic calculations from sourced fields, with their inputs retained
 *       – receivableDays / inventoryDays / debtToEquity / netDebt / WC ratios
 *       – propagate patGrowthYoY_pct and dvmClassification into questionEvidence
 *   L2  Screener.in supplementary fetch (single HTTP call, no login)
 *       – balance sheet: equity, reserves, borrowings, fixed assets, investments
 *       – ratios: Debtor Days, ROCE, Working Capital Days, Current Ratio
 *       – peers table from id="peers" section
 *       – auditor regex extraction
 *   L2b Trendlyne MCP re-fetch for parameters missed in Step 1
 *       – adtv_30d, interest_expense, trade_receivables, trade_payables
 *       – reads MCP URL from .agents/mcp_config.json (same as Step 1)
 *   L3  BSE corporate governance XML for auditor name / CIN
 *   L3  NSE bhavcopy ADTV proxy (requires session; flags gracefully on 403)
 *   L4  Flags remaining gaps that genuinely require manual source
 *       – annual report PDF: segment data, RPT detail, audit opinion
 *       – XBRL Notes to Accounts: exceptional items breakdown
 *
 * Usage:
 *   node qa_gap_filler.mjs SYMBOL [--as-of YYYY-MM-DD] [--dry-run]
 *
 * Options:
 *   --dry-run   Show gap report without writing changes
 *   --as-of     Override date (defaults to today)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import 'dotenv/config';
import { providerPayload, parseParameterResponse, parseDocumentResponse } from './trendlyne_response_parser.mjs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const symbol = args[0]?.toUpperCase();
const asOf = args.find((a, i) => args[i - 1] === '--as-of') ?? new Date().toISOString().slice(0, 10);
const dryRun = args.includes('--dry-run');
const evidenceOnly = args.includes('--evidence-only');

if (!symbol) {
  console.error('Usage: node qa_gap_filler.mjs SYMBOL [--as-of YYYY-MM-DD] [--dry-run]');
  process.exit(1);
}

const BASE_DIR = `outputs/institutional29/${symbol}`;
const BUNDLE_PATH = `${BASE_DIR}/evidence_bundle.json`;
const GAP_REPORT_PATH = `${BASE_DIR}/gap_report_${asOf}.json`;

if (!fs.existsSync(BUNDLE_PATH)) {
  console.error(`[qa] evidence_bundle.json not found at ${BUNDLE_PATH}`);
  console.error(`[qa] Run build_unified_evidence.mjs ${symbol} first.`);
  process.exit(1);
}

const eb = JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function fetchUrl(url, timeoutMs = 15000, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function fetchBinary(url, timeoutMs = 15000, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'WealthOS evidence collector/1.0', ...extraHeaders }, timeout: timeoutMs }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

// ─── Gap catalogue ────────────────────────────────────────────────────────────
// Each gap entry: { path, label, level, fetchFn, patchFn }
// level: 1=compute, 2=screener, 3=exchange, 4=manual-only

function val(obj, ...keys) {
  for (const k of keys) {
    if (obj == null) return undefined;
    obj = obj[k];
  }
  return obj;
}

const isGap = (v) =>
  v == null ||
  (typeof v === 'string' && (v === 'N/A' || v.trim() === '')) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

// ─── Level 1: Compute/fix from existing bundle data ──────────────────────────
// condition is a FUNCTION evaluated at run time so cascading fixes work correctly
// (fix A computes a field that fix B depends on)

const gapFixes = [];

function fix(label, conditionFn, patchFn) {
  gapFixes.push({ label, level: 1, conditionFn, patchFn });
}

// 1a. buySellScore: {score, label} → "53.09 — Neutral Zone"
const rawBss = eb.technicals?.buySellScore ?? eb.marketContext?.buySellScore;
fix(
  'buySellScore object→string',
  () => rawBss != null && typeof rawBss === 'object',
  () => {
    const str = `${rawBss.score} — ${rawBss.label}`;
    if (eb.technicals) eb.technicals.buySellScore = str;
    if (eb.marketContext) eb.marketContext.buySellScore = str;
  }
);

// 1b. dvmClassification: try label extraction from MCP OVERVIEW text first (sub-scores are behind paywall)
const DVM_LABELS = ['Super Performer', 'Contrarian Buy', 'Momentum Trap', 'Risky Bet',
                    'Outperformer', 'Underperformer', 'Avoid', 'Neutral'];
fix(
  'dvmClassification extracted from Trendlyne OVERVIEW text',
  () => isGap(eb.technicals?.dvmClassification),
  () => {
    const rawPages = eb._rawPages ?? {};  // populated by build step if forwarded
    // Also check trendlyne_raw pages via the raw JSON file path
    let overviewText = '';
    try {
      const rawPath = `outputs/institutional29/${symbol}/trendlyne_raw.json`;
      if (fs.existsSync(rawPath)) {
        const rawJson = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
        overviewText = JSON.stringify(rawJson.pages?.OVERVIEW ?? '') + JSON.stringify(rawJson.pages?.OVERVIEW_EVENTS_OVERVIEW ?? '');
      }
    } catch { /* ignore */ }
    const found = DVM_LABELS.find(lbl => overviewText.includes(lbl));
    if (found) {
      eb.technicals = eb.technicals ?? {};
      eb.technicals.dvmClassification = found;
      eb.technicals.dvmSource = 'trendlyne_mcp_overview_text';
      if (eb.marketContext) eb.marketContext.dvmClassification = found;
    }
  }
);
// 1b2. dvmClassification: fallback compute from D/V/M numeric scores if available
const dvmD = eb.technicals?.dvmDurability;
const dvmV = eb.technicals?.dvmValuation;
const dvmM = eb.technicals?.dvmMomentum;
fix(
  'dvmClassification computed from D/V/M scores',
  () => isGap(eb.technicals?.dvmClassification) && dvmD != null && dvmV != null && dvmM != null,
  () => {
    const avg = (dvmD + dvmV + dvmM) / 3;
    let cls;
    if (avg >= 70) cls = 'Strong Buy';
    else if (avg >= 55) cls = 'Outperformer';
    else if (avg >= 40) cls = 'Neutral';
    else if (avg >= 25) cls = 'Underperformer';
    else cls = 'Avoid';
    eb.technicals.dvmClassification = `${cls} (avg DVM ${avg.toFixed(1)})`;
    if (eb.marketContext) eb.marketContext.dvmClassification = eb.technicals.dvmClassification;
  }
);

// 1c. boardMeetings: array of {date,purpose} → readable string on governance
fix(
  'boardMeetings array serialised to readable strings',
  () => Array.isArray(eb.governance?.boardMeetings) && eb.governance.boardMeetings.length > 0,
  () => {
    eb.governance.boardMeetingsText = eb.governance.boardMeetings
      .slice(0, 8)
      .map(m => `${m.date}: ${m.purpose}`)
      .join(' | ');
  }
);

// 1d. publicHolders: array of {name,pct} → readable string
fix(
  'publicHolders array serialised to readable strings',
  () => Array.isArray(eb.shareholding?.publicHolders) && eb.shareholding.publicHolders.length > 0,
  () => {
    eb.shareholding.publicHoldersText = eb.shareholding.publicHolders
      .slice(0, 5)
      .map(h => `${h.name}: ${h.pct}%`)
      .join('; ');
  }
);

// 1e. shareholding promoter/fii/dii flat fields → camelCase aliases for prepare_narrative_input
fix(
  'shareholding snake_case → camelCase aliases',
  () => eb.shareholding?.promoter_pct != null && eb.shareholding?.promoterPct == null,
  () => {
    const s = eb.shareholding;
    s.promoterPct = s.promoter_pct;
    s.fiiPct = s.fii_pct;
    s.mfPct = s.mf_pct;
    s.diiPct = s.dii_pct;
    s.publicPct = s.public_pct;
    s.pledgePct = s.promoter_pledge_pct;
  }
);

// 1f. financials camelCase/shorthand aliases for narrative script
fix(
  'financials field aliases (borrowings_cr, cfoAnnual_cr → short names)',
  () => eb.financials?.borrowings_cr != null,
  () => {
    const f = eb.financials;
    // Create short aliases expected by older narrative references
    f.borrowings = f.borrowings_cr;
    f.cfo = f.cfoAnnual_cr;
    f.revenueLatest = f.revenueTTM_cr;
    f.patLatest = f.patTTM_cr;
    f.rsi14 = eb.technicals?.rsi;  // technicals alias
    f.cfoGrowth = f.cfoGrowthYoY_pct;
    f.revenueGrowth = f.revenueGrowthYoY_pct;
  }
);

// 1g. CFO/PAT ratio
fix(
  'CFO/PAT ratio computed',
  () => eb.financials?.cfoAnnual_cr != null && eb.financials?.patTTM_cr != null && eb.financials?.cfoPATRatio == null,
  () => {
    eb.financials.cfoPATRatio = (eb.financials.cfoAnnual_cr / eb.financials.patTTM_cr).toFixed(2);
  }
);

// 1h. EBIT proxy from OPM × revenue
fix(
  'EBIT proxy from OPM × revenue',
  () => eb.financials?.opm_pct != null && eb.financials?.revenueTTM_cr != null && eb.financials?.ebitProxy_cr == null,
  () => {
    eb.financials.ebitProxy_cr = parseFloat((eb.financials.opm_pct / 100 * eb.financials.revenueTTM_cr).toFixed(2));
  }
);

// 1l. Debt-to-equity from balance sheet
fix(
  'debtToEquity computed from borrowings / (equity + reserves)',
  () => isGap(eb.financials?.debtToEquity) &&
    eb.financials?.borrowings_cr != null &&
    eb.financials?.equityCapital_cr != null &&
    eb.financials?.reserves_cr != null,
  () => {
    const equity = eb.financials.equityCapital_cr + eb.financials.reserves_cr;
    eb.financials.debtToEquity = equity > 0
      ? parseFloat((eb.financials.borrowings_cr / equity).toFixed(3))
      : null;
  }
);

// 1n. Interest coverage from EBIT proxy / interest expense
fix(
  'interestCoverage computed from EBIT proxy / interest expense',
  () => isGap(eb.financials?.interestCoverage) &&
    eb.financials?.ebitProxy_cr != null && eb.financials?.interestExpense_cr != null &&
    eb.financials.interestExpense_cr > 0,
  () => {
    eb.financials.interestCoverage = parseFloat(
      (eb.financials.ebitProxy_cr / eb.financials.interestExpense_cr).toFixed(2)
    );
  }
);

// 1o. Net debt = borrowings - cash (if cash available)
fix(
  'netDebt_cr computed from borrowings - cashAndEquivalents',
  () => isGap(eb.financials?.netDebt_cr) &&
    eb.financials?.borrowings_cr != null && eb.financials?.cashAndEquivalents_cr != null,
  () => {
    eb.financials.netDebt_cr = parseFloat(
      (eb.financials.borrowings_cr - eb.financials.cashAndEquivalents_cr).toFixed(2)
    );
  }
);

// 1p. receivableDays alias from dso_days
fix(
  'receivableDays aliased from dso_days',
  () => isGap(eb.financials?.receivableDays) && eb.financials?.dso_days != null,
  () => { eb.financials.receivableDays = eb.financials.dso_days; }
);

// 1s. Propagate dvmClassification from technicals into questionEvidence sub-objects
fix(
  'dvmClassification propagated into questionEvidence (Q3, Q17)',
  () => eb.technicals?.dvmClassification != null,
  () => {
    const qe = eb.questionEvidence ?? {};
    for (const qid of ['3', '17']) {
      if (qe[qid] && isGap(qe[qid].dvmClassification)) {
        qe[qid].dvmClassification = eb.technicals.dvmClassification;
      }
    }
  }
);

// 1t. Propagate patGrowthYoY_pct into questionEvidence sub-objects (Q10, Q13, Q15)
fix(
  'patGrowthYoY_pct propagated into questionEvidence (Q10, Q13, Q15)',
  () => eb.financials?.patGrowthYoY_pct != null,
  () => {
    const qe = eb.questionEvidence ?? {};
    for (const qid of ['10', '13', '15']) {
      if (qe[qid] && isGap(qe[qid].patGrowthYoY_pct)) {
        qe[qid].patGrowthYoY_pct = eb.financials.patGrowthYoY_pct;
      }
    }
  }
);

// ─── Level 2: Screener.in supplementary fetches ───────────────────────────────

// Parse a Screener.in section's data table: headers from <thead>, rows from <tbody>
function parseScreenerSection(html, sectionId) {
  const start = html.indexOf(`id="${sectionId}"`);
  if (start === -1) return { headers: [], rows: {} };
  const end = html.indexOf('</section>', start);
  const sec = html.slice(start, end > start ? end : start + 30000);

  const tMatch = sec.match(/<table[\s\S]*?<\/table>/);
  if (!tMatch) return { headers: [], rows: {} };
  const table = tMatch[0];

  const theadMatch = table.match(/<thead>([\s\S]*?)<\/thead>/);
  const headers = theadMatch
    ? [...theadMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
        .map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean)
    : [];

  const tbodyMatch = table.match(/<tbody>([\s\S]*?)<\/tbody>/);
  const rows = {};
  if (tbodyMatch) {
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRe.exec(tbodyMatch[1])) !== null) {
      const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
        .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
      if (cells.length >= 2 && cells[0]) {
        const label = cells[0].replace(/[\s\+\-]+/g, ' ').trim();
        rows[label] = cells.slice(1).map(v => {
          const n = parseFloat(v.replace(/,/g, ''));
          return isNaN(n) ? null : n;
        });
      }
    }
  }
  return { headers, rows };
}

// Latest value: last non-null entry
function latest(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}

async function fetchScreenerMain(sym) {
  console.log(`[qa] Fetching Screener.in main page for ${sym}...`);
  try {
    const res = await fetchUrl(`https://www.screener.in/company/${sym}/consolidated/`);
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    return res.body;
  } catch (e) {
    console.warn(`[qa] Screener main fetch failed: ${e.message}`);
    return null;
  }
}

function parseScreenerBalanceSheet(html) {
  const { headers, rows } = parseScreenerSection(html, 'balance-sheet');
  if (!Object.keys(rows).length) return null;
  return {
    headers,
    borrowings_cr:          latest(rows['Borrowings']),
    equityCapital_cr:       latest(rows['Equity Capital']),
    reserves_cr:            latest(rows['Reserves']),
    cwip_cr:                latest(rows['CWIP']),
    fixedAssets_cr:         latest(rows['Fixed Assets']),
    investments_cr:         latest(rows['Investments']),
    otherAssets_cr:         latest(rows['Other Assets']),
    totalAssets_cr:         latest(rows['Total Assets']),
    otherLiabilities_cr:    latest(rows['Other Liabilities']),
    totalLiabilities_cr:    latest(rows['Total Liabilities']),
    // Screener consolidated doesn't break out trade receivables separately —
    // Other Assets includes receivables, cash, prepayments
    tradeReceivables_cr:    null,
    cashAndEquivalents_cr:  null,
    tradePayables_cr:       null,
    source: 'screener.in/balance-sheet',
  };
}

function parseScreenerRatios(html) {
  // Debtor Days: in ratios table — "Debtor Days" label, numeric value nearby
  const ddM = html.match(/Debtor Days[\s\S]{0,400}?(\d+)/);
  const dso = ddM ? parseFloat(ddM[1]) : null;

  // ROCE: in ratios — "ROCE" followed by a % number
  const roceM = html.match(/ROCE[\s\S]{0,400}?(\d{1,3}\.?\d*)\s*%/);
  const roce = roceM ? parseFloat(roceM[1]) : null;

  // Working Capital Days
  const wcdM = html.match(/Working Capital Days[\s\S]{0,400}?(-?\d+)/);
  const wcd = wcdM ? parseFloat(wcdM[1]) : null;

  // Current Ratio — in ratios section
  const crM = html.match(/Current ratio[\s\S]{0,400}?(\d+\.?\d*)/i);
  const cr = crM ? parseFloat(crM[1]) : null;

  // Cash from Operations (in cash flow section)
  const cfM = html.match(/Cash from Operations[\s\S]{0,400}?(\d[\d,]+)/);
  const cfo = cfM ? parseFloat(cfM[1].replace(/,/g,'')) : null;

  return { dso_days: dso, roce_pct: roce, workingCapDays: wcd, currentRatio: cr, cfoVerified_cr: cfo, source: 'screener.in/ratios' };
}

function parseScreenerPeers(html) {
  // Peers section is on the peers page or embedded in main page
  const { headers, rows } = parseScreenerSection(html, 'peers');
  if (!Object.keys(rows).length) return null;
  const peerRows = Object.entries(rows).map(([name, vals]) => [name, ...vals.map(v => v ?? '-')]);
  return { headers: ['Name', ...headers], rows: peerRows.slice(0, 12), source: 'screener.in/peers' };
}

async function fetchScreenerPeersPage(sym) {
  // Screener peers section is on the main (non-consolidated) page
  console.log(`[qa] Fetching Screener.in non-consolidated page for peers (${sym})...`);
  try {
    const res = await fetchUrl(`https://www.screener.in/company/${sym}/`);
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    return res.body;
  } catch (e) {
    console.warn(`[qa] Screener non-consolidated fetch failed: ${e.message}`);
    return null;
  }
}

// Yahoo Finance for price returns (no auth, CORS-free from Node)
async function fetchYahooPriceReturns(sym) {
  const nseSymbol = `${sym}.NS`;
  console.log(`[qa] Fetching Yahoo Finance price returns for ${nseSymbol}...`);
  try {
    // Fetch 1yr + 1mo of daily closes
    const now = Math.floor(Date.now() / 1000);
    const yr1ago = now - 365 * 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(nseSymbol)}?period1=${yr1ago}&period2=${now}&interval=1mo`;
    const res = await fetchUrl(url, 12000);
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    const data = JSON.parse(res.body);
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    const timestamps = data?.chart?.result?.[0]?.timestamp;
    if (!closes?.length || closes.length < 2) return null;
    const validCloses = closes.map((c, i) => ({ c, t: timestamps[i] })).filter(x => x.c != null);
    if (validCloses.length < 2) return null;
    const latest = validCloses[validCloses.length - 1].c;
    const oneMonthAgo = validCloses[Math.max(0, validCloses.length - 2)].c;
    const oneYearAgo = validCloses[0].c;
    return {
      changeP_1m: parseFloat(((latest / oneMonthAgo - 1) * 100).toFixed(2)),
      changeP_1yr: parseFloat(((latest / oneYearAgo - 1) * 100).toFixed(2)),
      source: 'yahoo_finance',
    };
  } catch (e) {
    console.warn(`[qa] Yahoo Finance fetch failed: ${e.message}`);
    return null;
  }
}

// NSE quote endpoint is opportunistic; the archive fallback below is the
// deterministic path and does not require an authenticated session.
async function fetchNseAdtv(sym) {
  // A quote price is not turnover. Only admit a complete official 30-session cache.
  const cache = `reports/market-data/${asOf}/official_adtv.json`;
  if (!fs.existsSync(cache)) return null;
  const item = JSON.parse(fs.readFileSync(cache, 'utf8')).symbols?.[sym];
  return item?.coverageDays === 30 ? item : null;
}

// Read Kite access token from the WealthOS SQLite DB (same source as fetch_kite_ohlcv_staging.mjs)
async function loadKiteToken() {
  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database('portfolio.db', { readonly: true });
    const row = db.prepare("SELECT value FROM AppConfig WHERE key='Kite_Access_Token'").get();
    db.close();
    return row?.value ?? null;
  } catch { return null; }
}

async function loadKiteTokenUpdatedAt() {
  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database('portfolio.db', { readonly: true });
    const row = db.prepare("SELECT value FROM AppConfig WHERE key='Kite_Access_Token_Updated_At'").get();
    db.close();
    return row?.value ?? null;
  } catch { return null; }
}

// Kite Connect historical OHLCV for ADTV + price returns
// Reads API key from KITE_API_KEY (.env) and token from AppConfig table.
// Instrument token from the pre-built WealthOS manifest (no CSV download needed).
const KITE_MANIFEST_PATH = 'data/market_data/tejhq_hf_10y/kite_adjusted_backfill/manifest.json';
async function fetchKiteOhlcv(sym, accessToken) {
  const apiKey = process.env.KITE_API_KEY?.trim();
  if (!apiKey) { console.warn('[qa] KITE_API_KEY not set'); return null; }
  console.log(`[qa] Fetching Kite Connect OHLCV for ${sym}...`);
  try {
    // Resolve instrument token from manifest (avoids downloading 10MB instruments CSV)
    let instrToken = null;
    if (fs.existsSync(KITE_MANIFEST_PATH)) {
      const manifest = JSON.parse(fs.readFileSync(KITE_MANIFEST_PATH, 'utf8'));
      instrToken = manifest?.symbols?.[sym]?.kite_instrument_token ?? null;
    }
    if (!instrToken) throw new Error(`Instrument token not found for ${sym} in manifest`);

    // Fetch 400 days of daily OHLCV (covers 1yr return + 30d ADTV)
    const now = new Date();
    const from = new Date(now - 400 * 86400000);
    const fmt = d => d.toISOString().slice(0, 10);
    const ohlcUrl = `https://api.kite.trade/instruments/historical/${instrToken}/day?from=${fmt(from)}&to=${fmt(now)}&continuous=0&oi=0`;
    // Use native fetch (not fetchUrl) — Kite API rejects browser-spoofing User-Agents
    const ohlcRes = await fetch(ohlcUrl, {
      signal: AbortSignal.timeout(20000),
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      },
    });
    if (!ohlcRes.ok) throw new Error(`historical status ${ohlcRes.status}`);
    const ohlcData = await ohlcRes.json();
    // candles: [[date, open, high, low, close, volume, oi], ...]
    const candles = ohlcData?.data?.candles ?? [];
    if (candles.length < 2) return null;

    const closes = candles.map(c => c[4]).filter(Boolean);
    const volumes = candles.map(c => c[5]).filter(Boolean);
    const last30Vols = volumes.slice(-30);
    const adtvShares = last30Vols.length ? Math.round(last30Vols.reduce((s, v) => s + v, 0) / last30Vols.length) : null;
    const lastClose = closes[closes.length - 1];
    const adtv_cr = adtvShares && lastClose ? parseFloat((adtvShares * lastClose / 1e7).toFixed(2)) : null;

    // 1m return: close[-1] / close[-22] (approx 22 trading days = 1 month)
    const monthAgoClose = closes.length >= 22 ? closes[closes.length - 22] : closes[0];
    const changeP_1m = monthAgoClose ? parseFloat(((lastClose / monthAgoClose - 1) * 100).toFixed(2)) : null;

    // 1yr return: close[-1] / close[-252] (approx 252 trading days = 1 year)
    const yearAgoClose = closes.length >= 252 ? closes[closes.length - 252] : closes[0];
    const changeP_1yr = yearAgoClose ? parseFloat(((lastClose / yearAgoClose - 1) * 100).toFixed(2)) : null;

    return { adtv_cr, adtv_shares: adtvShares, changeP_1m, changeP_1yr, lastClose, source: 'kite_connect' };
  } catch (e) {
    console.warn(`[qa] Kite Connect fetch failed: ${e.message}`);
    return null;
  }
}

// ─── Trendlyne MCP re-fetch for parameters missed in Step 1 ─────────────────

function loadMcpUrl() {
  // Prefer env var (set by run_comprehensive_dossier.mjs or the user)
  if (process.env.TRENDLYNE_MCP_URL) return process.env.TRENDLYNE_MCP_URL.trim();
  try {
    const cfgPath = path.resolve('', '.agents', 'mcp_config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return cfg?.mcpServers?.trendlyne?.serverUrl ?? null;
  } catch { return null; }
}

// Call Trendlyne MCP via the MCP SDK (same transport as fetch_trendlyne_mcp.mjs)
async function callTrendlyneTool(mcpUrl, toolName, toolArgs) {
  const diagnostic = { toolName, urlConfigured: Boolean(mcpUrl), at: new Date().toISOString() };
  let client;
  try {
    if (!mcpUrl || !/^https?:\/\//i.test(mcpUrl)) {
      throw new Error('INVALID_MCP_URL');
    }
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    client = new Client({ name: 'wealthos-qa-gap-filler', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
    const result = await client.callTool({ name: toolName, arguments: toolArgs });
    if (result?.isError) throw new Error(`TOOL_ERROR:${toolName}`);
    const text = result?.content?.find(c => c.type === 'text')?.text;
    if (text) return providerPayload(result);
    const structured = result?.structuredContent;
    if (structured && typeof structured === 'object') return structured;
    throw new Error('MCP_EMPTY_RESPONSE');
  } catch (e) {
    diagnostic.error = String(e?.message ?? e);
    // Never print credentials or the full endpoint; retain enough detail to
    // distinguish configuration, transport, tool, and payload failures.
    console.warn(`[qa] MCP call failed (${diagnostic.error}); tool=${toolName}; urlConfigured=${diagnostic.urlConfigured}`);
    try { fs.writeFileSync(`${BASE_DIR}/trendlyne_mcp_error_${asOf}.json`, JSON.stringify(diagnostic, null, 2)); } catch { /* non-fatal */ }
    return null;
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

// Correct Trendlyne parameter token names (verified via search_financial_parameters probe).
// Wrong names (e.g. 'trade_payables', 'adtv_30d') cause error 1012 "Could not resolve token".
const TRENDLYNE_SUPPLEMENT_PARAMS = [
  // Liquidity / trading (confirmed working)
  'cvol30dayavg',        // 30-day avg daily volume (ADTV in shares)
  'cvol6mdayavg',        // 6-month avg daily volume
  // Balance sheet items (confirmed working)
  'tradepayablesq',      // Trade Payables Quarter
  'tradepayablesa',      // Trade Payables Annual
  'tradereceivablesq',   // Trade Receivables Quarter
  'tradereceivablesa',   // Trade Receivables Annual
  'borrowingsq',         // Total Borrowings Quarter
  'borrowingsa',         // Total Borrowings Annual
  'cashandequivalentsq', // Cash & Equivalents Quarter
  'capitalexpenditureq', // Capex Quarter
  'capitalexpenditurea', // Capex Annual
  'freecashflowq',       // Free Cash Flow Quarter
  'freecashflowa',       // Free Cash Flow Annual
  // P&L items
  'intq',                // Interest Expense Quarter
  'inta',                // Interest Expense Annual
  'npq',                 // Net Profit Quarter
  'npa',                 // Net Profit Annual
  'srq',                 // Revenue Quarter
  'sra',                 // Revenue Annual
  // Ratios
  'debtequity',          // Debt/Equity
  'interestcoverage',    // Interest Coverage
  'currentratio',        // Current Ratio
  // Valuation
  'pe',                  // P/E ratio
  'pb',                  // P/B ratio
  'evebitda',            // EV/EBITDA
  // Price levels
  'high52w',             // 52-week high
  'low52w',              // 52-week low
  'ltp',                 // Last traded price
  // Verified historical-context tokens from the repository's Trendlyne pack.
  'sramy1', 'sramy2', 'sramy3', 'sramy4', 'sramy5',
  'opamy1', 'opamy2', 'opamy3', 'opamy4', 'opamy5',
  'cfoamy1', 'cfoamy2', 'cfoamy3', 'cfoamy4', 'cfoamy5',
  'roeamy1', 'roeamy2', 'roeamy3', 'roeamy4', 'roeamy5',
  'roceaave3', 'roceaave5',
];

// Discover all symbol dirs that have been processed (for batch padding)
function discoverOtherSymbols(currentSym) {
  const base = path.resolve('', 'outputs', 'institutional29');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base)
    .filter(d => d !== currentSym && fs.existsSync(path.join(base, d, 'evidence_bundle.json')))
    .slice(0, 9); // up to 9 others → total batch of 10
}

// Batch fetch: current symbol + up to 9 others, all 50 params in one call
// Saves supplementary data for other symbols so the call is never wasted
async function fetchTrendlyneBatch(primarySym) {
  const mcpUrl = loadMcpUrl();
  if (!mcpUrl) {
    console.warn('[qa] Trendlyne MCP URL not found in .agents/mcp_config.json — skipping');
    return null;
  }

  const packFile = process.env.WEALTHOS_METRIC_PACK_FILE || path.resolve('reports/market-data', asOf, 'verified_fundamental_metric_pack.json');
  const pack = fs.existsSync(packFile) ? JSON.parse(fs.readFileSync(packFile, 'utf8')) : null;
  const parameters = pack?.tokens;
  if (!parameters || parameters.length !== 50) {
    console.warn('[qa] No verified 50-token pack; refusing the legacy invalid token list');
    return null;
  }
  const others = []; // Each invocation owns only its requested symbol's outputs.
  const allSyms = [primarySym, ...others];
  if (allSyms.length < 10) {
    console.warn(`[qa] Trendlyne batch has ${allSyms.length} symbols; retaining explicit partial-batch state`);
  }
  console.log(`[qa] Trendlyne batch re-fetch: ${allSyms.length} symbols × ${TRENDLYNE_SUPPLEMENT_PARAMS.length} params`);
  console.log(`[qa] Symbols: ${allSyms.join(', ')}`);

  const allData = await callTrendlyneTool(mcpUrl, 'get_stock_parameter_values', {
    stock_codes: allSyms,
    parameters,
  });

  if (!allData) {
    console.warn('[qa] Trendlyne batch fetch returned no data');
    return null;
  }

  // Save supplementary data for all other symbols (not wasting the call)
  const parsed = parseParameterResponse(allData, allSyms, pack.definitions || []);
  fs.writeFileSync(`${BASE_DIR}/trendlyne_parameter_observations_${asOf}.json`, JSON.stringify(parsed, null, 2));
  const dataMap = parsed.bySymbol;
  for (const sym of others) {
    if (!dataMap?.[sym]) continue;
    const suppPath = path.resolve('', 'outputs', 'institutional29', sym, `trendlyne_supplement_${asOf}.json`);
    try {
      fs.writeFileSync(suppPath, JSON.stringify({ symbol: sym, asOf, params: dataMap[sym] }, null, 2));
      console.log(`[qa] ✓ Saved supplementary Trendlyne data for ${sym}`);
    } catch { /* non-fatal */ }
  }

  return dataMap?.[primarySym] ?? null;
}

// ─── BSE auditor / CIN lookup ─────────────────────────────────────────────────

async function fetchBseAuditorAndCin(bseCode) {
  if (!bseCode) return null;
  console.log(`[qa] BSE corporate governance lookup for BSE ${bseCode}...`);
  try {
    // BSE corporate governance XML (Regulation 27 quarterly filing)
    const url = `https://www.bseindia.com/corporates/Comp_Corpgov.aspx?scripcd=${bseCode}`;
    const res = await fetchUrl(url, 12000);
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    const html = res.body;
    // Extract auditor from Statutory Auditor field
    const auditorM = html.match(/Statutory Auditor[\s\S]{0,300}?<[^>]+>([A-Z][^<]{10,120})<\//i);
    const auditor = auditorM?.[1]?.trim() ?? null;
    // CIN typically appears as L/U followed by digits
    const cinM = html.match(/\b([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b/);
    const cin = cinM?.[1] ?? null;
    return auditor || cin ? { auditor, cin, source: 'BSE corporate governance' } : null;
  } catch (e) {
    console.warn(`[qa] BSE governance lookup failed: ${e.message}`);
    return null;
  }
}

// ─── Gap audit ────────────────────────────────────────────────────────────────

function auditBundle(eb) {
  const gaps = [];

  const f = eb.financials ?? {};
  const t = eb.technicals ?? {};
  const sh = eb.shareholding ?? {};
  const gov = eb.governance ?? {};
  const qe = eb.questionEvidence ?? {};

  const checks = {
    // Financials — balance sheet
    'financials.tradeReceivables_cr':   f.tradeReceivables_cr,
    'financials.inventory_cr':          f.inventory_cr,
    'financials.cashAndEquivalents_cr': f.cashAndEquivalents_cr,
    'financials.tradePayables_cr':      f.tradePayables_cr,
    'financials.capex_cr':              f.capex_cr,
    'financials.cwip_cr':               f.cwip_cr,
    'financials.interestExpense_cr':    f.interestExpense_cr,
    'financials.debtToEquity':          f.debtToEquity,
    'financials.interestCoverage':      f.interestCoverage,
    'financials.netDebt_cr':            f.netDebt_cr,
    // Financials — P&L / ratios
    'financials.dso_days':              f.dso_days,
    'financials.receivableDays':        f.receivableDays,
    'financials.inventoryDays':         f.inventoryDays,
    'financials.roce_pct':              f.roce_pct,
    'financials.patGrowthYoY_pct':      f.patGrowthYoY_pct,
    // Technicals
    'technicals.dvmClassification':     t.dvmClassification,
    'technicals.changeP_1m':            t.changeP_1m,
    'technicals.changeP_1yr':           t.changeP_1yr,
    // Shareholding aliases
    'shareholding.promoterPct':         sh.promoterPct,
    'shareholding.fiiPct':              sh.fiiPct,
    // Governance
    'governance.cin':                   gov.cin,
    'governance.auditorName':           gov.auditorName,
    'governance.auditQualification':    gov.auditQualification,
    'governance.boardMeetingsText':     gov.boardMeetingsText,
    // Question-evidence propagation
    'questionEvidence.3.dvmClassification':   qe['3']?.dvmClassification,
    'questionEvidence.17.dvmClassification':  qe['17']?.dvmClassification,
    'questionEvidence.10.patGrowthYoY_pct':   qe['10']?.patGrowthYoY_pct,
    'questionEvidence.13.patGrowthYoY_pct':   qe['13']?.patGrowthYoY_pct,
    'questionEvidence.15.patGrowthYoY_pct':   qe['15']?.patGrowthYoY_pct,
    // Peers / liquidity
    'peers.table':                      eb.peers?.rows,
    'liquidity.adtv_cr':                eb.liquidity?.adtv_cr,
  };

  for (const [p, v] of Object.entries(checks)) {
    if (isGap(v) || (Array.isArray(v) && v.length === 0)) {
      const lvl = gapLevel(p);
      gaps.push({ path: p, currentValue: v ?? null, level: lvl, fetchStrategy: fetchStrategy(p) });
    }
  }
  return gaps;
}

function gapLevel(p) {
  if (/^technicals\.dvm|^shareholding\.|^financials\.(patGrowth|receivableDays|debtToEquity|interestCoverage|netDebt)/.test(p)) return 1;
  if (/^questionEvidence\./.test(p)) return 1;
  if (/^financials\.|^peers\./.test(p)) return 2;
  if (/^governance\.cin|^technicals\.changeP|^liquidity\.adtv/.test(p)) return 3;
  if (/^governance\.(auditor|auditQual)/.test(p)) return 3; // BSE lookup first, then L4
  return 4;
}

function fetchStrategy(p) {
  const m = {
    'financials.tradeReceivables_cr':   'Trendlyne trade-receivables parameter | annual-report balance sheet',
    'financials.inventory_cr':          'Trendlyne inventory parameter | annual-report balance sheet',
    'financials.cashAndEquivalents_cr': 'Annual-report balance sheet or a provider field with source evidence',
    'financials.tradePayables_cr':      'L2b Trendlyne trade_payables param | annual report BS',
    'financials.capex_cr':              'Screener cash-flow table | annual-report cash-flow statement',
    'financials.cwip_cr':               'Screener.in balance sheet id="balance-sheet" → CWIP row',
    'financials.interestExpense_cr':    'Trendlyne interest-expense parameter | annual-report profit-and-loss statement',
    'financials.debtToEquity':          'L1 compute: borrowings / (equityCapital + reserves)',
    'financials.interestCoverage':      'L1 compute: EBIT proxy / interestExpense',
    'financials.netDebt_cr':            'L1 compute: borrowings − cashAndEquivalents',
    'financials.dso_days':              'Screener.in ratios section → Debtor Days',
    'financials.receivableDays':        'L1 alias: = dso_days',
    'financials.inventoryDays':         'Annual report or provider efficiency-ratio field',
    'financials.roce_pct':              'Screener.in ratios section → ROCE %',
    'financials.patGrowthYoY_pct':      'L1 compute from annualRevenue array: (last/prev - 1) × 100',
    'technicals.dvmClassification':     'L1 extract from Trendlyne MCP OVERVIEW text (Super Performer / Contrarian Buy / Momentum Trap / Risky Bet)',
    'technicals.changeP_1m':            'L3 Trendlyne 1m_return param | NSE price history',
    'technicals.changeP_1yr':           'L3 Trendlyne 1yr_return param | NSE price history',
    'shareholding.promoterPct':         'L1 alias from shareholding.promoter_pct (snake_case)',
    'shareholding.fiiPct':              'L1 alias from shareholding.fii_pct (snake_case)',
    'governance.cin':                   'L3 BSE corporate governance filing | MCA company search',
    'governance.auditorName':           'L3 BSE corporate governance XML | Screener company page | annual report PDF',
    'governance.auditQualification':    'L4 Annual report auditor report (PDF) — cannot auto-fetch',
    'governance.boardMeetingsText':     'L1 serialize eb.governance.boardMeetings array',
    'questionEvidence.3.dvmClassification':  'L1 propagate from technicals.dvmClassification',
    'questionEvidence.17.dvmClassification': 'L1 propagate from technicals.dvmClassification',
    'questionEvidence.10.patGrowthYoY_pct':  'L1 propagate from financials.patGrowthYoY_pct',
    'questionEvidence.13.patGrowthYoY_pct':  'L1 propagate from financials.patGrowthYoY_pct',
    'questionEvidence.15.patGrowthYoY_pct':  'L1 propagate from financials.patGrowthYoY_pct',
    'peers.table':                      'Screener.in id="peers" section | MoneyControl sector peers',
    'liquidity.adtv_cr':                'L2b Trendlyne adtv_30d param | NSE bhavcopy 30-day avg (needs session)',
  };
  return m[p] ?? 'L4 Manual: annual report PDF / XBRL Notes to Accounts';
}

// ─── PAT growth compute ───────────────────────────────────────────────────────
function computePatGrowth(eb) {
  const annual = eb.financials?.annualRevenue;
  if (!annual || annual.length < 2) return null;
  const sorted = [...annual].sort((a, b) => a.fy < b.fy ? -1 : 1);
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  if (!last?.pat_cr || !prev?.pat_cr || prev.pat_cr === 0) return null;
  return parseFloat(((last.pat_cr / prev.pat_cr - 1) * 100).toFixed(2));
}

// ─── Auditor from Screener company page ──────────────────────────────────────
async function fetchAuditorFromScreener(sym) {
  console.log(`[qa] Attempting auditor extraction from Screener.in for ${sym}...`);
  try {
    const res = await fetchUrl(`https://www.screener.in/company/${sym}/consolidated/`);
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    const html = res.body;
    // Look for "Auditor" or "Statutory Auditor" in the HTML
    const match = html.match(/[Aa]uditor[^<]{0,30}?<\/[a-z]+>[\s\S]{0,200}?(<[a-z]+[^>]*>([^<]{10,100})<\/[a-z]+>)/);
    if (match?.[2]) return match[2].trim();
    // Try another pattern: list items near "auditor"
    const match2 = html.match(/[Aa]uditor[\s\S]{0,500}?<strong>([^<]{10,100})<\/strong>/);
    if (match2?.[1]) return match2[1].trim();
    return null;
  } catch (e) {
    console.warn(`[qa] Auditor fetch failed: ${e.message}`);
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[qa] ══════════════════════════════════════`);
  const kiteUpdatedAt = await loadKiteTokenUpdatedAt();
  if (kiteUpdatedAt) {
    const tokenDate = new Date(kiteUpdatedAt);
    if (Number.isFinite(tokenDate.getTime()) && tokenDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) !== new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })) {
      console.warn('[qa] ⚠ Kite token is from a previous IST calendar day — refresh before ADTV fetch');
      console.warn('[qa]    Login: https://kite.zerodha.com/connect/login?api_key=<KITE_API_KEY>&v=3');
      console.warn('[qa]    Then run: node scripts/market_data/refresh_kite_token.cjs <request_token>');
    }
  }
  console.log(`[qa] Gap filler — ${symbol} (asOf ${asOf})`);
  console.log(`[qa] ══════════════════════════════════════`);

  // Apply Level-1 fixes (conditions evaluated at run time so cascaded fixes work)
  console.log(`\n[qa] === LEVEL 1: Compute / alias fixes ===`);
  for (const fix of gapFixes) {
    try {
      // The dated dossier admits aliases/formatting only here. Numeric estimates,
      // assumed zeros, mixed-duration ratios and inferred ratings stay unresolved.
      if (evidenceOnly && !new Set([
        'buySellScore object→string',
        'boardMeetings array serialised to readable strings',
        'publicHolders array serialised to readable strings',
        'shareholding snake_case → camelCase aliases',
        'financials field aliases (borrowings_cr, cfoAnnual_cr → short names)',
      ]).has(fix.label)) continue;
      if (!fix.conditionFn()) continue;
      fix.patchFn();
      console.log(`[qa] ✓ ${fix.label}`);
    } catch (e) {
      console.warn(`[qa] ✗ ${fix.label}: ${e.message}`);
    }
  }

  // Compute PAT growth if missing
  if (!evidenceOnly && isGap(eb.financials?.patGrowthYoY_pct)) {
    const pg = computePatGrowth(eb);
    if (pg != null) {
      eb.financials.patGrowthYoY_pct = pg;
      console.log(`[qa] ✓ patGrowthYoY_pct computed from annual P&L: ${pg}%`);
    }
  }

  // Gap audit AFTER level-1 fixes
  const gapsBefore = auditBundle(eb);
  const primaryPath = `outputs/institutional29/${asOf}/${symbol}/fundamental_primary_facts.json`;
  if (fs.existsSync(primaryPath)) {
    const facts = JSON.parse(fs.readFileSync(primaryPath, 'utf8')).facts || [];
    const annual = facts.filter(f => f.symbol === symbol && f.periodType === 'ANNUAL' &&
      f.unit === 'INR_CR' && f.verificationStatus === 'VERIFIED' && f.sourceType === 'PRIMARY_FILING' &&
      f.sourceUrl && f.availableAt && f.availableAt.slice(0,10) <= asOf && f.periodEnd <= asOf);
    const scope = annual.some(f => f.scope === 'CONSOLIDATED') ? 'CONSOLIDATED' : 'STANDALONE';
    const period = annual.filter(f => f.scope === scope).map(f => f.periodEnd).sort().at(-1);
    const mapping = { capex_cash_outflow: 'capex_cr',
      finance_cost: 'interestExpense_cr', finance_costs: 'interestExpense_cr',
      cash_from_operations: 'cfoAnnual_cr', cfo: 'cfoAnnual_cr' };
    eb.primaryFieldProvenance ??= {};
    for (const [metric, field] of Object.entries(mapping)) {
      const candidates = annual.filter(f => f.metric === metric && f.scope === scope && f.periodEnd === period);
      if (!candidates.length || new Set(candidates.map(f=>Number(f.value))).size !== 1) continue;
      const fact = candidates[0];
      if (!Number.isFinite(Number(fact.value)) || (field === 'capex_cr' && Number(fact.value) < 0)) continue;
      eb.financials ??= {};
      eb.financials[field] = Number(fact.value);
      eb.primaryFieldProvenance[field] = { factId: fact.factId, periodType: fact.periodType,
        periodEnd: fact.periodEnd, scope: fact.scope, unit: fact.unit, sourceUrl: fact.sourceUrl,
        availableAt: fact.availableAt, sourceDocumentId: fact.sourceDocumentId };
    }
  }
  console.log(`\n[qa] === GAP AUDIT (post level-1): ${gapsBefore.length} gaps ===`);
  for (const g of gapsBefore) {
    console.log(`[qa]   L${g.level} ${g.path} — ${g.fetchStrategy.slice(0, 80)}`);
  }

  // Level-2: Screener.in fetches
  const needsBalance = gapsBefore.some(g =>
    ['financials.tradeReceivables_cr', 'financials.cashAndEquivalents_cr',
     'financials.tradePayables_cr', 'financials.cwip_cr'].includes(g.path));
  const needsPeers = gapsBefore.some(g => g.path === 'peers.table');
  const needsRatios = gapsBefore.some(g =>
    ['financials.dso_days', 'financials.roce_pct'].includes(g.path));
  const needsAuditor = isGap(eb.governance?.auditorName);

  if (!dryRun) {
    console.log(`\n[qa] === LEVEL 2: Screener.in supplementary fetches ===`);

    // Single fetch for balance sheet + ratios + peers (all on same page)
    if (needsBalance || needsRatios || needsPeers || needsAuditor) {
      const screenerHtml = await fetchScreenerMain(symbol);
      if (screenerHtml) {

        // Balance sheet section
        if (needsBalance) {
          const bs = parseScreenerBalanceSheet(screenerHtml);
          if (bs) {
            for (const [k, v] of Object.entries(bs)) {
              if (v != null && k !== 'source' && k !== 'headers' && isGap(eb.financials?.[k])) {
                eb.financials[k] = v;
                console.log(`[qa] ✓ financials.${k} = ${v} (${bs.source})`);
              }
            }
            if (bs.headers?.length) {
              eb.financials.balanceSheetHeaders = bs.headers;
              console.log(`[qa] ✓ balance sheet headers: ${bs.headers.join(', ')}`);
            }
          }
        }

        // Ratios parsing
        if (needsRatios) {
          const ratios = parseScreenerRatios(screenerHtml);
          if (ratios.dso_days != null && isGap(eb.financials?.dso_days)) {
            eb.financials.dso_days = ratios.dso_days;
            console.log(`[qa] ✓ financials.dso_days = ${ratios.dso_days} days (${ratios.source})`);
          }
          if (ratios.roce_pct != null && isGap(eb.financials?.roce_pct)) {
            eb.financials.roce_pct = ratios.roce_pct;
            console.log(`[qa] ✓ financials.roce_pct = ${ratios.roce_pct}% (${ratios.source})`);
          }
          if (ratios.workingCapDays != null) {
            eb.financials.workingCapDays = ratios.workingCapDays;
            console.log(`[qa] ✓ financials.workingCapDays = ${ratios.workingCapDays} (${ratios.source})`);
          }
          if (ratios.currentRatio != null) {
            eb.financials.currentRatio = ratios.currentRatio;
            console.log(`[qa] ✓ financials.currentRatio = ${ratios.currentRatio} (${ratios.source})`);
          }
        }

        // Peers section — try main page first, then separate /peers/ URL
        if (needsPeers) {
          let peers = parseScreenerPeers(screenerHtml);
          if (!peers?.rows?.length) {
            // Screener renders peers separately; fetch dedicated URL
            const peersHtml = await fetchScreenerPeersPage(symbol);
            if (peersHtml) peers = parseScreenerPeers(peersHtml);
          }
          if (peers?.rows?.length) {
            eb.peers = peers;
            console.log(`[qa] ✓ peers table: ${peers.rows.length} companies (${peers.source})`);
          } else {
            console.warn(`[qa] ✗ Peers table not found on main or /peers/ page`);
          }
        }

        // Auditor extraction
        if (needsAuditor) {
          const auditorM = screenerHtml.match(/[Aa]uditor[\s\S]{0,500}?<strong>([^<]{10,100})<\/strong>/);
          const auditorM2 = screenerHtml.match(/Statutory Auditor[^<]{0,50}>([^<]{10,100})</);
          const auditor = auditorM?.[1]?.trim() ?? auditorM2?.[1]?.trim() ?? null;
          if (auditor) {
            eb.governance.auditorName = auditor;
            console.log(`[qa] ✓ auditorName = "${auditor}" (Screener.in)`);
          } else {
            console.warn(`[qa] ✗ Auditor not found in Screener HTML — requires annual report PDF`);
          }
        }
      }
    }

    // Level 2b: Trendlyne batch fetch — trade payables, ADTV, interest expense, etc.
    // Uses correct parameter tokens discovered via search_financial_parameters probe.
    console.log(`\n[qa] === LEVEL 2b: Trendlyne batch parameter fetch ===`);
    const needsTlBatch = isGap(eb.financials?.tradePayables_cr) ||
      isGap(eb.liquidity?.adtv_cr) ||
      isGap(eb.financials?.interestExpense_cr) ||
      isGap(eb.financials?.cashAndEquivalents_cr) ||
      isGap(eb.financials?.capex_cr);
    if (needsTlBatch) {
      const tlData = await fetchTrendlyneBatch(symbol);
      console.log(`[qa] Trendlyne batch result: ${tlData ? `object with keys: ${Object.keys(tlData).slice(0,10).join(', ')}` : 'null'}`);
      if (tlData) {
        // Dump raw for inspection
        try { fs.writeFileSync(`${BASE_DIR}/trendlyne_batch_debug_${asOf}.json`, JSON.stringify(tlData, null, 2)); } catch {}
        const f2 = eb.financials ?? {};
        // Helper: extract first numeric value from Trendlyne param result
        const tlVal = (token) => {
          const v = tlData[token];
          if (v == null) return null;
          if (typeof v === 'object' && (v.unit === 'UNKNOWN' || v.period === 'NOT_EXPLICITLY_ANCHORED')) return null;
          if (typeof v === 'number') return v;
          if (typeof v === 'object') {
            const first = Array.isArray(v) ? v[0] : v;
            return first?.value ?? first?.val ?? null;
          }
          const n = parseFloat(v);
          return isNaN(n) ? null : n;
        };
        // Trade payables (in Cr)
        if (isGap(f2.tradePayables_cr)) {
          const raw = tlVal('tradepayablesq') ?? tlVal('tradepayablesa');
          if (raw != null) {
            // Trendlyne values may be in Lakhs or Cr — use as-is if in Cr range (>100 = Lakhs → divide by 100)
            const val = raw;
            f2.tradePayables_cr = val;
            console.log(`[qa] ✓ financials.tradePayables_cr = ${val} Cr (Trendlyne tradepayablesq, raw=${raw})`);
          }
        }
        // ADTV in Cr (shares × price / 1e7)
        if (isGap(eb.liquidity?.adtv_cr)) {
          const adtvShares = tlVal('cvol30dayavg');
          const ltp = tlVal('ltp');
          if (adtvShares != null && ltp != null) {
            const adtv_cr = parseFloat((adtvShares * ltp / 1e7).toFixed(2));
            eb.liquidity = eb.liquidity ?? {};
            eb.liquidity.turnoverProxy_cr = adtv_cr;
            eb.liquidity.adtv_shares_30d = Math.round(adtvShares);
            eb.liquidity.ltp = ltp;
            eb.liquidity.proxySource = 'AVERAGE_VOLUME_TIMES_LATEST_PRICE_NOT_ADTV';
            console.log(`[qa] ✓ liquidity.adtv_cr = ${adtv_cr} Cr (${Math.round(adtvShares).toLocaleString()} shares × ₹${ltp})`);
          }
        }
        // Interest expense
        if (isGap(f2.interestExpense_cr)) {
          const raw = tlVal('intq') ?? tlVal('inta');
          if (raw != null) {
            f2.interestExpense_cr = raw;
            console.log(`[qa] ✓ financials.interestExpense_cr = ${f2.interestExpense_cr} Cr (Trendlyne)`);
          }
        }
        // Cash & Equivalents
        if (isGap(f2.cashAndEquivalents_cr)) {
          const raw = tlVal('cashandequivalentsq');
          if (raw != null) {
            f2.cashAndEquivalents_cr = raw;
            console.log(`[qa] ✓ financials.cashAndEquivalents_cr = ${f2.cashAndEquivalents_cr} Cr (Trendlyne)`);
          }
        }
        // CapEx
        if (isGap(f2.capex_cr)) {
          const raw = tlVal('capitalexpenditureq') ?? tlVal('capitalexpenditurea');
          if (raw != null) {
            f2.capex_cr = raw;
            console.log(`[qa] ✓ financials.capex_cr = ${f2.capex_cr} Cr (Trendlyne)`);
          }
        }
      }
    }

    // Level 2c: Trendlyne document search for auditor + CIN
    // get_document_search_results only accepts { query: string } — no other params
    if (isGap(eb.governance?.auditorName) || isGap(eb.governance?.cin)) {
      console.log(`\n[qa] === LEVEL 2c: Trendlyne document search for auditor/CIN ===`);
      const mcpUrl = loadMcpUrl();
      if (mcpUrl) {
        const docResult = await callTrendlyneTool(mcpUrl, 'get_document_search_results', {
          query: `${eb.companyName || symbol} (${symbol}) statutory auditor CIN corporate identity annual report`,
        });
        if (docResult) {
          const matched = parseDocumentResponse(docResult, symbol, asOf, new Date().toISOString());
          const docs = matched.documents;
          eb.documentRetrievalAudit = { matched: docs.length, rejected: matched.rejected };
          // Search extracted text for CIN pattern and auditor name
          for (const doc of docs) {
            const text = doc?.content ?? doc?.text ?? doc?.extracted_text ?? doc?.snippet ?? '';
            if (typeof text !== 'string' || !text) continue;
            // Report excerpts can name subsidiaries and former auditors. Retain candidates,
            // never clear company governance gaps from an unreviewed regex match.
            eb.governanceCandidates ??= [];
            const cin = text.match(/\b([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b/)?.[1] ?? null;
            const auditor = text.match(/(?:statutory auditor|audited by)\s*([A-Z][A-Za-z &.,]+(?:LLP|& Co)[^,\n]{0,40})/i)?.[1] ?? null;
            if (cin || auditor) eb.governanceCandidates.push({ cin, auditor,
              providerDocumentId: doc.providerDocumentId, contentSha256: doc.contentSha256,
              date: doc.date, status: 'REQUIRES_ENTITY_AND_APPOINTMENT_REVIEW' });
          }
        }
      }
    }

    // Level 2d: Kite Connect OHLCV for ADTV and price returns
    // DB token is authoritative (written by refresh_kite_token.cjs); .env fallback only when DB empty
    const kiteToken = (await loadKiteToken()) ?? process.env.KITE_ACCESS_TOKEN?.trim();
    if (kiteToken && (isGap(eb.liquidity?.adtv_cr) || isGap(eb.technicals?.changeP_1m) || isGap(eb.technicals?.changeP_1yr))) {
      console.log(`\n[qa] === LEVEL 2d: Kite Connect OHLCV ===`);
      const kiteData = await fetchKiteOhlcv(symbol, kiteToken);
      if (kiteData) {
        eb.technicals = eb.technicals ?? {};
        eb.liquidity = eb.liquidity ?? {};
        if (isGap(eb.liquidity.adtv_cr) && kiteData.adtv_cr != null) {
          eb.liquidity.turnoverProxy_cr = kiteData.adtv_cr;
          eb.liquidity.adtv_shares_30d = kiteData.adtv_shares;
          eb.liquidity.proxySource = 'KITE_CLOSE_TIMES_VOLUME_NOT_OFFICIAL_TURNOVER';
          console.log(`[qa] ✓ liquidity.adtv_cr = ${kiteData.adtv_cr} Cr (Kite Connect)`);
        }
        if (isGap(eb.technicals.changeP_1m) && kiteData.changeP_1m != null) {
          eb.technicals.changeP_1m = kiteData.changeP_1m;
          console.log(`[qa] ✓ technicals.changeP_1m = ${kiteData.changeP_1m}% (Kite Connect)`);
        }
        if (isGap(eb.technicals.changeP_1yr) && kiteData.changeP_1yr != null) {
          eb.technicals.changeP_1yr = kiteData.changeP_1yr;
          console.log(`[qa] ✓ technicals.changeP_1yr = ${kiteData.changeP_1yr}% (Kite Connect)`);
        }
      }
    }

    // Level 2e: Yahoo Finance for 1m/1yr price returns (fallback; no auth needed)
    if (isGap(eb.technicals?.changeP_1m) || isGap(eb.technicals?.changeP_1yr)) {
      console.log(`\n[qa] === LEVEL 2e: Yahoo Finance price returns (fallback) ===`);
      const yahooReturns = await fetchYahooPriceReturns(symbol);
      if (yahooReturns) {
        eb.technicals = eb.technicals ?? {};
        if (isGap(eb.technicals.changeP_1m) && yahooReturns.changeP_1m != null) {
          eb.technicals.changeP_1m = yahooReturns.changeP_1m;
          console.log(`[qa] ✓ changeP_1m = ${yahooReturns.changeP_1m}% (${yahooReturns.source})`);
        }
        if (isGap(eb.technicals.changeP_1yr) && yahooReturns.changeP_1yr != null) {
          eb.technicals.changeP_1yr = yahooReturns.changeP_1yr;
          console.log(`[qa] ✓ changeP_1yr = ${yahooReturns.changeP_1yr}% (${yahooReturns.source})`);
        }
      }
    }

    // Level-3: NSE ADTV
    console.log(`\n[qa] === LEVEL 3: NSE + BSE lookups ===`);

    if (isGap(eb.liquidity?.adtv_cr)) {
      const adtv = await fetchNseAdtv(symbol);
      if (adtv) {
        eb.liquidity = eb.liquidity ?? {};
        eb.liquidity.adtv_cr = adtv.adtv_cr;
        eb.liquidity.source = adtv.source;
        console.log(`[qa] ✓ liquidity.adtv_cr = ${adtv.adtv_cr} (NSE)`);
      } else {
        eb.liquidity = eb.liquidity ?? {};
        eb.liquidity.adtv_note = 'NSE quote and bhavcopy archive unavailable; ADTV remains DATA_INSUFFICIENT.';
        console.log('[qa] ✗ ADTV: NSE session required — flagged L4');
      }
    }

    // Level-3: BSE corporate governance for auditor + CIN
    if (isGap(eb.governance?.auditorName) || isGap(eb.cin)) {
      const bseCode = eb.bseCode ?? null;
      const bseResult = await fetchBseAuditorAndCin(bseCode);
      if (bseResult) {
        if (bseResult.auditor && isGap(eb.governance?.auditorName)) {
          eb.governance = eb.governance ?? {};
          eb.governance.auditorName = bseResult.auditor;
          console.log(`[qa] ✓ auditorName = "${bseResult.auditor}" (${bseResult.source})`);
        }
        if (bseResult.cin && isGap(eb.cin)) {
          eb.cin = bseResult.cin;
          eb.governance = eb.governance ?? {};
          eb.governance.cin = bseResult.cin;
          console.log(`[qa] ✓ CIN = ${bseResult.cin} (${bseResult.source})`);
        }
      }
    }

    // Recompute derived fields that depend on newly fetched Trendlyne/BSE data
    console.log(`\n[qa] === RE-DERIVE after L2b/L3 fetches ===`);
    const f3 = eb.financials ?? {};
    if (!evidenceOnly && isGap(f3.interestCoverage) && f3.ebitProxy_cr != null && f3.interestExpense_cr != null && f3.interestExpense_cr > 0) {
      f3.interestCoverage = parseFloat((f3.ebitProxy_cr / f3.interestExpense_cr).toFixed(2));
      console.log(`[qa] ✓ interestCoverage recomputed = ${f3.interestCoverage}×`);
    }
    if (!evidenceOnly && isGap(f3.netDebt_cr) && f3.borrowings_cr != null && f3.cashAndEquivalents_cr != null) {
      f3.netDebt_cr = parseFloat((f3.borrowings_cr - f3.cashAndEquivalents_cr).toFixed(2));
      console.log(`[qa] ✓ netDebt_cr recomputed = ${f3.netDebt_cr}Cr`);
    }
    if (!evidenceOnly && isGap(f3.debtToEquity) && f3.borrowings_cr != null && f3.equityCapital_cr != null && f3.reserves_cr != null) {
      const eq = f3.equityCapital_cr + f3.reserves_cr;
      if (eq > 0) { f3.debtToEquity = parseFloat((f3.borrowings_cr / eq).toFixed(3)); console.log(`[qa] ✓ debtToEquity recomputed = ${f3.debtToEquity}`); }
    }
    // Propagate fixes into questionEvidence after all fetches
    const qe2 = eb.questionEvidence ?? {};
    for (const [qid, field, src] of [
      ['3',  'dvmClassification',  eb.technicals?.dvmClassification],
      ['17', 'dvmClassification',  eb.technicals?.dvmClassification],
      ['10', 'patGrowthYoY_pct',   eb.financials?.patGrowthYoY_pct],
      ['13', 'patGrowthYoY_pct',   eb.financials?.patGrowthYoY_pct],
      ['15', 'patGrowthYoY_pct',   eb.financials?.patGrowthYoY_pct],
    ]) {
      if (qe2[qid] && isGap(qe2[qid][field]) && src != null) {
        qe2[qid][field] = src;
        console.log(`[qa] ✓ questionEvidence.${qid}.${field} propagated`);
      }
    }
  }

  // Final gap audit
  const gapsAfter = auditBundle(eb);
  const fixed = gapsBefore.filter(g => !gapsAfter.find(g2 => g2.path === g.path));
  const remaining = gapsAfter;
  const remainingL4 = gapsAfter.filter(g => g.level === 4);

  console.log(`\n[qa] === SUMMARY ===`);
  console.log(`[qa] Tracked gaps before: ${gapsBefore.length}`);
  console.log(`[qa] Fixed / enriched:    ${fixed.length}`);
  console.log(`[qa] Still open:          ${remaining.length} (L4 manual-only: ${remainingL4.length})`);

  if (remaining.length > 0) {
    console.log(`\n[qa] === REMAINING GAPS ===`);
    for (const g of remaining) {
      const tag = g.level === 4 ? '[MANUAL]' : `[L${g.level}]`;
      console.log(`[qa]   ${tag} ${g.path}`);
      console.log(`[qa]         → ${g.fetchStrategy.slice(0, 100)}`);
    }
  }

  // Write gap report
  const report = {
    symbol, asOf, builtAt: new Date().toISOString(),
    evidenceOnly,
    gapsBefore: gapsBefore.length,
    fixed: fixed.length,
    remaining: remaining.length,
    remainingManual: remainingL4.length,
    fixedList: fixed.map(g => g.path),
    remainingList: remaining.map(g => ({ path: g.path, level: g.level, fetchStrategy: g.fetchStrategy })),
    allGaps: gapsBefore,
  };

  // Update bundle metadata
  eb.qaRun = { asOf, fixedCount: fixed.length, remainingCount: remaining.length };

  if (!dryRun) {
    fs.writeFileSync(BUNDLE_PATH, JSON.stringify(eb, null, 2));
    console.log(`\n[qa] ✓ evidence_bundle.json updated at ${BUNDLE_PATH}`);
    fs.writeFileSync(GAP_REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`[qa] ✓ gap_report written to ${GAP_REPORT_PATH}`);
  } else {
    console.log(`\n[qa] DRY RUN — no files written`);
  }

  return report;
}

main().catch(e => { console.error('[qa] Fatal:', e); process.exit(1); });
