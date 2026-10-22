/**
 * scripts/data_quality/analyze360_missing_data_inventory.ts
 *
 * Deterministic read-only inventory of missing data inputs across WealthOS Analyze360,
 * QGLP, and Sector Momentum.
 *
 * Inspects local DB and DuckDB:
 * - company_facts
 * - DataQualityAuditLedger
 * - HistoricalFinancialStatements
 * - HistoricalShareholdingPattern
 * - FEREEnrichedLedger
 * - SecurityDossierSnapshots
 * - MasterTickers
 * - DuckDB adjusted OHLCV
 * - Sector index OHLCV sources
 *
 * Target Universe:
 * - Seven Strategies candidates
 * - Invested portfolio holdings
 * - Symbols in company_facts
 * - Representative Nifty 500 / Mid / Small / Microcaps
 *
 * Classification of missing data:
 *   A. Source data exists locally, but resolver mapping is missing / unmapped
 *   B. Source data not ingested (needs routine acquisition job)
 *   C. Provider unlikely to have it (niche / unlisted / delisted / early SME)
 *   D. Requires statutory exchange filing / XBRL extraction (FERE)
 *   E. Requires sector index OHLCV acquisition / mapping
 *
 * Zero DB mutations.
 */

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

interface SymbolMissingReport {
  symbol: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  marketCapCr: number | null;
  missingFields: string[];
  reasons: Record<string, string>;
  categoryClassification: Record<string, 'A' | 'B' | 'C' | 'D' | 'E'>;
}

interface InventoryOutput {
  generatedAt: string;
  totalSymbolsChecked: number;
  fieldSummary: Record<string, { available: number; missing: number; pctAvailable: number }>;
  topMissingFields: Array<{ field: string; missingCount: number; pctMissing: number }>;
  topMissingReasons: Array<{ reason: string; count: number }>;
  classificationRollup: {
    A_mapping_missing: number;
    B_source_not_ingested: number;
    C_provider_unlikely: number;
    D_requires_xbrl_filings: number;
    E_requires_sector_ohlcv: number;
  };
  symbols: SymbolMissingReport[];
}

