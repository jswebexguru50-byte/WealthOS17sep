import { describe, it, expect } from 'vitest';
import { ResearchContaminationDetector } from '../../../src/server/services/research/ResearchContaminationDetector.js';

describe('V672 Track E — Research Contamination Detection Tests', () => {
  const detector = new ResearchContaminationDetector();

  it('rejects experiment configurations modified after OOS window declaration', () => {
    const res = detector.checkChronology({
      experimentId: 'EXP_MUTATED',
      configurationId: 'C12_TAMPER',
      configurationCreatedAt: '2023-12-01T00:00:00Z',
      configurationModifiedAt: '2024-01-05T00:00:00Z', // In flight modification after OOS start
      runStartedAt: '2024-01-01T00:00:00Z',
      oosStartedAt: '2024-01-01T00:00:00Z'
    });

    expect(res.isContaminated).toBe(true);
    expect(res.status).toBe('RESEARCH_CONTAMINATION');
    expect(res.temporalDeltaMs).toBeGreaterThan(0);
  });

  it('passes experiments with strictly sealed configurations prior to OOS start', () => {
    const res = detector.checkChronology({
      experimentId: 'EXP_CLEAN',
      configurationId: 'C12_CLEAN',
      configurationCreatedAt: '2023-12-15T00:00:00Z',
      configurationModifiedAt: '2023-12-20T00:00:00Z',
      runStartedAt: '2024-01-01T00:00:00Z',
      oosStartedAt: '2024-01-01T00:00:00Z'
    });

    expect(res.isContaminated).toBe(false);
    expect(res.status).toBe('CLEAN');
  });
});
