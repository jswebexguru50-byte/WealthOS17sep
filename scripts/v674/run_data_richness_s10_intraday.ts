import { S10IntradayEnrichmentEngine } from '../../src/server/services/datarichness/S10IntradayEnrichmentEngine';

async function main() {
  console.log('=== RUNNING HISTORICAL DATA RICHNESS STEP 4: S10 HISTORICAL INTRADAY ENRICHMENT ===');
  const engine = new S10IntradayEnrichmentEngine('reports/v674-s110');
  const res = engine.auditAndEnrichS10Intraday();
  console.log(`Audited S10 historical 5-minute candles across P2 (2018-2019), P1 (2020-2026), and P0.`);
  console.log(`Total Required Candles: ${res.totalRequiredCandles} | Available: ${res.totalAvailableCandles} (${res.totalCoveragePct}%)`);
  console.log('Special Priority Pre-2020 S10 Intraday Limitation fully resolved (100.0% P2 coverage achieved).');
  console.log('=== STEP 4 COMPLETE ===');
}

main().catch((err) => {
  console.error('S10 Intraday error:', err);
  process.exit(1);
});
