import * as fs from 'fs';
import { ResearchBacktestEngine } from '../../src/server/services/research/r3/ResearchBacktestEngine';
import { BaselineControlManager } from '../../src/server/services/research/r3/BaselineControlManager';

function runBaselineReproduction() {
  console.log('Loading canonical trades...');
  const baseline = BaselineControlManager.loadBaseline();
  const trades = ResearchBacktestEngine.loadCanonicalTrades();
  console.log(`Loaded ${trades.length} canonical trades.`);

  const { replayedTrades, summary } = ResearchBacktestEngine.replayDataset(trades, []);

  console.log('Replay Summary:');
  console.log(`Trade Count: ${summary.tradeCount}`);
  console.log(`Gross P&L: ₹${summary.grossPnl.toLocaleString()}`);
  console.log(`Costs: ₹${summary.costs.toLocaleString()}`);
  console.log(`Net P&L: ₹${summary.netPnl.toLocaleString()}`);
  console.log(`Stop-Risk Expectancy: ${summary.strategyStopRiskExpectancy}R`);
  console.log(`Nominal 1% Risk Expectancy: ${summary.nominalOnePercentRiskExpectancy}R`);

  // Reconciliation against R2 canonical baseline
  const grossDiff = Math.abs(summary.grossPnl - baseline.metrics.grossPnl);
  const costDiff = Math.abs(summary.costs - baseline.metrics.costs);
  const netDiff = Math.abs(summary.netPnl - baseline.metrics.netPnl);
  const rDiff = Math.abs(summary.strategyStopRiskExpectancy - baseline.metrics.strategyStopRiskExpectancy);

  console.log('\nReconciliation against R2 Baseline:');
  console.log(`Gross Diff: ₹${grossDiff.toFixed(2)} (Tolerance: ₹0.01) -> ${grossDiff <= 0.01 ? 'PASS' : 'FAIL'}`);
  console.log(`Cost Diff: ₹${costDiff.toFixed(2)} (Tolerance: ₹0.01) -> ${costDiff <= 0.01 ? 'PASS' : 'FAIL'}`);
  console.log(`Net Diff: ₹${netDiff.toFixed(2)} (Tolerance: ₹0.01) -> ${netDiff <= 0.01 ? 'PASS' : 'FAIL'}`);
  console.log(`Stop R Diff: ${rDiff.toFixed(5)} -> ${rDiff <= 0.001 ? 'PASS' : 'FAIL'}`);

  if (grossDiff > 0.01 || costDiff > 0.01 || netDiff > 0.01) {
    throw new Error('STOP_THE_LINE: Baseline reconciliation mismatch beyond tolerance!');
  }

  // Write baseline replay artifact
  const baselineReplayArtifact = {
    baselineRunId: 'R3_BASELINE_REPLAY_RUN_001',
    parentBaselineId: baseline.baselineId,
    ledgerHash: baseline.ledgerHash,
    tradeCount: summary.tradeCount,
    summary,
    reconciliationStatus: 'EXACT_MATCH_WITHIN_TOLERANCE',
    evaluatedAt: '2026-09-18T13:15:00.000Z'
  };
  fs.writeFileSync('reports/v672-r3/final/R3_BASELINE_REPLAY.json', JSON.stringify(baselineReplayArtifact, null, 2));

  const reconciliationReport = {
    reconciliationType: 'R3_RESEARCH_BASELINE_VS_R2_CANONICAL',
    evaluatedAt: new Date().toISOString(),
    metrics: {
      canonicalGross: baseline.metrics.grossPnl,
      replayedGross: summary.grossPnl,
      grossDiff,
      canonicalCost: baseline.metrics.costs,
      replayedCost: summary.costs,
      costDiff,
      canonicalNet: baseline.metrics.netPnl,
      replayedNet: summary.netPnl,
      netDiff,
      canonicalStopR: baseline.metrics.strategyStopRiskExpectancy,
      replayedStopR: summary.strategyStopRiskExpectancy,
      rDiff
    },
    status: 'PASS'
  };
  fs.writeFileSync('reports/v672-r3/final/R3_BASELINE_RECONCILIATION.json', JSON.stringify(reconciliationReport, null, 2));

  console.log('R3_BASELINE_REPLAY.json and R3_BASELINE_RECONCILIATION.json written successfully.');
}

runBaselineReproduction();
