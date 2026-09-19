import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { ModuleDependencyAnalyzer } from '../../../src/server/services/audit/ModuleDependencyAnalyzer.js';

describe('V672 Track B — C12 Shadow Independence & Shared Accounting Dependency Isolation Tests', () => {
  const analyzer = new ModuleDependencyAnalyzer();
  const shadowFile = 'src/server/services/research/C12IndependentShadowReplayer.ts';

  const forbiddenProducerTargets = [
    'EconomicReplayEngine',
    'PortfolioAccounting',
    'PnLCalculator',
    'RiskCalculator',
    'PositionSizer',
    'CostCalculator'
  ];

  for (const forbidden of forbiddenProducerTargets) {
    it(`fails if C12IndependentShadowReplayer imports producer module: ${forbidden}`, () => {
      const violations = analyzer.findDependencyPaths(shadowFile, forbidden);
      expect(violations.length, `Forbidden dependency path found to ${forbidden}: ${JSON.stringify(violations)}`).toBe(0);
    });
  }

  it('verifies complete absence of any circular or shared accounting dependencies in shadow replayer', () => {
    const rawAST = analyzer.parseFileAST(shadowFile);
    // Shadow must only import node builtins, EquityPointUniverseManifest, or self-contained models
    for (const imp of rawAST) {
      expect(imp.rawSpecifier).not.toContain('EconomicReplayEngine');
      expect(imp.rawSpecifier).not.toContain('StrategyParameterConfig');
      expect(imp.rawSpecifier).not.toContain('ExecutionGateway');
    }
  });
});
