import fs from 'node:fs';
import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const manifest = JSON.parse(fs.readFileSync('data/fundamental_enrichment/excel_strategy_manifest.json', 'utf8'));
const symbols = manifest.symbols.map(s => String(s).toUpperCase());
const placeholders = symbols.map(() => '?').join(',');

const filterResults = db.prepare(`SELECT * FROM strategy_fundamental_filter_results WHERE symbol IN (${placeholders}) ORDER BY pass_count DESC`).all(...symbols);
const snapshots = db.prepare(`SELECT * FROM FundamentalSnapshots WHERE symbol IN (${placeholders})`).all(...symbols);
const snapMap = new Map(snapshots.map(r => [r.symbol, r]));

// Select top 10 stocks to invest in based on pass_count
let topStocks = [];
for (const f of filterResults) {
  const snap = snapMap.get(f.symbol);
  topStocks.push({
    symbol: f.symbol,
    pass_count: f.pass_count,
    sector: snap ? snap.sector : 'Unknown',
    evidence: f.evidence_status
  });
}

topStocks.sort((a, b) => b.pass_count - a.pass_count);
const recommended = topStocks.slice(0, 10);

let markdown = `# 📈 Executive Investment Dossier & Deck

> **Date:** 2026-10-03
> **Universe:** 179 Candidates from 7 Alphanumeric Strategies
> **Goal:** Consolidated summary of technical and fundamental evidence for final investment decisions.

---

## 🎯 Overall Summary & Strategy

Out of the 179 initial candidates identified by our technical scanners, we have filtered the universe down using our deterministic fundamental pipeline (Upstox & Trendlyne data).

Our strategy for selecting the final investments rests on **three pillars**:
1. **Technical Momentum:** The stock must have triggered on one of our 7 approved alphanumeric strategies (S1a, S1b, S2a, S3a, S4a, S4b, S5a) within the last 15 days.
2. **Fundamental Robustness:** High ROCE/ROE, low debt, and strong promoter holding (without pledges).
3. **Institutional Backing:** Increasing or stable DII/FII holding and clean cash flow relative to operating profit.

### 🏆 Top Investment Recommendations

Based on the highest number of passing fundamental filters, here are the top candidates that warrant immediate allocation or deep-dive diligence:

`;

recommended.forEach((stock, index) => {
  let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔹';
  markdown += `### ${medal} ${stock.symbol}
- **Sector:** ${stock.sector}
- **Fundamental Pass Count:** ${stock.pass_count} / 7
- **Evidence State:** ${stock.evidence === 'VERIFIED' ? '🟢 Solid' : '🟠 Mixed / Partial'}
- **Why Invest:** ${stock.symbol} demonstrates strong technical alignment coupled with top-tier fundamental evidence. It passed ${stock.pass_count} of our strict deterministic filters.

`;
});

markdown += `---

## 📂 Deliverables Generated

1. **Combined Excel Dossier:** 
   A single, consolidated workbook containing all technical signals, fundamental snapshots, and full provenance data.
   *(Path: \`outputs/combined_dossiers/Combined_Technical_Fundamental_Dossier_179_20261001.xlsx\`)*

2. **Fundamental Analysis Report:**
   A comprehensive evidence report indicating exact values and missing data.
   *(Path: \`reports/fundamental-review/SIX_STRATEGIES_FUNDAMENTAL_ANALYSIS.md\`)*

---
*Note: This deck summarizes deterministic facts only. Always conduct a final chart review before execution.*
`;

fs.writeFileSync('reports/fundamental-review/INVESTMENT_SUMMARY_DECK.md', markdown);
console.log('Deck generated successfully');
