import { describe, expect, it } from 'vitest';
import { PeriodAlignmentService } from '../../src/server/services/intelligence/assembler/PeriodAlignmentService.js';
import { CatalystEngine } from '../../src/server/services/intelligence/catalysts/CatalystEngine.js';
import { RiskEngine } from '../../src/server/services/intelligence/risks/RiskEngine.js';
import { ContradictionEngine } from '../../src/server/services/intelligence/contradictions/ContradictionEngine.js';
import { evidenceSourceTypeForProvider } from '../../src/server/services/intelligence/contracts/Provenance.js';

describe('company intelligence truth closure', () => {
  it('does not treat a missing fiscal year as an annual comparison', () => {
    const aligned = PeriodAlignmentService.getInstance().alignSeries([
      { value: 120, period: 'FY2025', unit: 'INR_CR', scope: 'CONSOLIDATED', provenance: [] },
      { value: 100, period: 'FY2023', unit: 'INR_CR', scope: 'CONSOLIDATED', provenance: [] },
    ] as any);

    expect(aligned.latestAnnual?.period).toBe('FY2025');
    expect(aligned.priorAnnual).toBeNull();
  });

  it('does not infer a matching YoY quarter from an array position', () => {
    const aligned = PeriodAlignmentService.getInstance().alignSeries([
      { value: 120, period: 'Q3FY2025', unit: 'INR_CR', scope: 'CONSOLIDATED', provenance: [] },
      { value: 110, period: 'Q2FY2025', unit: 'INR_CR', scope: 'CONSOLIDATED', provenance: [] },
      { value: 100, period: 'Q1FY2025', unit: 'INR_CR', scope: 'CONSOLIDATED', provenance: [] },
      { value: 90, period: 'Q4FY2024', unit: 'INR_CR', scope: 'CONSOLIDATED', provenance: [] },
      { value: 80, period: 'Q3FY2023', unit: 'INR_CR', scope: 'CONSOLIDATED', provenance: [] },
    ] as any);

    expect(aligned.yearAgoQuarter).toBeNull();
  });

  it('returns no hard-coded golden-company catalysts without persisted evidence', () => {
    const result = CatalystEngine.getInstance().evaluate({ securityId: 'TATASTEEL', symbol: 'TATASTEEL' });
    expect(result.catalysts).toEqual([]);
  });

  it('returns no hard-coded structural risks without contradiction or valuation evidence', () => {
    const result = RiskEngine.getInstance().evaluate({
      securityId: 'TATAMOTORS', symbol: 'TATAMOTORS', businessModel: 'MANUFACTURING', contradictions: [],
    });
    expect(result.risks).toEqual([]);
  });

  it('does not expose a contradiction when the compared values lack source evidence', () => {
    const result = ContradictionEngine.getInstance().evaluate({
      symbol: 'TEST', securityId: 'TEST', pat: 120, patPrior: 100, cfo: 40, cfoPrior: 100,
    });
    expect(result.contradictions).toEqual([]);
    expect(result.evaluations.find(e => e.patternId === 'PAT_VS_CFO')?.evaluable).toBe(true);
    expect(result.evaluations.find(e => e.patternId === 'PAT_VS_CFO')?.triggered).toBe(false);
  });

  it('maps an Upstox snapshot to its actual provider type', () => {
    expect(evidenceSourceTypeForProvider('UPSTOX_FUNDAMENTALS')).toBe('UPSTOX_SNAPSHOT');
    expect(evidenceSourceTypeForProvider('TRENDLYNE_MCP')).toBe('TRENDLYNE_SNAPSHOT');
  });
});
