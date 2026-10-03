import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import infraRouter from '../../src/server/routes/infra.js';

vi.mock('../../src/server/services/DuckDbAdjustedOhlcvService.js', () => {
  return {
    DuckDbAdjustedOhlcvService: {
      getDailyBarsForSymbols: vi.fn()
    }
  };
});

const { mockOpenPosition } = vi.hoisted(() => ({
  mockOpenPosition: vi.fn().mockResolvedValue({ id: 'pos_123' })
}));

vi.mock('../../src/server/services/PaperTradingPotService.js', () => {
  const instance = {
    ensurePotsInitialized: vi.fn().mockResolvedValue(true),
    openPosition: mockOpenPosition
  };
  return {
    PaperTradingPotService: {
      getInstance: () => instance
    }
  };
});

vi.mock('../../src/server/database.js', () => ({
  dbRun: vi.fn().mockResolvedValue(true),
  dbGet: vi.fn().mockResolvedValue([]),
  dbAll: vi.fn().mockResolvedValue([]),
  getDB: vi.fn().mockReturnValue({})
}));

vi.mock('../../src/server/services/PriceActionBacktestEngine.js', () => {
  return {
    PriceActionBacktestEngine: {
      getInstance: () => ({
        analyzeAndBacktest: vi.fn().mockReturnValue({ entrySignalContext: {} })
      })
    }
  };
});

const { DuckDbAdjustedOhlcvService } = await import('../../src/server/services/DuckDbAdjustedOhlcvService.js');
const { PaperTradingPotService } = await import('../../src/server/services/PaperTradingPotService.js');
const { dbRun } = await import('../../src/server/database.js');

const app = express();
app.use(express.json());
app.use('/api', infraRouter);

describe('Analyze360 Actions Backend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validBar = { trade_date: new Date().toISOString().split('T')[0], close_adjusted: 150 };
  const staleBar = { trade_date: '2023-01-01', close_adjusted: 150 };

  const mockBars = (bars: any[]) => {
    (DuckDbAdjustedOhlcvService.getDailyBarsForSymbols as any).mockResolvedValue({
      bars: new Map([['AAPL', bars]])
    });
  };

  it('1. Missing mode defaults to preview and does not call openPosition or dbRun', async () => {
    mockBars([validBar]);
    
    // Paper Trade
    let res = await request(app).post('/api/analyze360/AAPL/paper-trade').send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PREVIEW');
    expect(res.body.success).toBe(true);
    expect((PaperTradingPotService.getInstance() as any).openPosition).not.toHaveBeenCalled();

    // Alert
    res = await request(app).post('/api/analyze360/AAPL/alert').send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PREVIEW');
    expect(res.body.success).toBe(true);
    expect(dbRun).not.toHaveBeenCalled();
  });

  it('2. Paper trade create calls openPosition only when mode="create" and OHLCV fresh', async () => {
    mockBars([validBar]);
    
    const res = await request(app)
      .post('/api/analyze360/AAPL/paper-trade')
      .send({ mode: 'create' });
      
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CREATED');
    expect(res.body.success).toBe(true);
    expect(mockOpenPosition).toHaveBeenCalled();
  });

  it('3. Stale OHLCV blocks paper trade and alert', async () => {
    mockBars([staleBar]);
    
    // Paper Trade
    let res = await request(app).post('/api/analyze360/AAPL/paper-trade').send({ mode: 'create' });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('DATA_INSUFFICIENT');
    expect(res.body.success).toBe(false);

    // Alert
    res = await request(app).post('/api/analyze360/AAPL/alert').send({ mode: 'create', params: { targetPrice: 160 } });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('DATA_INSUFFICIENT');
    expect(res.body.success).toBe(false);
  });

  it('4. Alert create blocks invalid targetPrice', async () => {
    mockBars([validBar]);
    
    const res = await request(app)
      .post('/api/analyze360/AAPL/alert')
      .send({ mode: 'create', params: { targetPrice: -50 } }); // invalid
      
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('BLOCKED');
    expect(res.body.blockers[0].field).toBe('targetPrice');
  });

  it('5. Backtest blocked response is structured when OHLCV bars < required', async () => {
    mockBars([validBar]); // Only 1 bar, need 60
    
    const res = await request(app).post('/api/analyze360/AAPL/backtest').send({});
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('DATA_INSUFFICIENT');
    expect(res.body.success).toBe(false);
    expect(res.body.blockers[0].field).toBe('ohlcv');
  });
});
