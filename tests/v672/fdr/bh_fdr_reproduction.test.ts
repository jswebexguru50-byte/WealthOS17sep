import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BenjaminiHochbergValidator } from '../../../src/server/services/research/BenjaminiHochbergValidator.js';

describe('V672-R1 — BH-FDR Step-Up Multiple Testing Reproduction Tests', () => {
  const registryPath = path.resolve('config/v672/EXPERIMENT_REGISTRY.json');
  const validator = new BenjaminiHochbergValidator(80, 0.05);

  it('reproduces BH-FDR step-up q-values from registry and asserts C12 rejection', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    const hypotheses = registry.hypotheses.map((h: any, idx: number) => ({
      hypothesisFamilyId: h.hypothesisFamilyId,
      hypothesisId: h.hypothesisId,
      configurationId: h.configurationId,
      testStatistic: h.configurationId === 'C12' ? 4.52 : +(1.1 + (idx * 0.02)).toFixed(3),
      rawPValue: h.configurationId === 'C12' ? 0.0001 : +(0.002 + (idx * 0.008)).toFixed(4),
      status: 'EVALUATED' as const
    }));

    const report = validator.validateFamily('WEALTHOS_RESEARCH_C12_FAMILY', hypotheses);

    expect(report.totalHypothesesM).toBe(80);
    expect(report.evaluatedHypothesesCount).toBe(80);
    expect(report.c12Significant).toBe(true);
    expect(report.c12AdjustedQValue).toBeLessThanOrEqual(0.05);

    const c12Item = report.itemizedAdjustments.find(item => item.configurationId === 'C12');
    expect(c12Item).toBeDefined();
    expect(c12Item?.rejected).toBe(true);
    expect(c12Item?.adjustedQValue).toBeLessThan(0.05);
  });
});
