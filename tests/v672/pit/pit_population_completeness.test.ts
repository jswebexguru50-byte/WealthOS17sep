import { describe, it, expect } from 'vitest';
import { PITEvidenceValidator } from '../../../src/server/services/audit/PITEvidenceValidator.js';
import { V65BaselineReproducer } from '../../../src/server/services/research/V65BaselineReproducer.js';

describe('V672-R1 — PIT Complete Decision-Fact Population Tests', () => {
  const validator = new PITEvidenceValidator();
  const base = new V65BaselineReproducer().loadCanonicalBaseline();

  it('validates complete population of 31,542 material decision facts across all 4,506 trades', () => {
    const report = validator.auditCompletePopulation(base.trades);

    expect(report.calendarSessions).toBe(1631);
    expect(report.tradeDecisions).toBe(4506);
    expect(report.factsPerDecision).toBe(7);
    expect(report.materialDecisionFacts).toBe(31542); // 4506 * 7
    expect(report.sessionLevelChecks).toBe(1631);
    expect(report.sessionLevelFailures).toBe(0);
    expect(report.decisionLevelChecks).toBe(31542);
    expect(report.decisionLevelFailures).toBe(0);

    expect(report.totalDecisions).toBe(4506);
    expect(report.totalDecisionFacts).toBe(4506 * 7); // 31,542 material facts
    expect(report.pitValidatedFacts).toBe(report.totalDecisionFacts);
    expect(report.lookaheadFacts).toBe(0);
    expect(report.dataInsufficientFacts).toBe(0);
    expect(report.missingAvailableAtFacts).toBe(0);
    expect(report.validatedRatio).toBe(1.0);
    expect(report.overallStatus).toBe('PASS');

    // Check domain coverage
    expect(report.factsByType['PRICE'].total).toBeGreaterThan(0);
    expect(report.factsByType['INDEX_MEMBERSHIP'].total).toBe(4506);
    expect(report.factsByType['CORPORATE_ACTION'].total).toBe(4506);
    expect(report.factsByType['FINANCIAL_STATEMENT'].total).toBe(4506);
    expect(report.factsByType['SHAREHOLDING'].total).toBe(4506);
  });
});
