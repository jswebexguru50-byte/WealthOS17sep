import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SevenStrategiesCandidateEnrichmentService } from '../../src/server/services/SevenStrategiesCandidateEnrichmentService';
import * as database from '../../src/server/database';

// Mock database module
vi.mock('../../src/server/database', () => {
  return {
    getDB: vi.fn(),
    dbAll: vi.fn()
  };
});

describe('SevenStrategiesCandidateEnrichmentService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('1. market cap categories and missing market cap behavior', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) {
        return [
          { symbol: 'LARGE', market_cap_cr: 25000, sector: 'IT' },
          { symbol: 'MID', market_cap_cr: 10000, sector: 'IT' },
          { symbol: 'SMALL', market_cap_cr: 1000, sector: 'IT' },
          { symbol: 'NONE', market_cap_cr: null, sector: 'IT' }
        ];
      }
      return [];
    });

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([
      { symbol: 'LARGE' },
      { symbol: 'MID' },
      { symbol: 'SMALL' },
      { symbol: 'NONE' }
    ]);

    expect(result.get('LARGE')!.marketCapCategory).toBe('LARGE_CAP');
    expect(result.get('MID')!.marketCapCategory).toBe('MID_CAP');
    expect(result.get('SMALL')!.marketCapCategory).toBe('SMALL_CAP');
    expect(result.get('NONE')!.marketCapCategory).toBe('UNAVAILABLE');
    expect(result.get('NONE')!.marketCapSource).toBe('SOURCE_UNAVAILABLE');
  });

  it('2. no fabricated sector index and missing sector OHLCV means DATA_INSUFFICIENT', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) {
        return [
          { symbol: 'SYM1', sector: 'FAKE_SECTOR_NO_MAP' },
          { symbol: 'SYM2', sector: 'IT' }
        ];
      }
      // Return empty index OHLCV
      return [];
    });

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([{ symbol: 'SYM1' }, { symbol: 'SYM2' }]);

    const s1 = result.get('SYM1')!;
    expect(s1.sectorIndex).toBeNull();
    expect(s1.sectorMappingStatus).toBe('UNMAPPED');
    expect(s1.sectorMomentumStatus).toBe('DATA_INSUFFICIENT');

    const s2 = result.get('SYM2')!;
    // IT maps to NIFTY IT, but we returned no OHLCV for it
    expect(s2.sectorIndex).toBe('NIFTY IT');
    expect(s2.sectorMappingStatus).toBe('MAPPED');
    expect(s2.sectorMomentumStatus).toBe('DATA_INSUFFICIENT');
  });

  it('3. canBacktest false when OHLCV missing, canPaperTrade true only when CMP exists', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) {
        return [
          { symbol: 'HAS_CMP', sector: 'IT' },
          { symbol: 'NO_CMP', sector: 'IT' }
        ];
      }
      return []; // No technical data from MarketSnapshots
    });

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([
      { symbol: 'HAS_CMP', cmp: 100 },
      { symbol: 'NO_CMP', cmp: null }
    ]);

    const s1 = result.get('HAS_CMP')!;
    expect(s1.canBacktest).toBe(false); // Because tech OHLCV missing
    expect(s1.canPaperTrade).toBe(true);

    const s2 = result.get('NO_CMP')!;
    expect(s2.canBacktest).toBe(false);
    expect(s2.canPaperTrade).toBe(false);
  });

  it('4. missing QGLP inputs produce PARTIAL or DATA_INSUFFICIENT, not AVAILABLE', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) {
        return [
          { symbol: 'FULL', market_cap_cr: 100, sector: 'IT', roce_pct: 10, cfo_cr: 10, latest_pat_cr: 10, debt_to_equity: 1, pe_ratio: 10 },
          { symbol: 'PARTIAL', market_cap_cr: 100, sector: 'IT', roce_pct: 10, cfo_cr: null, latest_pat_cr: 10, debt_to_equity: 1, pe_ratio: 10 },
          { symbol: 'EMPTY' }
        ];
      }
      return [];
    });

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([
      { symbol: 'FULL' },
      { symbol: 'PARTIAL' },
      { symbol: 'EMPTY' }
    ]);

    expect(result.get('FULL')!.qglpStatus).toBe('AVAILABLE');
    expect(result.get('PARTIAL')!.qglpStatus).toBe('PARTIAL');
    expect(result.get('EMPTY')!.qglpStatus).toBe('DATA_INSUFFICIENT');
  });
});
