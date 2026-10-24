#!/usr/bin/env node
/**
 * acquire_bse_xbrl.mjs
 * Fetches XBRL filings from BSE Annual Reports API for numeric BSE scrip codes.
 * Intended for stocks identified only by a numeric BSE scrip code (e.g. 500209, 534109)
 * that do not have an NSE listing and so cannot use acquire_xbrl_financials.mjs.
 *
 * Usage:
 *   node acquire_bse_xbrl.mjs <BSE_SCRIP_CODE> [--dry-run]
 *
 * Pre-req: MasterTickers table must exist in the SQLite DB (portfolio.db) so the
 *          numeric scrip code can be resolved to a symbol and ISIN.
 *
 * Output:
 *   - XML files saved to outputs/institutional29/<SYMBOL>/documents/bse_xbrl_<code>_<n>.xml
 *   - Parsed facts written to trendlyne_mirror_observations (INSERT OR IGNORE)
 *   - JSON summary written to stdout:
 *       { scripCode, symbol, isin, filingsFound, filingsDownloaded, factsWritten, status }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.cwd();

// ── helpers ────────────────────────────────────────────────────────────────────

function log(tag, msg) { process.stderr.write(`[${tag}] ${msg}\n`); }
function warn(tag, msg) { process.stderr.write(`[${tag}] WARN: ${msg}\n`); }

function hash(...parts) {
  return createHash('sha256')
    .update(parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join('|'))
    .digest('hex');
}

async function fetchJSON(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Accept: 'application/json,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Referer: 'https://www.bseindia.com/',
  };
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timer);
    if (!res.ok) { warn('bse_xbrl', `${url} → HTTP ${res.status}`); return null; }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    warn('bse_xbrl', `${url} → ${err.message}`);
    return null;
  }
}

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Accept: 'application/xml,text/xml,*/*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timer);
    if (!res.ok) { warn('bse_xbrl', `${url} → HTTP ${res.status}`); return null; }
    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    warn('bse_xbrl', `${url} → ${err.message}`);
    return null;
  }
}

// ── XBRL XML parser (regex-based, no external dependency) ─────────────────────

const METRIC_PATTERNS = [
  { pattern: /NetProfit|ProfitAfterTax|ProfitLoss(?!.*[Ee]xpense)/i, canonical: 'net_profit_pat_cr', label: 'NetProfit' },
  { pattern: /Revenue|NetSales|TotalIncome|Turnover/i,               canonical: 'revenue_cr',        label: 'Revenue'   },
  { pattern: /EarningsPerShare|BasicEarnings(?:PerShare)?|DilutedEarnings(?:PerShare)?/i, canonical: 'eps_ttm', label: 'EarningsPerShare' },
];

function parseXbrlFacts(xmlText, sourceUrl) {
  const facts = [];
  if (!xmlText) return facts;

  // Extract contextRef → period date mapping
  const contextMap = {};
  const ctxRe = /<(?:[\w-]+:)?context[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?context>/g;
  let cm;
  while ((cm = ctxRe.exec(xmlText)) !== null) {
    const body = cm[2];
    const inst  = body.match(/<(?:[\w-]+:)?instant[^>]*>([\d-]+)/);
    const end   = body.match(/<(?:[\w-]+:)?endDate[^>]*>([\d-]+)/);
    const start = body.match(/<(?:[\w-]+:)?startDate[^>]*>([\d-]+)/);
    contextMap[cm[1]] = inst?.[1] || end?.[1] || start?.[1] || cm[1];
  }

  // Match numeric data elements that carry a contextRef
  const elemRe = /<(?:[\w-]+:)?([\w-]+)\s[^>]*contextRef="([^"]+)"[^>]*>([\d.,\-]+)<\/(?:[\w-]+:)?\1>/g;
  let em;
  while ((em = elemRe.exec(xmlText)) !== null) {
    const tagName = em[1];
    const ctxRef  = em[2];
    const value   = parseFloat(em[3].replace(/,/g, ''));
    if (isNaN(value)) continue;

    const matched = METRIC_PATTERNS.find(p => p.pattern.test(tagName));
    if (!matched) continue;

    facts.push({
      tag:       matched.label,
      canonical: matched.canonical,
      rawTag:    tagName,
      value,
      period:    contextMap[ctxRef] || ctxRef,
      source:    sourceUrl,
    });
  }
  return facts;
}

