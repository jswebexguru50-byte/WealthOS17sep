import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('V672 Track K — Master Evidence Completeness Tests', () => {
  it('verifies that V672_GATE_EVIDENCE_MATRIX.json contains 27 gates and zero null fields', () => {
    const matrixPath = path.resolve('reports/v672/V672_GATE_EVIDENCE_MATRIX.json');
    expect(fs.existsSync(matrixPath)).toBe(true);

    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    expect(matrix.totalGates).toBe(27);
    expect(matrix.passedGates).toBe(27);
    expect(matrix.failedGates).toBe(0);
    expect(matrix.allGatesPassed).toBe(true);
    expect(matrix.c12ResearchEligibility).toBe('ELIGIBLE');
    expect(matrix.productionPromotionAuthorized).toBe(false);

    for (const g of matrix.gates) {
      expect(g.status).toBe('PASS');
      expect(g.sourceEngine).toBeDefined();
      expect(g.computationHash).toBeDefined();
      expect(g.computationHash.length).toBeGreaterThan(10);
    }
  });
});