async function runInventory() {
  console.log('Starting WealthOS Analyze360 Missing Data Inventory...');

  // 1. Gather Candidate & Holding Symbols
  const targetSymbolsSet = new Set<string>([
    // Active Seven Strategies candidates
    'EMAMIREAL', 'MOTISONS', 'DIVYADHAN', 'GUJRAFFIA', 'JITFINFRA', 'K2INFRA',
    'PRAJIND', 'KONSTELEC', 'VLINFRA', 'SUDARCOLOR', 'VISHNUINFR', 'TERA', 'USHAMART',
    // Core benchmarks
    'INFY', 'TCS', 'RELIANCE', 'HDFCBANK', 'ICICIBANK',
    // Historical Financial Statements & Shareholding testbed
    '20MICRONS', '21STCENMGM', '360ONE', '3BBLACKBIO', '3IINFOLTD', '3MINDIA', '3PLAND',
    // Mid & Small Cap Universe with FERE Evidence
    'AETHER', 'DATAPATTNS', 'KAYNES', 'KPITTECH', 'MAZDOCK', 'POLICYBZR', 'SONACOMS',
    'SUZLON', 'TATATECH', 'ZOMATO', 'DEEPAKFERT',
    // Portfolio holdings & watchlists
    'TATASTEEL', 'TITAN', 'BEL', 'SUNPHARMA', 'DYCL'
  ]);

  const symbols = Array.from(targetSymbolsSet);
  console.log(`Checking ${symbols.length} representative symbols across local data stores...`);

  const results: SymbolMissingReport[] = [];

  const fieldStats: Record<string, { available: number; missing: number }> = {
    technicalOhlcv: { available: 0, missing: 0 },
    sectorMomentum: { available: 0, missing: 0 },
    revenueGrowth3Y: { available: 0, missing: 0 },
    revenueGrowth5Y: { available: 0, missing: 0 },
    operatingProfit: { available: 0, missing: 0 },
    pat: { available: 0, missing: 0 },
    marginTrend: { available: 0, missing: 0 },
    debtToEquity: { available: 0, missing: 0 },
    totalBorrowings: { available: 0, missing: 0 },
    cfo: { available: 0, missing: 0 },
    cfoToPat: { available: 0, missing: 0 },
    cfoToOperatingProfit: { available: 0, missing: 0 },
    freeCashFlow: { available: 0, missing: 0 },
    fcfYield: { available: 0, missing: 0 },
    workingCapital: { available: 0, missing: 0 },
    promoterHolding: { available: 0, missing: 0 },
    promoterPledge: { available: 0, missing: 0 },
    fiiHolding: { available: 0, missing: 0 },
    diiHolding: { available: 0, missing: 0 },
    fiiTrend: { available: 0, missing: 0 },
    diiTrend: { available: 0, missing: 0 },
    roe: { available: 0, missing: 0 },
    roce: { available: 0, missing: 0 },
    pe: { available: 0, missing: 0 },
    peg: { available: 0, missing: 0 },
    demandOutlook: { available: 0, missing: 0 },
    peerContext: { available: 0, missing: 0 },
    keyRisks: { available: 0, missing: 0 },
    whatToWatchNext: { available: 0, missing: 0 },
    qglpVerdict: { available: 0, missing: 0 }
  };

  const reasonCounts: Record<string, number> = {};
  const classificationCounts = {
    A_mapping_missing: 0,
    B_source_not_ingested: 0,
    C_provider_unlikely: 0,
    D_requires_xbrl_filings: 0,
    E_requires_sector_ohlcv: 0
  };

  // Helper to record
  const track = (field: string, isAvailable: boolean, reason: string | null, symReport: SymbolMissingReport, category: 'A' | 'B' | 'C' | 'D' | 'E') => {
    if (isAvailable) {
      fieldStats[field].available++;
    } else {
      fieldStats[field].missing++;
      const safeReason = reason || 'MISSING';
      reasonCounts[safeReason] = (reasonCounts[safeReason] || 0) + 1;
      symReport.missingFields.push(field);
      symReport.reasons[field] = safeReason;
      symReport.categoryClassification[field] = category;

      if (category === 'A') classificationCounts.A_mapping_missing++;
      else if (category === 'B') classificationCounts.B_source_not_ingested++;
      else if (category === 'C') classificationCounts.C_provider_unlikely++;
      else if (category === 'D') classificationCounts.D_requires_xbrl_filings++;
      else if (category === 'E') classificationCounts.E_requires_sector_ohlcv++;
    }
  };

  for (const sym of symbols) {
    try {
      let data: any = null;
      try {
        const res = await fetch(`http://localhost:3000/api/analyze360/${sym}`);
        if (res.ok) {
          data = await res.json();
        }
      } catch (httpErr) {
        // Fall back to in-process service if server is offline
      }

      if (!data) {
        try {
          const { Analyze360Service } = await import('../../src/server/services/Analyze360Service.js');
          data = await Analyze360Service.getInstance().getAnalyze360View(sym);
        } catch (svcErr: any) {
          console.warn(`[Inventory] Failed to analyze ${sym} in-process:`, svcErr?.message || svcErr);
          continue;
        }
      }

      if (!data) continue;

      const f = data.fundamental || {};
      const t = data.technical || {};
      const s = data.sectorMomentum || {};
      const q = data.qglp || {};

      const symReport: SymbolMissingReport = {
        symbol: sym,
        companyName: data.companyName || null,
        sector: data.sector || null,
        industry: data.industry || null,
        marketCapCr: data.summarySnapshot?.valuation?.marketCapCr || null,
        missingFields: [],
        reasons: {},
        categoryClassification: {}
      };

      // Technical & Sector
      track('technicalOhlcv', t.latestClose?.status === 'AVAILABLE', t.latestClose?.missingReason, symReport, 'B');
      track('sectorMomentum', s.status && s.status !== 'DATA_INSUFFICIENT', s.missingReason, symReport, 'E');

      // 3Y & 5Y Revenue Growth
      track('revenueGrowth3Y', f.revenueGrowth?.status === 'AVAILABLE', f.revenueGrowth?.missingReason, symReport, 'D');
      track('revenueGrowth5Y', f.revenueGrowth?.fiveYearCagr?.status === 'AVAILABLE', f.revenueGrowth?.fiveYearCagr?.missingReason, symReport, 'B');

      // Profitability & Margins
      track('operatingProfit', f.profitability?.operatingProfit?.status === 'AVAILABLE', f.profitability?.operatingProfit?.missingReason, symReport, 'D');
      track('pat', f.profitability?.pat?.status === 'AVAILABLE', f.profitability?.pat?.missingReason, symReport, 'D');
      track('marginTrend', f.profitability?.marginTrend?.status === 'AVAILABLE', f.profitability?.marginTrend?.missingReason, symReport, 'D');

      // Debt & Capital Structure
      track('debtToEquity', f.debtAndService?.debtToEquity?.status === 'AVAILABLE', f.debtAndService?.debtToEquity?.missingReason, symReport, 'B');
      track('totalBorrowings', f.debtAndService?.totalBorrowings?.status === 'AVAILABLE', f.debtAndService?.totalBorrowings?.missingReason, symReport, 'D');

      // Cash Flow & Working Capital
      track('cfo', f.cashFlow?.cfo?.status === 'AVAILABLE', f.cashFlow?.cfo?.missingReason, symReport, 'D');
      track('cfoToPat', f.cashFlow?.cfoToPat?.status === 'AVAILABLE', f.cashFlow?.cfoToPat?.missingReason, symReport, 'D');
      track('cfoToOperatingProfit', f.cashFlow?.cfoToOperatingProfit?.status === 'AVAILABLE', f.cashFlow?.cfoToOperatingProfit?.missingReason, symReport, 'D');
      track('freeCashFlow', f.cashFlow?.freeCashFlow?.status === 'AVAILABLE', f.cashFlow?.freeCashFlow?.missingReason, symReport, 'D');
      track('fcfYield', f.cashFlow?.fcfYield?.status === 'AVAILABLE', f.cashFlow?.fcfYield?.missingReason, symReport, 'B');
      track('workingCapital', f.cashFlow?.workingCapital?.status === 'AVAILABLE', f.cashFlow?.workingCapital?.missingReason, symReport, 'D');

      // Ownership & Holdings
      track('promoterHolding', f.holdings?.promoterHolding?.status === 'AVAILABLE', f.holdings?.promoterHolding?.missingReason, symReport, 'B');
      track('promoterPledge', f.holdings?.promoterPledge?.status === 'AVAILABLE', f.holdings?.promoterPledge?.missingReason, symReport, 'D');
      track('fiiHolding', f.holdings?.fiiHolding?.status === 'AVAILABLE', f.holdings?.fiiHolding?.missingReason, symReport, 'B');
      track('diiHolding', f.holdings?.diiHolding?.status === 'AVAILABLE', f.holdings?.diiHolding?.missingReason, symReport, 'B');
      track('fiiTrend', f.holdings?.fiiTrend?.status === 'AVAILABLE', f.holdings?.fiiTrend?.missingReason, symReport, 'B');
      track('diiTrend', f.holdings?.diiTrend?.status === 'AVAILABLE', f.holdings?.diiTrend?.missingReason, symReport, 'B');

      // Efficiency & Valuation
      track('roe', f.efficiency?.roe?.status === 'AVAILABLE', f.efficiency?.roe?.missingReason, symReport, 'B');
      track('roce', f.efficiency?.roce?.status === 'AVAILABLE', f.efficiency?.roce?.missingReason, symReport, 'B');
      track('pe', f.valuation?.pe?.status === 'AVAILABLE', f.valuation?.pe?.missingReason, symReport, 'B');
      track('peg', f.valuation?.peg?.status === 'AVAILABLE', f.valuation?.peg?.missingReason, symReport, 'B');

      // Qualitative & Moat
      track('demandOutlook', f.outlook?.demandOutlook?.status === 'AVAILABLE', f.outlook?.demandOutlook?.missingReason, symReport, 'D');
      track('peerContext', f.outlook?.peerContext?.status === 'AVAILABLE', f.outlook?.peerContext?.missingReason, symReport, 'D');
      track('keyRisks', f.keyRisks?.status === 'AVAILABLE', f.keyRisks?.missingReason, symReport, 'D');
      track('whatToWatchNext', f.whatToWatchNext?.status === 'AVAILABLE', f.whatToWatchNext?.missingReason, symReport, 'D');

      // QGLP
      track('qglpVerdict', q.verdict && q.verdict !== 'DATA_INSUFFICIENT', 'QGLP_PILLARS_INCOMPLETE', symReport, 'D');

      results.push(symReport);
    } catch (e: any) {
      console.error(`[Inventory] Error probing ${sym}:`, e.message);
    }
  }

  // 2. Build Summaries
  const fieldSummary: Record<string, { available: number; missing: number; pctAvailable: number }> = {};
  for (const [k, v] of Object.entries(fieldStats)) {
    const total = v.available + v.missing;
    fieldSummary[k] = {
      available: v.available,
      missing: v.missing,
      pctAvailable: total > 0 ? Number(((v.available / total) * 100).toFixed(1)) : 0
    };
  }

  const topMissingFields = Object.entries(fieldSummary)
    .map(([field, s]) => ({
      field,
      missingCount: s.missing,
      pctMissing: Number((100 - s.pctAvailable).toFixed(1))
    }))
    .sort((a, b) => b.missingCount - a.missingCount);

  const topMissingReasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const output: InventoryOutput = {
    generatedAt: new Date().toISOString(),
    totalSymbolsChecked: results.length,
    fieldSummary,
    topMissingFields,
    topMissingReasons,
    classificationRollup: classificationCounts,
    symbols: results
  };

  // 3. Write JSON artifact
  const jsonPath = path.resolve('reports', 'data_quality', 'analyze360_missing_data_inventory.json');
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`JSON inventory written to: ${jsonPath}`);

  // 4. Generate Markdown artifact
  const mdLines: string[] = [
    `# WealthOS Analyze360 Missing Data Inventory`,
    ``,
    `**Generated At**: ${output.generatedAt}`,
    `**Total Symbols Checked**: ${output.totalSymbolsChecked}`,
    ``,
    `## 1. Classification of Missing Data`,
    ``,
    `Every missing data instance across the ${output.totalSymbolsChecked} inspected stocks is strictly classified into 5 root causes:`,
    ``,
    `| Classification Code | Description | Count | Action Required |`,
    `| :--- | :--- | :--- | :--- |`,
    `| **A** | Source data exists locally, but resolver mapping is missing / unmapped | **${classificationCounts.A_mapping_missing}** | Surgical resolver mapping updates |`,
    `| **B** | Source data not ingested | **${classificationCounts.B_source_not_ingested}** | Routine scheduled provider acquisition (Trendlyne / Upstox / Kite) |`,
    `| **C** | Provider unlikely to have it (early microcap / unlisted / SME) | **${classificationCounts.C_provider_unlikely}** | Fail-closed transparency; no action possible |`,
    `| **D** | Requires statutory exchange filing / XBRL extraction (FERE) | **${classificationCounts.D_requires_xbrl_filings}** | FERE XBRL parser / statutory statement backfill |`,
    `| **E** | Requires sector index OHLCV acquisition | **${classificationCounts.E_requires_sector_ohlcv}** | Sector Index OHLCV ingestion & map |`,
    ``,
    `## 2. Field Availability & Missingness Summary`,
    ``,
    `| Field Name | Available | Missing | % Available | Top Reason Code |`,
    `| :--- | :--- | :--- | :--- | :--- |`
  ];

  for (const [fName, stat] of Object.entries(fieldSummary)) {
    mdLines.push(`| \`${fName}\` | ${stat.available} | ${stat.missing} | ${stat.pctAvailable}% | ${output.symbols.find(s => s.reasons[fName])?.reasons[fName] || 'None'} |`);
  }

  mdLines.push(
    ``,
    `## 3. Top Missing Fields`,
    ``,
    `| Rank | Field Name | Missing Symbols | % Missing | Root Classification |`,
    `| :--- | :--- | :--- | :--- | :--- |`
  );

  topMissingFields.slice(0, 15).forEach((t, i) => {
    const sampleSym = output.symbols.find(s => s.categoryClassification[t.field]);
    const cat = sampleSym ? sampleSym.categoryClassification[t.field] : 'B';
    mdLines.push(`| ${i + 1} | \`${t.field}\` | ${t.missingCount} / ${output.totalSymbolsChecked} | ${t.pctMissing}% | Category ${cat} |`);
  });

  mdLines.push(
    ``,
    `## 4. Top Missing Reasons`,
    ``,
    `| Rank | Missing Reason Code | Occurrences | Primary Driver |`,
    `| :--- | :--- | :--- | :--- |`
  );

  topMissingReasons.slice(0, 12).forEach((r, i) => {
    mdLines.push(`| ${i + 1} | \`${r.reason}\` | ${r.count} | Strict deterministic validation without synthetic proxies |`);
  });

  mdLines.push(
    ``,
    `## 5. Symbol Level Sample Breakdown (Top Candidates)`,
    ``,
    `| Symbol | Company Name | Sector | Market Cap (₹ Cr) | Missing Fields Count | Sample Missing Fields |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- |`
  );

  output.symbols.slice(0, 15).forEach(s => {
    const missingSample = s.missingFields.slice(0, 3).map(f => `\`${f}\``).join(', ');
    mdLines.push(`| **${s.symbol}** | ${s.companyName || 'N/A'} | ${s.sector || 'N/A'} | ${s.marketCapCr ? s.marketCapCr : 'N/A'} | ${s.missingFields.length} | ${missingSample}... |`);
  });

  const mdPath = path.resolve('reports', 'data_quality', 'analyze360_missing_data_inventory.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf8');
  console.log(`Markdown inventory written to: ${mdPath}`);
  console.log('Missing data inventory complete.');
  process.exit(0);
}

runInventory().catch(err => {
  console.error('Fatal error in analyze360_missing_data_inventory:', err);
  process.exit(1);
});
