import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = process.cwd();
const portfolioDbPath = path.resolve(root, 'portfolio.db');
const manifestPath = path.resolve(root, 'data/fundamental_enrichment/excel_strategy_manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const symbols = manifest.symbols.map(s => String(s).toUpperCase());

const db = new Database(portfolioDbPath, { readonly: true });

const placeholders = symbols.map(() => '?').join(',');

const filterResults = db.prepare(`SELECT * FROM strategy_fundamental_filter_results WHERE symbol IN (${placeholders})`).all(...symbols);
const snapshots = db.prepare(`SELECT * FROM FundamentalSnapshots WHERE symbol IN (${placeholders})`).all(...symbols);
const hfs = db.prepare(`SELECT * FROM HistoricalFinancialStatements WHERE symbol IN (${placeholders}) ORDER BY period_date DESC`).all(...symbols);

const filterMap = new Map(filterResults.map(r => [r.symbol, r]));
const snapMap = new Map(snapshots.map(r => [r.symbol, r]));
const hfsMap = new Map();
for (const r of hfs) {
  if (!hfsMap.has(r.symbol)) hfsMap.set(r.symbol, r);
}

let md = `# Six Strategies 179-Candidate Fundamental Analysis\n\n> Deterministic evidence-backed report. Missing data is stated, never estimated.\n\n`;

for (const symbol of symbols) {
  const f = filterMap.get(symbol);
  const s = snapMap.get(symbol);
  const h = hfsMap.get(symbol);

  let evidenceState = '⚪ Missing/Conflicting';
  let reason = 'Critical evidence is incomplete; no investment interpretation is emitted.';

  if (f && f.evidence_status === 'VERIFIED') {
    evidenceState = '🟢 Solid';
    reason = 'Sufficient dated history/peer context for a supportive conclusion is present.';
  } else if (f && f.evidence_status === 'PARTIAL') {
    evidenceState = '🟠 Mixed-Watch';
    reason = 'Core facts are available, but sufficient dated history/peer context for a supportive conclusion is not yet present.';
  }

  // Check for concern
  if (h && (h.net_profit_pat_cr < 0 || h.cfo_cr < 0)) {
    evidenceState = '🔴 Concern';
    reason = 'Reported PAT or operating cash flow is negative; this is a factual watch flag, not a recommendation.';
  }

  md += `## ${symbol}\n\n`;
  md += `**Evidence state:** ${evidenceState} — ${reason}\n\n`;

  let p1 = '';
  if (h && h.sales_cr !== null && h.net_profit_pat_cr !== null && s && s.sector) {
    p1 += `${symbol} reported LATEST revenue of ₹${h.sales_cr} Cr with net profit of ₹${h.net_profit_pat_cr} Cr in ${s.sector}. `;
  }
  
  if (s && s.operating_margin_pct !== null) {
    p1 += `Operating margin stands at ${s.operating_margin_pct}% `;
    if (s.debt_to_equity !== null) p1 += `with balance-sheet leverage of ${s.debt_to_equity}x D/E `;
    if (s.roce_pct !== null) p1 += `and ROCE of ${s.roce_pct}%. `;
  }

  const prom = f ? f.promoter_pct : null;
  const dii = f ? f.dii_pct : null;
  const fii = f ? f.fii_pct : null;

  if (prom !== null) {
    p1 += `Promoter ownership is ${prom}% (${dii !== null ? dii : 'N/A'}% DII, ${fii !== null ? fii : 'N/A'}% FII).\n\n`;
  } else {
    p1 += `Ownership data missing.\n\n`;
  }
  
  md += p1;

  let missing = [];
  if (!h || h.sales_cr === null) missing.push('revenue');
  if (!s || s.operating_margin_pct === null) missing.push('operatingMargin');
  if (!h || h.net_profit_pat_cr === null) missing.push('pat');
  if (!h || h.cfo_cr === null) missing.push('cfo');
  if (!s || s.debt_to_equity === null) missing.push('debtToEquity');
  if (!s || s.roce_pct === null) missing.push('roce');
  if (!s || s.roe_pct === null) missing.push('roe');
  if (prom === null) missing.push('promoter');
  if (f && f.pledged_pct === null) missing.push('pledge');

  if (missing.length > 0) {
    md += `**Still missing:** ${missing.join(', ')}\n\n`;
  }
}

const outPath = path.resolve(root, 'reports/fundamental-review/SIX_STRATEGIES_FUNDAMENTAL_ANALYSIS.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md, 'utf8');
console.log('Wrote summary to', outPath);
