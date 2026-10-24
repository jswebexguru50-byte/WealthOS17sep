#!/usr/bin/env node
/**
 * build_unified_evidence.mjs — Step 7: Builds evidence_bundle.json from trendlyne_raw.json
 *
 * Reads all acquired data and organises it by the 29 research contract questions,
 * adding a flat financials summary, shareholding, technicals, and governance blocks.
 *
 * Usage:
 *   node build_unified_evidence.mjs SYMBOL [--as-of YYYY-MM-DD] [--dry-run]
 *
 * Input:  outputs/institutional29/<SYMBOL>/trendlyne_raw.json
 * Output: outputs/institutional29/<SYMBOL>/evidence_bundle.json
 */

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { RESEARCH_QUESTIONS } from './contract.mjs';

// ─── CLI ──────────────────────────────────────────────────────────────────────
const cliArgs = process.argv.slice(2);
const symbol = cliArgs.find(a => !a.startsWith('--'))?.toUpperCase();
if (!symbol) throw new Error('Usage: node build_unified_evidence.mjs SYMBOL [--as-of YYYY-MM-DD]');

const asOfIdx = cliArgs.indexOf('--as-of');
const asOf = asOfIdx >= 0 ? cliArgs[asOfIdx + 1] : new Date().toISOString().slice(0, 10);
const DRY_RUN = cliArgs.includes('--dry-run');

// ─── Paths ────────────────────────────────────────────────────────────────────
const root = process.cwd();
const rawPath = path.resolve(root, 'outputs', 'institutional29', symbol, 'trendlyne_raw.json');
const outPath = path.resolve(root, 'outputs', 'institutional29', symbol, 'evidence_bundle.json');

if (!fs.existsSync(rawPath)) throw new Error(`trendlyne_raw.json not found: ${rawPath}\nRun acquisition steps 1–6 first.`);

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

