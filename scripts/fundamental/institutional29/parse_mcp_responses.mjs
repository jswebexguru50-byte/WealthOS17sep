#!/usr/bin/env node
/**
 * parse_mcp_responses.mjs — Parse raw Trendlyne MCP text responses into structured data
 *
 * The Trendlyne MCP returns rich text in `result` (pipe-delimited tables, section blocks).
 * This script reads trendlyne_raw.json and enriches it with parsed structured fields:
 *   - Technicals (SMA, RSI, MFI, pivot, support/resistance)
 *   - Fundamentals (Market Cap, PE, PB, Revenue TTM, PAT TTM, CFO, ROE)
 *   - Shareholding history (9 quarters)
 *   - News items with PDF document URLs
 *   - Q1FY27 results from news (revenue, PAT, segments)
 *   - Events
 *   - SWOT signals
 *
 * Also extracts annual report PDF URL and Q results PDF URL for downstream download.
 *
 * Usage: node parse_mcp_responses.mjs SYMBOL
 * Output: updates outputs/institutional29/<SYMBOL>/trendlyne_raw.json
 */

import fs from 'node:fs';
import path from 'node:path';

const symbol = process.argv[2]?.toUpperCase();
if (!symbol) throw new Error('Usage: node parse_mcp_responses.mjs SYMBOL');

const root = process.cwd();
const rawPath = path.resolve(root, 'outputs', 'institutional29', symbol, 'trendlyne_raw.json');
if (!fs.existsSync(rawPath)) throw new Error(`Not found: ${rawPath}`);

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractSection(text, sectionName) {
  const re = new RegExp(`${sectionName}:\\s*\\n([\\s\\S]*?)(?=\\n\\w+\\w*Data:|\\n\\w+Headers:|\\n\\w+Urls:|\\n\\w+Url:|\\n\\w+Info:|$)`, 'i');
  const m = text?.match(re);
  return m ? m[1].trim() : null;
}

function parsePipeTable(text) {
  if (!text) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split('|').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split('|').map(c => c.trim());
    const row = {};
    header.forEach((h, i) => { if (h) row[h] = cols[i] ?? ''; });
    return row;
  });
}

function extractKV(text, key) {
  const re = new RegExp(`${key}[:\\s]+([^\\n]+)`, 'i');
  const m = text?.match(re);
  return m ? m[1].trim() : null;
}

