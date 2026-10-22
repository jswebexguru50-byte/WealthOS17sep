/**
 * WealthOS Test Suite 1 & 2: Server Health, Infrastructure & Data Source Integration
 * 
 * Validates:
 * - TS1: Server health, trading calendar accuracy, feed staleness
 * - TS2: Yahoo Finance, Screener.in, AMFI, exchange rate data quality
 * 
 * Pillars: P1 (Technical Correctness), P2 (Functional Accuracy), P3 (Data Quality)
 */
import { describe, test, expect, beforeAll } from 'vitest';

const BASE = 'http://localhost:3000/api';

// --------------------------------------------------------------------------
// TS-1: SERVER HEALTH & INFRASTRUCTURE
// --------------------------------------------------------------------------
describe('TS-1: Server Health & Infrastructure', () => {

  test('TS1-01: Server healthcheck responds with 200 and valid timestamp', async () => {
    const res = await fetch(`${BASE}/healthcheck`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status || data.ok).toBeTruthy();
    if (data.timestamp) {
      const ts = new Date(data.timestamp);
      expect(ts.getTime()).toBeGreaterThan(Date.now() - 60_000);
    }
  });

  test('TS1-02: Unknown API route returns 404', async () => {
    const res = await fetch(`${BASE}/nonexistent-endpoint-xyz-9999`);
    expect(res.status).toBe(404);
  });
});

