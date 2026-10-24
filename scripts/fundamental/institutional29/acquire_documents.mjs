#!/usr/bin/env node
/**
 * acquire_documents.mjs
 * Downloads annual reports, concall transcripts, and investor presentations
 * from URLs found in raw.documentUrls, raw.news[], and raw.exchange.announcements[].
 * Extracts key text sections using pdf-parse.
 *
 * Usage:
 *   node acquire_documents.mjs SYMBOL [--max-docs 5] [--as-of YYYY-MM-DD] [--dry-run]
 *
 * Output: merges raw.documents[] into outputs/institutional29/<SYMBOL>/trendlyne_raw.json
 *         PDFs saved to outputs/institutional29/<SYMBOL>/documents/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.cwd();

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_GOVERNANCE_PARSE_BYTES = 200 * 1024;
const MAX_SECTION_CHARS = 3000;

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

function docsDir(symbol) {
  return path.join(PROJECT_ROOT, 'outputs', 'institutional29', symbol, 'documents');
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

function safeFilename(url) {
  return url.split('/').pop().replace(/[?#].*$/, '').replace(/[^\w.-]/g, '_').slice(0, 120) || 'document.pdf';
}

function classifyDocument(url, description = '') {
  const combined = (url + ' ' + description).toLowerCase();
  if (/annual.report|ar\d{2}|annual_report/i.test(combined)) return 'annual_report';
  if (/concall|conference.call|earnings.call/i.test(combined)) return 'concall_transcript';
  if (/investor.pres|presentation|investor_pres/i.test(combined)) return 'investor_presentation';
  if (/result|quarterly|q[1-4]fy/i.test(combined)) return 'quarterly_results';
  return 'other';
}

// ── text section extractors ───────────────────────────────────────────────────

function extractSection(text, headingPattern, maxChars = MAX_SECTION_CHARS) {
  const idx = text.search(headingPattern);
  if (idx === -1) return null;
  return text.slice(idx, idx + maxChars).trim();
}

function extractRevenueTable(text) {
  // Find a block of lines that has revenue/sales keywords alongside numbers
  const lines = text.split('\n');
  const revenueLines = [];
  let capturing = false;
  for (const line of lines) {
    if (/revenue|net sales|total income/i.test(line)) capturing = true;
    if (capturing) {
      revenueLines.push(line);
      if (revenueLines.length > 20) break;
    }
  }
  return revenueLines.join('\n').slice(0, MAX_SECTION_CHARS) || null;
}

function extractSections(text, docType) {
  const sections = {};

  if (docType === 'annual_report' || docType === 'quarterly_results') {
    sections.managementCommentary = extractSection(text, /Dear Shareholders|Management Discussion|MD&A|Management('s)? Discussion/i) ?? null;
    sections.segmentRevenue = extractSection(text, /segment|division|business/i) ?? extractRevenueTable(text);
    sections.riskFactors = extractSection(text, /risk factors|principal risks|key risks/i) ?? null;
    sections.auditorOpinion = (() => {
      const idx = text.search(/Independent Auditor|Auditors' Report/i);
      return idx !== -1 ? text.slice(idx, idx + 500).trim() : null;
    })();
    sections.relatedPartyTransactions = extractSection(text, /Related Party|RPT|transactions with related/i) ?? null;
  }

  if (docType === 'concall_transcript') {
    // Concall transcripts: capture management prepared remarks + Q&A highlights
    sections.concallHighlights = extractSection(text, /Good (morning|afternoon|evening)|Welcome to|Ladies and gentlemen/i) ?? null;
    sections.managementCommentary = extractSection(text, /revenue|guidance|outlook|quarter/i) ?? null;
  }

  if (docType === 'investor_presentation') {
    sections.managementCommentary = extractSection(text, /highlights|key metrics|performance/i) ?? null;
    sections.segmentRevenue = extractRevenueTable(text);
  }

  // Fallback for unclassified docs
  if (!Object.values(sections).some(Boolean)) {
    sections.managementCommentary = text.slice(0, MAX_SECTION_CHARS);
  }

  return sections;
}

function classifyAuditOpinion(text) {
  if (/modified\s+opinion/i.test(text)) return 'MODIFIED_OPINION';
  if (/qualified\s+opinion/i.test(text)) return 'QUALIFIED_OPINION';
  if (/adverse\s+opinion/i.test(text)) return 'ADVERSE_OPINION';
  if (/disclaimer\s+of\s+opinion/i.test(text)) return 'DISCLAIMER_OF_OPINION';
  if (/emphasis\s+of\s+matter/i.test(text)) return 'EMPHASIS_OF_MATTER';
  if (/unmodified\s+opinion|clean\s+opinion/i.test(text)) return 'UNMODIFIED_OPINION';
  return null;
}

function extractGovernance(text) {
  const firstPages = text.split('\n').slice(0, 80).join('\n');
  // Standard CIN format: L/U + 5 digits + 2 letters (state) + 4 digits (year) + 3 letters (category) + 6 digits
  const cin = firstPages.match(/\b([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6})\b/i)?.[1]?.toUpperCase() ?? null;
  const auditorMatch = firstPages.match(/(?:statutory|independent)\s+auditors?\s*[:\-]?\s*(.{3,180})/i);
  return {
    cin,
    auditorName: auditorMatch?.[1]?.split(/\n|\.{2,}/)[0]?.trim() ?? null,
    auditQualification: classifyAuditOpinion(text),
  };
}

// ── PDF download + parse ──────────────────────────────────────────────────────

async function downloadFile(url, destPath, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/pdf,*/*',
        'Referer': 'https://www.bseindia.com/',
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      warn('docs', `${url} → HTTP ${res.status}`);
      return false;
    }

    // Check content-length before downloading
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_FILE_BYTES) {
      warn('docs', `${url} → content-length ${contentLength} exceeds 50 MB limit, skipping`);
      return false;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const fileStream = createWriteStream(destPath);

    // Track bytes written; abort if > 50 MB
    let bytesWritten = 0;
    const body = res.body;
    const reader = body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesWritten += value.length;
      if (bytesWritten > MAX_FILE_BYTES) {
        warn('docs', `${url} → exceeded 50 MB mid-download, aborting`);
        fileStream.close();
        fs.existsSync(destPath) && fs.unlinkSync(destPath);
        return false;
      }
      chunks.push(value);
    }
    fileStream.end(Buffer.concat(chunks));
    await new Promise((resolve, reject) => { fileStream.on('finish', resolve); fileStream.on('error', reject); });
    return true;
  } catch (err) {
    clearTimeout(timer);
    warn('docs', `${url} → ${err.message}`);
    return false;
  }
}

