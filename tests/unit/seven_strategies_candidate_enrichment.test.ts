import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SevenStrategiesCandidateEnrichmentService } from '../../src/server/services/SevenStrategiesCandidateEnrichmentService.js';
import * as database from '../../src/server/database.js';
import { DuckDbAdjustedOhlcvService } from '../../src/server/services/DuckDbAdjustedOhlcvService.js';

// Mock database module
vi.mock('../../src/server/database.js', () => {
  return {
    getDB: vi.fn(),
    dbAll: vi.fn()
  };
});

describe('SevenStrategiesCandidateEnrichmentService Correctness', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('1. market cap provenance is not manufactured and runtime fetchedAt is not added', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) {
        return [
          { symbol: 'LARGE', market_cap_cr: 25000, sector: 'IT' },
          { symbol: 'NONE', market_cap_cr: null, sector: 'IT' }
        ];
      }
      return [];
    });

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([{ symbol: 'LARGE' }, { symbol: 'NONE' }]);

    const large = result.get('LARGE')!;
    expect(large.marketCapCategory).toBe('LARGE_CAP');
    expect(large.marketCapSource).toBeNull();
    expect(large.marketCapFetchedAt).toBeNull();

    const none = result.get('NONE')!;
    expect(none.marketCapCategory).toBe('UNAVAILABLE');
    expect(none.marketCapSource).toBeNull();
    expect(none.marketCapFetchedAt).toBeNull();
  });

  it('2. synthetic QGLP and fundamental state are not manufactured', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) {
        return [
          { symbol: 'FULL', market_cap_cr: 100, sector: 'IT', roce_pct: 10, cfo_cr: 10, latest_pat_cr: 10, debt_to_equity: 1, pe_ratio: 10 }
        ];
      }
      return [];
    });

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([{ symbol: 'FULL' }]);

    const full = result.get('FULL')!;
    // Even if all 6 local fields are present, it should not invent AVAILABLE
    expect(full.qglpStatus).toBe('DATA_INSUFFICIENT');
    expect(full.fundamentalEvidenceState).toBe('DATA_INSUFFICIENT');
  });

  it('3. technical freshness matches OHLCV freshness', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) {
        return [{ symbol: 'STALE_SYM' }, { symbol: 'NO_TECH_SYM' }];
      }
      return [];
    });
    
    // Mock duckdb to return stale data for STALE_SYM
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 10);
    const staleMap = new Map();
    staleMap.set('STALE_SYM', [{ trade_date: staleDate.toISOString().substring(0, 10), close_adjusted: 100, volume_raw: 1000 }]);

    vi.spyOn(DuckDbAdjustedOhlcvService, 'getDailyBarsForSymbols').mockResolvedValue({ bars: staleMap } as any);

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([{ symbol: 'STALE_SYM' }, { symbol: 'NO_TECH_SYM' }]);

    const stale = result.get('STALE_SYM')!;
    expect(stale.ohlcvStatus).toBe('STALE');
    expect(stale.technicalFreshnessStatus).toBe('STALE');

    const noTech = result.get('NO_TECH_SYM')!;
    expect(noTech.ohlcvStatus).toBe('DATA_INSUFFICIENT');
    expect(noTech.technicalFreshnessStatus).toBe('DATA_INSUFFICIENT');
  });

  it('4. action readiness rules are strictly enforced', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) {
        return [
          { symbol: 'HAS_LITTLE_TECH' },
          { symbol: 'NO_TECH' }
        ]; // missing FAKE_SYM
      }
      return [];
    });

    const littleMap = new Map();
    // Provide 200 bars for one to test canBacktest, all strictly in the past
    littleMap.set('HAS_LITTLE_TECH', Array.from({length: 200}).map((_, i) => {
      const d = new Date('2025-01-01');
      d.setDate(d.getDate() + i);
      return { trade_date: d.toISOString().substring(0, 10), close_adjusted: 100, volume_raw: 1000 };
    }));
    vi.spyOn(DuckDbAdjustedOhlcvService, 'getDailyBarsForSymbols').mockResolvedValue({ bars: littleMap } as any);

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([
      { symbol: 'HAS_LITTLE_TECH', cmp: 100 },
      { symbol: 'NO_TECH', cmp: 100 },
      { symbol: 'FAKE_SYM', cmp: 100 }
    ]);

    const little = result.get('HAS_LITTLE_TECH')!;
    expect(little.canBacktest).toBe(false); // < 200 bars
    expect(little.canPaperTrade).toBe(false); // Because STALE, since bars are from 2026-01 and now it's Oct 2026

    const noTech = result.get('NO_TECH')!;
    expect(noTech.canBacktest).toBe(false);
    expect(noTech.canPaperTrade).toBe(false); // lacks tech

    const fake = result.get('FAKE_SYM')!;
    expect(fake.canBacktest).toBe(false);
    expect(fake.canPaperTrade).toBe(false); // lacks master symbol mapping
  });

  it('5. sector momentum never emits NOT_BULLISH or UNAVAILABLE', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) return [{ symbol: 'SYM', sector: 'IT' }];
      if ((query as string).includes('index_symbol IN')) {
        // Return dummy bars for NIFTY IT (flat at 100 -> NOT_BULLISH, but not crossing EMA -> WEAK)
        return Array.from({length: 60}).map((_, i) => ({ index_symbol: 'NIFTY IT', trade_date: `2026-01-${(i+1).toString().padStart(2,'0')}`, close: 100 }));
      }
      return [];
    });

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([{ symbol: 'SYM' }]);
    const s = result.get('SYM')!;
    
    expect(s.sectorMomentumStatus).not.toBe('NOT_BULLISH');
    expect(s.sectorMomentumStatus).not.toBe('UNAVAILABLE');
    expect(s.sectorMomentumStatus).toBe('WEAK'); // below/equal ema
  });

  it('6. signal cmp does not affect technical calculations when latestClose differs', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) return [{ symbol: 'DIFF_CMP' }];
      return [];
    });

    const ohlcvMap = new Map();
    // 25 bars: first 24 at 110, last bar at 120.
    const bars = Array.from({length: 24}).map((_, i) => ({ trade_date: `2026-01-${(i+1).toString().padStart(2,'0')}`, close_adjusted: 110, volume_raw: 1000 }));
    bars.push({ trade_date: '2026-01-25', close_adjusted: 120, volume_raw: 1000 });
    ohlcvMap.set('DIFF_CMP', bars);
    vi.spyOn(DuckDbAdjustedOhlcvService, 'getDailyBarsForSymbols').mockResolvedValue({ bars: ohlcvMap } as any);

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([{ symbol: 'DIFF_CMP', cmp: 100 }]); // signal cmp 100
    
    const diff = result.get('DIFF_CMP')!;
    expect(diff.signalCmp).toBe(100);
    expect(diff.latestClose).toBe(120);
    
    // EMA/SMA around 110, so latestClose (120) is above them.
    expect(diff.aboveEma20).toBe(true);
    expect(diff.aboveSma20).toBe(true);
  });
  it('7. includeTechnicals: false skips DuckDB and preserves fail-closed statuses without fabricating values', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) return [{ symbol: 'SKIP_TECH', company_name: 'Skip Inc', sector: 'IT' }];
      return [];
    });

    const duckDbSpy = vi.spyOn(DuckDbAdjustedOhlcvService, 'getDailyBarsForSymbols');

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([{ symbol: 'SKIP_TECH', cmp: 150 }], { includeTechnicals: false });

    expect(duckDbSpy).not.toHaveBeenCalled();
    const item = result.get('SKIP_TECH')!;
    expect(item.ohlcvStatus).toBe('NOT_CHECKED');
    expect(item.latestClose).toBeNull();
    expect(item.ema20).toBeNull();
    expect(item.sma20).toBeNull();
    expect(item.rsi14).toBeNull();
    expect(item.atrPct).toBeNull();
    expect(item.canBacktest).toBe(false);
    expect(item.canPaperTrade).toBe(false);
    expect(item.canCreateAlert).toBe(false);
  });

  it('8. includeSectorMomentum: false skips sector queries and sets DATA_INSUFFICIENT', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) return [{ symbol: 'SKIP_SECTOR', sector: 'IT' }];
      return [];
    });

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([{ symbol: 'SKIP_SECTOR' }], { includeSectorMomentum: false });

    const item = result.get('SKIP_SECTOR')!;
    expect(item.sectorMomentumStatus).toBe('DATA_INSUFFICIENT');
    expect(item.sectorLatestDate).toBeNull();
  });

  it('9. DuckDB error sets SOURCE_UNAVAILABLE and blocks action readiness', async () => {
    vi.mocked(database.dbAll).mockImplementation(async (db, query, params) => {
      if ((query as string).includes('MasterTickers')) return [{ symbol: 'FAIL_DUCK' }];
      return [];
    });

    vi.spyOn(DuckDbAdjustedOhlcvService, 'getDailyBarsForSymbols').mockRejectedValue(new Error('DuckDB process crashed'));

    const service = SevenStrategiesCandidateEnrichmentService.getInstance();
    const result = await service.bulkEnrich([{ symbol: 'FAIL_DUCK', cmp: 200 }]);

    const item = result.get('FAIL_DUCK')!;
    expect(item.ohlcvStatus).toBe('SOURCE_UNAVAILABLE');
    expect(item.canBacktest).toBe(false);
    expect(item.canPaperTrade).toBe(false);
    expect(item.canCreateAlert).toBe(false);
  });
});
