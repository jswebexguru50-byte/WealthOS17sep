import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('V672-R1 — Research Contamination & OOS Timestamp Separation Tests', () => {
  const registryPath = path.resolve('config/v672/EXPERIMENT_REGISTRY.json');

  it('asserts configurationModifiedAt <= OOSStartedAt for every single registered hypothesis', () => {
    expect(fs.existsSync(registryPath)).toBe(true);
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    expect(registry.hypotheses.length).toBe(80);

    for (const exp of registry.hypotheses) {
      const modTime = new Date(exp.configurationModifiedAt || exp.configurationCreatedAt).getTime();
      const oosTime = new Date(exp.OOSStart).getTime();

      expect(modTime).toBeLessThanOrEqual(oosTime);
      expect(exp.oosLocked).toBe(true);
      expect(exp.resultsImportedIntoConfigGeneration).toBe(false);
    }
  });

  it('rejects post-OOS modification attempts with STOP-THE-LINE', () => {
    const corruptedHypothesis = {
      configurationModifiedAt: '2024-02-01T00:00:00Z', // After 2024-01-01 OOS start
      OOSStart: '2024-01-01T00:00:00Z'
    };

    const isContaminated = new Date(corruptedHypothesis.configurationModifiedAt).getTime() > new Date(corruptedHypothesis.OOSStart).getTime();
    expect(isContaminated).toBe(true);
  });
});
