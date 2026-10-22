import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('V672-R1 — Complete 80-Hypothesis Predeclaration Registry Tests', () => {
  const registryPath = path.resolve('config/v672/EXPERIMENT_REGISTRY.json');

  it('verifies all 80 hypotheses are present with complete required metadata', () => {
    expect(fs.existsSync(registryPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    expect(data.totalHypothesesM).toBe(80);
    expect(data.hypotheses.length).toBe(80);

    const ids = new Set<string>();
    for (const h of data.hypotheses) {
      expect(h.hypothesisId).toBeDefined();
      expect(h.configurationId).toBeDefined();
      expect(h.predeclaredAt).toBeDefined();
      expect(h.ISStart).toBe('2020-01-01');
      expect(h.ISEnd).toBe('2023-12-31');
      expect(h.OOSStart).toBe('2024-01-01');
      expect(h.OOSEnd).toBe('2026-09-15');
      expect(h.configurationHash).toBeDefined();
      expect(h.dataSnapshotHash).toBeDefined();

      ids.add(h.hypothesisId);
    }

    expect(ids.size).toBe(80);
  });
});
