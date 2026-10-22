import { describe, it, expect } from 'vitest';
import { ModuleDependencyAnalyzer } from '../../../src/server/services/audit/ModuleDependencyAnalyzer.js';
import path from 'path';

describe('V672 Track H — AST Dependency Graph Audit Tests', () => {
  const analyzer = new ModuleDependencyAnalyzer();

  it('verifies IndependentAuditEngine has zero imports from EconomicReplayEngine via TypeScript AST', () => {
    const auditorPath = path.resolve('src/server/services/research/IndependentAuditEngine.ts');
    const result = analyzer.assertAuditorIndependence(auditorPath);
    expect(result.clean).toBe(true);
    expect(result.violations.length).toBe(0);
  });
});
