import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dbAllMock, getDBMock } = vi.hoisted(() => ({
  dbAllMock: vi.fn(),
  getDBMock: vi.fn(() => ({ mockedDatabase: true })),
}));

vi.mock('../../src/server/database', () => ({
  dbAll: dbAllMock,
  getDB: getDBMock,
}));
import {
  TrendlyneIntelligenceReportSchema,
  TrendlyneIntelligenceService,
} from '../../src/server/services/TrendlyneIntelligenceService';

beforeEach(() => {
  dbAllMock.mockReset();
  getDBMock.mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe('TrendlyneIntelligenceService mirror reader', () => {
  it('maps only direct mirror observations and preserves unavailable fields as null', async () => {
    dbAllMock.mockImplementation(async (_db, sql, params) => {
      expect(sql).toContain('FROM trendlyne_mirror_observations');
      expect(params).toEqual(['INFY']);
      return [
        {
          observationId: 'new-price',
          providerToken: 'currentprice',
          canonicalMetric: 'current_price',
          rawValue: null,
          status: 'PROVIDER_EXPLICIT_NULL',
          lastSeenAt: '2026-10-16T10:00:00.000Z',
        },
        {
          observationId: 'old-price',
          providerToken: 'currentprice',
          canonicalMetric: 'current_price',
          rawValue: '123.45',
          status: 'AVAILABLE',
          lastSeenAt: '2026-10-15T10:00:00.000Z',
        },
        {
          observationId: 'fii',
          providerToken: 'fiihold',
          canonicalMetric: 'fii_holding',
          rawValue: '12.5%',
          status: 'AVAILABLE',
          lastSeenAt: '2026-10-16T09:00:00.000Z',
        },
        {
          observationId: 'promoter',
          providerToken: 'prompct',
          canonicalMetric: 'promoter_holding',
          rawValue: '51.2',
          status: 'AVAILABLE',
          lastSeenAt: '2026-10-16T09:00:00.000Z',
        },
      ];
    });

    const report = await TrendlyneIntelligenceService.getInstance().getScripIntelligence('INFY.NS', 999);

    expect(report?.symbol).toBe('INFY');
    expect(report?.cmp).toBeNull();
    expect(report?.checklists.fiiHoldingPct).toBe(12.5);
    expect(report?.checklists.promoterHoldingPct).toBe(51.2);
    expect(report?.dvm.durabilityScore).toBeNull();
    expect(report?.analystConsensus.meanTargetPrice).toBeNull();
    expect(report?.forecaster.epsForward).toBeNull();
    expect(report?.checklists.piotroskiScore).toBeNull();
    expect(report?.checklists.diiHoldingPct).toBeNull();
    expect(report?.cachedAt).toBe('2026-10-16T10:00:00.000Z');
    expect(getDBMock).toHaveBeenCalledOnce();
    expect(dbAllMock.mock.calls[0][0]).toEqual({ mockedDatabase: true });
    expect(TrendlyneIntelligenceReportSchema.parse(report)).toEqual(report);
  });

  it('selects the newest evidence row even when the reader receives rows out of order', async () => {
    dbAllMock.mockResolvedValue([
        {
          observationId: 'older',
          providerToken: 'currentprice',
          canonicalMetric: 'current_price',
          rawValue: '123.45',
          status: 'AVAILABLE',
          lastSeenAt: '2026-10-15T10:00:00.000Z',
        },
        {
          observationId: 'newer-null',
          providerToken: 'currentprice',
          canonicalMetric: 'current_price',
          rawValue: null,
          status: 'PROVIDER_EXPLICIT_NULL',
          lastSeenAt: '2026-10-16T10:00:00.000Z',
        },
    ]);

    const report = await TrendlyneIntelligenceService.getInstance().getScripIntelligence('INFY');

    expect(report?.cmp).toBeNull();
    expect(report?.cachedAt).toBe('2026-10-16T10:00:00.000Z');
  });

  it('returns no report when the mirror has no observations', async () => {
    dbAllMock.mockResolvedValue([]);

    await expect(
      TrendlyneIntelligenceService.getInstance().getScripIntelligence('INFY'),
    ).resolves.toBeNull();
  });
});
