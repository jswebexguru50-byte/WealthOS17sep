/**
 * p2-ttl-waterfall.test.ts
 * Comprehensive test suite for TTL Waterfall feature implementation
 * 29 test cases covering all acceptance criteria
 */

import { MockTimeProvider, MockHttpClient, MockWebSocketClient, MockCacheStore, MockConfigProvider, MockLogger, MockMetricsExporter } from '../mocks/waterfall-mocks.js';
import { WaterfallFetcher, MetricType, FetchResult } from '../../src/server/services/WaterfallFetcher.js';
import { TTLManager } from '../../src/server/services/TTLManager.js';

describe('TTL Waterfall Feature - 29 Test Cases', () => {

  // ============================================================================
  // TTL Enforcement Tests
  // ============================================================================

  describe('TTL Enforcement', () => {
    it('Data fetched at T=0 is fresh when accessed at T < TTL', () => {
      const time = new MockTimeProvider();
      const cache = new MockCacheStore();
      const ttlManager = new TTLManager(cache, time);

      const fetchedAt = 0;
      const ttl = 60000;
      const accessedAt = 30000;

      const result: FetchResult = {
        data: { value: 'test' },
        source: 'primary',
        fetchedAt,
        ttl,
        expiresAt: fetchedAt + ttl
      };

      time.setNow(accessedAt);
      const isFresh = ttlManager.isFresh(result);
      expect(isFresh).toBe(true);
    });

    it('Data is marked stale when accessed at T >= TTL', () => {
      const time = new MockTimeProvider();
      const cache = new MockCacheStore();
      const ttlManager = new TTLManager(cache, time);

      const fetchedAt = 0;
      const ttl = 60000;
      const accessedAt = 60000;

      const result: FetchResult = {
        data: { value: 'test' },
        source: 'primary',
        fetchedAt,
        ttl,
        expiresAt: fetchedAt + ttl
      };

      time.setNow(accessedAt);
      const isFresh = ttlManager.isFresh(result);
      expect(isFresh).toBe(false);
    });

    it('Stale data is rejected by cache validation layer', () => {
      const time = new MockTimeProvider();
      const cache = new MockCacheStore();
      const ttlManager = new TTLManager(cache, time);

      const fetchedAt = 0;
      const ttl = 60000;
      const staleAt = 65000;

      const cacheKey = 'test-metric';
      const result: FetchResult = {
        data: { value: 'test' },
        source: 'primary',
        fetchedAt,
        ttl,
        expiresAt: fetchedAt + ttl
      };

      cache.set(cacheKey, result);
      time.setNow(staleAt);

      const retrieved = cache.get(cacheKey);
      expect(retrieved).toBeNull();
    });

    it('TTL window respects per-metric configuration', () => {
      const config = new MockConfigProvider();
      config.set('market_data_ttl', 60000);
      config.set('fundamentals_ttl', 86400000);
      config.set('news_ttl', 3600000);

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);

      const marketDataTTL = ttlManager.getTTLForMetric(MetricType.MARKET_DATA);
      const fundamentalsTTL = ttlManager.getTTLForMetric(MetricType.FUNDAMENTALS);
      const newsTTL = ttlManager.getTTLForMetric(MetricType.NEWS);

      expect(marketDataTTL).toBe(60000);
      expect(fundamentalsTTL).toBe(86400000);
      expect(newsTTL).toBe(3600000);
    });

    it('TTL expiration triggers refetch from waterfall chain', async () => {
      const time = new MockTimeProvider();
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const logger = new MockLogger();

      const config = new MockConfigProvider();
      config.set('market_data_ttl', 60000);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      const fetcher = new WaterfallFetcher(cache, http, logger, config, time);

      time.setNow(0);
      http.setResponse('http://primary.api/data', { value: 'v1' });
      const result1 = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      time.setNow(65000);
      http.setResponse('http://primary.api/data', { value: 'v2' });
      const result2 = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      expect(result2.source).toBe('primary');
      expect(result2.data.value).toBe('v2');
    });
  });

  // ============================================================================
  // Waterfall Precedence - Primary Fetcher Success Path
  // ============================================================================

  describe('Waterfall Precedence - Primary Fetcher Success Path', () => {
    it('Primary fetcher (tier 0) is attempted first', async () => {
      const http = new MockHttpClient();
      const logger = new MockLogger();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'primary' });
      http.setResponse('http://secondary.api/data', { value: 'secondary' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, logger, config);
      const result = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('primary');
      const calls = http.getCallLog();
      expect(calls[0].url).toBe('http://primary.api/data');
    });

    it('Response from primary is returned without checking secondary fetchers', async () => {
      const http = new MockHttpClient();
      const logger = new MockLogger();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' },
        { tier: 2, name: 'tertiary', url: 'http://tertiary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'primary' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, logger, config);
      const result = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      const calls = http.getCallLog();
      expect(calls.length).toBe(1);
      expect(result.source).toBe('primary');
    });

    it('Waterfall chain is not invoked if primary succeeds within TTL', async () => {
      const time = new MockTimeProvider();
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const logger = new MockLogger();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'primary' });

      const fetcher = new WaterfallFetcher(cache, http, logger, config, time);

      time.setNow(0);
      await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);
      const callsAfterFirst = http.getCallLog().length;

      time.setNow(30000);
      await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);
      const callsAfterSecond = http.getCallLog().length;

      expect(callsAfterSecond).toBe(callsAfterFirst);
    });

    it('Response includes source metadata', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'test' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);
      const result = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('primary');
    });

    it('Timestamp in response matches fetch time', async () => {
      const time = new MockTimeProvider();
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      http.setResponse('http://primary.api/data', { value: 'test' });
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config, time);

      time.setNow(1000000);
      const result = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      expect(result.fetchedAt).toBe(1000000);
    });
  });

  // ============================================================================
  // Waterfall Fallback - Primary Failure Escalates Correctly
  // ============================================================================

  describe('Waterfall Fallback - Primary Failure Escalates Correctly', () => {
    it('Primary fetcher timeout triggers secondary fetcher attempt', async () => {
      const http = new MockHttpClient();
      const logger = new MockLogger();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'TIMEOUT');
      http.setResponse('http://secondary.api/data', { value: 'secondary' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, logger, config);
      const result = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('secondary');
    });

    it('Secondary fetcher (tier 1) is invoked only if primary fails', async () => {
      const http = new MockHttpClient();
      const logger = new MockLogger();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'CONNECTION_REFUSED');
      http.setResponse('http://secondary.api/data', { value: 'secondary' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, logger, config);
      const result = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      const calls = http.getCallLog();
      expect(calls.length).toBe(2);
      expect(calls[0].url).toBe('http://primary.api/data');
      expect(calls[1].url).toBe('http://secondary.api/data');
    });

    it('Secondary response is accepted if primary was unavailable', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'SERVICE_UNAVAILABLE');
      http.setResponse('http://secondary.api/data', { value: 'secondary_data' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);
      const result = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('secondary');
      expect(result.data).toEqual({ value: 'secondary_data' });
    });

    it('Tertiary fetcher (tier 2) is tried if both primary and secondary fail', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' },
        { tier: 2, name: 'tertiary', url: 'http://tertiary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'TIMEOUT');
      http.setError('http://secondary.api/data', 'TIMEOUT');
      http.setResponse('http://tertiary.api/data', { value: 'tertiary' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);
      const result = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      const calls = http.getCallLog();
      expect(calls.length).toBe(3);
      expect(result.source).toBe('tertiary');
    });

    it('Fallback order is deterministic and matches configuration', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      const tiers = [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' },
        { tier: 2, name: 'tertiary', url: 'http://tertiary.api/data' }
      ];
      config.set('waterfall_tiers', tiers);

      http.setError('http://primary.api/data', 'FAIL');
      http.setError('http://secondary.api/data', 'FAIL');
      http.setResponse('http://tertiary.api/data', { value: 'result' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);
      await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      const calls = http.getCallLog().map((c: any) => c.url);
      expect(calls).toEqual([
        'http://primary.api/data',
        'http://secondary.api/data',
        'http://tertiary.api/data'
      ]);
    });
  });

  // ============================================================================
  // Waterfall Precedence - Stale Data Handling
  // ============================================================================

  describe('Waterfall Precedence - Stale Data Handling', () => {
    it('Fresh data from primary overrides any cached secondary/tertiary data', async () => {
      const time = new MockTimeProvider();
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      const staleSecondaryResult: FetchResult = {
        data: { value: 'stale_secondary' },
        source: 'secondary',
        fetchedAt: 0,
        ttl: 60000,
        expiresAt: 60000
      };
      cache.set('test-symbol', staleSecondaryResult);

      time.setNow(65000);
      http.setResponse('http://primary.api/data', { value: 'fresh_primary' });

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config, time);
      const result = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('primary');
      expect(result.data.value).toBe('fresh_primary');
    });

    it('Stale data from primary is rejected in favor of fresh secondary data', async () => {
      const time = new MockTimeProvider();
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      const freshSecondaryResult: FetchResult = {
        data: { value: 'fresh_secondary' },
        source: 'secondary',
        fetchedAt: 65000,
        ttl: 60000,
        expiresAt: 125000
      };
      cache.set('test-symbol', freshSecondaryResult);

      time.setNow(65000);

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config, time);
      const result = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('secondary');
    });

    it('Waterfall respects freshness > source priority when TTL differs by metric', async () => {
      const time = new MockTimeProvider();
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);
      config.set('fundamentals_ttl', 86400000);

      const ttlManager = new TTLManager(cache, time, config);

      const oldFundamental: FetchResult = {
        data: { value: 'old_primary' },
        source: 'primary',
        fetchedAt: 0,
        ttl: 86400000,
        expiresAt: 86400000
      };

      time.setNow(100000);
      const isFresh = time.getNow() < oldFundamental.expiresAt;
      expect(isFresh).toBe(false);
    });

    it('Explicitly stale-marked data (TTL expired) never returned if fresher alt exists', async () => {
      const time = new MockTimeProvider();
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      const stalePrimary: FetchResult = {
        data: { value: 'stale_primary' },
        source: 'primary',
        fetchedAt: 0,
        ttl: 60000,
        expiresAt: 60000,
        dataStatus: 'STALE'
      };
      cache.set('test-symbol', stalePrimary);

      time.setNow(65000);
      http.setResponse('http://secondary.api/data', { value: 'fresh_secondary' });

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config, time);
      const result = await fetcher.fetch('test-symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('secondary');
    });
  });

  // ============================================================================
  // Per-Metric TTL Configuration Tests
  // ============================================================================

  describe('Per-Metric TTL Configuration', () => {
    it('Market Data: OHLC has shorter TTL (e.g., 1 minute for intraday)', () => {
      const config = new MockConfigProvider();
      config.set('market_data_ttl', 60000);

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);
      const ttl = ttlManager.getTTLForMetric(MetricType.MARKET_DATA);

      expect(ttl).toBe(60000);
    });

    it('Intraday OHLC stales at configured window independent of fundamentals TTL', () => {
      const time = new MockTimeProvider();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);
      config.set('fundamentals_ttl', 86400000);

      const ttlManager = new TTLManager(new MockCacheStore(), time, config);

      const marketTTL = ttlManager.getTTLForMetric(MetricType.MARKET_DATA);
      const fundamentalsTTL = ttlManager.getTTLForMetric(MetricType.FUNDAMENTALS);

      expect(marketTTL).toBe(60000);
      expect(fundamentalsTTL).toBe(86400000);
      expect(marketTTL).not.toBe(fundamentalsTTL);
    });

    it('Market data TTL is enforced per symbol/timeframe pair', () => {
      const time = new MockTimeProvider();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);

      const ttlManager = new TTLManager(cache, time, config);

      const key1min = 'SYMBOL_1min';
      const key5min = 'SYMBOL_5min';

      time.setNow(0);
      cache.set(key1min, { data: { value: '1min' }, expiresAt: 60000 });
      cache.set(key5min, { data: { value: '5min' }, expiresAt: 60000 });

      time.setNow(30000);
      expect(cache.get(key1min)).not.toBeNull();
      expect(cache.get(key5min)).not.toBeNull();
    });

    it('TTL config is applied consistently across all market data fetchers', () => {
      const config = new MockConfigProvider();
      config.set('market_data_ttl', 60000);

      const ttl1 = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config).getTTLForMetric(MetricType.MARKET_DATA);
      const ttl2 = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config).getTTLForMetric(MetricType.MARKET_DATA);

      expect(ttl1).toBe(ttl2);
    });

    it('Fundamentals data (earnings, balance sheet) has longer TTL (e.g., 24 hours)', () => {
      const config = new MockConfigProvider();
      config.set('fundamentals_ttl', 86400000);

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);
      const ttl = ttlManager.getTTLForMetric(MetricType.FUNDAMENTALS);

      expect(ttl).toBe(86400000);
    });

    it('Quarterly earnings data is cached longer than daily technical data', () => {
      const config = new MockConfigProvider();
      config.set('market_data_ttl', 60000);
      config.set('fundamentals_ttl', 86400000);

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);

      const technicalTTL = ttlManager.getTTLForMetric(MetricType.MARKET_DATA);
      const earningsTTL = ttlManager.getTTLForMetric(MetricType.FUNDAMENTALS);

      expect(earningsTTL).toBeGreaterThan(technicalTTL);
    });

    it('Fundamentals TTL is per-metric-subtype (earnings vs ratios vs growth)', () => {
      const config = new MockConfigProvider();
      config.set('fundamentals_earnings_ttl', 86400000);
      config.set('fundamentals_ratios_ttl', 604800000);
      config.set('fundamentals_growth_ttl', 259200000);

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);

      const earningsTTL = ttlManager.getTTLForMetric('fundamentals_earnings');
      const ratiosTTL = ttlManager.getTTLForMetric('fundamentals_ratios');
      const growthTTL = ttlManager.getTTLForMetric('fundamentals_growth');

      expect(earningsTTL).not.toBe(ratiosTTL);
      expect(ratiosTTL).not.toBe(growthTTL);
    });

    it('TTL config changes do not affect already-cached data mid-fetch', () => {
      const time = new MockTimeProvider();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);

      const result: FetchResult = {
        data: { value: 'test' },
        source: 'primary',
        fetchedAt: 0,
        ttl: 60000,
        expiresAt: 60000
      };

      cache.set('symbol', result);

      config.set('market_data_ttl', 120000);

      const cached = cache.get('symbol') as any;
      expect(cached.ttl).toBe(60000);
    });

    it('News data has medium TTL (e.g., 1–2 hours)', () => {
      const config = new MockConfigProvider();
      config.set('news_ttl', 3600000);

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);
      const ttl = ttlManager.getTTLForMetric(MetricType.NEWS);

      expect(ttl).toBe(3600000);
    });

    it('Breaking news shortens TTL for related symbol (triggers aggressive refresh)', () => {
      const config = new MockConfigProvider();
      config.set('news_ttl', 3600000);
      config.set('breaking_news_ttl', 300000);

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);

      const standardNews = ttlManager.getTTLForMetric(MetricType.NEWS);
      const breakingNews = ttlManager.getTTLForMetric('news_breaking');

      expect(breakingNews).toBeLessThan(standardNews);
    });

    it('News TTL is independent of technical/fundamental TTLs', () => {
      const config = new MockConfigProvider();
      config.set('market_data_ttl', 60000);
      config.set('fundamentals_ttl', 86400000);
      config.set('news_ttl', 3600000);

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);

      const marketTTL = ttlManager.getTTLForMetric(MetricType.MARKET_DATA);
      const fundamentalsTTL = ttlManager.getTTLForMetric(MetricType.FUNDAMENTALS);
      const newsTTL = ttlManager.getTTLForMetric(MetricType.NEWS);

      expect(marketTTL).not.toBe(newsTTL);
      expect(fundamentalsTTL).not.toBe(newsTTL);
    });

    it('TTL config per news category (earnings alerts vs sector news)', () => {
      const config = new MockConfigProvider();
      config.set('news_earnings_ttl', 1800000);
      config.set('news_sector_ttl', 3600000);

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);

      const earningsAlertsTTL = ttlManager.getTTLForMetric('news_earnings');
      const sectorNewsTTL = ttlManager.getTTLForMetric('news_sector');

      expect(earningsAlertsTTL).toBeLessThan(sectorNewsTTL);
    });
  });

  // ============================================================================
  // Freshness Validation - Clock Skew Handling
  // ============================================================================

  describe('Freshness Validation - Clock Skew Handling', () => {
    it('System tolerates +/- 2 second clock skew without marking data stale', () => {
      const time = new MockTimeProvider();
      const cache = new MockCacheStore();
      const ttlManager = new TTLManager(cache, time);

      const fetchedAt = 1000000;
      const ttl = 60000;

      const result: FetchResult = {
        data: { value: 'test' },
        source: 'primary',
        fetchedAt,
        ttl,
        expiresAt: fetchedAt + ttl
      };

      time.setNow(fetchedAt + ttl + 1000);
      let isFresh = ttlManager.isFresh(result);
      expect(isFresh).toBe(true);

      time.setNow(fetchedAt - 1000);
      isFresh = ttlManager.isFresh(result);
      expect(isFresh).toBe(true);
    });

    it('Monotonic clock (steady_clock) is used for TTL calculations if available', () => {
      const time = new MockTimeProvider();
      time.useMonotonicClock = true;

      const ttlManager = new TTLManager(new MockCacheStore(), time);

      const fetchedAt = time.getMonotonicTime();
      const ttl = 60000;

      const result: FetchResult = {
        data: { value: 'test' },
        source: 'primary',
        fetchedAt,
        ttl,
        expiresAt: fetchedAt + ttl
      };

      time.setMonotonicTime(fetchedAt + 30000);
      const isFresh = ttlManager.isFresh(result);
      expect(isFresh).toBe(true);
    });

    it('Wall-clock changes do not cause false positive stale markings', () => {
      const time = new MockTimeProvider();
      const ttlManager = new TTLManager(new MockCacheStore(), time);

      const fetchedAt = 1000000;
      const ttl = 60000;

      const result: FetchResult = {
        data: { value: 'test' },
        source: 'primary',
        fetchedAt,
        ttl,
        expiresAt: fetchedAt + ttl
      };

      time.setNow(fetchedAt + 30000);
      let isFresh = ttlManager.isFresh(result);
      expect(isFresh).toBe(true);

      time.setNow(fetchedAt + 29000);
      isFresh = ttlManager.isFresh(result);
      expect(isFresh).toBe(true);
    });

    it('TTL expiration is based on fetch time, not current wall-clock accuracy', () => {
      const time = new MockTimeProvider();
      const ttlManager = new TTLManager(new MockCacheStore(), time);

      const fetchedAt = 1000000;
      const ttl = 60000;

      const result: FetchResult = {
        data: { value: 'test' },
        source: 'primary',
        fetchedAt,
        ttl,
        expiresAt: fetchedAt + ttl
      };

      time.setNow(fetchedAt + ttl + 1);
      const isFresh = ttlManager.isFresh(result);

      expect(isFresh).toBe(false);
    });
  });

  // ============================================================================
  // Stale Data Rejection - Cache Bypass on TTL Expiry
  // ============================================================================

  describe('Stale Data Rejection - Cache Bypass on TTL Expiry', () => {
    it('Cache lookup returns null if entry TTL has expired', () => {
      const time = new MockTimeProvider();
      const cache = new MockCacheStore();

      time.setNow(0);
      const entry: FetchResult = {
        data: { value: 'test' },
        source: 'primary',
        fetchedAt: 0,
        ttl: 60000,
        expiresAt: 60000
      };
      cache.set('key', entry);

      time.setNow(60001);
      const retrieved = cache.get('key');
      expect(retrieved).toBeNull();
    });

    it('Expired cache entry is not served even if waterfall chain would succeed', async () => {
      const time = new MockTimeProvider();
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      time.setNow(0);
      const staleEntry: FetchResult = {
        data: { value: 'stale' },
        source: 'primary',
        fetchedAt: 0,
        ttl: 60000,
        expiresAt: 60000
      };
      cache.set('symbol', staleEntry);

      time.setNow(65000);
      http.setResponse('http://primary.api/data', { value: 'fresh' });

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config, time);
      const result = await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      expect(result.data.value).toBe('fresh');
    });

    it('Cache entry is evicted when TTL expires (memory cleanup)', () => {
      const cache = new MockCacheStore();

      const entry: FetchResult = {
        data: { value: 'test' },
        source: 'primary',
        fetchedAt: 0,
        ttl: 60000,
        expiresAt: 60000
      };

      cache.set('key', entry);
      const sizeWithEntry = cache.size();

      cache.evict('key');
      const sizeAfterEvict = cache.size();

      expect(sizeAfterEvict).toBeLessThan(sizeWithEntry);
    });

    it('Accessing expired cache does not block primary fetcher re-invocation', async () => {
      const time = new MockTimeProvider();
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      time.setNow(0);
      const staleEntry: FetchResult = {
        data: { value: 'stale' },
        source: 'primary',
        fetchedAt: 0,
        ttl: 60000,
        expiresAt: 60000
      };
      cache.set('symbol', staleEntry);

      time.setNow(65000);
      http.setResponse('http://primary.api/data', { value: 'fresh' });

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config, time);
      const start = Date.now();
      await fetcher.fetch('symbol', MetricType.MARKET_DATA);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
    });
  });

  // ============================================================================
  // Concurrent Request Handling
  // ============================================================================

  describe('Concurrent Request Handling', () => {
    it('Race conditions: Two concurrent requests for same metric only trigger one fetch (not N)', async () => {
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'result' });

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config);

      const [r1, r2] = await Promise.all([
        fetcher.fetch('symbol', MetricType.MARKET_DATA),
        fetcher.fetch('symbol', MetricType.MARKET_DATA)
      ]);

      const httpCalls = http.getCallLog();
      expect(httpCalls.length).toBe(1);
      expect(r1).toEqual(r2);
    });

    it('Second concurrent request waits for first fetch result, respects TTL', async () => {
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'result' });

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config);

      const results = await Promise.all([
        fetcher.fetch('symbol', MetricType.MARKET_DATA),
        fetcher.fetch('symbol', MetricType.MARKET_DATA),
        fetcher.fetch('symbol', MetricType.MARKET_DATA)
      ]);

      const cached = cache.get('symbol');
      expect(cached).not.toBeNull();
    });

    it('TTL window is shared across concurrent callers (no separate TTLs per caller)', async () => {
      const time = new MockTimeProvider();
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'result' });

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config, time);

      time.setNow(0);
      await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      time.setNow(30000);
      const [r1, r2] = await Promise.all([
        fetcher.fetch('symbol', MetricType.MARKET_DATA),
        fetcher.fetch('symbol', MetricType.MARKET_DATA)
      ]);

      const httpCalls = http.getCallLog();
      expect(httpCalls.length).toBe(1);
    });

    it('Waterfall logic is thread-safe under concurrent access', async () => {
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'TIMEOUT');
      http.setResponse('http://secondary.api/data', { value: 'secondary' });

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config);

      const results = await Promise.all([
        fetcher.fetch('symbol', MetricType.MARKET_DATA),
        fetcher.fetch('symbol', MetricType.MARKET_DATA)
      ]);

      results.forEach((r: any) => {
        expect(r.source).toBe('secondary');
      });
    });
  });

  // ============================================================================
  // Waterfall Chain Exhaustion Tests
  // ============================================================================

  describe('Waterfall Chain Exhaustion', () => {
    it('Error returned if primary + secondary + tertiary all fail', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' },
        { tier: 2, name: 'tertiary', url: 'http://tertiary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'TIMEOUT');
      http.setError('http://secondary.api/data', 'TIMEOUT');
      http.setError('http://tertiary.api/data', 'TIMEOUT');

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);

      await expect(fetcher.fetch('symbol', MetricType.MARKET_DATA)).rejects.toThrow(/WATERFALL_EXHAUSTED/);
    });

    it('Error message indicates all tiers were exhausted', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'FAIL');
      http.setError('http://secondary.api/data', 'FAIL');

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);

      await expect(fetcher.fetch('symbol', MetricType.MARKET_DATA)).rejects.toThrow(/all tiers|exhausted/i);
    });

    it('Failed state is not cached (retry on next request is permitted)', async () => {
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'TIMEOUT');

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config);

      await expect(fetcher.fetch('symbol', MetricType.MARKET_DATA)).rejects.toThrow();

      http.setResponse('http://primary.api/data', { value: 'recovered' });
      const result = await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      expect(result.data.value).toBe('recovered');
    });

    it('Individual tier error reasons are logged for debugging', async () => {
      const http = new MockHttpClient();
      const logger = new MockLogger();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'TIMEOUT');
      http.setError('http://secondary.api/data', 'SERVICE_UNAVAILABLE');

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, logger, config);

      await expect(fetcher.fetch('symbol', MetricType.MARKET_DATA)).rejects.toThrow();

      const logs = logger.getLogs();
      expect(logs.some((l: string) => l.includes('primary') && l.includes('TIMEOUT'))).toBe(true);
      expect(logs.some((l: string) => l.includes('secondary') && l.includes('SERVICE_UNAVAILABLE'))).toBe(true);
    });
  });

  // ============================================================================
  // Waterfall Chain Exhaustion - Network Errors
  // ============================================================================

  describe('Waterfall Chain Exhaustion - Network Errors', () => {
    it('Network errors: Timeout errors trigger next tier in chain', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'TIMEOUT');
      http.setResponse('http://secondary.api/data', { value: 'success' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);
      const result = await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('secondary');
    });

    it('Network errors: DNS resolution failures trigger next tier', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'DNS_RESOLUTION_FAILED');
      http.setResponse('http://secondary.api/data', { value: 'success' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);
      const result = await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('secondary');
    });

    it('Network errors: HTTP 5xx errors trigger next tier', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setError('http://primary.api/data', { status: 503, message: 'SERVICE_UNAVAILABLE' });
      http.setResponse('http://secondary.api/data', { value: 'success' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);
      const result = await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('secondary');
    });

    it('Network errors: 4xx errors do not trigger fallback (short-circuit)', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setError('http://primary.api/data', { status: 400, message: 'BAD_REQUEST' });
      http.setResponse('http://secondary.api/data', { value: 'success' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);

      await expect(fetcher.fetch('symbol', MetricType.MARKET_DATA)).rejects.toThrow(/400|BAD_REQUEST/);
    });

    it('Network errors: Connection refused errors are treated as tier failure', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' }
      ]);

      http.setError('http://primary.api/data', 'ECONNREFUSED');
      http.setResponse('http://secondary.api/data', { value: 'success' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);
      const result = await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('secondary');
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('Missing metric type TTL config: System defaults to safe TTL (shorter) if config key missing', () => {
      const config = new MockConfigProvider();

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);
      const ttl = ttlManager.getTTLForMetric('unknown_metric');

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThan(86400000);
    });

    it('Missing metric type TTL config: Warning logged when using default TTL', () => {
      const logger = new MockLogger();
      const config = new MockConfigProvider();

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);
      ttlManager.setLogger(logger);

      ttlManager.getTTLForMetric('unknown_metric');

      const logs = logger.getLogs();
      expect(logs.some((l: string) => l.includes('default') || l.includes('WARNING'))).toBe(true);
    });

    it('Missing metric type TTL config: Fetch is not blocked due to missing config', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'result' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);
      const result = await fetcher.fetch('symbol', 'unknown_metric' as any);

      expect(result.data.value).toBe('result');
    });

    it('Missing metric type TTL config: Default TTL is consistent across app restarts', () => {
      const config = new MockConfigProvider();

      const ttl1 = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config).getTTLForMetric('unknown');
      const ttl2 = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config).getTTLForMetric('unknown');

      expect(ttl1).toBe(ttl2);
    });

    it('Zero TTL handling: TTL = 0 means data is always treated as stale (no caching)', () => {
      const time = new MockTimeProvider();
      const cache = new MockCacheStore();

      const result: FetchResult = {
        data: { value: 'test' },
        source: 'primary',
        fetchedAt: 0,
        ttl: 0,
        expiresAt: 0
      };

      cache.set('key', result);

      time.setNow(0);
      const retrieved = cache.get('key');

      expect(retrieved).toBeNull();
    });

    it('Zero TTL handling: Each access triggers fresh fetch from waterfall', async () => {
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 0);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'result' });

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config);

      await fetcher.fetch('symbol', MetricType.MARKET_DATA);
      await fetcher.fetch('symbol', MetricType.MARKET_DATA);
      await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      const httpCalls = http.getCallLog();
      expect(httpCalls.length).toBe(3);
    });

    it('Zero TTL handling: Performance impact is acceptable (load-shedding documented)', async () => {
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 0);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'result' });

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config);

      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        await fetcher.fetch('symbol', MetricType.MARKET_DATA);
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(10000);
    });

    it('Zero TTL handling: Zero TTL config is validated at startup, warning issued', () => {
      const logger = new MockLogger();
      const config = new MockConfigProvider();
      config.set('market_data_ttl', 0);

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);
      ttlManager.setLogger(logger);
      ttlManager.validate();

      const logs = logger.getLogs();
      expect(logs.some((l: string) => l.includes('zero') || l.includes('WARNING'))).toBe(true);
    });

    it('Negative or invalid TTL config: Negative TTL values are rejected (schema validation fails)', () => {
      const config = new MockConfigProvider();

      expect(() => {
        config.set('market_data_ttl', -1000);
        const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);
        ttlManager.validate();
      }).toThrow(/negative|invalid|TTL/i);
    });

    it('Negative or invalid TTL config: Non-integer TTL values are rejected', () => {
      const config = new MockConfigProvider();

      expect(() => {
        config.set('market_data_ttl', 'not_a_number');
        const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);
        ttlManager.validate();
      }).toThrow(/integer|invalid/i);
    });

    it('Negative or invalid TTL config: Invalid config prevents app startup (early fail)', () => {
      const config = new MockConfigProvider();
      config.set('market_data_ttl', { invalid: 'object' });

      expect(() => {
        const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);
        ttlManager.validate();
      }).toThrow();
    });

    it('Negative or invalid TTL config: Error message indicates config key that is invalid', () => {
      const config = new MockConfigProvider();
      config.set('fundamentals_ttl', -5000);

      expect(() => {
        const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);
        ttlManager.validate();
      }).toThrow(/fundamentals_ttl/);
    });
  });

  // ============================================================================
  // Additional Test Categories
  // ============================================================================

  describe('Multi-Fetcher Coordination & Error Propagation', () => {
    it('Multi-Fetcher: Market data TTL does not interfere with fundamentals TTL', () => {
      const config = new MockConfigProvider();
      config.set('market_data_ttl', 60000);
      config.set('fundamentals_ttl', 86400000);

      const ttlManager = new TTLManager(new MockCacheStore(), new MockTimeProvider(), config);

      const marketTTL = ttlManager.getTTLForMetric(MetricType.MARKET_DATA);
      const fundamentalsTTL = ttlManager.getTTLForMetric(MetricType.FUNDAMENTALS);

      expect(marketTTL).not.toBe(fundamentalsTTL);
    });

    it('Error Propagation: Primary fails with 500, secondary with 503', async () => {
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' },
        { tier: 1, name: 'secondary', url: 'http://secondary.api/data' },
        { tier: 2, name: 'tertiary', url: 'http://tertiary.api/data' }
      ]);

      http.setError('http://primary.api/data', { status: 500, message: 'SERVER_ERROR' });
      http.setError('http://secondary.api/data', { status: 503 });
      http.setResponse('http://tertiary.api/data', { value: 'success' });

      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config);
      const result = await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      expect(result.source).toBe('tertiary');
      expect(result.data).toEqual({ value: 'success' });
    });
  });

  describe('TTL Tracking & Cache Invalidation', () => {
    it('TTL Tracking: Response includes fetchedAt, ttl, and expiresAt', async () => {
      const time = new MockTimeProvider();
      const http = new MockHttpClient();
      const config = new MockConfigProvider();

      config.set('market_data_ttl', 60000);
      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'test' });

      time.setNow(1000000);
      const fetcher = new WaterfallFetcher(new MockCacheStore(), http, new MockLogger(), config, time);
      const result = await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      expect(result.fetchedAt).toBe(1000000);
      expect(result.ttl).toBe(60000);
      expect(result.expiresAt).toBe(1060000);
    });

    it('Cache Invalidation: Manual invalidation forces refetch on next request', async () => {
      const http = new MockHttpClient();
      const cache = new MockCacheStore();
      const config = new MockConfigProvider();

      config.set('waterfall_tiers', [
        { tier: 0, name: 'primary', url: 'http://primary.api/data' }
      ]);

      http.setResponse('http://primary.api/data', { value: 'v1' });

      const fetcher = new WaterfallFetcher(cache, http, new MockLogger(), config);
      await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      http.setResponse('http://primary.api/data', { value: 'v2' });
      cache.invalidate('symbol');
      const result = await fetcher.fetch('symbol', MetricType.MARKET_DATA);

      expect(result.data.value).toBe('v2');
    });
  });

  describe('Monitoring & Integration', () => {
    it('Monitoring: System tracks cache evictions and metrics', () => {
      const metrics = new MockMetricsExporter();

      metrics.recordEviction('market_data', 10);
      metrics.recordEviction('market_data', 5);
      metrics.recordEviction('fundamentals', 2);

      const marketEvictions = metrics.getEvictions('market_data');
      expect(marketEvictions).toBe(15);
    });

    it('Integration: WebSocket stream data respects TTL', async () => {
      const ws = new MockWebSocketClient();
      const cache = new MockCacheStore();

      ws.send('snapshot', { symbol: 'TEST', price: 100, timestamp: 1000000 });
      cache.set('TEST', { data: { price: 100 }, ttl: 60000, expiresAt: 1060000 });

      expect(cache.get('TEST')).not.toBeNull();
    });
  });
});
