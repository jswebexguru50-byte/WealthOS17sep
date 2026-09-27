import { describe, expect, it } from 'vitest';
import { classifySectorMomentum } from '../../src/server/services/SectorMomentumService';

const bars = Array.from({ length: 25 }, (_, i) => ({
  trade_date: `2026-01-${String(i + 1).padStart(2, '0')}`,
  symbol: 'NIFTY IT',
  open_adjusted: 100 + i,
  high_adjusted: 101 + i,
  low_adjusted: 99 + i,
  close_adjusted: 100 + i,
  volume_raw: 1,
  data_source: 'TEST'
}));

describe('sector momentum calculations', () => {
  it('classifies close above both 20 EMA and 20 SMA as bullish', () => {
    const result = classifySectorMomentum('IT', bars);
    expect(result.indexSymbol).toBe('NIFTY IT');
    expect(result.status).toBe('BULLISH');
    expect(result.aboveEma20).toBe(true);
    expect(result.aboveSma20).toBe(true);
  });

  it('keeps an unmapped or missing sector unavailable', () => {
    const result = classifySectorMomentum('Unknown sector', null);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.close).toBeNull();
    expect(result.aboveEma20).toBeNull();
    expect(result.aboveSma20).toBeNull();
  });
});