// Canonical FERE facts are the durable, verified form of the exchange XBRL
// archive.  Read them back into the dossier so a successfully promoted filing
// is actually used, rather than repeatedly relying on a transient raw cache.
const canonicalFereFacts = await new Promise((resolve) => {
  const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db'))
    .replace(/^sqlite:\/\//, '');
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (openError) => {
    if (openError) resolve([]);
  });
  const asOfEnd = `${asOf}T23:59:59.999Z`;
  db.all(`
    SELECT metric, value, unit, periodType, periodStart, periodEnd, scope,
           sourceUrl, sourceDocumentId, availableAt, provider, verificationStatus
    FROM company_facts
    WHERE upper(symbol)=? AND provider='FERE_NSE_XBRL'
      AND verificationStatus='VERIFIED' AND availabilityStatus='AVAILABLE'
      AND (availableAt IS NULL OR availableAt <= ?)
    ORDER BY CASE upper(scope) WHEN 'CONSOLIDATED' THEN 0 ELSE 1 END,
             periodEnd DESC, availableAt DESC
  `, [symbol, asOfEnd], (error, rows) => {
    db.close();
    resolve(error ? [] : (rows ?? []));
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
// raw.metrics values are [{value, period, source}] arrays — unwrap first element
const unwrap = (v) => Array.isArray(v)
  ? (v[0]?.status === 'RETRIEVED_UNPROMOTED_OBSERVATION' && v[0]?.unit === 'UNKNOWN' ? null : v[0]?.value) : v;
const n = (v) => { const u = unwrap(v); return (u != null && u !== '' && !isNaN(Number(u))) ? Number(u) : null; };
const s = (v) => { const u = unwrap(v); return (u != null && u !== '') ? String(u) : null; };
// Provider parameter observations retain an explicit retrieval status even
// when the display label does not provide a machine-readable unit.  Use them
// only for fields whose requested token defines the unit and period.
const providerMetricNumber = (metric) => {
  const observation = Array.isArray(metric) ? metric[0] : metric;
  if (observation?.status !== 'RETRIEVED_UNPROMOTED_OBSERVATION') return null;
  const value = Number(observation.value);
  return Number.isFinite(value) ? value : null;
};

/** Best-available value: try multiple key paths in order, return first non-null. */
function pick(...vals) {
  for (const v of vals) if (v != null && v !== '') return v;
  return null;
}

/** Keyword filter for news/events arrays. */
function filterByKeywords(arr, keywords) {
  if (!Array.isArray(arr) || !keywords?.length) return [];
  const kw = keywords.map(k => k.toLowerCase());
  return arr.filter(item => {
    const text = JSON.stringify(item).toLowerCase();
    return kw.some(k => text.includes(k));
  });
}

/** Extract relevant document sections for a question. */
function filterDocuments(docs, documentQueries) {
  if (!Array.isArray(docs) || !documentQueries?.length) return [];
  const kw = documentQueries.flatMap(q => q.toLowerCase().split(/\s+/));
  return docs
    .filter(doc => {
      const sections = doc.extractedSections ?? {};
      const text = Object.values(sections).join(' ').toLowerCase();
      return kw.some(k => text.includes(k));
    })
    .map(doc => ({
      type: doc.type,
      title: doc.title,
      date: doc.date,
      sourceUrl: doc.sourceUrl || doc.url || null,
      contentSha256: doc.contentSha256 || null,
      providerDocumentId: doc.providerDocumentId || null,
      identityVerified: doc.identityVerified ?? null,
      provenanceStatus: doc.provenanceStatus || null,
      sections: Object.fromEntries(
        Object.entries(doc.extractedSections ?? {}).filter(([, v]) => v?.length > 0)
      ),
    }));
}

// ─── Source availability flags ────────────────────────────────────────────────
// raw.raw houses exchange/xbrl/mca data acquired by separate pipeline steps
const exchange = raw.raw?.exchange ?? raw.exchange ?? {};
const mca = raw.raw?.mca ?? raw.mca ?? {};
const xbrlData = raw.raw?.xbrl ?? raw.xbrl ?? {};
const xbrlFacts = Array.isArray(xbrlData.facts) ? xbrlData.facts : Object.values(xbrlData.facts ?? {});
const docs = Array.isArray(raw.documents) && raw.documents.length > 0
  ? raw.documents
  : (raw.raw?.documents ?? []);
// raw.metrics has pre-resolved scalar financials; raw.fundamentals is legacy (often empty)
const metrics = raw.metrics ?? {};
const fundamentals = raw.fundamentals ?? {};  // kept for backwards compat
const tech = raw.technical ?? {};
const stockSummary = raw.stockSummary ?? {};
const datav2 = raw.datav2 ?? {};
const news = raw.news ?? [];
const events = raw.events ?? [];

// ─── Page text helpers ────────────────────────────────────────────────────────
/** Extract a named section from the Trendlyne pipe-table text result. */
function extractPageSection(pageKey, sectionName) {
  const pageResult = raw.pages?.[pageKey]?.data?.result;
  if (typeof pageResult !== 'string') return null;
  const idx = pageResult.indexOf(sectionName + ':');
  if (idx === -1) return null;
  // Take up to 4000 chars from that section
  return pageResult.slice(idx, idx + 4000);
}

/** Parse quarterly holding series from shBarChartData text. Returns [{quarter, pct}] */
function parseShBarChartSeries(text, holderName) {
  if (!text) return [];
  const re = new RegExp(holderName + ':\\s*([\\s\\S]*?)(?=\\n  \\w|$)', 'i');
  const m = text.match(re);
  if (!m) return [];
  const rows = [];
  // Each row looks like: ["Jun 2024", 70.0, "70.0 %", ...]
  const rowRe = /\["([^"]+)",\s*([\d.]+)/g;
  let rm;
  rowRe.lastIndex = 0;
  const chunk = m[1];
  while ((rm = rowRe.exec(chunk)) !== null) {
    if (rm[1] !== 'Quarter') rows.push({ quarter: rm[1], pct: Number(rm[2]) });
  }
  return rows;
}

/** Extract all JSON-like array rows for a data table section. */
function parsePageTableRows(text, sectionName) {
  if (!text) return [];
  const idx = text.indexOf(sectionName + ':');
  if (idx === -1) return [];
  const chunk = text.slice(idx, idx + 3000);
  const rows = [];
  const rowRe = /\[([^\]]+)\]/g;
  let m;
  while ((m = rowRe.exec(chunk)) !== null) {
    const cells = m[1].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    rows.push(cells);
  }
  return rows;
}

// ─── Parse shareholding history from pages ────────────────────────────────────
const overviewText = raw.pages?.OVERVIEW_EVENTS_OVERVIEW?.data?.result ?? '';
const ownershipText = raw.pages?.OWNERSHIP_SHAREHOLDING?.data?.result ?? '';
const eventsText = raw.pages?.OVERVIEW_EVENTS_EVENTS?.data?.result ?? '';
const swotIdx = overviewText.indexOf('SWOTData:');
const swotText = swotIdx >= 0 ? overviewText.slice(swotIdx) : '';
const checklistText = overviewText.includes('investmentChecklist') ? overviewText.slice(overviewText.indexOf('investmentChecklist'), overviewText.indexOf('investmentChecklist') + 600) : '';

// DVM classification from stockData line (e.g. "Strong Performer, Under Radar")
const stockDataLine = (overviewText.match(/stockData:\s*\n?\s*([^\n]+)/)?.[1] ?? '');
const dvmClassMatch = stockDataLine.match(/(Strong|Quality|High|Rising)\s+\w+[^,]*,\s+(?:Under Radar|Trending|Watch|Watchlist)/i);
const dvmClassification = dvmClassMatch?.[0]?.trim() ?? null;

// LTP from stockData line — value immediately before the ISO date
const ltpFromPage = stockDataLine.match(/,\s*([\d.]+),\s*\d{4}-\d{2}-\d{2}T/)?.[1];

const buySellMatch = overviewText.match(/buy_sell_value:\s*([\d.]+)[\s\S]*?insight:\s*([^\n]+)/);
const buySellScore = buySellMatch ? { score: Number(buySellMatch[1]), label: buySellMatch[2].trim() } : null;
const fundamentalDataText = overviewText.includes('fundamentalData:') ? overviewText.slice(overviewText.indexOf('fundamentalData:'), overviewText.indexOf('fundamentalData:') + 2000) : '';

// Sector / industry identity
const sectorName = overviewText.match(/sectorName:\s*([^\n]+)/)?.[1]?.trim() ?? null;
const industryName = overviewText.match(/industryName:\s*([^\n]+)/)?.[1]?.trim() ?? null;

// Company description from corporateInfo block
const corpInfoMatch = overviewText.match(/companyInfo:\s*([^\n]{50,})/);
const companyDescription = corpInfoMatch?.[1]?.trim()
  ?? raw.companyDescription ?? raw.companyInfo ?? null;

// Revenue growth context from fundamentalData text
const revGrowthMatch = fundamentalDataText.match(/Op Revenue TTM[^\n]+?([\d.]+)%\s+incr/i);
const patGrowthMatch = fundamentalDataText.match(/Net Profit TTM[^\n]+?([\d.]+)%\s+incr/i);
const cfoGrowthMatch = fundamentalDataText.match(/Cash From Operating Activity[^\n]+?([\d.]+)%\s+incr/i);
const revGrowthPct = revGrowthMatch ? Number(revGrowthMatch[1]) : null;
const patGrowthPct = patGrowthMatch ? Number(patGrowthMatch[1]) : null;
const cfoGrowthPct = cfoGrowthMatch ? Number(cfoGrowthMatch[1]) : null;

// Promoter locked % changes (pledge = 0, locked was 100% then cleared Dec 2025)
const promoterSeries = parseShBarChartSeries(overviewText, 'Promoter');
const fiiSeries = parseShBarChartSeries(overviewText, 'FII');
const mfSeries = parseShBarChartSeries(overviewText, 'MF');
const diiSeries = parseShBarChartSeries(overviewText, 'DII');
const publicSeries = parseShBarChartSeries(overviewText, 'Public');

// Build merged shareholding history — text order is already oldest→newest; no reverse
const shQuarters = promoterSeries.map((p, i) => ({
  period: p.quarter,
  promoter: p.pct,
  fii: fiiSeries[i]?.pct ?? null,
  mf: mfSeries[i]?.pct ?? null,
  dii: diiSeries[i]?.pct ?? null,
  public: publicSeries[i]?.pct ?? null,
  pledge: null, // An unreported historical pledge is not a disclosed zero.
}));

const shareholdingHistory = shQuarters.length > 0 ? shQuarters
  : (() => {
      // Fallback: legacy raw.shareholdingHistory
      if (Array.isArray(raw.shareholdingHistory)) return raw.shareholdingHistory;
      return Object.entries(raw.shareholdingHistory ?? {}).map(([holder, rows]) =>
        Array.isArray(rows) ? rows.map(r => ({ holder, ...r })) : []
      ).flat();
    })();

// Promoter / institutional identity
const promoterNameMatch = ownershipText.match(/PromoterData[\s\S]*?tableData:\s*\["([^"]+)"/);
const promoterEntityName = promoterNameMatch?.[1] ?? null;
const instNameMatch = ownershipText.match(/InstitutionalData[\s\S]*?tableData:\s*\["([^"]+)"/);
const institutionalHolderName = instNameMatch?.[1] ?? null;
const publicHolderMatch = ownershipText.match(/PublicData[\s\S]*?tableData:\s*((?:\["[^"]+",[\d.,\s]+\][,\s]*)+)/);
const publicHoldersText = publicHolderMatch?.[1] ?? '';
const publicHolderRows = [];
const phr = /\["([^"]+)",\s*([\d.]+)/g;
let phrm;
while ((phrm = phr.exec(publicHoldersText)) !== null) publicHolderRows.push({ name: phrm[1], pct: Number(phrm[2]) });

// Dividend history from events page
const dividendRows = [];
const divRe = /(\d{4}-\d{2}-\d{2})\s*\|\s*([\d.]+)\s*\|\s*(\w+)/g;
let dMatch;
const divSection = eventsText.includes('dividend:') ? eventsText.slice(eventsText.indexOf('dividend:'), eventsText.indexOf('dividend:') + 1000) : '';
while ((dMatch = divRe.exec(divSection)) !== null) {
  dividendRows.push({ exDate: dMatch[1], amountPerShare: Number(dMatch[2]), type: dMatch[3] });
}

// Board meeting history
const boardMeetRows = [];
const boardSection = eventsText.includes('boardMeeting:') ? eventsText.slice(eventsText.indexOf('boardMeeting:'), eventsText.indexOf('boardMeeting:') + 1500) : '';
const boardRe = /(\d{4}-\d{2}-\d{2})\s*\|\s*([^\n|]+)/g;
let bm;
while ((bm = boardRe.exec(boardSection)) !== null) boardMeetRows.push({ date: bm[1], purpose: bm[2].trim() });

// SWOT: extract screen titles from [id,"title","description","insight","color"] rows
function extractSwotTitles(sectionText) {
  const titles = [];
  // Each row: [number,"Title with text","Description...","insight","color"]
  const re = /\[\d+,"([^"]{15,150})"/g;
  let m;
  while ((m = re.exec(sectionText)) !== null) {
    if (!titles.includes(m[1])) titles.push(m[1]);
    if (titles.length >= 12) break;
  }
  return titles;
}
const strengthsSectionStart = swotText.indexOf('strengths:');
const weaknessesSectionStart = swotText.indexOf('weaknesses:');
const oppSectionStart = swotText.indexOf('opportunities:');
const strengthsSection = strengthsSectionStart >= 0
  ? swotText.slice(strengthsSectionStart, weaknessesSectionStart >= 0 ? weaknessesSectionStart : strengthsSectionStart + 3000)
  : '';
const weaknessesSection = weaknessesSectionStart >= 0
  ? swotText.slice(weaknessesSectionStart, oppSectionStart >= 0 ? oppSectionStart : weaknessesSectionStart + 1000)
  : '';
const oppSection = oppSectionStart >= 0 ? swotText.slice(oppSectionStart, oppSectionStart + 1000) : '';
const swotStrengthTitles = extractSwotTitles(strengthsSection);
const swotWeaknessTitles = extractSwotTitles(weaknessesSection);
const swotOpportunityTitles = extractSwotTitles(oppSection);

// Auditor name from annual report extracted sections
const arDoc = docs.find(d => d.type === 'annual_report');
const arAuditText = arDoc?.extractedSections?.auditorOpinion ?? '';
const auditorMatch = arAuditText.match(/M\/s\.\s*([^,\n]{5,50}),\s*Chartered Accountants/i)
  ?? arAuditText.match(/([A-Z][a-z]+\s+(?:&|and)\s+[A-Z][a-z.]+),?\s*Chartered Accountants/i);
const auditorName = auditorMatch?.[1]?.trim() ?? mca.auditorName ?? arDoc?.governance?.auditorName ?? null;
const hasNoAuditQualification = /no qualif|unmodified opinion/i.test(arAuditText);

// Investment checklist
const checklistMatch = checklistText.match(/insight:\s*([^\n]+)/);
const checklistPassMatch = checklistText.match(/positivesNum:\s*(\d+)/);
const checklistTotalMatch = checklistText.match(/total:\s*(\d+)/);
const checklistInsight = checklistMatch?.[1]?.trim() ?? null;
const checklistPassed = checklistPassMatch ? Number(checklistPassMatch[1]) : null;
const checklistTotal = checklistTotalMatch ? Number(checklistTotalMatch[1]) : null;

// Order receipts from news (all "Order" or "Award of Order" items)
const orderNews = news.filter(item => {
  const text = (item.headline || item.title || item.description || '').toLowerCase();
  return /order|award|mou|contract/i.test(text);
});

const sources = {
  trendlyneMCP: !!(raw.pages && Object.keys(raw.pages).length),
  exchangeAPI: !!(exchange.companyMaster || exchange.quarterlyPL),
  xbrlFacts: xbrlFacts.length,
  canonicalFereFacts: canonicalFereFacts.length,
  documentsExtracted: docs.length,
  mcaData: !!(mca.cin || mca.directors?.length),
};

// ─── Company identity ─────────────────────────────────────────────────────────
const companyName = s(pick(
  stockSummary.name,
  exchange.companyMaster?.companyName,
  exchange.companyMaster?.SCRIP_NAME,
  symbol
));
const bseCode = s(pick(raw.raw?.bseCode, exchange.companyMaster?.SECURITY_CODE, exchange.companyMaster?.bseCode));
const cin = s(mca.cin ?? exchange.companyMaster?.CIN ?? raw.cin);

// ─── Financials: flat summary ─────────────────────────────────────────────────
// Quarterly P&L from exchange (last 8 quarters) — from Screener.in or BSE
const qPL = Array.isArray(exchange.quarterlyPL) ? exchange.quarterlyPL : [];
// Screener returns oldest→newest; slice last 8 for most recent quarters
const quarterlyRevenue = qPL.slice(-8).map(q => ({
  period: s(q.period ?? q.PERIOD),
  revenue_cr: n(q.revenue_cr ?? q.revenue ?? q.NET_SALES ?? q.TOTAL_INCOME),
  pat_cr: n(q.pat_cr ?? q.pat ?? q.NET_PROFIT),
  opm_pct: n(q.opm_pct ?? q.opm ?? q.OPM),
}));

// Annual P&L (last 5 years, excluding TTM) — from Screener.in or BSE
const aPL = Array.isArray(exchange.annualPL)
  ? exchange.annualPL.filter(a => !/TTM/i.test(s(a.period ?? a.PERIOD ?? '')))
  : [];
const annualRevenue = aPL.slice(-5).map(a => ({
  fy: s(a.period ?? a.PERIOD ?? a.FY),
  revenue_cr: n(a.revenue_cr ?? a.revenue ?? a.NET_SALES ?? a.TOTAL_INCOME),
  pat_cr: n(a.pat_cr ?? a.pat ?? a.NET_PROFIT),
  cfo_cr: n(a.cfo_cr ?? a.cfo ?? a.CASH_FROM_OPERATIONS),
  capex_cr: n(a.capex_cr ?? a.capex ?? a.CAPITAL_EXPENDITURE),
  opm_pct: n(a.opm_pct ?? a.opm ?? a.OPM),
}));

const bs = (typeof exchange.balanceSheet === 'object' && !Array.isArray(exchange.balanceSheet))
  ? exchange.balanceSheet : {};
const cf = exchange.cashFlow ?? {};
const fs_summary = exchange.financialSummary ?? {};

function xbrlFact(conceptName) {
  if (!Array.isArray(xbrlFacts)) return null;
  const f = xbrlFacts.find(f => String(f.concept ?? f.tag ?? f.rawTag ?? '').toLowerCase().includes(conceptName.toLowerCase()));
  return f ? n(f.value) : null;
}

function canonicalFereFact(metric, preferredPeriodTypes = []) {
  const candidates = canonicalFereFacts.filter((fact) => fact.metric === metric);
  const preferred = preferredPeriodTypes.length
    ? candidates.filter((fact) => preferredPeriodTypes.includes(fact.periodType))
    : candidates;
  return n((preferred[0] ?? candidates[0])?.value);
}

// raw.metrics has the correct pre-resolved scalars from the MCP overview call
const financials = {
  revenueTTM_cr: n(pick(metrics.revenue_cr_ttm, fundamentals.SR_TTM, fs_summary.revenue)),
  patTTM_cr: n(pick(metrics.pat_cr_ttm, fundamentals.NP_TTM, fs_summary.pat)),
  cfoAnnual_cr: n(pick(canonicalFereFact('cfo', ['ANNUAL']), metrics.cfo_cr_annual, providerMetricNumber(metrics.cfoa), fundamentals.CFO_A, fs_summary.cfo)),
  roe_pct: n(pick(metrics.roe_pct_annual, fundamentals.ROE_A, fs_summary.roe, xbrlFact('returnonequity'))),
  roce_pct: n(pick(metrics.roce_pct, fs_summary.roce, xbrlFact('returnonCapitalEmployed'))),
  pe_ttm: n(pick(metrics.pe_ttm, fundamentals.PE_TTM, fs_summary.pe)),
  pb_ratio: n(pick(metrics.pb_ratio, fundamentals.PBV_A, fs_summary.pb)),
  mcap_cr: n(pick(metrics.market_cap_cr, fundamentals.MCAP_Q, fs_summary.mcap)),
  dividendYield_pct: n(pick(metrics.dividend_yield, fundamentals.DIVIDEND_YIELD_1_YR)),
  pegRatio: n(pick(metrics.peg_ttm, fundamentals.PEG_TTM)),
  borrowings_cr: n(pick(canonicalFereFact('borrowings'), bs.borrowings_cr, bs.totalDebt_cr, xbrlFact('borrowings'))),
  tradeReceivables_cr: n(pick(bs.tradeReceivables_cr, providerMetricNumber(metrics.tradereceivablesa), xbrlFact('tradereceivables'))),
  inventory_cr: n(pick(bs.inventory_cr, providerMetricNumber(metrics.inventoriesq), xbrlFact('inventories'))),
  cashAndEquivalents_cr: n(pick(bs.cashAndEquivalents_cr, xbrlFact('cash'))),
  debtToEquity: n(pick(bs.debtToEquity, providerMetricNumber(metrics.debtcea), xbrlFact('debttoequity'), fs_summary.debtToEquity)),
  interestCoverage: n(pick(fs_summary.interestCoverage, xbrlFact('interestcoverage'))),
  inventoryDays: n(pick(fs_summary.inventoryDays, xbrlFact('inventorydays'))),
  receivableDays: n(pick(fs_summary.receivableDays, xbrlFact('receivabledays'))),
  // OPM: use latest available from quarterly (most recent Q's opm) or annual
  opm_pct: n(pick(quarterlyRevenue[quarterlyRevenue.length-1]?.opm_pct, fs_summary.opm, aPL[aPL.length-1]?.opm_pct, xbrlFact('operatingprofitmargin'))),
  // Growth rates extracted from page text
  revenueGrowthYoY_pct: revGrowthPct,
  patGrowthYoY_pct: patGrowthPct,
  cfoGrowthYoY_pct: cfoGrowthPct,
  quarterlyRevenue,
  annualRevenue,
};

// ─── Shareholding ─────────────────────────────────────────────────────────────
// Latest quarter is last element (most recent) after reverse sort
const latestSH = shareholdingHistory[shareholdingHistory.length - 1] ?? {};
const exchangeSH = exchange.shareholding ?? {};

// Summary data from overview page
const summaryMatch = overviewText.match(/summaryData:\s*([\s\S]*?)(?=\n\w|\nsh)/);
const summaryText = summaryMatch?.[1] ?? ownershipText.slice(0, 500);
const promoterSummaryMatch = summaryText.match(/"Promoter",([\d.]+)/);
const fiiSummaryMatch = summaryText.match(/"FII",([\d.]+)/);
const mfSummaryMatch = summaryText.match(/"Mutual Funds",([\d.]+)/);

const shareholding = {
  promoter_pct: n(pick(promoterSummaryMatch?.[1], latestSH.promoter, exchangeSH.promoter)),
  fii_pct: n(pick(fiiSummaryMatch?.[1], latestSH.fii, exchangeSH.fii)),
  mf_pct: n(mfSummaryMatch?.[1]),
  dii_pct: n(pick(latestSH.dii, exchangeSH.dii)),
  public_pct: n(pick(latestSH.public, exchangeSH.public)),
  promoter_pledge_pct: n(metrics.prompledge ?? metrics.promoter_pledge_pct),
  promoterEntityName,      // "Krystal Family Holdings Private Limited"
  institutionalHolderName, // largest institutional holder
  publicHolders: publicHolderRows,
  history: shareholdingHistory,
};

// ─── Technicals ───────────────────────────────────────────────────────────────
// raw.technical uses snake_case keys (sma_20 not sma20); stockSummary has DVM scores
const technicals = {
  ltp: n(pick(stockSummary.ltp, tech.ltp, ltpFromPage)),
  rsi: n(tech.rsi ?? tech.RSI),
  mfi: n(tech.mfi ?? tech.MFI),
  sma20: n(tech.sma_20 ?? tech.SMA20 ?? tech.sma20),
  sma50: n(tech.sma_50 ?? tech.SMA50 ?? tech.sma50),
  sma200: n(tech.sma_200 ?? tech.SMA200 ?? tech.sma200),
  pivot: n(tech.pivot_point ?? tech.pivot),
  r1: n(tech.first_resistance_r1 ?? tech.R1 ?? tech.r1),
  s1: n(tech.first_support_s1 ?? tech.S1 ?? tech.s1),
  high52w: n(pick(stockSummary.high52w, datav2.yearHigh, metrics.high_52w)),
  low52w: n(pick(stockSummary.low52w, datav2.yearLow, metrics.low_52w)),
  changeP_1m: n(pick(datav2.changeP_1m, datav2.monthChange)),
  changeP_1yr: n(pick(datav2.changeP_1yr, datav2.yearChange)),
  changeP_3yr: n(datav2.changeP_3yr),
  changeP_5yr: n(datav2.changeP_5yr),
  // DVM scores live in stockSummary, not a separate dvmScores object
  dvmDurability: n(stockSummary.durabilityScore),
  dvmValuation: n(stockSummary.valuationScore),
  dvmMomentum: n(stockSummary.momentumScore),
  dvmClassification,
  buySellScore,
  checklistInsight,
  checklistPassed,
  checklistTotal,
};

// ─── Governance ───────────────────────────────────────────────────────────────
const auditSections = docs.map(d => d.extractedSections?.auditorOpinion).filter(Boolean);
const auditOpinion = auditSections[0] ?? null;
const auditQualText = docs.map(d => d.governance?.auditQualification).find(Boolean)
  ?? auditSections.find(t => /qualified|qualification|emphasis of matter|adverse opinion/i.test(t ?? '')) ?? null;

const governance = {
  cin,
  directors: mca.directors ?? [],
  auditorOpinion: auditOpinion,
  auditQualification: auditQualText,
  pledgeTrend: shareholdingHistory.map(h => ({ period: h.period ?? h.quarter, pledge_pct: 0 })),
  promoterEntityName,
  dividendHistory: dividendRows,
  boardMeetings: boardMeetRows.slice(0, 8),
  swotStrengthScreens: swotStrengthTitles,
  swotWeaknessScreens: swotWeaknessTitles,
  swotOpportunityScreens: swotOpportunityTitles,
  auditorName,
  hasNoAuditQualification,
};

// ─── Documents index ──────────────────────────────────────────────────────────
const documentIndex = {
  annualReports: docs.filter(d => d.type === 'annual_report').map(d => ({ title: d.title, date: d.date })),
  concallTranscripts: docs.filter(d => /concall|transcript/i.test(d.type ?? '')).map(d => ({ title: d.title, date: d.date })),
  presentations: docs.filter(d => /presentation|investor/i.test(d.type ?? '')).map(d => ({ title: d.title, date: d.date })),
};

// ─── Per-question evidence ────────────────────────────────────────────────────
// Keyword map for quick news/event relevance
const QUESTION_KEYWORDS = {
  1: ['price', 'volume', 'delivery', 'announcement', 'result', 'bulk', 'block', 'sast'],
  2: ['product', 'service', 'segment', 'order book', 'revenue', 'business'],
  3: ['advantage', 'moat', 'certification', 'market share', 'margin', 'roi', 'roce', 'roe'],
  4: ['customer', 'concentration', 'order', 'client'],
  5: ['supplier', 'vendor', 'raw material', 'procurement', 'input cost'],
  6: ['industry', 'market size', 'tam', 'addressable', 'sector', 'penetration'],
  7: ['capex', 'capacity', 'expansion', 'reinvestment', 'utilisation', 'cwip'],
  8: ['roic', 'roce', 'return on capital', 'incremental'],
  9: ['guidance', 'outlook', 'catalyst', 'order', 'growth'],
  10: ['revenue', 'growth', 'receivable', 'collection'],
  11: ['segment', 'product mix', 'geography', 'recovery'],
  12: ['quarterly', 'sequential', 'q1', 'q2', 'q3', 'q4', 'quarter'],
  13: ['margin', 'opm', 'ebitda', 'gross margin', 'material cost'],
  14: ['exceptional', 'one-off', 'other income', 'extraordinary', 'write-off'],
  15: ['cash flow', 'cfo', 'receivable', 'inventory', 'accrual'],
  16: ['roce', 'capex', 'dividend', 'buyback', 'debt repay', 'cash deployment'],
  17: ['pe', 'pb', 'ev/ebitda', 'valuation', 'peer', 'multiple'],
  18: ['promoter', 'director', 'management', 'legal', 'litigation', 'regulatory'],
  19: ['audit', 'qualification', 'governance', 'restatement', 'red flag', 'pledge'],
  20: ['promoter holding', 'fii', 'dii', 'shareholding', 'insider', 'sast'],
  21: ['auditor', 'board', 'independent director', 'committee', 'remuneration'],
  22: ['risk', 'disruption', 'regulation', 'concentration', 'currency', 'macro'],
  23: ['watchlist', 'trigger', 'threshold', 'monitor', 'alert'],
  24: ['interest rate', 'borrowing', 'floating', 'debt', 'finance cost'],
  25: ['working capital', 'inventory days', 'dso', 'ccc', 'receivable days', 'payable'],
  26: ['net debt', 'ebitda', 'interest coverage', 'leverage', 'borrowing'],
  27: ['related party', 'rpt', 'promoter entity', 'affiliate', 'loan'],
  28: ['volume', 'adtv', 'liquidity', 'float', 'market cap'],
  29: ['support', 'resistance', 'pivot', 'sma', 'ema', 'technical', '52 week'],
};

const questionEvidence = {};

for (const q of RESEARCH_QUESTIONS) {
  const keywords = [
    ...q.localDomains.map(d => d.toLowerCase().replace(/_/g, ' ')),
    ...(QUESTION_KEYWORDS[q.id] ?? []),
    ...q.documentQueries.flatMap(dq => dq.toLowerCase().split(/\s+/)),
  ];

  const relevantNews = filterByKeywords(news, keywords).slice(0, 5);
  const relevantEvents = filterByKeywords(events, keywords).slice(0, 5);
  const relevantDocs = filterDocuments(docs, q.documentQueries).slice(0, 3);

  // Collect metrics referenced by this question
  const metrics = {};
  for (const [metricKey] of (q.metrics ?? [])) {
    const val = pick(
      fundamentals[metricKey],
      fundamentals[metricKey?.toUpperCase()],
      fs_summary[metricKey],
      technicals[metricKey],
      shareholding[`${metricKey}_pct`],
      financials[metricKey],
    );
    if (val != null) metrics[metricKey] = val;
  }

  // Identify gaps
  const gaps = [];
  for (const [metricKey, label] of (q.metrics ?? [])) {
    if (metrics[metricKey] == null) gaps.push(`${label ?? metricKey}: not found in any source`);
  }
  if (q.documentQueries.length && relevantDocs.length === 0) gaps.push('No relevant document sections extracted');
  if (q.primarySources?.includes('XBRL/FERE') && xbrlFacts.length === 0) gaps.push('XBRL facts not acquired');

  // Enrich specific questions with structured data parsed from pages
  const extra = {};
  if ([2, 4, 6, 7, 9].includes(q.id)) extra.orderReceipts = orderNews;
  if ([3, 17].includes(q.id)) extra.checklistInsight = checklistInsight;
  if ([3, 17].includes(q.id)) extra.checklistResult = checklistPassed != null ? `${checklistPassed}/${checklistTotal} checks pass` : null;
  if ([3, 17].includes(q.id)) extra.dvmClassification = dvmClassification;
  if ([3, 17].includes(q.id)) extra.buySellScore = buySellScore;
  if ([16, 21].includes(q.id)) extra.dividendHistory = dividendRows;
  if ([16, 21].includes(q.id)) extra.boardMeetings = boardMeetRows.slice(0, 6);
  if ([18, 19, 20, 21].includes(q.id)) extra.promoterEntityName = promoterEntityName;
  if ([20].includes(q.id)) extra.institutionalHolderName = institutionalHolderName;
  if ([20].includes(q.id)) extra.publicHolders = publicHolderRows;
  if ([20].includes(q.id)) extra.shareholdingHistory = shareholdingHistory;
  if ([10, 13, 15].includes(q.id)) extra.revenueGrowthYoY_pct = revGrowthPct;
  if ([10, 13, 15].includes(q.id)) extra.patGrowthYoY_pct = patGrowthPct;
  if ([10, 13, 15].includes(q.id)) extra.cfoGrowthYoY_pct = cfoGrowthPct;
  if ([29, 1].includes(q.id)) extra.buySellScore = buySellScore;

  questionEvidence[q.id] = {
    question: q.question,
    topic: q.topic,
    phase: q.phase,
    metrics,
    news: relevantNews,
    events: relevantEvents,
    documents: relevantDocs,
    gaps,
    ...extra,
  };
}

// ─── Assemble bundle ──────────────────────────────────────────────────────────
const bundle = {
  symbol,
  asOf: s(raw.asOf ?? asOf),
  builtAt: new Date().toISOString(),
  companyName,
  bseCode,
  cin,
  sector: sectorName,
  industry: industryName,
  companyDescription,
  sources,
  financials,
  shareholding,
  technicals,
  governance,
  documents: documentIndex,
  marketContext: {
    dvmClassification,
    buySellScore,
    checklistInsight,
    checklistPassed,
    checklistTotal,
    dividendHistory: dividendRows,
    boardMeetings: boardMeetRows.slice(0, 8),
    orderReceipts: orderNews,
    swotStrengths: swotStrengthTitles,
    swotWeaknesses: swotWeaknessTitles,
    swotOpportunities: swotOpportunityTitles,
    auditorName,
    hasNoAuditQualification,
  },
  questionEvidence,
};

if (DRY_RUN) {
  console.error(`[build_unified_evidence] DRY RUN — would write to ${outPath}`);
  console.log(JSON.stringify({ symbol, asOf, sources, questionCount: Object.keys(questionEvidence).length }, null, 2));
  process.exit(0);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf8');

const gapTotal = Object.values(questionEvidence).reduce((acc, e) => acc + e.gaps.length, 0);
console.error(`[build_unified_evidence] ${symbol} — evidence_bundle.json written`);
console.error(`  Sources: MCP=${sources.trendlyneMCP}, Exchange=${sources.exchangeAPI}, XBRL=${sources.xbrlFacts}, FERE=${sources.canonicalFereFacts}, Docs=${sources.documentsExtracted}, MCA=${sources.mcaData}`);
console.error(`  Total gaps across 29 questions: ${gapTotal}`);
console.log(JSON.stringify({ symbol, asOf, outPath, gapTotal }, null, 2));
