import { describe, it, expect } from 'vitest';
import { ExperimentRegistry } from '../../../src/server/services/research/ExperimentRegistry.js';

describe('V672 Track E — Experiment Registry Predeclaration Tests', () => {
  const registry = ExperimentRegistry.getInstance();

  it('verifies immutable registration of all 12 candidate configurations', () => {
    const experiments = registry.getAllExperiments();
    expect(experiments.length).toBeGreaterThanOrEqual(12);

    const c12 = registry.getExperiment('C12');
    expect(c12).toBeDefined();
    expect(c12?.configurationId).toBe('C12');
    expect(c12?.status).toBe('PREDECLARED');
    expect(c12?.oosLocked).toBe(true);
  });
});
