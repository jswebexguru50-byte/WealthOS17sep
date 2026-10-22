import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbGet: vi.fn(),
  dbAll: vi.fn(),
  dbRun: vi.fn(async () => undefined),
  fetchScreenerData: vi.fn(),
}));

vi.mock('../../src/server/database.js', () => ({
  getDB: vi.fn(() => ({})),
  dbGet: mocks.dbGet,
  dbAll: mocks.dbAll,
  dbRun: mocks.dbRun,
}));

vi.mock('../../src/server/services/screenerService.js', () => ({
  ScreenerService: {
    getInstance: () => ({ fetchScreenerData: mocks.fetchScreenerData }),
  },
}));

import { FundamentalDataService } from '../../src/server/services/FundamentalDataService.js';

const screenerData = {
  symbol: 'TEST',
  company_name: 'Test Ltd',
  about: '',
  ratios: {
    stock_pe: '10',
    book_value: '100',
    dividend_yield: '1%',
    roce: '15%',
    roe: '12%',
    debt_to_equity: '0.4',
  },
  pros: [],
  cons: [],
  documents: [],
  concalls: [],
  presentations: [],
  peers: [],
  shareholding: { promoters: '45%', fiis: '10%', diis: '5%' },
  growthMetrics: { sales5Yr: '8%', profit5Yr: '9%', roe3Yr: '12%' },
  quarterlyResults: { latestQuarter: 'Sep 2026', latestOpmPct: 18 },
  quarterlySeries: [],
  annualPlSeries: [],
  cached_at: new Date().toISOString(),
};

describe('FundamentalDataService null-field remediation', () => {
  it('keeps real zero pledge data and reads explicit coverage from canonical rows', async () => {
    mocks.dbGet.mockImplementation(async (_db: unknown, sql: string) => {
      if (sql.includes('HistoricalFinancialStatements')) return { opm_pct: 17 };
      if (sql.includes('FundamentalSnapshots')) {
        return { operating_margin_pct: null, interest_coverage: null, roe_3y_pct: null, pledged_pct: 0 };
      }
      return null;
    });
    mocks.dbAll.mockImplementation(async (_db: unknown, _sql: string, params: unknown[]) => {
      if (params.includes('interest_coverage')) return [{ value: '4.5', unit: 'RATIO' }];
      return [];
    });
    mocks.fetchScreenerData.mockResolvedValue(screenerData);

    const snapshot = await new FundamentalDataService().getSnapshot('TEST');

    expect(snapshot).not.toBeNull();
    expect(snapshot?.operatingMarginPct).toBe(18);
    expect(snapshot?.interestCoverage).toBe(4.5);
    expect(snapshot?.roe3yPct).toBe(12);
    expect(snapshot?.pledgedPct).toBe(0);
    expect(snapshot?.isHighPledge).toBe(false);
  });

  it('leaves fields null when no exact source row exists and never derives them', async () => {
    mocks.dbGet.mockResolvedValue(null);
    mocks.dbAll.mockResolvedValue([]);
    mocks.fetchScreenerData.mockResolvedValue({
      ...screenerData,
      growthMetrics: undefined,
      quarterlyResults: { latestQuarter: 'Sep 2026' },
    });

    const snapshot = await new FundamentalDataService().getSnapshot('NO_SOURCE');

    expect(snapshot?.operatingMarginPct).toBeNull();
    expect(snapshot?.interestCoverage).toBeNull();
    expect(snapshot?.roe3yPct).toBeNull();
    expect(snapshot?.pledgedPct).toBeNull();
    expect(snapshot?.isPoorDebtServiceability).toBe(false);
  });
});