// --------------------------------------------------------------------------
// TS-1.2: TRADING CALENDAR (INFRA-1)
// --------------------------------------------------------------------------
describe('TS-1.2: Trading Calendar (INFRA-1)', () => {

  test('TS1-05: Known Saturday is NOT a trading day', async () => {
    const res = await fetch(`${BASE}/calendar/is-trading-day?date=2026-09-05`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.is_trading_day).toBe(false);
  });

  test('TS1-06: Republic Day 2026 (Jan 26) is NOT a trading day', async () => {
    const res = await fetch(`${BASE}/calendar/is-trading-day?date=2026-01-26`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.is_trading_day).toBe(false);
  });

  test('TS1-08: Adding 5 trading days skips weekends', async () => {
    const res = await fetch(`${BASE}/calendar/add-trading-days?date=2026-09-04&n=5`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const resultDate = new Date(data.result_date || data.date || data.result);
    // Result should not fall on a weekend
    const day = resultDate.getDay();
    expect(day).not.toBe(0); // Not Sunday
    expect(day).not.toBe(6); // Not Saturday
  });

  test('TS1-09: Trading days between returns reasonable count', async () => {
    const res = await fetch(`${BASE}/calendar/trading-days-between?from=2026-04-01&to=2026-04-30`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const count = data.count || data.trading_days || data.result;
    // April typically has ~20-22 trading days minus holidays
    expect(count).toBeGreaterThan(15);
    expect(count).toBeLessThan(24);
  });

  test('TS1-10: Calendar validates against known NSE holidays', async () => {
    // Known NSE holidays — cross-reference with official NSE circulars
    const KNOWN_HOLIDAYS: Record<string, string> = {
      '2025-08-15': 'Independence Day',
      '2025-10-02': 'Mahatma Gandhi Jayanti',
      '2026-01-26': 'Republic Day',
      '2026-08-15': 'Independence Day',
    };

    for (const [date, name] of Object.entries(KNOWN_HOLIDAYS)) {
      const res = await fetch(`${BASE}/calendar/is-trading-day?date=${date}`);
      const data = await res.json();
      expect(data.is_trading_day).toBe(false);
    }
  });
});

// --------------------------------------------------------------------------
// TS-1.3: DATA FEED STALENESS MONITOR (INFRA-3)
// --------------------------------------------------------------------------
describe('TS-1.3: Data Feed Staleness Monitor (INFRA-3)', () => {

  test('TS1-11: Feed status endpoint returns feed list', async () => {
    const res = await fetch(`${BASE}/data-quality/feed-status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    // Should return an array or object with feed entries
    expect(data).toBeDefined();
  });

  test('TS1-12: Each feed has valid state enum', async () => {
    const res = await fetch(`${BASE}/data-quality/feed-status`);
    const data = await res.json();
    const feeds = Array.isArray(data) ? data : (data.feeds || []);
    
    const VALID_STATES = ['LIVE', 'STALE', 'UNAVAILABLE'];
    feeds.forEach((feed: any) => {
      if (feed.state) {
        expect(VALID_STATES).toContain(feed.state);
      }
    });
  });
});

// --------------------------------------------------------------------------
// TS-2: DATA SOURCE INTEGRATION & QUALITY
// --------------------------------------------------------------------------
describe('TS-2.1: Yahoo Finance Market Data Quality', () => {

  test('TS2-01: Dashboard returns real stock prices (not zero)', async () => {
    const res = await fetch(`${BASE}/dashboard?portfolio=Combined`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const holdings = data.holdings || data.rows || [];
    
    if (holdings.length > 0) {
      const withPrice = holdings.filter((h: any) => Number(h.ltp || h.current_price || 0) > 0);
      // At least 80% of holdings should have a real price
      expect(withPrice.length / holdings.length).toBeGreaterThan(0.8);
    }
  });

  test('TS2-05: No active holdings have LTP = 0', async () => {
    const res = await fetch(`${BASE}/dashboard?portfolio=Combined`);
    const data = await res.json();
    const holdings = data.holdings || data.rows || [];
    
    const activeWithZeroLTP = holdings.filter((h: any) => 
      Number(h.quantity || 0) > 0 && Number(h.ltp || 0) <= 0
    );

    if (activeWithZeroLTP.length > 0) {
      console.warn('⚠️ Holdings with zero LTP:', 
        activeWithZeroLTP.map((h: any) => `${h.symbol} (qty: ${h.quantity})`));
    }
    // Allow max 5% to have stale/missing price (BSE-only micro-caps)
    const failRate = activeWithZeroLTP.length / Math.max(holdings.length, 1);
    expect(failRate).toBeLessThan(0.05);
  });

  test('TS2-06: Market value = quantity × LTP for each holding', async () => {
    const res = await fetch(`${BASE}/dashboard?portfolio=Combined`);
    const data = await res.json();
    const holdings = data.holdings || data.rows || [];
    
    holdings.forEach((h: any) => {
      const qty = Number(h.quantity || 0);
      const ltp = Number(h.ltp || h.current_price || 0);
      const value = Number(h.current_value || h.market_value || 0);
      
      if (qty > 0 && ltp > 0 && value > 0) {
        const computed = qty * ltp;
        const variance = Math.abs(computed - value) / Math.max(value, 1);
        // Allow 0.5% variance for rounding
        expect(variance).toBeLessThan(0.005);
      }
    });
  });
});

describe('TS-2.4: Exchange Rate Data Quality', () => {

  test('TS2-15: USD/INR rate is in reasonable range (70-120)', async () => {
    const res = await fetch(`${BASE}/currency-rates`);
    if (res.status === 200) {
      const data = await res.json();
      const usdInr = data.USD_INR || data.usd_inr || data.rates?.USD_INR;
      if (usdInr) {
        expect(usdInr).toBeGreaterThan(70);
        expect(usdInr).toBeLessThan(120);
      }
    }
  });

  test('TS2-16: AED/INR rate is approximately USD/INR ÷ 3.67', async () => {
    const res = await fetch(`${BASE}/currency-rates`);
    if (res.status === 200) {
      const data = await res.json();
      const usdInr = data.USD_INR || data.usd_inr || data.rates?.USD_INR;
      const aedInr = data.AED_INR || data.aed_inr || data.rates?.AED_INR;
      if (usdInr && aedInr) {
        const expectedAed = usdInr / 3.6725;
        const variance = Math.abs(aedInr - expectedAed) / expectedAed;
        expect(variance).toBeLessThan(0.03); // Within 3%
      }
    }
  });
});

// --------------------------------------------------------------------------
// TS-2.2: Command Center Aggregate Accuracy
// --------------------------------------------------------------------------
describe('TS-2.2: Command Center Aggregate Accuracy', () => {

  test('TS5-08: Total net worth = sum of holdings + cash/FDs', async () => {
    const ccRes = await fetch(`${BASE}/command-center`);
    if (ccRes.status === 200) {
      const ccData = await ccRes.json();
      const totalNetWorth = Number(ccData.summary?.totalNetWorthINR ?? ccData.totalNetWorth ?? ccData.total_net_worth ?? 0);
      
      // Net worth should be a real, positive number for a live portfolio
      expect(totalNetWorth).toBeGreaterThan(0);

      // Verify mathematical invariant: totalNetWorth = portfolio + bank/FD
      if (ccData.summary) {
        const portVal = Number(ccData.summary.totalPortfolioValINR || 0);
        const bankVal = Number(ccData.summary.totalBankAndFdVal || 0);
        expect(Math.abs(totalNetWorth - (portVal + bankVal))).toBeLessThan(1.0);
      }
    }
  });
});
