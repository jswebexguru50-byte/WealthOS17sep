/**
 * scripts/review/analyze360_coverage_probe.ts
 *
 * Real product coverage check for Analyze360, QGLP, and Fundamental Snapshots.
 * Read-only probe evaluating local production data coverage across at least 30 symbols.
 * Zero network calls to external providers, zero LLM, zero DB mutations.
 */

import fs from 'node:fs';
import path from 'node:path';

// Diverse set of 34 symbols across Seven Strategies candidates, FERE XBRL, Historical Statements, and Large/Mid/Small/Micro caps
const SYMBOLS_TO_PROBE = [
  // 1. Seven Strategies candidates (active momentum & swing candidates)
  'EMAMIREAL',
  'MOTISONS',
  'DIVYADHAN',
  'GUJRAFFIA',
  'JITFINFRA',
  'K2INFRA',
  'PRAJIND',
  'KONSTELEC',
  'VLINFRA',
  'SUDARCOLOR',
  'VISHNUINFR',
  'TERA',
  'USHAMART',

  // 2. Large Cap Institutional benchmarks with audited XBRL filings
  'INFY',
  'TCS',
  'RELIANCE',

  // 3. Historical Financial Statements & Shareholding symbols
  '20MICRONS',
  '21STCENMGM',
  '360ONE',
  '3BBLACKBIO',
  '3IINFOLTD',
  '3MINDIA',
  '3PLAND',

  // 4. Mid & Small Cap Universe with FERE Evidence
  'AETHER',
  'DATAPATTNS',
  'KAYNES',
  'KPITTECH',
  'MAZDOCK',
  'POLICYBZR',
  'SONACOMS',
  'SUZLON',
  'TATATECH',
  'ZOMATO',
  'DEEPAKFERT'
];

interface FieldStats {
  available: number;
  missing: number;
  missingReasons: Record<string, number>;
}

