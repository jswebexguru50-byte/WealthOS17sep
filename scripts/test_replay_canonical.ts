import fs from 'fs';
import path from 'path';
import { CleanRoomEconomicReplay } from '../src/server/services/research/CleanRoomEconomicReplay';
import { CleanRoomIndependentAuditor } from '../src/server/services/research/CleanRoomIndependentAuditor';
import { ReplayReconciliationEngine } from '../src/server/services/research/ReplayReconciliationEngine';
import { createDeterministicRunContext } from '../src/server/services/research/DeterministicRunContext';
import { ResearchRun } from '../src/server/services/research/ResearchRun';

async function testReplay() {
  const root = process.cwd();
  const ledgerPath = path.join(root, 'data/v6.5/runs/REPLAY_V65_ED18F3B9A403/v65_economic_replay_ledger.jsonl');
  
  console.log('[Test Replay] Loading canonical ledger from:', ledgerPath);
  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
  console.log('[Test Replay] Loaded lines:', lines.length);

  const rawTrades = lines.map(l => JSON.parse(l));
  
  // Adapt to CanonicalTrade interface
  const trades = rawTrades.map(t => ({
    ...t,
    // Ensure stopPrice is defined for R calculation
    stopPrice: t.stopPrice ?? (t.rawEntryPrice ? t.rawEntryPrice * 0.95 : t.entryPrice * 0.95),
    entryPrice: t.rawEntryPrice ?? t.signalPrice ?? t.entryPrice ?? t.actualEntryPrice,
    exitPrice: t.actualExitPrice ?? t.exitPrice
  }));

  const runContext: ResearchRun = {
    runId: 'TEST_CANONICAL_R2',
    inputs: {} as any,
    frozenControls: { status: 'PASS', failures: [] },
    experimentRegistry: { experiments: {} },
    deterministicContext: createDeterministicRunContext({ runId: 'TEST_CANONICAL_R2', seed: 42, timestamp: '2026-09-15T23:59:59Z' })
  };

  const costModel = {
    calculate: (trade: any) => trade.totalCosts ?? 0
  };

  console.log('[Test Replay] Executing CleanRoomEconomicReplay...');
  const replayEngine = new CleanRoomEconomicReplay();
  const producerResult = replayEngine.run(runContext, trades, costModel);

  console.log('[Test Replay] Executing CleanRoomIndependentAuditor...');
  const auditorEngine = new CleanRoomIndependentAuditor();
  const auditorResult = auditorEngine.run(runContext, trades, (trade) => trade.totalCosts ?? 0);

  console.log('[Test Replay] Reconciling Producer and Auditor...');
  ReplayReconciliationEngine.compare(producerResult, auditorResult);
  console.log('[Test Replay] Reconciliation SUCCESS!');

  console.log('\n=== METRICS SUMMARY ===');
  console.log('Trade Count:', producerResult.metrics.tradeCount);
  console.log('Total Costs:', producerResult.metrics.costs.toFixed(2));
  console.log('Total Net PnL:', auditorResult.auditedTotalNetPnl.toFixed(2));
  console.log('Expectancy R:', producerResult.metrics.expectancyR.toFixed(5));
}

testReplay().catch(console.error);
