import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ObservabilityHub
vi.mock('../../src/server/services/ObservabilityHub.js', () => ({
  obs: {
    increment: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    timing: vi.fn(),
  },
}));

vi.mock('../../src/server/services/BatchFundamentalProvider.js', () => ({
  BatchFundamentalProvider: {
    getInstance: vi.fn().mockReturnValue({
      get: vi.fn(),
    }),
  },
}));

vi.mock('../../src/server/services/FactsRepository.js', () => ({
  FactsRepository: {
    getInstance: vi.fn().mockReturnValue({
      getTicker: vi.fn(),
      getHoldings: vi.fn(),
      listStrategies: vi.fn(),
      getNseEquityUniverse: vi.fn(),
      getCorporateActions: vi.fn(),
    }),
  },
}));

// Import AFTER mocks
import { UnifiedDataResolver } from '../../src/server/services/UnifiedDataResolver.js';
import { BatchFundamentalProvider } from '../../src/server/services/BatchFundamentalProvider.js';
import { FactsRepository } from '../../src/server/services/FactsRepository.js';

describe('UnifiedDataResolver', () => {
  let mockGet: ReturnType<typeof vi.fn>;
  let mockRepo: ReturnType<typeof FactsRepository.getInstance>;

  beforeEach(() => {
    vi.clearAllMocks();
    (UnifiedDataResolver as any).instance = undefined;
    mockGet = BatchFundamentalProvider.getInstance().get as ReturnType<typeof vi.fn>;
    mockRepo = FactsRepository.getInstance();
  });

  it('getInstance() returns singleton', () => {
    const a = UnifiedDataResolver.getInstance();
    const b = UnifiedDataResolver.getInstance();
    expect(a).toBe(b);
  });

  it('getFundamentals() delegates to BatchFundamentalProvider and returns result', async () => {
    const snap = { pe: 20, marketCap: 1000 };
    mockGet.mockResolvedValueOnce(snap);
    const result = await UnifiedDataResolver.getInstance().getFundamentals('INFY');
    expect(mockGet).toHaveBeenCalledWith('INFY');
    expect(result).toEqual(snap);
  });

  it('getFundamentals() returns null on error (does not throw)', async () => {
    mockGet.mockRejectedValueOnce(new Error('provider down'));
    const result = await UnifiedDataResolver.getInstance().getFundamentals('INFY');
    expect(result).toBeNull();
  });

  it('getTicker() delegates to FactsRepository.getTicker', async () => {
    const ticker = { symbol: 'INFY', isin: 'INE009A01021', name: 'Infosys', exchange: 'NSE', segment: 'EQ' };
    (mockRepo.getTicker as ReturnType<typeof vi.fn>).mockResolvedValueOnce(ticker);
    const result = await UnifiedDataResolver.getInstance().getTicker('INFY');
    expect(mockRepo.getTicker).toHaveBeenCalledWith('INFY');
    expect(result).toEqual(ticker);
  });

  it('getTicker() returns null on error', async () => {
    (mockRepo.getTicker as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db error'));
    const result = await UnifiedDataResolver.getInstance().getTicker('INFY');
    expect(result).toBeNull();
  });

  it('getHoldings() delegates to FactsRepository.getHoldings', async () => {
    const holdings = [{ portfolio: 'main', symbol: 'INFY', isin: 'INE009A01021', quantity: 100, avg_buy_price: 1500 }];
    (mockRepo.getHoldings as ReturnType<typeof vi.fn>).mockResolvedValueOnce(holdings);
    const result = await UnifiedDataResolver.getInstance().getHoldings('main');
    expect(mockRepo.getHoldings).toHaveBeenCalledWith('main');
    expect(result).toEqual(holdings);
  });

  it('getHoldings() returns [] on error', async () => {
    (mockRepo.getHoldings as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db error'));
    const result = await UnifiedDataResolver.getInstance().getHoldings('main');
    expect(result).toEqual([]);
  });

  it('getActiveStrategies() delegates to FactsRepository.listStrategies(true)', async () => {
    const strategies = [{ id: 1, name: 'S1', parameters_json: '{}', is_active: 1 }];
    (mockRepo.listStrategies as ReturnType<typeof vi.fn>).mockResolvedValueOnce(strategies);
    const result = await UnifiedDataResolver.getInstance().getActiveStrategies();
    expect(mockRepo.listStrategies).toHaveBeenCalledWith(true);
    expect(result).toEqual(strategies);
  });

  it('getEquityUniverse() delegates to FactsRepository.getNseEquityUniverse', async () => {
    const universe = [{ symbol: 'INFY', isin: 'INE009A01021', name: 'Infosys', exchange: 'NSE', segment: 'EQ' }];
    (mockRepo.getNseEquityUniverse as ReturnType<typeof vi.fn>).mockResolvedValueOnce(universe);
    const result = await UnifiedDataResolver.getInstance().getEquityUniverse();
    expect(mockRepo.getNseEquityUniverse).toHaveBeenCalled();
    expect(result).toEqual(universe);
  });

  it('getEquityUniverse() returns [] on error', async () => {
    (mockRepo.getNseEquityUniverse as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db error'));
    const result = await UnifiedDataResolver.getInstance().getEquityUniverse();
    expect(result).toEqual([]);
  });

  it('getCorporateActions() delegates to FactsRepository.getCorporateActions', async () => {
    const actions = [{ symbol: 'INFY', action_type: 'SPLIT', record_date: '2024-01-01', details: '2:1' }];
    (mockRepo.getCorporateActions as ReturnType<typeof vi.fn>).mockResolvedValueOnce(actions);
    const result = await UnifiedDataResolver.getInstance().getCorporateActions('INFY', '2024-01-01');
    expect(mockRepo.getCorporateActions).toHaveBeenCalledWith('INFY', '2024-01-01');
    expect(result).toEqual(actions);
  });

  it('getCorporateActions() returns [] on error', async () => {
    (mockRepo.getCorporateActions as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db error'));
    const result = await UnifiedDataResolver.getInstance().getCorporateActions('INFY');
    expect(result).toEqual([]);
  });
});