async function runCoverageProbe() {
  console.log(`Starting Analyze360 coverage probe across ${SYMBOLS_TO_PROBE.length} symbols...`);

  const results: any[] = [];
  const fieldSummary: Record<string, FieldStats> = {};

  const recordField = (fieldName: string, fieldObj: any) => {
    if (!fieldSummary[fieldName]) {
      fieldSummary[fieldName] = { available: 0, missing: 0, missingReasons: {} };
    }
    const isAvail = fieldObj?.status === 'AVAILABLE' && fieldObj?.value !== null && fieldObj?.value !== undefined;
    if (isAvail) {
      fieldSummary[fieldName].available++;
    } else {
      fieldSummary[fieldName].missing++;
      const reason = fieldObj?.missingReason || 'MISSING_NO_REASON';
      fieldSummary[fieldName].missingReasons[reason] = (fieldSummary[fieldName].missingReasons[reason] || 0) + 1;
    }
  };

  let qglpComplete = 0;
  let qglpPartial = 0;
  let qglpMissing = 0;

  let technicalUsable = 0;
  let fundamentalUsable = 0;
  let bothUsable = 0;

  let actionBacktestReady = 0;
  let actionPaperTradeReady = 0;
  let actionAlertReady = 0;

  const topBlockers: Record<string, number> = {};

  for (const symbol of SYMBOLS_TO_PROBE) {
    try {
      const res = await fetch(`http://localhost:3000/api/analyze360/${symbol}`);
      if (!res.ok) {
        console.warn(`HTTP ${res.status} for ${symbol}`);
        continue;
      }
      const data = await res.json();
      results.push(data);

      const f = data.fundamental || {};
      const t = data.technical || {};
      const s = data.sectorMomentum || {};
      const q = data.qglp || {};
      const a = data.actionReadiness || {};

      // Technical fields
      recordField('latestClose', t.latestClose);
      recordField('latestOhlcvDate', t.latestOhlcvDate);
      recordField('ema20', t.ema20);
      recordField('sma20', t.sma20);
      recordField('sma50', t.sma50);
      recordField('sma200', t.sma200);
      recordField('rsi14', t.rsi14);
      recordField('atrPct', t.atrPct);

      // Sector
      const isSectorAvail = s?.mappingStatus === 'MAPPED' && s?.status && s?.status !== 'DATA_INSUFFICIENT' && !s?.missingReason;
      recordField('sectorMomentum', {
        status: isSectorAvail ? 'AVAILABLE' : 'MISSING',
        value: s?.status ?? null,
        missingReason: s?.missingReason || (s?.mappingStatus !== 'MAPPED' ? 'UNMAPPED_SECTOR' : null)
      });

      // Fundamental fields
      recordField('revenueGrowth3Y', f.revenueGrowth);
      recordField('revenueGrowth5Y', f.revenueGrowth?.fiveYearCagr);
      recordField('operatingProfit', f.profitability?.operatingProfit);
      recordField('pat', f.profitability?.pat);
      recordField('marginTrend', f.profitability?.marginTrend);
      recordField('debtToEquity', f.debtAndService?.debtToEquity);
      recordField('totalBorrowings', f.debtAndService?.totalBorrowings);
      recordField('cfo', f.cashFlow?.cfo);
      recordField('cfoToPat', f.cashFlow?.cfoToPat);
      recordField('cfoToOperatingProfit', f.cashFlow?.cfoToOperatingProfit);
      recordField('freeCashFlow', f.cashFlow?.freeCashFlow);
      recordField('fcfYield', f.cashFlow?.fcfYield);
      recordField('workingCapital', f.cashFlow?.workingCapital);
      recordField('promoterHolding', f.holdings?.promoterHolding);
      recordField('promoterPledge', f.holdings?.promoterPledge);
      recordField('fiiHolding', f.holdings?.fiiHolding);
      recordField('diiHolding', f.holdings?.diiHolding);
      recordField('fiiTrend', f.holdings?.fiiTrend);
      recordField('diiTrend', f.holdings?.diiTrend);
      recordField('roe', f.efficiency?.roe);
      recordField('roce', f.efficiency?.roce);
      recordField('pe', f.valuation?.pe);
      recordField('peg', f.valuation?.peg);
      recordField('demandOutlook', f.outlook?.demandOutlook);
      recordField('peerContext', f.outlook?.peerContext);
      recordField('keyRisks', f.keyRisks);
      recordField('whatToWatchNext', f.whatToWatchNext);

      // Usability criteria
      const isTechUsable = t.freshnessStatus === 'VALID' && t.latestClose?.value > 0;
      const isFundUsable = f.evidenceState === 'SUPPORTIVE' || (f.profitability?.pat?.value !== null && f.efficiency?.roe?.value !== null);

      if (isTechUsable) technicalUsable++;
      if (isFundUsable) fundamentalUsable++;
      if (isTechUsable && isFundUsable) bothUsable++;

      // QGLP status
      if (q.verdict && q.verdict !== 'DATA_INSUFFICIENT' && q.score !== null) {
        qglpComplete++;
      } else if (q.quality?.status === 'PASS' || q.growth?.status === 'PASS' || q.longevity?.status === 'PASS') {
        qglpPartial++;
      } else {
        qglpMissing++;
      }

      // Actions
      if (a.canBacktest?.enabled) actionBacktestReady++;
      else if (a.canBacktest?.blockerReason) {
        topBlockers[a.canBacktest.blockerReason] = (topBlockers[a.canBacktest.blockerReason] || 0) + 1;
      }

      if (a.canPaperTrade?.enabled) actionPaperTradeReady++;
      else if (a.canPaperTrade?.blockerReason) {
        topBlockers[a.canPaperTrade.blockerReason] = (topBlockers[a.canPaperTrade.blockerReason] || 0) + 1;
      }

      if (a.canCreateAlert?.enabled) actionAlertReady++;
      else if (a.canCreateAlert?.blockerReason) {
        topBlockers[a.canCreateAlert.blockerReason] = (topBlockers[a.canCreateAlert.blockerReason] || 0) + 1;
      }

      console.log(`[OK] ${symbol} | Tech: ${t.freshnessStatus} | QGLP: ${q.verdict || 'INSUFFICIENT'} | Actions: BT=${a.canBacktest?.enabled}, PT=${a.canPaperTrade?.enabled}, Alert=${a.canCreateAlert?.enabled}`);
    } catch (e) {
      console.error(`Error probing ${symbol}:`, e);
    }
  }

  // Generate Markdown report
  const total = results.length;
  let md = `# WealthOS Analyze360 Phase 7 Coverage Report\n\n`;
  md += `**Date**: ${new Date().toISOString()}\n`;
  md += `**Total Symbols Checked**: ${total}\n\n`;

  md += `## 1. Executive Usability Summary\n\n`;
  md += `| Category | Usable Count | Percentage |\n`;
  md += `| :--- | :--- | :--- |\n`;
  md += `| **Technical Usable (Valid Freshness & OHLCV)** | ${technicalUsable} / ${total} | ${((technicalUsable / total) * 100).toFixed(1)}% |\n`;
  md += `| **Fundamental Usable (Key Financial Metrics Present)** | ${fundamentalUsable} / ${total} | ${((fundamentalUsable / total) * 100).toFixed(1)}% |\n`;
  md += `| **Both Technical + Fundamental Usable** | ${bothUsable} / ${total} | ${((bothUsable / total) * 100).toFixed(1)}% |\n`;
  md += `| **QGLP Complete (Score & Verdict Evaluated)** | ${qglpComplete} / ${total} | ${((qglpComplete / total) * 100).toFixed(1)}% |\n`;
  md += `| **QGLP Partial (At Least 1 Pillar Evaluated)** | ${qglpPartial} / ${total} | ${((qglpPartial / total) * 100).toFixed(1)}% |\n`;
  md += `| **QGLP Missing / Insufficient Data** | ${qglpMissing} / ${total} | ${((qglpMissing / total) * 100).toFixed(1)}% |\n\n`;

  md += `## 2. Action Readiness Status\n\n`;
  md += `| Action Endpoint | Ready Count | Blocked Count | Readiness % |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;
  md += `| **Backtest Ready** | ${actionBacktestReady} | ${total - actionBacktestReady} | ${((actionBacktestReady / total) * 100).toFixed(1)}% |\n`;
  md += `| **Paper Trade Ready** | ${actionPaperTradeReady} | ${total - actionPaperTradeReady} | ${((actionPaperTradeReady / total) * 100).toFixed(1)}% |\n`;
  md += `| **Alert Create Ready** | ${actionAlertReady} | ${total - actionAlertReady} | ${((actionAlertReady / total) * 100).toFixed(1)}% |\n\n`;

  md += `## 3. Field Coverage Matrix\n\n`;
  md += `| Field Name | Available | Missing | Coverage % | Top Missing Reason |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;

  const globalMissingReasons: Record<string, number> = {};

  for (const [fName, stats] of Object.entries(fieldSummary)) {
    const cov = ((stats.available / total) * 100).toFixed(1);
    const sortedReasons = Object.entries(stats.missingReasons).sort((a, b) => b[1] - a[1]);
    const topReason = sortedReasons.length > 0 ? `${sortedReasons[0][0]} (${sortedReasons[0][1]})` : '—';

    for (const [r, count] of Object.entries(stats.missingReasons)) {
      globalMissingReasons[r] = (globalMissingReasons[r] || 0) + count;
    }

    md += `| \`${fName}\` | ${stats.available} | ${stats.missing} | ${cov}% | ${topReason} |\n`;
  }

  md += `\n## 4. Top Missing Reasons (Across All Fields)\n\n`;
  md += `| Missing Reason Code | Occurrences |\n`;
  md += `| :--- | :--- |\n`;
  const sortedGlobalReasons = Object.entries(globalMissingReasons).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [r, count] of sortedGlobalReasons) {
    md += `| \`${r}\` | ${count} |\n`;
  }

  md += `\n## 5. Top Production Blockers\n\n`;
  md += `| Blocker Reason | Blocked Count |\n`;
  md += `| :--- | :--- |\n`;
  const sortedBlockers = Object.entries(topBlockers).sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [b, count] of sortedBlockers) {
    md += `| ${b} | ${count} |\n`;
  }

  const outPath = path.resolve('reports', 'analyze360_phase7_coverage.md');
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`\nCoverage report successfully generated at: ${outPath}`);
}

runCoverageProbe().catch(e => {
  console.error('Fatal probe error:', e);
  process.exit(1);
});
