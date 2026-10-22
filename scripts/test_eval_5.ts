import { ConsolidatedOpportunityEngine } from '../src/server/services/ConsolidatedOpportunityEngine.js';

async function main() {
  const engine = ConsolidatedOpportunityEngine.getInstance();
  const testSymbols = ['INFY', 'WIPRO', 'TATASTEEL', 'ADANIPORTS', 'NESTLEIND'];
  console.log('Testing evaluation on 5 symbols:', testSymbols);
  const start = Date.now();
  for (const sym of testSymbols) {
    const s1 = Date.now();
    const res = await engine.evaluateScripOnDemand(sym);
    console.log(`Evaluated ${sym}: ${res ? `Score ${res.convergenceScore}, ${res.companyName}, ${res.marketCapCategory}` : 'FAILED'} in ${Date.now() - s1}ms`);
  }
  console.log(`Total time for 5 symbols: ${Date.now() - start}ms`);
}

main().catch(console.error);
