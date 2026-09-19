import { runIndependentVerification } from '../../src/server/services/dataenrichment/verifiers/IndependentVerifier';
import { CanonicalMarketObservation } from '../../src/server/services/dataenrichment/DataStagingContract';

describe('IndependentVerifier', () => {
  it('passes a fully valid dataset', () => {
    const rows: CanonicalMarketObservation[] = [
      {
        securityId: 'NIFTY_50',
        exchange: 'NSE',
        segment: 'EQ',
        timeframe: '15m',
        barStartTime: '2026-09-19T10:15:00+05:30',
        barEndTime: '2026-09-19T10:30:00+05:30',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        providerTimestamp: '2026-09-19T10:15:00+05:30',
        observationTimestamp: '2026-09-19T10:30:00+05:30',
        dataAcquisitionTimestamp: '2026-09-19T10:35:00+05:30',
        source: 'UPSTOX_V3',
        datasetId: 'TEST_DATASET',
        observationHash: 'abc',
        candleState: 'CLOSED'
      }
    ];

    const manifest = {
      datasetId: 'TEST_DATASET',
      rawSha256: 'xyz',
      canonicalSha256: 'xyz',
      pitStatus: 'PIT_VERIFIED',
      source: 'UPSTOX_V3',
      coverageStart: '2026-09-19T10:15:00+05:30'
    };

    const checks = runIndependentVerification('TEST_DATASET', rows, manifest);
    expect(checks.schemaValid).toBe(true);
    expect(checks.noNaN).toBe(true);
    expect(checks.ohlcRelationshipValid).toBe(true);
    expect(checks.timestampValid).toBe(true);
  });

  it('fails OHLC relationship if open > high', () => {
    const rows: CanonicalMarketObservation[] = [
      {
        securityId: 'NIFTY_50',
        exchange: 'NSE',
        segment: 'EQ',
        timeframe: '15m',
        barStartTime: '2026-09-19T10:15:00+05:30',
        barEndTime: '2026-09-19T10:30:00+05:30',
        open: 110, // Invalid, > high
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        providerTimestamp: '2026-09-19T10:15:00+05:30',
        observationTimestamp: '2026-09-19T10:30:00+05:30',
        dataAcquisitionTimestamp: '2026-09-19T10:35:00+05:30',
        source: 'UPSTOX_V3',
        datasetId: 'TEST_DATASET',
        observationHash: 'abc',
        candleState: 'CLOSED'
      }
    ];

    const manifest = {
      datasetId: 'TEST_DATASET',
      rawSha256: 'xyz',
      canonicalSha256: 'xyz',
      pitStatus: 'PIT_VERIFIED',
      source: 'UPSTOX_V3',
      coverageStart: '2026-09-19T10:15:00+05:30'
    };

    const checks = runIndependentVerification('TEST_DATASET', rows, manifest);
    expect(checks.ohlcRelationshipValid).toBe(false);
  });

  it('fails if NaN values exist', () => {
    const rows: CanonicalMarketObservation[] = [
      {
        securityId: 'NIFTY_50',
        exchange: 'NSE',
        segment: 'EQ',
        timeframe: '15m',
        barStartTime: '2026-09-19T10:15:00+05:30',
        barEndTime: '2026-09-19T10:30:00+05:30',
        open: NaN,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
        providerTimestamp: '2026-09-19T10:15:00+05:30',
        observationTimestamp: '2026-09-19T10:30:00+05:30',
        dataAcquisitionTimestamp: '2026-09-19T10:35:00+05:30',
        source: 'UPSTOX_V3',
        datasetId: 'TEST_DATASET',
        observationHash: 'abc',
        candleState: 'CLOSED'
      }
    ];

    const manifest = {
      datasetId: 'TEST_DATASET',
      rawSha256: 'xyz',
      canonicalSha256: 'xyz',
      pitStatus: 'PIT_VERIFIED',
      source: 'UPSTOX_V3',
      coverageStart: '2026-09-19T10:15:00+05:30'
    };

    const checks = runIndependentVerification('TEST_DATASET', rows, manifest);
    expect(checks.noNaN).toBe(false);
    expect(checks.numericValuesFinite).toBe(false);
  });
});
