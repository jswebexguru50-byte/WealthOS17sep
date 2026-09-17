
import { getDB } from './src/server/database.js';
import { PureTechnicalStrategiesEngine } from './src/server/services/PureTechnicalStrategiesEngine.js';

async function test() {
  const engine = new PureTechnicalStrategiesEngine();
  const res = await engine.scanUniverseAllStrategies(['S1_VPA_BASE_BREAKOUT']);
  const s1res = res.strategy_results['S1_VPA_BASE_BREAKOUT'];
  const qualified = s1res.filter((s: any) => s.qualified).length;
  console.log('S1_VPA_BASE_BREAKOUT total stocks:', s1res.length, 'qualified:', qualified);
  process.exit(0);
}

test().catch(console.error);