async function parsePdf(filePath) {
  try {
    // Dynamic import — pdf-parse must be installed
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // PDF cross-reference data is usually stored at the end of the file, so
    // truncating bytes makes otherwise valid reports unparsable. Read the PDF
    // intact, then retain at most 10 pages / 200 KB of extracted evidence.
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const chunks = [];
    for (let i = 1; i <= Math.min(numPages, 10); i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      chunks.push(content.items.map(item => item.str).join(' '));
    }
    const text = chunks.join('\n');
    const firstTenPages = chunks.slice(0, 10).join('\n').slice(0, MAX_GOVERNANCE_PARSE_BYTES);
    return { text: firstTenPages, firstTenPages, wordCount: firstTenPages.split(/\s+/).length, pages: numPages };
  } catch (err) {
    warn('docs', `pdf-parse failed for ${filePath}: ${err.message}`);
    return null;
  }
}

// ── URL collection ────────────────────────────────────────────────────────────

const DOCUMENT_URL_PATTERN = /annual.report|concall|transcript|presentation|investor|result|order|award|mou|agm|regulation.30/i;
const ANNOUNCEMENT_CATEGORIES = /annual report|concall|investor presentation|result|award|order|agm/i;

function collectPdfUrls(raw) {
  const urlMap = new Map(); // url → { type, description, date }

  // 1. raw.documentUrls.*
  const docUrls = raw.documentUrls;
  if (docUrls && typeof docUrls === 'object') {
    for (const [key, val] of Object.entries(docUrls)) {
      const url = typeof val === 'string' ? val : val?.url;
      if (url && url.startsWith('http')) {
        urlMap.set(url, { type: classifyDocument(url, key), description: val?.title || key, date: val?.date || null });
      }
    }
  }

  // 2. raw.news[] with pdfUrl — include ALL BSE filing PDFs from news feed
  const news = raw.news ?? [];
  for (const item of news) {
    const pdfUrl = item.pdfUrl || item.pdf_url || item.document_url;
    const desc = item.headline || item.title || '';
    if (pdfUrl && typeof pdfUrl === 'string' && pdfUrl.startsWith('http') && pdfUrl.toLowerCase().includes('.pdf')) {
      urlMap.set(pdfUrl, { type: classifyDocument(pdfUrl, desc), description: desc, date: item.date || null });
    }
  }

  // 3. raw.exchange.announcements[]
  const announcementValue = raw.exchange?.announcements;
  const announcements = Array.isArray(announcementValue) ? announcementValue : Array.isArray(announcementValue?.Table) ? announcementValue.Table : [];
  for (const ann of announcements) {
    const cat = String(ann.SUBCATNAME || ann.CATEGORY || ann.CATEGORY_NAME || '');
    const headline = String(ann.HEADLINE || ann.DESCRIPTION || '');
    const combined = cat + ' ' + headline;
    if (!ANNOUNCEMENT_CATEGORIES.test(combined)) continue;

    for (const field of ['PDFNAME', 'ATTACHMENTNAME', 'FILENAME', 'FILEURL']) {
      const val = ann[field];
      if (typeof val !== 'string' || !val.trim()) continue;
      let url = val.trim();
      if (url.startsWith('/')) url = 'https://www.bseindia.com' + url;
      if (!url.startsWith('http')) continue;
      // Only add PDFs; XBRL XML is handled by acquire_xbrl_financials.mjs
      if (!url.toLowerCase().endsWith('.pdf') && !url.toLowerCase().includes('.pdf')) continue;
      urlMap.set(url, {
        type: classifyDocument(url, combined),
        description: headline || cat,
        date: ann.NEWS_DT || ann.DATETIME || null,
      });
    }
  }

  return urlMap;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const symbol = args.find(a => !a.startsWith('--'));
  if (!symbol) {
    process.stderr.write('Usage: node acquire_documents.mjs SYMBOL [--max-docs 5] [--as-of YYYY-MM-DD] [--dry-run]\n');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const maxDocsArg = args.includes('--max-docs') ? parseInt(args[args.indexOf('--max-docs') + 1], 10) : 5;
  const maxDocs = isNaN(maxDocsArg) ? 5 : maxDocsArg;
  const asOfArg = args.includes('--as-of') ? args[args.indexOf('--as-of') + 1] : null;
  const asOf = asOfArg ? new Date(asOfArg) : new Date();
  const todayISO = toDateStr(asOf);

  log('docs', `Symbol=${symbol} maxDocs=${maxDocs} asOf=${todayISO} dryRun=${dryRun}`);

  const raw = readRaw(symbol);
  const source = raw.raw ?? raw;
  // Prefer the latest BSE annual-report filing already acquired by the exchange step.
  // The filing remains source-traceable; no inferred URL is promoted as evidence.
  const bseCode = source.exchange?.companyMaster?.SCRIPCODE || source.exchange?.companyMaster?.ScripCode || source.exchange?.bseCode;
  if (bseCode && !args.includes('--dry-run')) {
    try {
      const api = `https://api.bseindia.com/BseIndiaAPI/api/annSubCategoryGetData/w?strCat=-1&strPrevDate=&strScrip=${encodeURIComponent(bseCode)}&strSearch=P&strToDate=${todayISO}&strType=C&subcategory=-1`;
      const res = await fetch(api, { headers: { Accept: 'application/json', Referer: 'https://www.bseindia.com/' } });
      if (res.ok) {
        const payload = await res.json();
        for (const item of (payload?.Table ?? payload?.Data ?? [])) {
          const label = `${item.NEWS_SUB ?? item.NEWSSUB ?? ''} ${item.HEADLINE ?? item.HEADLINE_TEXT ?? ''}`;
          const url = item.ATTACHMENTNAME ?? item.PDFNAME ?? item.FILEURL;
          if (/annual report|reg\.?\s*34/i.test(label) && typeof url === 'string' && url) {
            const absolute = url.startsWith('http') ? url : `https://www.bseindia.com${url.startsWith('/') ? '' : '/'}${url}`;
            source.documentUrls = source.documentUrls ?? {};
            source.documentUrls[`bse_annual_report_${item.NEWS_DT ?? todayISO}`] = { url: absolute, title: label, date: item.NEWS_DT ?? null };
            break;
          }
        }
      }
    } catch (err) { warn('docs', `BSE annual-report discovery failed: ${err.message}`); }
  }

  const urlMap = collectPdfUrls(source);
  log('docs', `Found ${urlMap.size} candidate document URLs`);

  if (urlMap.size === 0) {
    log('docs', 'No document URLs found. Ensure prior acquisition modules have run.');
    process.stdout.write(JSON.stringify({ symbol, documentsProcessed: 0 }, null, 2) + '\n');
    return;
  }

  const docsDirPath = docsDir(symbol);
  if (!dryRun) fs.mkdirSync(docsDirPath, { recursive: true });

  const documents = [];
  let processed = 0;

  for (const [url, meta] of urlMap) {
    if (processed >= maxDocs) break;

    const filename = safeFilename(url);
    const localPath = path.join(docsDirPath, filename);
    const relPath = path.relative(PROJECT_ROOT, localPath);

    log('docs', `[${processed + 1}/${maxDocs}] ${meta.type}: ${url}`);

    if (dryRun) {
      documents.push({ type: meta.type, title: meta.description, date: meta.date, url, localPath: relPath, _dryRun: true });
      processed++;
      continue;
    }

    // Skip if already downloaded
    let alreadyDownloaded = fs.existsSync(localPath);
    if (!alreadyDownloaded) {
      const ok = await downloadFile(url, localPath);
      if (!ok) {
        warn('docs', `Failed to download ${url}, skipping`);
        continue;
      }
    } else {
      log('docs', `  Using cached ${filename}`);
    }

    const parsed = await parsePdf(localPath);
    if (!parsed) {
      warn('docs', `Failed to parse PDF ${filename}, keeping file but skipping section extract`);
      documents.push({
        type: meta.type,
        title: meta.description,
        date: meta.date,
        url,
        localPath: relPath,
        extractedSections: {},
        wordCount: 0,
        parseError: true,
        extractedAt: new Date().toISOString(),
      });
      processed++;
      continue;
    }

    const extractedSections = extractSections(parsed.text, meta.type);
    const governance = meta.type === 'annual_report' ? extractGovernance(parsed.firstTenPages) : { cin: null, auditorName: null, auditQualification: null };
    log('docs', `  Extracted sections: ${Object.keys(extractedSections).filter(k => extractedSections[k]).join(', ')}`);

    documents.push({
      type: meta.type,
      title: meta.description,
      date: meta.date,
      url,
      localPath: relPath,
      extractedSections,
      governance,
      wordCount: parsed.wordCount,
      pages: parsed.pages,
      extractedAt: new Date().toISOString(),
    });
    processed++;
  }

  source.documents = documents;

  // Merge governance findings from the first annual report into source.mca
  // so build_unified_evidence can read CIN, auditorName, auditQualification
  const annualReportDoc = documents.find(d => d.type === 'annual_report' && d.governance);
  if (annualReportDoc?.governance) {
    const g = annualReportDoc.governance;
    source.mca = source.mca ?? {};
    if (g.cin && !source.mca.cin) source.mca.cin = g.cin;
    if (g.auditorName && !source.mca.auditorName) source.mca.auditorName = g.auditorName;
    if (g.auditQualification && !source.mca.auditQualification) source.mca.auditQualification = g.auditQualification;
    log('docs', `Governance merged → CIN=${g.cin ?? 'not found'} auditor=${g.auditorName ?? 'not found'} opinion=${g.auditQualification ?? 'not found'}`);
  }

  writeRaw(symbol, raw);
  log('docs', `Saved ${documents.length} document records to ${outputPath(symbol)}`);

  const summary = {
    symbol,
    documentsProcessed: documents.length,
    byType: Object.fromEntries(
      ['annual_report', 'concall_transcript', 'investor_presentation', 'quarterly_results', 'other']
        .map(t => [t, documents.filter(d => d.type === t).length])
    ),
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch(err => {
  process.stderr.write(`[docs] FATAL: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
