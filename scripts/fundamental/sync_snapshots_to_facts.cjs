const Database = require('better-sqlite3');
const path = require('path');
const db = new Database('portfolio.db');

console.log('Syncing all Trendlyne snapshots into company_facts...');

const rows = db.prepare(`
  SELECT symbol, response_json, fetched_at 
  FROM fundamental_endpoint_snapshots 
  WHERE provider = 'TRENDLYNE_MCP' AND status = 'SUCCESS' AND response_json IS NOT NULL
`).all();

console.log(`Found ${rows.length} snapshots to process.`);

const insertFact = db.prepare(`
  INSERT OR REPLACE INTO company_facts
  (factId, companyId, symbol, metric, periodType, periodEnd, asOfDate, factType, sourceType, scope, verificationStatus, fetchedAt, value, unit, provider, availableAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'REPORTED', 'STRUCTURED_SECONDARY', 'CONSOLIDATED', 'SECONDARY_VERIFIED', datetime('now'), ?, ?, 'TRENDLYNE_MCP', ?)
`);

const insertHfs = db.prepare(`
  INSERT OR REPLACE INTO HistoricalFinancialStatements
  (symbol, statement_type, period_label, period_date, opm_pct, primary_source)
  VALUES (?, 'QUARTERLY_PL', ?, ?, ?, 'TRENDLYNE_MCP')
`);

let factsInserted = 0;
let hfsInserted = 0;

const runSync = db.transaction(() => {
  for (const r of rows) {
    const symbol = r.symbol;
    let metrics;
    try {
      metrics = JSON.parse(r.response_json);
    } catch {
      continue;
    }
    if (!metrics || typeof metrics !== 'object') continue;

    const asOf = metrics.asOfDate || (r.fetched_at ? r.fetched_at.substring(0, 10) : '2026-10-01');
    const asOfYear = parseInt(asOf.substring(0, 4), 10) || 2026;

    // 1. Annual Revenue Series
    const revPoints = [
      { yr: asOfYear, val: metrics.sra },
      { yr: asOfYear - 1, val: metrics.sramy1 },
      { yr: asOfYear - 2, val: metrics.sramy2 },
      { yr: asOfYear - 3, val: metrics.sramy3 }
    ];
    for (const pt of revPoints) {
      if (pt.val != null && Number(pt.val) > 0) {
        const periodEnd = `${pt.yr}-03-31`;
        const factId = `tl:${symbol}:revenue:${periodEnd}`;
        insertFact.run(factId, symbol, symbol, 'revenue', 'ANNUAL', periodEnd, asOf, String(pt.val), 'INR_CR', asOf);
        factsInserted++;
      }
    }

    // 2. Annual Net Profit / PAT Series
    const patPoints = [
      { yr: asOfYear, val: metrics.npa },
      { yr: asOfYear - 1, val: metrics.npamy1 },
      { yr: asOfYear - 2, val: metrics.npamy2 },
      { yr: asOfYear - 3, val: metrics.npamy3 }
    ];
    for (const pt of patPoints) {
      if (pt.val != null && !isNaN(Number(pt.val))) {
        const periodEnd = `${pt.yr}-03-31`;
        const factId = `tl:${symbol}:pat:${periodEnd}`;
        insertFact.run(factId, symbol, symbol, 'pat', 'ANNUAL', periodEnd, asOf, String(pt.val), 'INR_CR', asOf);
        factsInserted++;
      }
    }

    // 3. Ratios: ROCE, ROE, Debt/Equity, PE, PEG, Market Cap
    const ratioMetrics = [
      { metric: 'roce_reported', val: metrics.rocea, unit: '%', pType: 'ANNUAL' },
      { metric: 'roe_pct', val: metrics.roea, unit: '%', pType: 'ANNUAL' },
      { metric: 'debt_to_equity_reported', val: metrics.debtcea, unit: 'RATIO', pType: 'ANNUAL' },
      { metric: 'pe_ratio', val: metrics.pettm, unit: 'RATIO', pType: 'TTM' },
      { metric: 'peg_ratio', val: metrics.pegttm, unit: 'RATIO', pType: 'TTM' },
      { metric: 'market_cap_cr', val: metrics.mcapq, unit: 'INR_CR', pType: 'LATEST' },
      { metric: 'operating_profit', val: metrics.opa, unit: 'INR_CR', pType: 'ANNUAL' },
      { metric: 'operating_profit', val: metrics.opq, unit: 'INR_CR', pType: 'QUARTERLY' },
      { metric: 'promoter_pledge', val: metrics.prompledge, unit: '%', pType: 'QUARTERLY' },
      { metric: 'cfo', val: metrics.cfoa, unit: 'INR_CR', pType: 'ANNUAL' }
    ];

    for (const rm of ratioMetrics) {
      if (rm.val != null && !isNaN(Number(rm.val))) {
        const factId = `tl:${symbol}:${rm.metric}:${rm.pType}`;
        insertFact.run(factId, symbol, symbol, rm.metric, rm.pType, asOf, asOf, String(rm.val), rm.unit, asOf);
        factsInserted++;
      }
    }

    // 4. Sequential quarterly margins
    if (metrics.opmpctq != null && !isNaN(Number(metrics.opmpctq))) {
      insertHfs.run(symbol, `${asOf} (Latest Qtr)`, asOf, Number(metrics.opmpctq));
      hfsInserted++;
    }
    if (metrics.opmpctqmq1 != null && !isNaN(Number(metrics.opmpctqmq1))) {
      const prevQDate = `${asOfYear}-06-30`;
      insertHfs.run(symbol, `1Q Ago`, prevQDate, Number(metrics.opmpctqmq1));
      hfsInserted++;
    }
  }
});

runSync();

console.log(`Sync complete: ${factsInserted} facts and ${hfsInserted} HFS records persisted.`);
