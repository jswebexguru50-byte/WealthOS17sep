import { SmartMoneyFlowEngine } from '../src/server/services/SmartMoneyFlowEngine.js';

async function run() {
  console.log('Testing SmartMoneyFlowEngine...');
  const t0 = Date.now();
  const engine = SmartMoneyFlowEngine.getInstance();
  await engine.initTables();

  console.log('Fetching sector flows for 1W...');
  const sectors = await engine.getSectorSmartMoneyFlows('1W');
  console.log(`getSectorSmartMoneyFlows returned ${sectors.length} sectors in ${Date.now() - t0}ms:`);
  console.log(sectors.slice(0, 3).map(s => ({ sector: s.sector, netFlowCr: s.netFlowCr, avgSmas: s.averageSmas })));

  const t1 = Date.now();
  console.log('Fetching top stocks for 1W...');
  const stocks = await engine.getTopSmartMoneyStocks('1W', 10);
  console.log(`getTopSmartMoneyStocks returned acc:${stocks.topAccumulation.length}, dist:${stocks.topDistribution.length} in ${Date.now() - t1}ms`);
  console.log('Top accumulation:', stocks.topAccumulation.slice(0, 3).map(s => ({ sym: s.symbol, smas: s.smasScore, flow: s.netInstitutionalFlowCr })));

  process.exit(0);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
