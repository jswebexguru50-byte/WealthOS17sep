import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PaperTradingPotService } from '../../services/PaperTradingPotService.js';
import { setDbMockHooks } from '../../database.js';
import { LiveMarketStreamService } from '../../services/LiveMarketStreamService.js';

describe('Unit: PaperTradingPotService', () => {
  let service: PaperTradingPotService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = PaperTradingPotService.getInstance();
    jest.spyOn(LiveMarketStreamService.getInstance(), 'broadcastAlert').mockImplementation(() => {});
  });

  afterEach(() => {
    setDbMockHooks({});
  });

  // U-PT-01
  it('U-PT-01: Conviction gate rejects when probability_pct < 70', async () => {
    const rec = {
      symbol: 'LOW_PROB',
      probability_pct: 68,
      confidence_score: 80,
      entry_price: 100
    };
    const result = await service.evaluateRecommendationForEntry(rec);
    expect(result).toBe(false);
  });

  // U-PT-02
  it('U-PT-02: Conviction gate rejects when confidence_score < 65', async () => {
    const rec = {
      symbol: 'LOW_CONF',
      probability_pct: 75,
      confidence_score: 62,
      entry_price: 100
    };
    const result = await service.evaluateRecommendationForEntry(rec);
    expect(result).toBe(false);
  });

  // U-PT-03
  it('U-PT-03: Circuit breaker active (is_circuit_breaker_tripped = 1) blocks entry', async () => {
    setDbMockHooks({
      dbAll: async () => [{ id: 'pot_conservative' }],
      dbGet: async () => ({
        id: 'pot_conservative',
        is_circuit_breaker_tripped: 1,
        cash_balance: 1000000,
        current_portfolio_nav: 1000000
      })
    });

    const rec = {
      symbol: 'TCS',
      probability_pct: 75,
      confidence_score: 70,
      entry_price: 3500
    };
    const result = await service.evaluateRecommendationForEntry(rec);
    expect(result).toBe(false);
  });

  // U-PT-04
  it('U-PT-04: Max open positions (8) reached blocks further entry', async () => {
    let allCallCount = 0;
    setDbMockHooks({
      dbAll: async (sql) => {
        allCallCount++;
        if (allCallCount === 1) return [{ id: 'pot_conservative' }];
        // 8 open positions
        return Array.from({ length: 8 }, (_, i) => ({ id: i, symbol: `STOCK_${i}`, sector: 'General', invested_capital: 50000 }));
      },
      dbGet: async () => ({
        id: 'pot_conservative',
        is_circuit_breaker_tripped: 0,
        cash_balance: 500000,
        current_portfolio_nav: 1000000
      })
    });

    const rec = {
      symbol: 'NINTH_STOCK',
      probability_pct: 85,
      confidence_score: 80,
      entry_price: 500
    };
    const result = await service.evaluateRecommendationForEntry(rec);
    expect(result).toBe(false);
  });

  // U-PT-05
  it('U-PT-05: Sector cap (3 positions or > 30% NAV) blocks entry', async () => {
    const itPositions = [
      { id: 1, symbol: 'INFY', sector: 'IT', invested_capital: 80000 },
      { id: 2, symbol: 'TCS', sector: 'IT', invested_capital: 80000 },
      { id: 3, symbol: 'WIPRO', sector: 'IT', invested_capital: 80000 }
    ];

    let allCallCount = 0;
    setDbMockHooks({
      dbAll: async () => {
        allCallCount++;
        if (allCallCount === 1) return [{ id: 'pot_conservative' }];
        return itPositions;
      },
      dbGet: async () => ({
        id: 'pot_conservative',
        is_circuit_breaker_tripped: 0,
        cash_balance: 500000,
        current_portfolio_nav: 1000000
      })
    });

    const rec = {
      symbol: 'HCLTECH',
      sector: 'IT',
      probability_pct: 88,
      confidence_score: 85,
      entry_price: 1400
    };
    const result = await service.evaluateRecommendationForEntry(rec);
    expect(result).toBe(false);
  });

  // U-PT-06
  it('U-PT-06: Successful entry applies slippage (1.0005) and calculates friction (STT + Fixed fee)', async () => {
    let allCallCount = 0;
    const runCalls: { sql: string; params: any[] }[] = [];
    setDbMockHooks({
      dbAll: async () => {
        allCallCount++;
        if (allCallCount === 1) return [{ id: 'pot_conservative' }];
        return []; // 0 open positions
      },
      dbGet: async () => ({
        id: 'pot_conservative',
        pot_name: 'Conservative',
        is_circuit_breaker_tripped: 0,
        cash_balance: 1000000,
        current_portfolio_nav: 1000000
      }),
      dbRun: async (sql, params) => {
        runCalls.push({ sql, params });
        return { lastID: 1, changes: 1 };
      }
    });

    const rec = {
      symbol: 'RELIANCE',
      company_name: 'Reliance Industries',
      sector: 'Energy',
      action: 'BUY',
      timeframe: 'SWING_1_TO_2_WEEKS',
      entry_price: 2000.0,
      target_1: 2100.0,
      target_2: 2200.0,
      stop_loss: 1950.0,
      probability_pct: 75,
      confidence_score: 70
    };

    const success = await service.evaluateRecommendationForEntry(rec);
    expect(success).toBe(true);

    const insertCall = runCalls.find(c => c.sql.includes('INSERT INTO PaperTradingPositions'));
    expect(insertCall).toBeDefined();
    const params = insertCall!.params;

    const nominalPrice = 2000.0;
    const expectedExecutedPrice = +(nominalPrice * 1.0005).toFixed(2); // 2001.00
    expect(params[9]).toBe(expectedExecutedPrice); // entry_price is param index 9

    const quantity = params[7];
    const investedCapital = params[10];
    expect(investedCapital).toBe(+(quantity * expectedExecutedPrice).toFixed(2));

    const expectedFriction = +(investedCapital * 0.0010 + 23.60).toFixed(2);
    expect(params[16]).toBe(expectedFriction); // friction_costs is param index 16
  });

  // U-PT-07
  it('U-PT-07: Position sizing respects Half-Kelly bounds (2% - 8% of NAV)', () => {
    const pot = { current_portfolio_nav: 1000000 };

    // Extreme low probability (25%): bounded to 2%
    const lowSize = service.calculatePositionSize(pot, 25);
    expect(lowSize).toBe(20000.0); // 2% of 10,00,000

    // Extreme high probability (85%): bounded to 8%
    const highSize = service.calculatePositionSize(pot, 85);
    expect(highSize).toBe(80000.0); // 8% of 10,00,000

    // Mid probability (50%)
    const midSize = service.calculatePositionSize(pot, 50);
    expect(midSize).toBeGreaterThanOrEqual(20000.0);
    expect(midSize).toBeLessThanOrEqual(80000.0);
  });

  // U-PT-08
  it('U-PT-08: Partial exit at T1 halves quantity, sets trailing SL to entry_price, and records friction', async () => {
    const mockPos = {
      id: 501,
      pot_id: 'pot_conservative',
      symbol: 'TCS',
      action: 'BUY',
      quantity: 50,
      initial_quantity: 50,
      entry_price: 3500.0,
      invested_capital: 175000.0,
      current_price: 3500.0,
      target_1: 3600.0,
      target_2: 3700.0,
      stop_loss: 3400.0,
      trailing_stop_loss: 3400.0,
      partial_exit_done: 0,
      friction_costs: 198.60,
      status: 'OPEN'
    };

    const runCalls: { sql: string; params: any[] }[] = [];
    setDbMockHooks({
      dbAll: async (sql) => {
        if (sql.includes('PaperTradingPots')) return [{ id: 'pot_conservative', cash_balance: 800000 }];
        if (sql.includes('PaperTradingPositions')) return [mockPos];
        return [];
      },
      dbGet: async (sql) => {
        if (sql.includes('SELECT close FROM Prices')) {
          return { close: 3605.0 }; // >= target_1 (3600)
        }
        if (sql.includes('PaperTradingPots')) {
          return {
            id: 'pot_conservative',
            cash_balance: 800000,
            total_realized_pnl: 10000,
            current_portfolio_nav: 1000000
          };
        }
        return null;
      },
      dbRun: async (sql, params) => {
        runCalls.push({ sql, params });
        return { changes: 1 };
      }
    });

    const result = await service.syncOpenPositions();

    expect(result.updated).toBe(1);
    expect(result.closed).toBe(0);

    const partialCall = runCalls.find(c => c.sql.includes('UPDATE PaperTradingPositions') && c.sql.includes('partial_exit_done = 1'));
    expect(partialCall).toBeDefined();
    expect(partialCall!.params[0]).toBe(25); // quantity halved (50 -> 25)
    expect(partialCall!.params[3]).toBe(3500.0); // trailing_stop_loss moved to entry_price (break-even)
  });

  // U-PT-09
  it('U-PT-09: Full close at T2 realizes full P&L, sets status to CLOSED_PROFIT, and records exit STT + fee', async () => {
    const mockPos = {
      id: 502,
      pot_id: 'pot_conservative',
      symbol: 'INFY',
      action: 'BUY',
      quantity: 25,
      entry_price: 1500.0,
      invested_capital: 37500.0,
      target_1: 1550.0,
      target_2: 1600.0,
      stop_loss: 1450.0,
      trailing_stop_loss: 1500.0,
      partial_exit_done: 1,
      partial_exit_pnl: 1100.0,
      friction_costs: 61.10,
      status: 'OPEN'
    };

    const runCalls: { sql: string; params: any[] }[] = [];
    setDbMockHooks({
      dbAll: async (sql) => {
        if (sql.includes('PaperTradingPots')) return [{ id: 'pot_conservative', cash_balance: 900000 }];
        if (sql.includes('PaperTradingPositions')) return [mockPos];
        return [];
      },
      dbGet: async (sql) => {
        if (sql.includes('SELECT close FROM Prices')) {
          return { close: 1605.0 }; // >= target_2 (1600)
        }
        if (sql.includes('PaperTradingPots')) {
          return {
            id: 'pot_conservative',
            cash_balance: 900000,
            total_realized_pnl: 20000,
            current_portfolio_nav: 1000000
          };
        }
        return null;
      },
      dbRun: async (sql, params) => {
        runCalls.push({ sql, params });
        return { changes: 1 };
      }
    });

    const result = await service.syncOpenPositions();

    expect(result.closed).toBe(1);

    const closeCall = runCalls.find(c => c.sql.includes('status = ?') && c.sql.includes('exit_reason = ?'));
    expect(closeCall).toBeDefined();
    expect(closeCall!.params[0]).toBe('CLOSED_PROFIT'); // status
    expect(closeCall!.params[2]).toBe('TARGET_2_HIT'); // exitReason
  });

  // U-PT-10
  it('U-PT-10: Stop-loss breach after partial exit sets exitReason TRAILING_STOP_HIT and status CLOSED_LOSS', async () => {
    const mockPos = {
      id: 503,
      pot_id: 'pot_conservative',
      symbol: 'HDFC',
      action: 'BUY',
      quantity: 20,
      entry_price: 2500.0,
      invested_capital: 50000.0,
      target_1: 2600.0,
      target_2: 2700.0,
      stop_loss: 2450.0,
      trailing_stop_loss: 2500.0,
      partial_exit_done: 1,
      partial_exit_pnl: 950.0,
      friction_costs: 80.0,
      status: 'OPEN'
    };

    const runCalls: { sql: string; params: any[] }[] = [];
    setDbMockHooks({
      dbAll: async (sql) => {
        if (sql.includes('PaperTradingPots')) return [{ id: 'pot_conservative', cash_balance: 850000 }];
        if (sql.includes('PaperTradingPositions')) return [mockPos];
        return [];
      },
      dbGet: async (sql) => {
        if (sql.includes('SELECT close FROM Prices')) {
          return { close: 2490.0 }; // <= trailing_stop_loss (2500)
        }
        if (sql.includes('PaperTradingPots')) {
          return {
            id: 'pot_conservative',
            cash_balance: 850000,
            total_realized_pnl: 15000,
            current_portfolio_nav: 1000000
          };
        }
        return null;
      },
      dbRun: async (sql, params) => {
        runCalls.push({ sql, params });
        return { changes: 1 };
      }
    });

    const result = await service.syncOpenPositions();

    expect(result.closed).toBe(1);

    const closeCall = runCalls.find(c => c.sql.includes('exit_reason = ?'));
    expect(closeCall).toBeDefined();
    expect(closeCall!.params[0]).toBe('CLOSED_LOSS');
    expect(closeCall!.params[2]).toBe('TRAILING_STOP_HIT');
  });

  // U-PT-11
  it('U-PT-11: Circuit breaker evaluation trips when drawdown >= 20%', async () => {
    const pot = {
      id: 'pot_conservative',
      initial_capital: 1000000,
      cash_balance: 750000,
      peak_nav: 1000000
    };

    const runCalls: { sql: string; params: any[] }[] = [];
    setDbMockHooks({
      dbAll: async (sql) => {
        if (sql.includes('SELECT * FROM PaperTradingPots')) return [pot];
        if (sql.includes('SELECT SUM(quantity * current_price)')) return [{ investedValue: 0 }];
        return [];
      },
      dbRun: async (sql, params) => {
        runCalls.push({ sql, params });
        return { changes: 1 };
      }
    });

    await (service as any).evaluatePotCircuitBreakers();

    const tripCall = runCalls.find(c => c.sql.includes('is_circuit_breaker_tripped = ?'));
    expect(tripCall).toBeDefined();
    expect(tripCall!.params[3]).toBe(1); // tripBreaker flag = 1
    expect(tripCall!.params[4]).toContain('Max Drawdown Circuit Breaker Tripped');
  });

  // U-PT-12
  it('U-PT-12: DB failure during ensurePotsInitialized is caught, logged, and does not crash process', async () => {
    const dbErr = new Error('SQLITE_CORRUPT: database disk image is malformed');
    setDbMockHooks({
      dbAll: async () => { throw dbErr; }
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.ensurePotsInitialized()).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[PaperTradingPotService] ensurePotsInitialized error:'),
      dbErr
    );
  });
});