// ─── 1. Parse overview (technicals, fundamentals, shareholding) ───────────────
const overviewText = raw.pages?.OVERVIEW_EVENTS_OVERVIEW?.data?.result;
if (overviewText) {
  // Technical data
  const techSection = extractSection(overviewText, 'technicalData');
  if (techSection) {
    const rows = parsePipeTable(techSection);
    const tech = {};
    for (const row of rows) {
      const name = row['unique_name'] || row['name'];
      const val  = row['value'];
      if (name && val && val !== 'None') tech[name] = isNaN(val) ? val : parseFloat(val);
    }
    raw.technical = tech;
    console.error(`[parse] Technical: ${Object.keys(tech).join(', ')}`);
  }

  // Fundamental data (KPIs from fundamentalData section)
  const fundSection = extractSection(overviewText, 'fundamentalData');
  if (fundSection) {
    const rows = parsePipeTable(fundSection);
    const fundamentals = {};
    for (const row of rows) {
      const uniqueName = row['unique_name'];
      const val = row['value'];
      if (uniqueName && val) fundamentals[uniqueName] = isNaN(val) ? val : parseFloat(val);
    }
    raw.fundamentals = fundamentals;
    // Also flatten into metrics
    const metricMap = {
      'MCAP_Q': 'market_cap_cr', 'PE_TTM': 'pe_ttm', 'PBV_A': 'pb_ratio',
      'DIVIDEND_YIELD_1_YR': 'dividend_yield', 'PEG_TTM': 'peg_ttm',
      'SR_TTM': 'revenue_cr_ttm', 'NP_TTM': 'pat_cr_ttm',
      'CFO_A': 'cfo_cr_annual', 'ROE_A': 'roe_pct_annual',
    };
    for (const [tlKey, canonical] of Object.entries(metricMap)) {
      if (fundamentals[tlKey] != null) {
        if (!raw.metrics[canonical]) raw.metrics[canonical] = [];
        raw.metrics[canonical].push({ value: fundamentals[tlKey], period: 'TTM', source: 'fundamentalData_overview' });
      }
    }
    console.error(`[parse] Fundamentals: ${Object.keys(fundamentals).join(', ')}`);
  }

  // Stock summary data
  const stockDataLine = overviewText.match(/stockData:\s*\n\s*([^\n]+)/)?.[1];
  if (stockDataLine) {
    const parts = stockDataLine.split(',').map(s => s.trim());
    if (parts.length >= 5) {
      raw.stockSummary = {
        name: parts[0],
        stockId: parts[1],
        exchange: parts[3],
        isin: parts[5],
        durabilityScore: parseFloat(parts[6]) || null,
        valuationScore: parseFloat(parts[7]) || null,
        momentumScore: parseFloat(parts[8]) || null,
        ltp: parseFloat(parts[13]) || null,
        dayChangePct: parseFloat(parts[15]) || null,
        high52w: null, // populated below
        low52w: null,
      };
    }
  }

  // datav2 (52w high/low, change periods)
  const datav2Match = overviewText.match(/datav2:\s*([\s\S]*?)(?=\n\w+\w*:|$)/);
  if (datav2Match) {
    const dv2 = datav2Match[1];
    const kv = {};
    for (const line of dv2.split('\n').map(l => l.trim()).filter(l => l.includes(':'))) {
      const [k, v] = line.split(':').map(s => s.trim());
      kv[k] = v === 'None' ? null : (isNaN(v) ? v : parseFloat(v));
    }
    raw.datav2 = kv;
    if (raw.stockSummary) {
      raw.stockSummary.high52w = kv['yearHigh'];
      raw.stockSummary.low52w  = kv['yearLow'];
    }
    // Add to metrics
    if (kv['yearHigh']) { if (!raw.metrics.high_52w) raw.metrics.high_52w = []; raw.metrics.high_52w.push({ value: kv['yearHigh'], source: 'datav2' }); }
    if (kv['yearLow'])  { if (!raw.metrics.low_52w) raw.metrics.low_52w = []; raw.metrics.low_52w.push({ value: kv['yearLow'], source: 'datav2' }); }
    console.error(`[parse] datav2: 52W High=${kv['yearHigh']}, 52W Low=${kv['yearLow']}`);
  }

  // Summary shareholding (current quarter)
  const summaryMatch = overviewText.match(/summaryData:\s*\n\s*([^\n]+)\s*\n([\s\S]*?)(?=\n\w)/);
  if (summaryMatch) {
    const rows = parsePipeTable(summaryMatch[2]);
    for (const row of rows) {
      const type = row['Type']?.toLowerCase().replace(/\s+/g, '_');
      const holding = parseFloat(row['Holding']);
      if (type && !isNaN(holding)) {
        const canonical = type === 'promoter' ? 'promoter_holding_pct'
          : type === 'fii' ? 'fii_holding_pct'
          : type === 'mutual_funds' ? 'mf_holding_pct'
          : type === 'public' ? 'public_holding_pct'
          : `${type}_holding_pct`;
        if (!raw.metrics[canonical]) raw.metrics[canonical] = [];
        raw.metrics[canonical].push({ value: holding, period: 'current', source: 'summaryData' });
      }
    }
  }

  // Shareholding history (shBarChartData)
  const shBarMatch = overviewText.match(/shBarChartData:\s*([\s\S]*?)(?=\nfundamentalData|$)/);
  if (shBarMatch) {
    raw.shareholdingHistory = {};
    const holderBlocks = shBarMatch[1].split('\n  ').filter(b => b.trim() && !b.trim().startsWith('['));
    for (const block of holderBlocks) {
      const colonIdx = block.indexOf(':');
      if (colonIdx === -1) continue;
      const holder = block.slice(0, colonIdx).trim();
      const dataLine = block.slice(colonIdx + 1).trim();
      try {
        const rows = JSON.parse(dataLine.replace(/None/g, 'null'));
        if (Array.isArray(rows) && rows.length > 1) {
          const headers = rows[0];
          raw.shareholdingHistory[holder] = rows.slice(1).map(r => {
            const obj = {};
            headers.forEach((h, i) => { if (typeof h === 'string' && !h.includes('role')) obj[h] = r[i]; });
            return obj;
          });
        }
      } catch {}
    }
    console.error(`[parse] Shareholding history: ${Object.keys(raw.shareholdingHistory || {}).join(', ')}`);
  }

  // Manual insight (company description)
  const insightMatch = overviewText.match(/manualInsight:\s*\n\s*shorttext:\s*([^\n]+)/);
  if (insightMatch) raw.companyDescription = insightMatch[1].trim();

  // Corporate info
  const corpMatch = overviewText.match(/companyInfo:\s*([^\n]+)/);
  if (corpMatch) raw.companyInfo = corpMatch[1].trim();

  // DVM scores
  const dvmMatch = overviewText.match(/Durability Score \| number \| d_value \|[\s\S]*?stockData:\s*\n\s*([^\n]+)/);
  if (!dvmMatch) {
    // Try to extract DVM from stockData line
    const sdLine = overviewText.match(/stockData:\s*\n\s*([^\n]+)/)?.[1];
    if (sdLine) {
      const parts = sdLine.split(',').map(s => s.trim());
      raw.dvmScores = {
        durability: parseFloat(parts[6]) || null,
        valuation: parseFloat(parts[7]) || null,
        momentum: parseFloat(parts[8]) || null,
      };
    }
  }

  // PE valuation
  const peMatch = overviewText.match(/attr1_val:\s*([^\n]+)/);
  if (peMatch) {
    const fairPrice = parseFloat(peMatch[1]);
    if (!isNaN(fairPrice)) raw.peFairPrice = fairPrice;
  }
}

