import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('V672-R1 — Independent BH-FDR Reproduction from Experiment Registry Tests', () => {
  const registryPath = path.resolve('config/v672/EXPERIMENT_REGISTRY.json');
  const evidencePath = path.resolve('reports/v672/BH_FDR_EVIDENCE.json');

  it('independently calculates Benjamini-Hochberg from registry and verifies H012 rejection', () => {
    expect(fs.existsSync(registryPath)).toBe(true);
    expect(fs.existsSync(evidencePath)).toBe(true);

    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

    const m = registry.totalHypothesesM;
    expect(m).toBe(80);
    expect(registry.hypotheses.length).toBe(80);

    // Extract raw p-values and test statistics
    const rawItems = registry.hypotheses.map((h: any) => {
      expect(h.rawPValue).toBeDefined();
      expect(h.testStatistic).toBeDefined();
      return {
        hypothesisId: h.hypothesisId,
        configurationId: h.configurationId,
        rawPValue: h.rawPValue,
        testStatistic: h.testStatistic
      };
    });

    // Independent BH step-up algorithm
    const sorted = [...rawItems].sort((a, b) => a.rawPValue - b.rawPValue);

    // Compute step-up q-values: q(i) = min_{k >= i} (m * p(k) / k)
    const qValues: number[] = new Array(m);
    let minTail = Infinity;
    for (let i = m - 1; i >= 0; i--) {
      const rank = i + 1;
      const unadjustedQ = (m * sorted[i].rawPValue) / rank;
      minTail = Math.min(minTail, unadjustedQ);
      qValues[i] = +Math.min(1.0, minTail).toFixed(5);
    }

    const independentResults = sorted.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      adjustedPValue: qValues[idx],
      rejected: qValues[idx] <= 0.05
    }));

    // Find C12 hypothesis (H012 / H_012)
    const h012 = independentResults.find(
      h => h.hypothesisId === 'H012' || h.hypothesisId === 'H_012' || h.configurationId === 'C12'
    );
    expect(h012).toBeDefined();
    expect(h012?.rawPValue).toBe(0.000378);
    expect(h012?.adjustedPValue).toBe(0.03024);
    expect(h012?.rejected).toBe(true);

    // Verify consistency with evidence artifact
    expect(evidence.report.totalHypothesesM).toBe(80);
    expect(evidence.report.evaluatedHypothesesCount).toBe(80);
    expect(evidence.report.c12Significant).toBe(true);
  });
});
