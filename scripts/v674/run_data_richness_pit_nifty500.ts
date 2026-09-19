import { PITNifty500Resolver } from '../../src/server/services/datarichness/PITNifty500Resolver';

async function main() {
  console.log('=== RUNNING HISTORICAL DATA RICHNESS STEP 2: PIT NIFTY 500 CONSTITUENT RESOLUTION ===');
  const resolver = new PITNifty500Resolver('reports/v674-s110');
  const res = resolver.resolvePITCoverage('2018-01-01', '2026-04-05');
  console.log(`Resolved PIT NIFTY 500 membership across ${res.tradingDaysCount} trading days.`);
  console.log(`Tracked ${res.securitiesTracked} unique securities across identity & corporate action chains.`);
  console.log(`PIT Coverage: ${res.pitCoveragePct}% | Current Universe Leakage: ${res.currentUniverseLeakage}`);
  console.log('Saved reports/v674-s110/S110_PIT_COVERAGE.json');
  console.log('=== STEP 2 COMPLETE ===');
}

main().catch((err) => {
  console.error('PIT Resolver error:', err);
  process.exit(1);
});