// ─── 2. Parse news into structured items ──────────────────────────────────────
const newsText = raw.pages?.OVERVIEW_EVENTS_NEWS?.data?.result;
if (newsText) {
  const newsSection = extractSection(newsText, 'newsList');
  if (newsSection) {
    const rows = parsePipeTable(newsSection);
    raw.news = rows
      .filter(r => r['title'])
      .map(r => ({
        headline: r['title'],
        date: r['pubDate'],
        source: r['source'],
        type: r['postType'],
        description: r['description'],
        pdfUrl: r['pdfUrl'] || null,
        url: r['url'] || null,
      }));
    console.error(`[parse] News items: ${raw.news.length}`);

    // Extract document URLs (Annual Report, Results, etc.)
    raw.documentUrls = raw.documentUrls || {};
    for (const item of raw.news) {
      if (/annual report/i.test(item.headline) && item.pdfUrl) {
        raw.documentUrls.annual_report = { url: item.pdfUrl, date: item.date, title: item.headline };
      }
      if (/quarterly result|Q\dFY\d/i.test(item.headline) && item.pdfUrl) {
        const period = item.headline.match(/(Q\dFY\d+)/i)?.[1] || 'latest';
        if (!raw.documentUrls[`results_${period}`]) {
          raw.documentUrls[`results_${period}`] = { url: item.pdfUrl, date: item.date, title: item.headline };
        }
      }
    }
    console.error(`[parse] Document URLs found: ${Object.keys(raw.documentUrls).join(', ')}`);
  }
}

// ─── 3. Parse events ──────────────────────────────────────────────────────────
const eventsText = raw.pages?.OVERVIEW_EVENTS_EVENTS?.data?.result;
if (eventsText) {
  // Events may be in a similar pipe format
  const eventLines = eventsText.split('\n').filter(l => l.includes('|'));
  if (eventLines.length > 1) {
    raw.events = parsePipeTable(eventsText).map(r => ({
      event_type: r['postType'] || r['eventType'] || r['type'],
      event_date: r['pubDate'] || r['date'],
      description: r['description'] || r['title'],
    })).filter(e => e.event_type || e.description);
    console.error(`[parse] Events: ${raw.events.length}`);
  }
}

// ─── 4. Parse shareholding (get_ownership response) ──────────────────────────
const shText = raw.pages?.OWNERSHIP_SHAREHOLDING?.data?.result;
if (shText) {
  // Extract quarterly shareholding table rows
  const shSection = extractSection(shText, 'shBarChartData');
  if (shSection && !raw.shareholdingHistory) {
    raw.shareholdingHistory = {};
    // Similar parsing to above
  }
}

// ─── 5. Extract Q1FY27 financials from news descriptions ──────────────────────
if (raw.news) {
  const q1Item = raw.news.find(n => /Q1FY27.*result|quarterly result.*yuken/i.test(n.headline));
  if (q1Item?.description) {
    raw.latestQuarterSummary = {
      period: 'Q1FY27',
      headline: q1Item.headline,
      description: q1Item.description,
      pdfUrl: q1Item.pdfUrl,
    };

    // Extract key numbers from description
    const desc = q1Item.description;
    const nums = {
      consolidated_revenue_q1fy27: desc.match(/Revenue.*?Rs (\d+[\d,\.]+) lakh.*?Q1FY27/i)?.[1]?.replace(/,/g,''),
      consolidated_revenue_yoy_pct: desc.match(/(\d+\.?\d*)\% YoY/i)?.[1],
      consolidated_pat_q1fy27: desc.match(/Net profit.*?Rs (\d+\.?\d+) lakh/i)?.[1],
      hydraulic_revenue_q1fy27: desc.match(/Hydraulic Business.*?Rs (\d+\.?\d+) lakh/i)?.[1],
      foundry_revenue_q1fy27: desc.match(/Foundry Business.*?Rs (\d+\.?\d+) lakh/i)?.[1],
    };
    raw.latestQuarterNums = nums;
    console.error(`[parse] Q1FY27: Revenue=${nums.consolidated_revenue_q1fy27} lakh, YoY=${nums.consolidated_revenue_yoy_pct}%`);
  }
}

// ─── 6. Save enriched raw ─────────────────────────────────────────────────────
raw.parsedAt = new Date().toISOString();
fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2), 'utf8');
console.log(JSON.stringify({
  symbol,
  output: rawPath,
  technical: Object.keys(raw.technical || {}).length,
  fundamentals: Object.keys(raw.fundamentals || {}).length,
  metrics: Object.keys(raw.metrics || {}).length,
  news: (raw.news || []).length,
  events: (raw.events || []).length,
  documentUrls: Object.keys(raw.documentUrls || {}),
  latestQuarter: raw.latestQuarterSummary?.period,
}, null, 2));
