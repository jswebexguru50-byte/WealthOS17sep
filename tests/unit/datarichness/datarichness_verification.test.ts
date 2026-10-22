import { describe, expect, it } from 'vitest';
import { S1ToS10RequirementsExtractor } from '../../../src/server/services/datarichness/S1ToS10RequirementsExtractor';
import { PITNifty500Resolver } from '../../../src/server/services/datarichness/PITNifty500Resolver';
import { DataRichnessAcquisitionWorker } from '../../../src/server/services/datarichness/DataRichnessAcquisitionWorker';
import { S10IntradayEnrichmentEngine } from '../../../src/server/services/datarichness/S10IntradayEnrichmentEngine';
import { DataRichnessAuditor } from '../../../src/server/services/datarichness/DataRichnessAuditor';

describe('WEALTHOS Historical Data Richness & NIFTY 500 Completion Suite', () => {
  it('1. Extract S1-S10 Code Data Requirements Specs', () => {
    const extractor = new S1ToS10RequirementsExtractor('reports/v674-s110');
    const reqs = extractor.extractAllRequirements();
    expect(Object.keys(reqs)).toHaveLength(10);
    expect(reqs.S1[0].dependencyType).toBe('OHLCV');
    expect(reqs.S10[0].dependencyType).toBe('INTRADAY');
  });

  it('2. PIT NIFTY 500 Membership Resolution (2018-2026)', () => {
    const resolver = new PITNifty500Resolver('reports/v674-s110');
    const res = resolver.resolvePITCoverage();
    expect(res.pitCoveragePct).toBe(100.0);
    expect(res.currentUniverseLeakage).toBe(0);
    expect(res.futureConstituentLeakage).toBe(0);
  });

  it('3. Automatic Data Acquisition Pipeline & Raw Quarantine', () => {
    const worker = new DataRichnessAcquisitionWorker('reports/v674-s110');
    const res = worker.runAcquisitionPipeline();
    expect(res.gapsAcquired).toBe(2);
    expect(res.acquisitions.every((a) => a.schemaValidation === 'PASS')).toBe(true);
  });

  it('4. S10 Pre-2020 Historical 5-Min Intraday Enrichment', () => {
    const engine = new S10IntradayEnrichmentEngine('reports/v674-s110');
    const res = engine.auditAndEnrichS10Intraday();
    expect(res.totalCoveragePct).toBe(100.0);
    expect(res.metricsByPeriod[0].coveragePct).toBe(100.0); // P2 2018-2019
  });

  it('5. Full Data Richness Determination & Certificate', () => {
    const auditor = new DataRichnessAuditor('reports/v674-s110');
    const res = auditor.runFullDataRichnessAudit();
    expect(res.finalStatus).toBe('DATA_RICHNESS_VERIFIED');
    expect(res.overallCoveragePct).toBe(100.0);
  });
});
