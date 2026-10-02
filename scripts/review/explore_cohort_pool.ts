import Database from 'better-sqlite3';
import { BusinessModelClassifier } from '../../src/server/services/intelligence/domain/BusinessModelClassifier.js';
import { mapRawToCanonicalSector, CANONICAL_SECTORS } from './cohort_builder.js';

const db = new Database('portfolio.db', { readonly: true });

// 1. Get all tickers with sector / industry / market cap
const tickers = db.prepare(`
  SELECT m.symbol, m.name, m.sector, m.industry, m.isin, m.last_price,
         f.pe_ratio, f.promoter_holding_pct, f.fii_holding_pct, f.dii_holding_pct, f.debt_to_equity, f.operating_margin_pct,
         (SELECT COUNT(*) FROM company_facts c WHERE c.symbol = m.symbol) as fact_count,
         (SELECT COUNT(*) FROM company_facts c WHERE c.symbol = m.symbol AND c.verificationStatus IN ('VERIFIED', 'VERIFIED_PARTIAL')) as verified_fact_count
  FROM MasterTickers m
  LEFT JOIN FundamentalSnapshots f ON f.symbol = m.symbol
  WHERE m.symbol IS NOT NULL AND m.symbol != ''
  ORDER BY m.symbol
`).all() as any[];

console.log(`Total MasterTickers found: ${tickers.length}`);

// Classify sectors and business models
const sectorCounts: Record<string, number> = {};
const bmCounts: Record<string, number> = {};
const factBuckets = { high: 0, medium: 0, sparse: 0, zero: 0 };

for (const t of tickers) {
  const cSec = mapRawToCanonicalSector(t.sector, t.industry) || 'OTHER_UNCLASSIFIED';
  sectorCounts[cSec] = (sectorCounts[cSec] || 0) + 1;

  const bm = BusinessModelClassifier.classify(t.symbol, t.sector, t.industry, t.name);
  bmCounts[bm] = (bmCounts[bm] || 0) + 1;

  if (t.fact_count >= 15) factBuckets.high++;
  else if (t.fact_count >= 5) factBuckets.medium++;
  else if (t.fact_count > 0) factBuckets.sparse++;
  else factBuckets.zero++;
}

console.log('Sector distribution:', sectorCounts);
console.log('Business Model distribution:', bmCounts);
console.log('Fact coverage distribution:', factBuckets);

// Check conflicting facts in company_facts
const conflicts = db.prepare(`
  SELECT symbol, metric, periodEnd, COUNT(*) as c
  FROM company_facts
  GROUP BY symbol, metric, periodEnd
  HAVING c > 1
`).all() as any[];

const conflictSymbols = [...new Set(conflicts.map(c => c.symbol))];
console.log(`Symbols with multiple facts for same metric+period: ${conflictSymbols.length}`);
console.log('Sample conflict symbols:', conflictSymbols.slice(0, 10));
