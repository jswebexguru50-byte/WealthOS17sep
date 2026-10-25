/**
 * Unit tests for DataProviderRegistry
 */
import { describe, it, expect } from 'vitest';
import {
  PROVIDER,
  DATA_CLASS,
  providerMeta,
  fallbackChain,
  initProviderCircuitBreakers,
} from '../../src/server/services/DataProviderRegistry.js';

describe('PROVIDER constants', () => {
  it('exports all expected provider keys', () => {
    expect(PROVIDER.UPSTOX).toBe('upstox');
    expect(PROVIDER.KITE).toBe('kite');
    expect(PROVIDER.TRADINGVIEW).toBe('tradingview');
    expect(PROVIDER.TRENDLYNE_SITE).toBe('trendlyne-site');
    expect(PROVIDER.NSE).toBe('nse');
    expect(PROVIDER.BSE).toBe('bse');
    expect(PROVIDER.MCA).toBe('mca');
    expect(PROVIDER.COMPANY_IR).toBe('company-ir');
    expect(PROVIDER.SCREENER).toBe('screener');
    expect(PROVIDER.YAHOO).toBe('yahoo');
    expect(PROVIDER.TRENDLYNE_MCP).toBe('trendlyne-mcp');
  });
});

describe('DATA_CLASS constants', () => {
  it('exports all expected data class keys', () => {
    expect(DATA_CLASS.LIVE_PRICE).toBe('live_price');
    expect(DATA_CLASS.DAILY_OHLCV).toBe('daily_ohlcv');
    expect(DATA_CLASS.FINANCIALS).toBe('financials');
    expect(DATA_CLASS.RATIOS).toBe('ratios');
    expect(DATA_CLASS.ENRICHMENT).toBe('enrichment');
    expect(DATA_CLASS.MF_NAV).toBe('mf_nav');
  });
});

describe('providerMeta', () => {
  it('UPSTOX has highest priority (1)', () => {
    expect(providerMeta[PROVIDER.UPSTOX].priority).toBe(1);
  });

  it('KITE has priority 2', () => {
    expect(providerMeta[PROVIDER.KITE].priority).toBe(2);
  });

  it('TRENDLYNE_MCP is explicit-only with priority 99', () => {
    const meta = providerMeta[PROVIDER.TRENDLYNE_MCP];
    expect(meta.isExplicitOnly).toBe(true);
    expect(meta.priority).toBe(99);
  });

  it('all non-explicit providers have isExplicitOnly=false', () => {
    const explicitProviders = [PROVIDER.TRENDLYNE_MCP];
    for (const [p, meta] of Object.entries(providerMeta)) {
      if (explicitProviders.includes(p as any)) continue;
      expect(meta.isExplicitOnly, `${p} should not be explicit-only`).toBe(false);
    }
  });

  it('UPSTOX requires auth', () => {
    expect(providerMeta[PROVIDER.UPSTOX].requiresAuth).toBe(true);
  });

  it('NSE does not require auth', () => {
    expect(providerMeta[PROVIDER.NSE].requiresAuth).toBe(false);
  });

  it('TRADINGVIEW requires session', () => {
    expect(providerMeta[PROVIDER.TRADINGVIEW].requiresSession).toBe(true);
  });

  it('UPSTOX ttlMs is 1 minute (60_000)', () => {
    expect(providerMeta[PROVIDER.UPSTOX].ttlMs).toBe(60_000);
  });

  it('SCREENER ttlMs is 48 hours', () => {
    expect(providerMeta[PROVIDER.SCREENER].ttlMs).toBe(48 * 60 * 60_000);
  });

  it('UPSTOX is authoritative for LIVE_PRICE', () => {
    expect(providerMeta[PROVIDER.UPSTOX].authoritative).toContain(DATA_CLASS.LIVE_PRICE);
  });

  it('KITE is authoritative for DAILY_OHLCV', () => {
    expect(providerMeta[PROVIDER.KITE].authoritative).toContain(DATA_CLASS.DAILY_OHLCV);
  });

  it('YAHOO has no authoritative data classes', () => {
    expect(providerMeta[PROVIDER.YAHOO].authoritative).toHaveLength(0);
  });
});

describe('fallbackChain', () => {
  it('never includes TRENDLYNE_MCP in any chain', () => {
    for (const dc of Object.values(DATA_CLASS)) {
      const chain = fallbackChain(dc);
      expect(chain, `${dc} chain should not include trendlyne-mcp`).not.toContain(PROVIDER.TRENDLYNE_MCP);
    }
  });

  it('LIVE_PRICE chain starts with UPSTOX', () => {
    const chain = fallbackChain(DATA_CLASS.LIVE_PRICE);
    expect(chain[0]).toBe(PROVIDER.UPSTOX);
  });

  it('DAILY_OHLCV chain starts with KITE', () => {
    const chain = fallbackChain(DATA_CLASS.DAILY_OHLCV);
    expect(chain[0]).toBe(PROVIDER.KITE);
  });

  it('RATIOS chain starts with SCREENER', () => {
    const chain = fallbackChain(DATA_CLASS.RATIOS);
    expect(chain[0]).toBe(PROVIDER.SCREENER);
  });

  it('returns an array (never undefined) for every DATA_CLASS', () => {
    for (const dc of Object.values(DATA_CLASS)) {
      expect(Array.isArray(fallbackChain(dc))).toBe(true);
    }
  });

  it('all providers in any chain are non-explicit', () => {
    for (const dc of Object.values(DATA_CLASS)) {
      for (const p of fallbackChain(dc)) {
        expect(providerMeta[p].isExplicitOnly, `${p} in ${dc} chain must not be explicit-only`).toBe(false);
      }
    }
  });
});

describe('initProviderCircuitBreakers', () => {
  it('runs without throwing', () => {
    expect(() => initProviderCircuitBreakers()).not.toThrow();
  });

  it('is idempotent — second call does not throw', () => {
    expect(() => initProviderCircuitBreakers()).not.toThrow();
  });
});
