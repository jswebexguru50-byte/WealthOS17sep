#!/usr/bin/env node
/**
 * acquire_mca_company_data.mjs
 * Fetches company registration and director data from MCA21 and related sources.
 * CIN discovery priority: BSE company master → NSE → annual report text → MCA portal.
 *
 * Usage:
 *   node acquire_mca_company_data.mjs SYMBOL [--as-of YYYY-MM-DD] [--dry-run]
 *
 * Output: merges raw.mca into outputs/institutional29/<SYMBOL>/trendlyne_raw.json
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

function sourceRoot(raw) { return raw.raw ?? raw; }
function announcementRows(raw) {
  const value = sourceRoot(raw).exchange?.announcements;
  return Array.isArray(value) ? value : Array.isArray(value?.Table) ? value.Table : [];
}

function writeRaw(symbol, raw) {
  const p = outputPath(symbol);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(raw, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

async function fetchJSON(url, opts = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ...opts.headers,
  };
  try {
    const res = await fetch(url, { signal: controller.signal, headers, ...opts });
    clearTimeout(timer);
    if (!res.ok) {
      warn('mca', `${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    warn('mca', `${url} → ${err.message}`);
    return null;
  }
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    warn('mca', `fetchText ${url} → ${err.message}`);
    return null;
  }
}

// ── CIN patterns ──────────────────────────────────────────────────────────────

// CIN format: L/U + 5 digits + 2 letters + 4 digits + PLC/LLC/NPL/OPC + 6 digits
// e.g. L17110MH1973PLC019786
const CIN_REGEX = /\b([LU]\d{5}[A-Z]{2}\d{4}(?:PLC|PTC|LLC|NPL|OPC|FLC|GOI|SGC|GAP|GAT|GAM|GAL)\d{6})\b/;

function extractCIN(text) {
  if (!text) return null;
  const match = CIN_REGEX.exec(text);
  return match ? match[1] : null;
}

// ── CIN discovery strategy ────────────────────────────────────────────────────

function cinFromBseMaster(raw) {
  const master = sourceRoot(raw).exchange?.companyMaster;
  if (!master) return null;
  // BSE company master field names vary
  const candidates = [master.CIN_NUMBER, master.CIN, master.cin, master.CIN_NO];
  for (const c of candidates) {
    if (typeof c === 'string' && CIN_REGEX.test(c)) return c;
  }
  // Try extracting from stringified master in case it's embedded
  return extractCIN(JSON.stringify(master));
}

function cinFromDocuments(raw) {
  const docs = sourceRoot(raw).documents ?? [];
  for (const doc of docs) {
    const embeddedCin = extractCIN(JSON.stringify(doc.governance ?? {}));
    if (embeddedCin) return embeddedCin;
    const sections = doc.extractedSections ?? {};
    for (const text of Object.values(sections)) {
      if (!text) continue;
      const cin = extractCIN(text);
      if (cin) return cin;
    }
  }
  return null;
}

function cinFromXbrl(raw) {
  // XBRL facts sometimes contain CIN in entity identifier context
  const xbrlStr = JSON.stringify(sourceRoot(raw).xbrl ?? {});
  return extractCIN(xbrlStr);
}

function cinFromAnnouncements(raw) {
  const announcements = announcementRows(raw);
  for (const ann of announcements) {
    const cin = extractCIN(JSON.stringify(ann));
    if (cin) return cin;
  }
  return null;
}

// ── MCA portal data ───────────────────────────────────────────────────────────

async function fetchMcaPortalData(cin) {
  // MCA21 v3 public company master endpoint — works without login for public company data
  // If blocked, returns null gracefully
  const url = `https://www.mca.gov.in/mcafoportal/viewCompanyMasterData.do`;
  log('mca', `Attempting MCA portal POST for CIN=${cin}`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
        'Referer': 'https://www.mca.gov.in/',
      },
      body: `companyID=${encodeURIComponent(cin)}`,
    });
    clearTimeout(timer);
    if (!res.ok) {
      warn('mca', `MCA portal → HTTP ${res.status}`);
      return null;
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('json')) return await res.json();
    // HTML response — try to extract key fields
    const html = await res.text();
    return parseMcaHtml(html, cin);
  } catch (err) {
    warn('mca', `MCA portal POST → ${err.message}`);
    return null;
  }
}

function parseMcaHtml(html, cin) {
  if (!html || html.length < 100) return null;
  // MCA pages embed data in table cells — extract with regex
  const extract = (pattern) => {
    const m = html.match(pattern);
    return m ? m[1].replace(/<[^>]+>/g, '').trim() : null;
  };

  return {
    cin,
    companyName: extract(/Company Name[^<]*<[^>]+>([^<]+)/i),
    registeredOffice: extract(/Registered Address[^<]*<[^>]+>([^<]{10,200})/i),
    dateOfIncorporation: extract(/Date of Incorporation[^<]*<[^>]+>([^<]+)/i),
    authorizedCapital: extract(/Authorized Capital[^<]*<[^>]+>([^<]+)/i),
    paidUpCapital: extract(/Paid Up Capital[^<]*<[^>]+>([^<]+)/i),
    lastFiledAnnualReturn: extract(/Annual Return[^<]*<[^>]+>([^<]+)/i),
    source: 'MCA_portal_html',
  };
}

// ── Director extraction from announcements ────────────────────────────────────

function extractDirectors(raw) {
  const announcements = announcementRows(raw);
  const directors = [];
  const seen = new Set();

  for (const ann of announcements) {
    const cat = String(ann.SUBCATNAME || ann.CATEGORY || '');
    const headline = String(ann.HEADLINE || ann.DESCRIPTION || '');
    if (!/director|KMP|key managerial|appointment|resignation|board/i.test(cat + ' ' + headline)) continue;

    // Try to extract director name from headline
    // Patterns: "Appointment of Mr. XYZ as Director", "Resignation of Ms. ABC"
    const nameMatch = headline.match(/(?:appointment|resignation|cessation|change)\s+of\s+(?:Mr\.|Ms\.|Mrs\.|Dr\.)?\s*([A-Z][a-zA-Z\s]+?)(?:\s+as\s+|\s+from\s+|,|\.|$)/i);
    const roleMatch = headline.match(/(?:as|of)\s+((?:Managing Director|MD|CEO|CFO|Director|Independent Director|Whole.time Director|KMP|Company Secretary)[a-zA-Z\s]*)/i);

    const name = nameMatch?.[1]?.trim();
    const designation = roleMatch?.[1]?.trim() || 'Director';

    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    directors.push({
      name,
      designation,
      appointedOn: ann.NEWS_DT || ann.DATETIME || null,
      announcementHeadline: headline.slice(0, 200),
    });
  }

  return directors;
}

function auditorFromDocuments(raw) {
  const docs = sourceRoot(raw).documents ?? [];
  for (const doc of docs) {
    if (doc.governance?.auditorName) return doc.governance.auditorName;
    const text = doc.extractedSections?.auditorOpinion ?? '';
    const match = text.match(/M\/s\.\s*([^,\n]{5,80}),?\s*Chartered Accountants/i);
    if (match) return match[1].trim();
  }
  return null;
}

// ── BSE master field extraction ───────────────────────────────────────────────

function extractBseMasterFields(master) {
  if (!master || typeof master !== 'object') return {};
  return {
    companyName: master.COMPANYNAME || master.CompanyName || master.LONG_NAME || null,
    registeredOffice: master.REGD_OFFICE || master.REG_OFFICE || master.ADDRESS || null,
    dateOfIncorporation: master.DATE_OF_INCORP || master.INCORP_DATE || null,
    authorizedCapital: master.AUTH_CAPITAL || master.AUTHORISED_CAPITAL || null,
    paidUpCapital: master.PAID_UP_CAPITAL || master.PAID_CAPITAL || null,
    sector: master.SECTOR || master.INDUSTRY || null,
    isin: master.ISIN_CODE || master.ISIN || null,
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const symbol = args.find(a => !a.startsWith('--'));
  if (!symbol) {
    process.stderr.write('Usage: node acquire_mca_company_data.mjs SYMBOL [--as-of YYYY-MM-DD] [--dry-run]\n');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const asOfArg = args.includes('--as-of') ? args[args.indexOf('--as-of') + 1] : null;
  const asOf = asOfArg ? new Date(asOfArg) : new Date();
  const todayISO = toDateStr(asOf);

  log('mca', `Symbol=${symbol} asOf=${todayISO} dryRun=${dryRun}`);

  const raw = readRaw(symbol);
  const target = sourceRoot(raw);

  // ── CIN discovery ────────────────────────────────────────────────────────────

  let cin = null;
  let cinSource = null;

  // Strategy 1: BSE company master
  cin = cinFromBseMaster(raw);
  if (cin) { cinSource = 'BSE_master'; log('mca', `CIN from BSE master: ${cin}`); }

  // Strategy 2: XBRL data
  if (!cin) {
    cin = cinFromXbrl(raw);
    if (cin) { cinSource = 'XBRL_data'; log('mca', `CIN from XBRL: ${cin}`); }
  }

  // Strategy 3: Document extracted text
  if (!cin) {
    cin = cinFromDocuments(raw);
    if (cin) { cinSource = 'annual_report_extract'; log('mca', `CIN from document text: ${cin}`); }
  }

  // Strategy 4: Announcements
  if (!cin) {
    cin = cinFromAnnouncements(raw);
    if (cin) { cinSource = 'BSE_announcements'; log('mca', `CIN from announcements: ${cin}`); }
  }

  if (!cin) {
    warn('mca', `No CIN found from any source for ${symbol}`);
    target.mca = {
      cin: null,
      source: 'NOT_FOUND',
      note: 'Chrome MCA portal scrape required',
      acquiredAt: new Date().toISOString(),
    };
    writeRaw(symbol, raw);
    process.stdout.write(JSON.stringify({ symbol, cin: null, cinSource: 'NOT_FOUND' }, null, 2) + '\n');
    return;
  }

  // ── MCA portal fetch ──────────────────────────────────────────────────────────

  let mcaPortalData = null;
  if (!dryRun) {
    mcaPortalData = await fetchMcaPortalData(cin);
    if (mcaPortalData) {
      log('mca', `MCA portal data retrieved`);
    } else {
      log('mca', `MCA portal unavailable — using BSE master fields only`);
    }
  }

  // ── Build mca object ──────────────────────────────────────────────────────────

  const bseFields = extractBseMasterFields(sourceRoot(raw).exchange?.companyMaster);
  const directors = extractDirectors(raw);
  log('mca', `Extracted ${directors.length} director records from announcements`);

  target.mca = {
    cin,
    // Prefer MCA portal data, fall back to BSE master
    companyName: mcaPortalData?.companyName || bseFields.companyName || null,
    registeredOffice: mcaPortalData?.registeredOffice || bseFields.registeredOffice || null,
    dateOfIncorporation: mcaPortalData?.dateOfIncorporation || bseFields.dateOfIncorporation || null,
    authorizedCapital: mcaPortalData?.authorizedCapital || bseFields.authorizedCapital || null,
    paidUpCapital: mcaPortalData?.paidUpCapital || bseFields.paidUpCapital || null,
    auditorName: auditorFromDocuments(raw),
    sector: bseFields.sector || null,
    isin: bseFields.isin || null,
    directors,
    lastFiledAnnualReturn: mcaPortalData?.lastFiledAnnualReturn || null,
    source: mcaPortalData ? `MCA_portal + ${cinSource}` : cinSource,
    acquiredAt: new Date().toISOString(),
  };

  writeRaw(symbol, raw);
  log('mca', `Saved MCA data to ${outputPath(symbol)}`);

  const summary = {
    symbol,
    cin,
    cinSource,
    mcaPortalReached: !!mcaPortalData,
    directorsFound: directors.length,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch(err => {
  process.stderr.write(`[mca] FATAL: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
