#!/usr/bin/env node
/**
 * acquire_xbrl_financials.mjs
 * Fetches and parses XBRL-structured financial statements from BSE/NSE filing URLs.
 * Reads raw.exchange.announcements to discover XBRL XML file links.
 * Uses regex-based XML parsing — no external XML library.
 *
 * Usage:
 *   node acquire_xbrl_financials.mjs SYMBOL [--as-of YYYY-MM-DD] [--dry-run]
 *
 * Prereq: acquire_exchange_data.mjs must have run first.
 * Output: merges raw.xbrl into outputs/institutional29/<SYMBOL>/trendlyne_raw.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.cwd();

// ── helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function log(tag, msg) { process.stderr.write(`[${tag}] ${msg}\n`); }
function warn(tag, msg) { process.stderr.write(`[${tag}] WARN: ${msg}\n`); }

function outputPath(symbol) {
  return path.join(PROJECT_ROOT, 'outputs', 'institutional29', symbol, 'trendlyne_raw.json');
}

function readRaw(symbol) {
  const p = outputPath(symbol);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function writeRaw(symbol, raw) {
  const p = outputPath(symbol);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(raw, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    'Accept': 'application/xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timer);
    if (!res.ok) {
      warn('xbrl', `${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    warn('xbrl', `${url} → ${err.message}`);
    return null;
  }
}

// ── XBRL XML parser (regex-based) ────────────────────────────────────────────

// Tags we care about, mapped to friendly names
const XBRL_TAGS_OF_INTEREST = [
  // Revenue
  { pattern: /Revenue|NetSales|TotalIncome|Turnover/i, label: 'Revenue' },
  // PAT
  { pattern: /ProfitAfterTax|NetProfit|ProfitForPeriod|ProfitLoss/i, label: 'ProfitAfterTax' },
  // Operating profit
  { pattern: /OperatingProfit|EBITDA|ProfitFromOperations/i, label: 'OperatingProfit' },
  // Cash flow from ops
  { pattern: /CashFlowFromOperating|NetCashFromOperating|CashFlowsFromUsedInOperatingActivities/i, label: 'CashFlowFromOperating' },
  // Borrowings
  { pattern: /Borrowings|LongTermBorrowings|ShortTermBorrowings/i, label: 'Borrowings' },
  // Inventories
  { pattern: /Inventories/i, label: 'Inventories' },
  // Trade receivables
  { pattern: /TradeReceivables|Receivables/i, label: 'TradeReceivables' },
];

function parseXbrlXml(xmlText, sourceUrl) {
  const facts = [];
  if (!xmlText) return facts;

  // Extract contextRef → period mapping
  // <context id="XYZ"><period><startDate>...</startDate><endDate>...</endDate></period></context>
  const contextMap = {};
  const ctxRegex = /<(?:[\w-]+:)?context[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?context>/g;
  let cm;
  while ((cm = ctxRegex.exec(xmlText)) !== null) {
    const ctxId = cm[1];
    const ctxBody = cm[2];
    const instantMatch = ctxBody.match(/<(?:[\w-]+:)?instant[^>]*>([\d-]+)<\/(?:[\w-]+:)?instant>/);
    const endMatch = ctxBody.match(/<(?:[\w-]+:)?endDate[^>]*>([\d-]+)<\/(?:[\w-]+:)?endDate>/);
    const startMatch = ctxBody.match(/<(?:[\w-]+:)?startDate[^>]*>([\d-]+)<\/(?:[\w-]+:)?startDate>/);
    contextMap[ctxId] = instantMatch?.[1] || endMatch?.[1] || startMatch?.[1] || ctxId;
  }

  // Match all data elements: <ns:TagName contextRef="..." unitRef="..." decimals="...">value</ns:TagName>
  const elemRegex = /<(?:[\w-]+:)?([\w-]+)\s[^>]*contextRef="([^"]+)"[^>]*>([\d.,\-]+)<\/(?:[\w-]+:)?\1>/g;
  let em;
  while ((em = elemRegex.exec(xmlText)) !== null) {
    const tagName = em[1];
    const ctxRef = em[2];
    const rawValue = em[3].replace(/,/g, '');
    const value = parseFloat(rawValue);
    if (isNaN(value)) continue;

    // Only capture tags that match our interest list
    const matched = XBRL_TAGS_OF_INTEREST.find(t => t.pattern.test(tagName));
    if (!matched) continue;

    // Determine unit from nearby unitRef attribute
    const unitMatch = em[0].match(/unitRef="([^"]+)"/);
    const unit = unitMatch?.[1] ?? 'unknown';

    const period = contextMap[ctxRef] ?? ctxRef;
    facts.push({ tag: matched.label, rawTag: tagName, value, unit, period, source: sourceUrl });
  }

  return facts;
}

// ── URL discovery ─────────────────────────────────────────────────────────────

const XBRL_ANNOUNCEMENT_PATTERN = /XBRL|financial result|quarterly result|annual report/i;
// BSE PDF/XML attachment URLs typically live in these fields
const ATTACHMENT_FIELDS = ['PDFNAME', 'ATTACHMENTNAME', 'FILENAME', 'FILEURL', 'PDF_URL'];

function discoverXbrlUrls(announcements) {
  const urls = new Set();

  if (!Array.isArray(announcements)) return urls;

  for (const ann of announcements) {
    const cat = String(ann.CATEGORY || ann.SUBCATNAME || ann.CATEGORY_NAME || '');
    const desc = String(ann.HEADLINE || ann.DESCRIPTION || ann.DETAILS || '');
    const combined = cat + ' ' + desc;

    if (!XBRL_ANNOUNCEMENT_PATTERN.test(combined)) continue;

    for (const field of ATTACHMENT_FIELDS) {
      const val = ann[field];
      if (typeof val === 'string' && val.trim()) {
        let url = val.trim();
        // BSE relative paths need base URL prefix
        if (url.startsWith('/')) url = 'https://www.bseindia.com' + url;
        if (url.startsWith('http')) urls.add(url);
      }
    }
  }

  return urls;
}

// NSE is the primary statutory XBRL discovery source.  BSE announcement
// attachments remain a secondary source because their API often omits rows.
// Discovery returns only official NSE archive URLs; it never manufactures a
// filing URL from a symbol or report date.
async function discoverNseXbrlUrls(symbol) {
  const urls = new Set();
  const baseHeaders = {
    'Accept': 'application/json,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-financial-results',
  };
  try {
    const landing = await fetch('https://www.nseindia.com/', { headers: baseHeaders });
    const cookie = landing.headers.get('set-cookie') || '';
    for (const period of ['Quarterly', 'Annual']) {
      const endpoint = `https://www.nseindia.com/api/corporates-financial-results?index=equities&symbol=${encodeURIComponent(symbol)}&period=${period}`;
      const response = await fetch(endpoint, { headers: { ...baseHeaders, ...(cookie ? { Cookie: cookie } : {}) } });
      if (!response.ok) { warn('xbrl', `NSE ${period} discovery → HTTP ${response.status}`); continue; }
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : (payload?.data ?? []);
      for (const row of rows) {
        const url = row?.xbrl;
        if (typeof url === 'string' && url !== '-' && /^https:\/\/(?:nsearchives|archives)\.nseindia\.com\//i.test(url)) urls.add(url);
      }
    }
  } catch (err) {
    warn('xbrl', `NSE XBRL discovery failed: ${err.message}`);
  }
  return urls;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const symbol = args.find(a => !a.startsWith('--'));
  if (!symbol) {
    process.stderr.write('Usage: node acquire_xbrl_financials.mjs SYMBOL [--as-of YYYY-MM-DD] [--dry-run]\n');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const asOfArg = args.includes('--as-of') ? args[args.indexOf('--as-of') + 1] : null;
  const asOf = asOfArg ? new Date(asOfArg) : new Date();
  const todayISO = toDateStr(asOf);

  log('xbrl', `Symbol=${symbol} asOf=${todayISO} dryRun=${dryRun}`);

  const raw = readRaw(symbol);
  if (!raw.raw) raw.raw = {};

  const announcements = raw.raw?.exchange?.announcements;
  if (!announcements) {
    warn('xbrl', 'raw.exchange.announcements not found — run acquire_exchange_data.mjs first');
  }

  // Identifier routing is deliberate: BSE scrip codes are numeric; NSE
  // symbols are alphabetic.  A known cross-listing may still contribute an
  // attachment from the other exchange, but the supplied identifier decides
  // which statutory discovery API is primary.
  const isBseScripCode = /^\d+$/.test(symbol);
  const bseXbrlUrls = discoverXbrlUrls(announcements);
  const nseXbrlUrls = (dryRun || isBseScripCode) ? new Set() : await discoverNseXbrlUrls(symbol.toUpperCase());
  const xbrlUrls = new Map();
  for (const url of bseXbrlUrls) xbrlUrls.set(url, 'BSE');
  for (const url of nseXbrlUrls) xbrlUrls.set(url, 'NSE');
  log('xbrl', `Route=${isBseScripCode ? 'BSE_NUMERIC_SCRIP' : 'NSE_SYMBOL'}; discovered ${xbrlUrls.size} potential XBRL filing URLs (NSE official: ${nseXbrlUrls.size}; BSE attachments: ${bseXbrlUrls.size})`);

  if (xbrlUrls.size === 0) {
    log('xbrl', 'No official NSE/BSE XBRL filing URLs were discovered');
    const previous = raw.raw?.xbrl;
    // A temporary discovery outage must never erase previously verified
    // statutory facts. Preserve them and record the failed refresh instead.
    if (Array.isArray(previous?.facts) && previous.facts.length > 0) {
      previous.lastRefreshAttempt = new Date().toISOString();
      previous.lastRefreshStatus = 'DISCOVERY_FAILED_PRESERVED_PREVIOUS_EVIDENCE';
      if (!dryRun) writeRaw(symbol, raw);
      process.stdout.write(JSON.stringify({ symbol, xbrlFactsCount: previous.facts.length, sources: previous.sources ?? [], refreshStatus: previous.lastRefreshStatus }, null, 2) + '\n');
      return;
    }
    raw.raw.xbrl = {
      facts: [],
      sources: [],
      parsedAt: new Date().toISOString(),
      note: 'No official NSE/BSE XBRL filing URLs were discovered',
    };
    if (!dryRun) writeRaw(symbol, raw);
    process.stdout.write(JSON.stringify({ symbol, xbrlFactsCount: 0, sources: [] }, null, 2) + '\n');
    return;
  }

  const allFacts = [];
  const usedSources = [];
  const sourceLedger = [];

  for (const [url, exchange] of xbrlUrls) {
    // Only attempt XML files; skip PDFs (handled by acquire_documents.mjs)
    const lowerUrl = url.toLowerCase();
    const isXml = lowerUrl.endsWith('.xml') || lowerUrl.includes('xbrl') || lowerUrl.includes('ixbrl');
    if (!isXml) {
      log('xbrl', `Skipping non-XML URL: ${url}`);
      sourceLedger.push({ exchange, url, status: 'SKIPPED_NON_XBRL_ATTACHMENT' });
      continue;
    }

    log('xbrl', `Fetching XBRL XML: ${url}`);
    if (dryRun) {
      usedSources.push(url);
      sourceLedger.push({ exchange, url, status: 'DISCOVERED_NOT_FETCHED' });
      continue;
    }

    const xmlText = await fetchText(url);
    if (!xmlText) { sourceLedger.push({ exchange, url, status: 'FETCH_FAILED' }); continue; }

    const facts = parseXbrlXml(xmlText, url);
    log('xbrl', `  Parsed ${facts.length} facts from ${url}`);
    allFacts.push(...facts);
    usedSources.push(url);
    sourceLedger.push({ exchange, url, status: facts.length ? 'PARSED' : 'PARSED_NO_RECOGNISED_FACTS', factCount: facts.length });
  }

  // Deduplicate: keep highest-value entry per (tag, period) combination
  const dedupMap = new Map();
  for (const fact of allFacts) {
    const key = `${fact.tag}::${fact.period}`;
    const existing = dedupMap.get(key);
    if (!existing || Math.abs(fact.value) > Math.abs(existing.value)) {
      dedupMap.set(key, fact);
    }
  }
  const dedupedFacts = Array.from(dedupMap.values());

  raw.raw.xbrl = {
    facts: dedupedFacts,
    sources: usedSources,
    sourceLedger,
    parsedAt: new Date().toISOString(),
  };

  if (!dryRun) writeRaw(symbol, raw);
  log('xbrl', `Saved ${dedupedFacts.length} XBRL facts to ${outputPath(symbol)}`);

  const summary = {
    symbol,
    xbrlFactsCount: dedupedFacts.length,
    sources: usedSources,
    tagBreakdown: Object.fromEntries(
      XBRL_TAGS_OF_INTEREST.map(t => [t.label, dedupedFacts.filter(f => f.tag === t.label).length])
    ),
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch(err => {
  process.stderr.write(`[xbrl] FATAL: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
