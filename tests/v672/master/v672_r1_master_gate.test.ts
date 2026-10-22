import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function loadValidationGates(): Record<string, any> {
  const finalReportPath = path.resolve('reports/v672/V672_FINAL_VALIDATION_REPORT.json');
  if (!fs.existsSync(finalReportPath)) {
    throw new Error('V672_FINAL_VALIDATION_REPORT.json missing');
  }
  const report = JSON.parse(fs.readFileSync(finalReportPath, 'utf8'));

  return {
    R1_ACCOUNTING_IMPACT: report.accountingBugImpactAudited ? 'PASS' : 'FAIL',
    R2_CANONICAL_IMMUTABILITY: report.canonicalV65Preserved ? 'PASS' : 'FAIL',
    R3_CLEAN_ROOM_REPLAY: report.independentReplayVerified ? 'PASS' : 'FAIL',
    R4_DEPENDENCY_ISOLATION: report.shadowDependencyIsolationVerified ? 'PASS' : 'FAIL',
    R5_PIT_POPULATION: report.pitPopulationValidated ? 'PASS' : 'FAIL',
    R6_LOOKAHEAD: report.noLookahead ? 'PASS' : 'FAIL',
    R7_UNIVERSE_INTEGRITY: report.noCurrentUniverseFallback ? 'PASS' : 'FAIL',
    R8_HYPOTHESIS_REGISTRY: report.experimentRegistryComplete ? 'PASS' : 'FAIL',
    R9_CONTAMINATION: report.contaminationFree ? 'PASS' : 'FAIL',
    R10_BH_FDR: report.fdrVerified ? 'PASS' : 'FAIL',
    R11_WFO: report.wfoVerified ? 'PASS' : 'FAIL',
    R12_REGIME: report.regimeRobustnessVerified ? 'PASS' : 'FAIL',
    R13_BOOTSTRAP: report.bootstrapVerified ? 'PASS' : 'FAIL',
    R14_COST: report.transactionCostVerified ? 'PASS' : 'FAIL',
    R15_CAPACITY: report.capacityValidated ? 'PASS' : 'FAIL',
    R16_SUPPRESSION: report.opportunitySuppressionReconciled ? 'PASS' : 'FAIL',
    R17_RISK_ABLATION: report.riskAblationVerified ? 'PASS' : 'FAIL',
    R18_FROZEN_CONTROLS: report.frozenControlsIntact ? 'PASS' : 'FAIL',
    R19_PRODUCTION_LOCK: report.productionLocked ? 'PASS' : 'FAIL',
    productionPromotionAuthorization: report.productionPromotionAuthorization,
    liveExecutionAuthorization: report.liveExecutionAuthorization,
    status: report.status
  };
}

describe('v6.7.2-R1 master gate', () => {
  it('must not declare C12 eligible unless every mandatory gate passes', () => {
    const gates = loadValidationGates();

    const mandatory = [
      'R1_ACCOUNTING_IMPACT',
      'R2_CANONICAL_IMMUTABILITY',
      'R3_CLEAN_ROOM_REPLAY',
      'R4_DEPENDENCY_ISOLATION',
      'R5_PIT_POPULATION',
      'R6_LOOKAHEAD',
      'R7_UNIVERSE_INTEGRITY',
      'R8_HYPOTHESIS_REGISTRY',
      'R9_CONTAMINATION',
      'R10_BH_FDR',
      'R11_WFO',
      'R12_REGIME',
      'R13_BOOTSTRAP',
      'R14_COST',
      'R15_CAPACITY',
      'R16_SUPPRESSION',
      'R17_RISK_ABLATION',
      'R18_FROZEN_CONTROLS',
      'R19_PRODUCTION_LOCK'
    ];

    for (const gate of mandatory) {
      expect(gates[gate], `Mandatory gate ${gate} failed`).toBe('PASS');
    }

    expect(gates.productionPromotionAuthorization).toBe(false);
    expect(gates.liveExecutionAuthorization).toBe(false);
    expect(gates.status).toBe('C12_RESEARCH_ELIGIBLE');
  });
});
