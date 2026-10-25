#!/usr/bin/env node
/**
 * acquire_exchange_data.mjs
 * Fetches company financials, corporate actions, shareholding, and announcements
 * from BSE India public APIs and NSE public endpoints.
 * No auth required. Pure fetch, no LLM calls.
 *
 * Usage:
 *   node acquire_exchange_data.mjs SYMBOL [--bse-code XXXXXX] [--as-of YYYY-MM-DD] [--dry-run]
 *
 * Output: merges raw.exchange.* into outputs/institutional29/<SYMBOL>/trendlyne_raw.json
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

function toBSEDateStr(d) {
  // BSE uses DD/MM/YYYY
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}/${m}/${y}`;
}

function log(tag, msg) {
  process.stderr.write(`[${tag}] ${msg}\n`);
}

function warn(tag, msg) {
  process.stderr.write(`[${tag}] WARN: ${msg}\n`);
}

async function fetchJSON(url, opts = {}, timeoutMs = 15000, maxAttempts = 3) {
  const headers = {
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ...opts.headers,
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, headers, ...opts });
      clearTimeout(timer);
      if (!res.ok) {
        warn('exchange', `${url} → HTTP ${res.status}`);
        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) { await new Promise(r => setTimeout(r, 250 * 2 ** (attempt - 1))); continue; }
        return { data: null, httpStatus: res.status, error: `HTTP_${res.status}` };
      }
      try {
        return { data: await res.json(), httpStatus: res.status, error: null };
      } catch (err) {
        const error = `INVALID_JSON: ${err.message}`;
        warn('exchange', `${url} → ${error}`);
        return { data: null, httpStatus: res.status, error };
      }
    } catch (err) {
      clearTimeout(timer);
      warn('exchange', `${url} → ${err.message} (attempt ${attempt}/${maxAttempts})`);
      if (attempt < maxAttempts) { await new Promise(r => setTimeout(r, 250 * 2 ** (attempt - 1))); continue; }
      return { data: null, httpStatus: null, error: `NETWORK_ERROR: ${err.message}` };
    }
  }
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,*/*' } });
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    warn('exchange', `${url} → ${error.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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

// ── resolve BSE code ──────────────────────────────────────────────────────────

function resolveBseCode(raw, cliCode) {
  if (cliCode) return cliCode;
  // Check common locations where prior modules may have stored the BSE code
  const candidates = [
    raw?.raw?.companyInfo?.bseCode,
    raw?.raw?.companyInfo?.bse_code,
    raw?.raw?.stockSummary?.bseCode,
    raw?.raw?.stockSummary?.bse_code,
    raw?.raw?.bseCode,
  ];
  for (const c of candidates) {
    if (c) return String(c);
  }
  return null;
}

// ── financial summary extractor ──────────────────────────────────────────────

function extractFinancialSummary(quarterlyData, annualData) {
  const summary = { periods: [], revenue: [], operatingProfit: [], pat: [] };

  function extractRows(data, label) {
    if (!data) return;
    const table = data?.Table || data?.data || data?.ResultData || [];
    if (!Array.isArray(table)) return;
    table.slice(0, 8).forEach(row => {
      const period = row.PERIOD || row.period || row.YEAR || row.year || '';
      const rev = parseFloat(row.NET_SALES || row.TOTAL_INCOME || row.Revenue || row.revenue || 0);
      const op = parseFloat(row.OPERATING_PROFIT || row.EBITDA || row.operating_profit || 0);
      const pat = parseFloat(row.NET_PROFIT || row.PAT || row.net_profit || 0);
      if (period) {
        summary.periods.push(`${label}:${period}`);
        summary.revenue.push(rev);
        summary.operatingProfit.push(op);
        summary.pat.push(pat);
      }
    });
  }

  extractRows(quarterlyData, 'Q');
  extractRows(annualData, 'A');
  return summary;
}

// ── Screener.in HTML scraper ──────────────────────────────────────────────────
// Screener.in is the most reliable public source for Indian listed company financials.
// Returns quarterly P&L, annual P&L, balance sheet, shareholding from HTML.

async function fetchScreenerData(symbol, timeoutMs = 20000) {
  const url = `https://www.screener.in/company/${symbol}/consolidated/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.screener.in/',
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      warn('screener', `${url} → HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    return parseScreenerHtml(html, symbol);
  } catch (err) {
    clearTimeout(timer);
    warn('screener', `${url} → ${err.message}`);
    return null;
  }
}

function parseScreenerHtml(html, symbol) {
  const result = { symbol, quarterlyPL: [], annualPL: [], balanceSheet: {} };

  function stripTags(s) {
    return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#[^;]+;/g, '').replace(/\s+/g, ' ').trim();
  }

  function parseNum(s) {
    if (!s || s === '' || s === '--') return null;
    const n = parseFloat(String(s).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  // Extract section HTML by id
  function getSection(id) {
    const re = new RegExp(`<section[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/section>`, 'i');
    return html.match(re)?.[1] ?? '';
  }

  // Parse Screener table: extracts header periods (from <th>) and data rows (from <td>)
  function parseScreenerTable(secHtml) {
    // Extract header row from <thead> or first <tr> with <th>
    const theadMatch = secHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
    const periods = [];
    if (theadMatch) {
      const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
      let thM;
      let first = true;
      while ((thM = thRe.exec(theadMatch[1])) !== null) {
        const text = stripTags(thM[1]);
        if (first) { first = false; continue; } // skip label column header
        if (text) periods.push(text);
      }
    }

    // Extract data rows from <tbody>
    const tbodyMatch = secHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    const rowMap = {};
    if (tbodyMatch) {
      const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trM;
      while ((trM = trRe.exec(tbodyMatch[1])) !== null) {
        const cells = [];
        const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdM;
        while ((tdM = tdRe.exec(trM[1])) !== null) {
          cells.push(stripTags(tdM[1]));
        }
        if (cells.length > 1 && cells[0]) {
          const label = cells[0].replace(/\s*[+\-]\s*$/, '').trim().toLowerCase();
          rowMap[label] = cells.slice(1);
        }
      }
    }
    return { periods, rowMap };
  }

  // ── Quarters section ──
  const quartersSec = getSection('quarters');
  if (quartersSec) {
    const { periods, rowMap } = parseScreenerTable(quartersSec);
    const salesRow = rowMap['sales'] ?? rowMap['revenue from operations'] ?? rowMap['net sales'] ?? rowMap['revenue'];
    const opmRow = rowMap['opm %'] ?? rowMap['operating profit %'] ?? rowMap['opm'];
    const patRow = rowMap['net profit'] ?? rowMap['profit after tax'] ?? rowMap['pat'];

    periods.forEach((period, i) => {
      if (!period || /^\d+$/.test(period)) return; // skip if period looks like a number
      result.quarterlyPL.push({
        period,
        revenue_cr: parseNum(salesRow?.[i]),
        opm_pct: parseNum(opmRow?.[i]),
        pat_cr: parseNum(patRow?.[i]),
      });
    });
  }

  // ── Profit & Loss section (annual) ──
  const plSec = getSection('profit-loss');
  if (plSec) {
    const { periods, rowMap } = parseScreenerTable(plSec);
    const salesRow = rowMap['sales'] ?? rowMap['revenue from operations'] ?? rowMap['revenue'];
    const opmRow = rowMap['opm %'] ?? rowMap['operating profit %'] ?? rowMap['opm'];
    const patRow = rowMap['net profit'] ?? rowMap['profit after tax'] ?? rowMap['pat'];
    const cfoRow = rowMap['cash from operations'] ?? rowMap['cash from operating activity'] ?? rowMap['cfo'];

    periods.forEach((period, i) => {
      if (!period || /^\d+$/.test(period)) return;
      result.annualPL.push({
        period,
        revenue_cr: parseNum(salesRow?.[i]),
        opm_pct: parseNum(opmRow?.[i]),
        pat_cr: parseNum(patRow?.[i]),
        cfo_cr: parseNum(cfoRow?.[i]),
      });
    });
  }

  // ── Balance Sheet section ──
  const bsSec = getSection('balance-sheet');
  if (bsSec) {
    const { periods, rowMap } = parseScreenerTable(bsSec);
    const latestIdx = periods.length - 1;
    if (latestIdx >= 0) {
      result.balanceSheet = {
        latestPeriod: periods[latestIdx],
        borrowings_cr: parseNum((rowMap['borrowings'] ?? rowMap['total borrowings'])?.[latestIdx]),
        tradeReceivables_cr: parseNum(rowMap['trade receivables']?.[latestIdx]),
        inventory_cr: parseNum((rowMap['inventory'] ?? rowMap['inventories'])?.[latestIdx]),
        cashAndEquivalents_cr: parseNum((rowMap['cash equivalents'] ?? rowMap['cash & equivalents'])?.[latestIdx]),
      };
    }
  }

  log('screener', `Parsed: ${result.quarterlyPL.length} Q-periods, ${result.annualPL.length} A-periods`);
  return result;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const symbol = args.find(a => !a.startsWith('--'));
  if (!symbol) {
    process.stderr.write('Usage: node acquire_exchange_data.mjs SYMBOL [--bse-code XXXXXX | --nse-code SYMBOL] [--as-of YYYY-MM-DD] [--dry-run]\n');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  // Accept --bse-code (6-digit numeric) or --nse-code (NSE ticker alias) — both work
  const bseCodeArg = args.includes('--bse-code') ? args[args.indexOf('--bse-code') + 1]
    : args.includes('--nse-code') ? args[args.indexOf('--nse-code') + 1]
    : null;
  const asOfArg = args.includes('--as-of') ? args[args.indexOf('--as-of') + 1] : null;
  const asOf = asOfArg ? new Date(asOfArg) : new Date();

  const today = toBSEDateStr(asOf);
  const date1yAgo = toBSEDateStr(new Date(asOf.getTime() - 365 * 864e5));
  const date6mAgo = toBSEDateStr(new Date(asOf.getTime() - 182 * 864e5));
  const todayISO = toDateStr(asOf);

  const raw = readRaw(symbol);
  // A numeric primary identifier is itself a BSE scrip code.  Alphabetic
  // identifiers are NSE symbols and may be cross-resolved to BSE separately.
  const suppliedBseCode = /^\d{6}$/.test(bseCodeArg ?? '')
    ? bseCodeArg
    : (/^\d{6}$/.test(symbol) ? symbol : null);
  let bseCode = resolveBseCode(raw, suppliedBseCode);

  if (!bseCode) {
    // Auto-resolve: Screener.in embeds the BSE code in the company page
    log('exchange', `BSE code not provided — attempting auto-resolve from Screener.in for ${symbol}`);
    try {
      const html = await fetchText(`https://www.screener.in/company/${symbol}/consolidated/`, 20000);
      const match = html?.match(/BSE[:\s]+(\d{6})/i) ?? html?.match(/"bse_code"\s*:\s*"?(\d{6})"?/i);
      if (match) {
        bseCode = match[1];
        log('exchange', `Auto-resolved BSE code: ${bseCode}`);
      }
    } catch { /* non-fatal — continue without BSE API calls */ }
  }

  if (!bseCode) {
    warn('exchange', `No BSE code found for ${symbol}. BSE-specific API calls will be skipped; Screener.in data still fetched.`);
    // Don't exit — Screener.in works on NSE symbol alone
  }

  log('exchange', `Symbol=${symbol} BSE=${bseCode} asOf=${todayISO} dryRun=${dryRun}`);

  if (!raw.raw) raw.raw = {};
  raw.raw.bseCode = bseCode;

  if (!raw.raw.exchange) raw.raw.exchange = {};
  // Re-running a symbol starts a fresh auditable ledger; stale failures must
  // not be mixed with the current acquisition attempt.
  raw.raw.exchange.sourceLedger = [];

  // ── PRIMARY: Screener.in (public, no auth required) ──────────────────────────
  // BSE api.bseindia.com now returns 403/404; Screener.in is the reliable fallback.
  if (!dryRun) {
    log('exchange', `Fetching Screener.in consolidated page for ${symbol}`);
    const screenerData = await fetchScreenerData(symbol.toUpperCase());
    if (screenerData) {
      if (screenerData.quarterlyPL.length > 0) {
        raw.raw.exchange.quarterlyPL = screenerData.quarterlyPL;
        log('exchange', `  ✓ Screener quarterly P&L: ${screenerData.quarterlyPL.length} periods`);
      }
      if (screenerData.annualPL.length > 0) {
        raw.raw.exchange.annualPL = screenerData.annualPL;
        log('exchange', `  ✓ Screener annual P&L: ${screenerData.annualPL.length} periods`);
      }
      if (Object.keys(screenerData.balanceSheet).length > 2) {
        raw.raw.exchange.balanceSheet = screenerData.balanceSheet;
        log('exchange', `  ✓ Screener balance sheet: ${screenerData.balanceSheet.latestPeriod}`);
      }
      raw.raw.exchange.screenerSource = `https://www.screener.in/company/${symbol.toUpperCase()}/consolidated/`;
    } else {
      warn('exchange', 'Screener.in fetch failed — trying BSE fallback');
    }
  } else {
    log('exchange', 'Dry run: Screener.in fetch skipped; no local evidence will be changed');
  }

  // ── SECONDARY: BSE API (may fail with 403 for newer listings) ────────────────
  const bseBase = 'https://api.bseindia.com/BseIndiaAPI/api';
  const bseHeaders = {
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bseindia.com/',
    'Origin': 'https://www.bseindia.com',
  };

  // Only try BSE endpoints that are most likely to work (announcements, corporate actions)
  const bseEndpoints = bseCode ? [
    {
      key: 'announcements',
      url: `${bseBase}/AnnSubCategoryGetData/w?strCat=-1&strPrevDate=${date1yAgo}&strScrip=${bseCode}&strSearch=P&strToDate=${today}&strType=C`,
      label: 'BSE announcements',
      transform: d => (Array.isArray(d?.Table) ? d.Table.slice(0, 50) : []),
    },
    {
      key: 'corporateActions',
      url: `${bseBase}/CorporateAction/w?scripcode=${bseCode}&flag=C&from_date=${date1yAgo}&to_date=${today}`,
      label: 'BSE corporate actions',
      transform: d => d?.Table || d,
    },
    // Only fetch these if Screener didn't provide them
    ...((!raw.raw.exchange.quarterlyPL || !Array.isArray(raw.raw.exchange.quarterlyPL)) ? [{
      key: 'quarterlyPL',
      url: `${bseBase}/FinancialsQuarterlyConsolidatedResults/w?scripcode=${bseCode}`,
      label: 'BSE quarterly P&L',
    }] : []),
    ...((!raw.raw.exchange.annualPL || !Array.isArray(raw.raw.exchange.annualPL)) ? [{
      key: 'annualPL',
      url: `${bseBase}/FinancialsAnnuallyConsolidatedResults/w?scripcode=${bseCode}`,
      label: 'BSE annual P&L',
    }] : []),
  ] : [];

  for (const ep of bseEndpoints) {
    log('exchange', `Fetching ${ep.label}`);
    if (dryRun) {
      log('exchange', `Dry run: would request ${ep.url}`);
      continue;
    }
    const result = await fetchJSON(ep.url, { headers: bseHeaders });
    raw.raw.exchange.sourceLedger.push({
      provider: 'BSE', endpoint: ep.key, url: ep.url, httpStatus: result.httpStatus,
      status: result.error ? 'SOURCE_UNAVAILABLE' : 'RETRIEVED', error: result.error,
      retrievedAt: new Date().toISOString(),
    });
    if (result.data !== null) {
      raw.raw.exchange[ep.key] = ep.transform ? ep.transform(result.data) : result.data;
      log('exchange', `  ✓ ${ep.label}`);
    } else {
      raw.raw.exchange[ep.key] = raw.raw.exchange[ep.key] ?? null;
    }
  }

  // Extract financial summary from quarterly + annual P&L
  if (!dryRun) {
    raw.raw.exchange.financialSummary = extractFinancialSummary(
      Array.isArray(raw.raw.exchange.quarterlyPL) ? raw.raw.exchange.quarterlyPL : null,
      Array.isArray(raw.raw.exchange.annualPL) ? raw.raw.exchange.annualPL : null
    );
    log('exchange', `Extracted financialSummary: ${raw.raw.exchange.financialSummary.periods.length} periods`);
  }

  if (!dryRun) {
    raw.raw.exchangeAcquiredAt = new Date().toISOString();
    writeRaw(symbol, raw);
    log('exchange', `Saved to ${outputPath(symbol)}`);
  }

  const summary = {
    symbol,
    bseCode,
    acquiredAt: dryRun ? null : raw.raw.exchangeAcquiredAt,
    dryRun,
    keys: Object.keys(raw.raw.exchange),
    announcementsCount: Array.isArray(raw.raw.exchange.announcements) ? raw.raw.exchange.announcements.length : 0,
    financialPeriods: raw.raw.exchange.financialSummary?.periods?.length ?? 0,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch(err => {
  process.stderr.write(`[exchange] FATAL: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
