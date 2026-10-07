import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import ExcelJS from 'exceljs';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/fundamental_enrichment/pilot_25_manifest.json'), 'utf8'));
const db = new Database(path.join(root, 'portfolio.db'), { readonly: true });
const outDir = path.join(root, 'outputs/fundamental_dossiers/pilot_25');
fs.mkdirSync(outDir, { recursive: true });

function latest(symbol, endpoint) {
  return db.prepare(`SELECT response_json,fetched_at FROM fundamental_endpoint_snapshots WHERE provider='TRENDLYNE_MCP' AND symbol=? AND endpoint=? ORDER BY fetched_at DESC LIMIT 1`).get(symbol, endpoint);
}
function text(raw) {
  try { const outer = JSON.parse(raw); const t = outer?.content?.find(x => x.type === 'text')?.text ?? outer?.structuredContent?.result ?? ''; const inner = JSON.parse(t); return inner?.data ?? t; } catch { return String(raw ?? ''); }
}
function value(rawText, label, symbol) {
  const re = new RegExp(`(?:^|\\n)${label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*\\n[^\\n]*\\n(?:[^\\n]*\\n)*?${symbol}:([^\\n]+)`, 'i');
  const m = rawText.match(re); if (!m) return null;
  const v = m[1].trim(); if (!v || /^none|null$/i.test(v)) return null;
  const n = Number(v.replace(/,/g, '')); return Number.isFinite(n) ? n : v;
}
function firstMetric(rawText, labels, symbol) { for (const l of labels) { const v = value(rawText, l, symbol); if (v != null) return v; } return null; }
function fmt(v, suffix='') { return v == null ? 'not available' : `${typeof v === 'number' ? Number(v.toFixed(2)) : v}${suffix}`; }
function summary(symbol) {
  const p = latest(symbol, 'parameters'); const pt = text(p?.response_json);
  const revenue = firstMetric(pt, ['Operating Rev. Ann.', 'Total Rev. Ann.'], symbol);
  const pat = firstMetric(pt, ['Net Profit Ann.'], symbol);
  const cfo = firstMetric(pt, ['Cash from Operating Act. Ann.'], symbol);
  const op = firstMetric(pt, ['Operating Profit Ann.'], symbol);
  const roe = firstMetric(pt, ['ROE Ann. %'], symbol);
  const roce = firstMetric(pt, ['ROCE Ann. %'], symbol);
  const de = firstMetric(pt, ['Total Debt to Total Equity Ann.', 'LT Debt To Equity Ann.'], symbol);
  const pe = firstMetric(pt, ['PE TTM'], symbol);
  const mcap = firstMetric(pt, ['Market Cap'], symbol);
  const promoter = firstMetric(text(latest(symbol,'shareholding')?.response_json), ['Promoter Holding'], symbol);
  const fII = firstMetric(pt, ['FII holding current Qtr %'], symbol);
  const missing = [];
  for (const [name,v] of [['revenue',revenue],['PAT',pat],['CFO',cfo],['operating profit',op],['ROE',roe],['ROCE',roce],['debt/equity',de],['valuation',pe]]) if (v == null) missing.push(name);
  const evidence = missing.length ? '🟠 Mixed-Watch' : '🟢 Supportive';
  const summaryText = `${symbol} has a recorded market-capitalisation of ${fmt(mcap,' Cr')} and a trailing P/E of ${fmt(pe)}. The latest available operating data shows revenue of ${fmt(revenue,' Cr')}, operating profit of ${fmt(op,' Cr')}, PAT of ${fmt(pat,' Cr')}, and operating cash flow of ${fmt(cfo,' Cr')}. Reported returns are ROE ${fmt(roe,'%')} and ROCE ${fmt(roce,'%')}; debt-to-equity is ${fmt(de)}. Promoter ownership is ${fmt(promoter,'%')}, while the latest FII holding/change evidence is ${fmt(fII,'%')}. These figures suggest the company should be assessed primarily on cash conversion, return consistency, leverage discipline and the price paid rather than on a single ratio. Key risks to verify are ${missing.length ? `missing or unanchored ${missing.join(', ')}` : 'working-capital and capex quality, competitive pressure, and valuation sensitivity'}. Technical OHLCV, QGLP and event evidence must be read alongside this snapshot. Evidence state: ${evidence}. What to watch next: the next filing, cash-flow trend, margin direction, ownership change and any material corporate event.`;
  return { symbol, executiveSummary: summaryText, missing: missing.join(', ') || 'none', fetchedAt: p?.fetched_at ?? null, metrics: { revenue, op, pat, cfo, roe, roce, de, pe, mcap, promoter, fII } };
}

const rows = manifest.symbols.map(summary);
const jsonPath = path.join(outDir, 'Business_Language_Summaries_25_data.json');
fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), symbols: rows }, null, 2));
const md = ['# WealthOS — Business-Language Fundamental Summaries', '', 'Deterministic summaries from persisted provider evidence. Missing values are stated explicitly; no LLM inference or synthetic values are used.', ''];
for (const r of rows) md.push(`## ${r.symbol}\n\n${r.executiveSummary}\n\n**Missing/needs verification:** ${r.missing}\n`);
fs.writeFileSync(path.join(outDir, 'Business_Language_Summaries_25.md'), md.join('\n'));
const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Business Summaries');
ws.columns = [{header:'Symbol',key:'symbol',width:16},{header:'Executive Summary (business language)',key:'summary',width:120},{header:'Missing / needs verification',key:'missing',width:35},{header:'Fetched At',key:'fetchedAt',width:24}];
for (const r of rows) ws.addRow(r); ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}}; ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0F766E'}}; ws.getColumn(2).alignment={wrapText:true,vertical:'top'}; ws.getColumn(3).alignment={wrapText:true}; ws.views=[{state:'frozen',ySplit:1}]; ws.autoFilter='A1:D26';
await wb.xlsx.writeFile(path.join(outDir, 'Business_Language_Summaries_25.xlsx'));
console.log(JSON.stringify({symbols: rows.length, jsonPath, markdownPath:path.join(outDir,'Business_Language_Summaries_25.md'), workbookPath:path.join(outDir,'Business_Language_Summaries_25.xlsx')}, null, 2));
db.close();
