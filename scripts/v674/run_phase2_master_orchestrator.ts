import { Phase2MasterOrchestrator } from '../../src/server/services/phase2forensics/Phase2MasterOrchestrator';

async function main() {
  console.log('================================================================');
  console.log('WEALTHOS PHASE 2.1 — S1–S10 HISTORICAL SIGNAL FORENSIC REPLAY');
  console.log('================================================================');

  const orchestrator = new Phase2MasterOrchestrator('reports/v674-phase2');
  const certificate = await orchestrator.executeFullPhase2Orchestration();

  console.log('\n--- PHASE 2.1 FORENSIC EXECUTION COMPLETE ---');
  console.log(`Final Status:                     ${certificate.status}`);
  console.log(`Git HEAD SHA:                     ${certificate.gitCommitSha}`);
  console.log(`Dataset Version:                  ${certificate.datasetVersion}`);
  console.log(`Dataset Hash:                     ${certificate.datasetHash}`);
  console.log(`Replay Period:                    ${certificate.replayPeriod}`);
  console.log(`Trading Sessions Evaluated:       ${certificate.calendarTradingSessions}`);
  console.log(`Expected PIT Security-Days:       ${certificate.expectedPITSecurityDays}`);
  console.log(`Actual Evaluated Security-Days:   ${certificate.actualEvaluatedSecurityDays}`);
  console.log(`Total Strategy Signals:           ${certificate.totalSignalsGenerated}`);
  console.log(`Unique Stocks Signaled:           ${certificate.uniqueStocksSignaled}`);
  console.log(`Near-Miss Count:                  ${certificate.nearMissCount}`);
  console.log(`Downstream Investment Candidates: ${certificate.downstreamInvestmentCandidates}`);
  console.log(`Capital Eligible Candidates:      ${certificate.capitalEligibleCandidates}`);
  console.log(`Signal Hash Match:                ${certificate.signalHashMatch ? 'PASS' : 'FAIL'}`);
  console.log(`Parameter Hash Match:             ${certificate.parameterHashMatch ? 'PASS' : 'FAIL'}`);
  console.log(`Outcome Hash Match:               ${certificate.outcomeHashMatch ? 'PASS' : 'FAIL'}`);
  console.log(`Overall Reproducibility Match:    ${certificate.overallReproducibilityMatch ? '100% MATCH' : 'MISMATCH'}`);
  console.log(`Run 1 Signal Hash:                ${certificate.run1SignalHash}`);
  console.log(`Run 2 Signal Hash:                ${certificate.run2SignalHash}`);
  console.log('\nOutput Artifacts Generated:');
  for (const artifact of certificate.outputArtifacts) {
    console.log(` - ${artifact}`);
  }
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Phase 2.1 Execution Failed:', err);
  process.exit(1);
});
