import { describe, it, expect, afterEach } from '@jest/globals';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { RecommendationOutcomeAuditor } from '../../services/RecommendationOutcomeAuditor.js';
import { PaperTradingPotService } from '../../services/PaperTradingPotService.js';
import { setDbMockHooks } from '../../database.js';

const API_BASE = 'http://localhost:3000/api';
const PERF_LOG_PATH = path.join(process.cwd(), 'performance.log');
const ARTIFACT_PERF_LOG = path.join(process.cwd(), 'artifacts', 'performance.log');

function appendPerfLog(message: string) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(PERF_LOG_PATH, line);
  try {
    fs.appendFileSync(ARTIFACT_PERF_LOG, line);
  } catch {}
}

describe('Performance & Stress Benchmark Tests (Spec Section 6)', () => {

  afterEach(() => {
    setDbMockHooks({});
  });

  // Benchmark 1: auditActiveRecommendations on 10,000 active rows < 2s
  it('PERF-01: auditActiveRecommendations evaluates 10,000 active rows in < 2,000 ms (repeated 5x)', async () => {
    const auditor = RecommendationOutcomeAuditor.getInstance();
    
    // Generate 10,000 mock active recommendations
    const mock10kRecs = Array.from({ length: 10000 }, (_, i) => ({
      id: i + 1,
      symbol: `PERF_SYM_${i % 50}`,
      company_name: `Perf Company ${i % 50}`,
      sector: 'Technology',
      action: 'ENTER_LONG_BREAKOUT',
      entry_price: 1000.0,
      current_price: 1000.0,
      stop_loss: 950.0,
      target_1: 1100.0,
      target_2: 1200.0,
      timeframe: 'SWING_1_TO_2_WEEKS',
      status: 'ACTIVE',
      volume_surge_ratio: 1.5,
      created_at: new Date().toISOString()
    }));

    setDbMockHooks({
      dbAll: async (sql: string) => {
        if (sql.includes('AutonomousRecommendationsLedger')) {
          return mock10kRecs;
        }
        return [];
      },
      dbGet: async () => ({ close: 1025.0, high: 1030.0, low: 995.0 }),
      dbRun: async () => ({ id: 1, lastID: 1, changes: 1 })
    });

    const runTimes: number[] = [];
    const ITERATIONS = 5;

    for (let iter = 1; iter <= ITERATIONS; iter++) {
      const start = Date.now();
      const result = await auditor.auditActiveRecommendations();
      const elapsed = Date.now() - start;
      runTimes.push(elapsed);

      expect(result.audited).toBe(10000);
      appendPerfLog(`PERF-01 Run #${iter}: 10,000 rows audited in ${elapsed} ms`);
    }

    const maxTime = Math.max(...runTimes);
    const avgTime = runTimes.reduce((a, b) => a + b, 0) / ITERATIONS;
    appendPerfLog(`PERF-01 Summary: Avg ${avgTime.toFixed(1)} ms | Max ${maxTime} ms (Threshold: 2000 ms)`);

    expect(maxTime).toBeLessThanOrEqual(2000);
  });

  // Benchmark 2: syncOpenPositions on 500 open positions < 3s
  it('PERF-02: syncOpenPositions syncs 500 open positions in < 3,000 ms (repeated 5x)', async () => {
    const potService = PaperTradingPotService.getInstance();

    const mock500Positions = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      pot_id: 'pot_conservative',
      symbol: `PERF_POS_${i % 30}`,
      action: 'ENTER_LONG_BREAKOUT',
      quantity: 50,
      initial_quantity: 50,
      entry_price: 500.0,
      current_price: 510.0,
      stop_loss: 475.0,
      trailing_stop_loss: 475.0,
      target_1: 550.0,
      target_2: 600.0,
      invested_capital: 25000.0,
      partial_exit_done: 0,
      friction_costs: 45.0,
      status: 'OPEN'
    }));

    const mockPot = {
      id: 'pot_conservative',
      pot_name: 'Main Conservative Sandbox',
      strategy_type: 'CONSERVATIVE',
      initial_capital: 1000000.0,
      cash_balance: 750000.0,
      current_portfolio_nav: 1005000.0,
      total_realized_pnl: 5000.0,
      is_circuit_breaker_tripped: 0
    };

    setDbMockHooks({
      dbAll: async (sql: string) => {
        if (sql.includes('PaperTradingPositions') && sql.includes("status = 'OPEN'")) {
          return mock500Positions;
        }
        if (sql.includes('PaperTradingPots')) {
          return [mockPot];
        }
        if (sql.includes('SUM(quantity * current_price)')) {
          return [{ investedValue: 255000.0 }];
        }
        return [];
      },
      dbGet: async (sql: string) => {
        if (sql.includes('PaperTradingPots')) return mockPot;
        if (sql.includes('Prices')) return { close: 515.0 };
        if (sql.includes('SUM(quantity * current_price)')) return { investedValue: 255000.0 };
        if (sql.includes('PaperTradingNAVHistory')) return { nav: 1005000.0, benchmark_nifty_nav: 1000000.0 };
        return null;
      },
      dbRun: async () => ({ id: 1, lastID: 1, changes: 1 })
    });

    const runTimes: number[] = [];
    const ITERATIONS = 5;

    for (let iter = 1; iter <= ITERATIONS; iter++) {
      const start = Date.now();
      const result = await potService.syncOpenPositions();
      const elapsed = Date.now() - start;
      runTimes.push(elapsed);

      expect(result.checked).toBe(500);
      appendPerfLog(`PERF-02 Run #${iter}: 500 positions synced in ${elapsed} ms`);
    }

    const maxTime = Math.max(...runTimes);
    const avgTime = runTimes.reduce((a, b) => a + b, 0) / ITERATIONS;
    appendPerfLog(`PERF-02 Summary: Avg ${avgTime.toFixed(1)} ms | Max ${maxTime} ms (Threshold: 3000 ms)`);

    expect(maxTime).toBeLessThanOrEqual(3000);
  });

  // Benchmark 3: API latency for /v1/autonomous-agent/recommendations < 200 ms (average over 20 runs)
  it('PERF-03: API latency for /v1/autonomous-agent/recommendations averages < 200 ms over 20 runs', async () => {
    const RUNS = 20;
    const latencies: number[] = [];

    // Warm-up call
    try {
      await axios.get(`${API_BASE}/v1/autonomous-agent/recommendations`);
    } catch {}

    for (let i = 1; i <= RUNS; i++) {
      const start = Date.now();
      const res = await axios.get(`${API_BASE}/v1/autonomous-agent/recommendations`);
      const elapsed = Date.now() - start;
      latencies.push(elapsed);
      expect(res.status).toBe(200);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / RUNS;
    const maxLatency = Math.max(...latencies);
    appendPerfLog(`PERF-03 Summary: 20 API calls - Avg ${avgLatency.toFixed(1)} ms | Max ${maxLatency} ms (Threshold: 200 ms)`);

    expect(avgLatency).toBeLessThan(200);
  });
});