// ── filing list helpers ────────────────────────────────────────────────────────

const XBRL_HEADLINE_PATTERN = /xbrl|reg\.?\s*33|financial\s+result/i;
const ATTACHMENT_FIELDS     = ['ATTACHMENTNAME', 'PDFNAME', 'FILENAME', 'FILEURL', 'PDF_URL'];

function extractFilingItems(listData) {
  const items = Array.isArray(listData)
    ? listData
    : (listData?.Table || listData?.data || listData?.Data || []);
  const results = [];
  for (const item of Array.isArray(items) ? items : []) {
    const headline = String(item.HEADLINE || item.CATTAIL || item.CAT || '');
    if (!XBRL_HEADLINE_PATTERN.test(headline)) continue;
    for (const field of ATTACHMENT_FIELDS) {
      const raw = item[field];
      if (typeof raw !== 'string' || !raw.trim()) continue;
      let url = raw.trim();
      if (url.startsWith('/')) url = 'https://www.bseindia.com' + url;
      if (!url.startsWith('http')) continue;
      results.push({ headline, url });
      break; // take first available attachment per filing
    }
  }
  return results;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args       = process.argv.slice(2);
  const scripCode  = args.find(a => !a.startsWith('--'));
  const dryRun     = args.includes('--dry-run');

  if (!scripCode || !/^\d+$/.test(scripCode)) {
    process.stderr.write('Usage: node acquire_bse_xbrl.mjs <BSE_SCRIP_CODE> [--dry-run]\n');
    process.exit(1);
  }

  log('bse_xbrl', `ScripCode=${scripCode} dryRun=${dryRun}`);

  // ── 1. Resolve symbol + ISIN from MasterTickers ──────────────────────────────
  let db     = null;
  let symbol = scripCode;   // fallback: use scrip code as symbol
  let isin   = null;

  try {
    const { default: Database } = await import('better-sqlite3');
    const dbPath = (process.env.DATABASE_URL || path.join(PROJECT_ROOT, 'portfolio.db'))
      .replace(/^sqlite:\/\//, '');
    if (fs.existsSync(dbPath)) {
      db = new Database(dbPath);
      const row = db.prepare(
        `SELECT symbol, isin FROM MasterTickers WHERE bse_code=? OR symbol=? LIMIT 1`
      ).get(scripCode, scripCode);
      if (row) {
        symbol = row.symbol || scripCode;
        isin   = row.isin   || null;
      } else {
        warn('bse_xbrl', `No row in MasterTickers for bse_code/symbol=${scripCode}; using scrip code as symbol`);
      }
    } else {
      warn('bse_xbrl', `DB not found at ${dbPath}; continuing without ISIN lookup`);
    }
  } catch (err) {
    warn('bse_xbrl', `DB lookup failed: ${err.message}`);
  }

  log('bse_xbrl', `Symbol=${symbol} ISIN=${isin ?? 'unknown'}`);

  // ── 2. Fetch BSE filing list ────────────────────────────────────────────────
  const listUrl  = `https://api.bseindia.com/BseIndiaAPI/api/AnnualReports/w?scripcode=${scripCode}&type=C`;
  log('bse_xbrl', `Fetching BSE filing list: ${listUrl}`);
  const listData = await fetchJSON(listUrl);
  const filingItems = listData ? extractFilingItems(listData) : [];
  log('bse_xbrl', `Found ${filingItems.length} XBRL-matching filings`);

  // ── 3. Download up to 3 XML filings ────────────────────────────────────────
  const docsDir = path.join(PROJECT_ROOT, 'outputs', 'institutional29', symbol, 'documents');
  if (!dryRun) fs.mkdirSync(docsDir, { recursive: true });

  const allFacts        = [];
  let   filingsDownloaded = 0;

  for (let i = 0; i < Math.min(3, filingItems.length); i++) {
    const { headline, url } = filingItems[i];
    const lowerUrl          = url.toLowerCase();
    const isXml = lowerUrl.endsWith('.xml') || lowerUrl.includes('xbrl') || lowerUrl.includes('ixbrl');

    if (!isXml) {
      log('bse_xbrl', `Skipping non-XML filing (${headline}): ${url}`);
      continue;
    }

    log('bse_xbrl', `Downloading filing ${i + 1} (${headline}): ${url}`);

    if (dryRun) {
      filingsDownloaded++;
      continue;
    }

    const xmlText = await fetchText(url);
    if (!xmlText) continue;

    const savePath = path.join(docsDir, `bse_xbrl_${scripCode}_${i + 1}.xml`);
    try {
      fs.writeFileSync(savePath, xmlText, 'utf8');
      log('bse_xbrl', `  Saved: ${savePath}`);
    } catch (saveErr) {
      warn('bse_xbrl', `  Failed to save ${savePath}: ${saveErr.message}`);
    }

    const facts = parseXbrlFacts(xmlText, url);
    log('bse_xbrl', `  Parsed ${facts.length} facts from filing`);
    allFacts.push(...facts);
    filingsDownloaded++;
  }

  // ── 4. Deduplicate facts by (tag, period) ──────────────────────────────────
  const dedupMap = new Map();
  for (const fact of allFacts) {
    const key      = `${fact.tag}::${fact.period}`;
    const existing = dedupMap.get(key);
    if (!existing || Math.abs(fact.value) > Math.abs(existing.value)) {
      dedupMap.set(key, fact);
    }
  }
  const dedupedFacts = Array.from(dedupMap.values());

  // ── 5. Write parsed facts to trendlyne_mirror_observations ─────────────────
  let factsWritten = 0;

  if (!dryRun && db && dedupedFacts.length > 0) {
    try {
      const tables = new Set(
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
      );

      if (tables.has('trendlyne_mirror_observations')) {
        const snapshotId   = `bse_xbrl_${scripCode}_${Date.now()}`;
        const now          = new Date().toISOString();
        const responseHash = hash(scripCode, symbol, dedupedFacts);

        const insertObs = db.prepare(`
          INSERT OR IGNORE INTO trendlyne_mirror_observations
            (observationId, snapshotId, symbol, companyId, providerToken, providerLabel,
             rawValue, rawUnit, periodType, relativePeriod, providerPeriod, providerAsOf,
             scope, status, canonicalMetric, observationHash,
             firstSeenAt, lastSeenAt, responseHash)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

        for (const fact of dedupedFacts) {
          const observationId = `bse_xbrl_${hash(symbol, fact.tag, fact.period, String(fact.value)).slice(0, 28)}`;
          const obsHash       = hash({ symbol, tag: fact.tag, value: fact.value, period: fact.period });
          const result = insertObs.run(
            observationId, snapshotId, symbol, null,
            fact.rawTag, fact.tag,
            String(fact.value), null,
            'ANNUAL', null, fact.period,
            now,
            'BSE_XBRL', 'OBSERVED',
            fact.canonical,
            obsHash, now, now, responseHash
          );
          factsWritten += result.changes;
        }

        log('bse_xbrl', `Wrote ${factsWritten} facts to trendlyne_mirror_observations`);
      } else {
        warn('bse_xbrl', 'trendlyne_mirror_observations table not found — skipping DB write');
      }
    } catch (dbErr) {
      warn('bse_xbrl', `DB write failed: ${dbErr.message}`);
    }
  }

  if (db) {
    try { db.close(); } catch { /* ignore */ }
  }

  // ── 6. Output JSON summary ─────────────────────────────────────────────────
  const summary = {
    scripCode,
    symbol,
    isin,
    filingsFound:      filingItems.length,
    filingsDownloaded,
    factsWritten,
    status: filingItems.length > 0 ? 'OK' : 'NO_XBRL_FILINGS_FOUND',
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch(err => {
  process.stderr.write(`[bse_xbrl] FATAL: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
