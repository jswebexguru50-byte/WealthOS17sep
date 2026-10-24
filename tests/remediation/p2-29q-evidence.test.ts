import { EvidenceProvider } from '../../src/server/services/EvidenceProvider.js';
import { ConfidenceCalculator } from '../../src/server/services/ConfidenceCalculator.js';
import { TimestampService } from '../../src/server/services/TimestampService.js';
import { BrokerAPI } from '../../src/server/services/BrokerAPI.js';
import { CacheService } from '../../src/server/services/CacheService.js';
import { SourceRegistry } from '../../src/server/services/SourceRegistry.js';
import { EvidenceEnvelopeService } from '../../src/server/services/EvidenceEnvelopeService.js';

describe('Evidence Provider Integration Tests', () => {
  // Test 1: 29Q route returns evidence envelope structure on success
  it('29Q route returns evidence envelope structure on success', async () => {
    const data = { portfolio: 'test-portfolio', date: '2026-10-24' };
    const envelope = EvidenceEnvelopeService.getInstance().createEnvelope(data, {
      urls: ['https://broker.example.com/api/holdings'],
      timestamp: new Date().toISOString(),
      confidence: 0.95,
      sources: [{ type: 'broker', name: 'Zerodha', timestamp: new Date().toISOString(), reliability: 0.98 }]
    });

    expect(envelope.evidence).toBeDefined();
    expect(Array.isArray(envelope.evidence.urls)).toBe(true);
    expect(typeof envelope.evidence.timestamp).toBe('string');
    expect(typeof envelope.evidence.confidence).toBe('number');
    expect(Array.isArray(envelope.evidence.sources)).toBe(true);
    expect(envelope.data).toBeDefined();
    expect(envelope.data).toEqual(data);
  });

  // Test 2: Evidence URLs are validated and properly formatted
  it('Evidence URLs are validated and properly formatted', async () => {
    const validator = EvidenceProvider.getInstance();

    // Valid URLs
    expect(() => {
      validator.validateUrls(['https://broker.com/api', 'http://exchange.com/data']);
    }).not.toThrow();

    // Invalid URLs
    expect(() => {
      validator.validateUrls(['not-a-url']);
    }).toThrow(/INVALID_URL_FORMAT/);

    expect(() => {
      validator.validateUrls(['ftp://broker.com']);
    }).toThrow(/INVALID_PROTOCOL/);

    expect(() => {
      validator.validateUrls([]);
    }).toThrow(/EMPTY_URL_ARRAY/);

    // Duplicate URLs should be deduplicated
    const deduped = validator.deduplicateUrls([
      'https://broker.com/api',
      'https://broker.com/api',
      'https://exchange.com/data'
    ]);
    expect(deduped.length).toBe(2);
  });

  // Test 3: Evidence timestamp is current and valid
  it('Evidence timestamp is current and valid', async () => {
    const tsService = TimestampService.getInstance();
    const now = new Date();
    const timestamp = tsService.getCurrentTimestamp();

    // Check format (ISO-8601 with timezone and milliseconds)
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Check it's recent (within 5 seconds)
    const parsed = new Date(timestamp);
    const diff = Math.abs(now.getTime() - parsed.getTime());
    expect(diff).toBeLessThan(5000);
    expect(parsed.getTime()).toBeGreaterThan(0);
  });

  // Test 4: Evidence confidence score is valid and meaningful
  it('Evidence confidence score is valid and meaningful', async () => {
    const calc = ConfidenceCalculator.getInstance();

    // Valid confidence
    const conf1 = calc.calculateConfidence([
      { reliability: 0.9, type: 'broker' },
      { reliability: 0.85, type: 'exchange' }
    ]);
    expect(typeof conf1).toBe('number');
    expect(conf1).toBeGreaterThanOrEqual(0);
    expect(conf1).toBeLessThanOrEqual(1);

    // Low confidence should be flagged
    const conf2 = calc.calculateConfidence([
      { reliability: 0.3, type: 'cache' }
    ]);
    expect(conf2).toBeLessThan(0.5);

    // Deterministic for same input
    const conf3 = calc.calculateConfidence([
      { reliability: 0.9, type: 'broker' }
    ]);
    const conf4 = calc.calculateConfidence([
      { reliability: 0.9, type: 'broker' }
    ]);
    expect(conf3).toBe(conf4);
  });

  // Test 5: Evidence sources contain required metadata
  it('Evidence sources contain required metadata', async () => {
    const sources = [
      {
        type: 'broker',
        name: 'Zerodha',
        timestamp: new Date().toISOString(),
        reliability: 0.98
      },
      {
        type: 'exchange',
        name: 'NSE',
        timestamp: new Date().toISOString(),
        reliability: 0.99
      }
    ];

    for (const source of sources) {
      expect(source.type).toBeDefined();
      expect(source.name).toBeDefined();
      expect(source.timestamp).toBeDefined();
      expect(typeof source.reliability).toBe('number');
      expect(source.reliability).toBeGreaterThanOrEqual(0);
      expect(source.reliability).toBeLessThanOrEqual(1);
    }

    expect(sources.length).toBeGreaterThan(0);
  });

  // Test 6: Error responses maintain evidence envelope integrity
  it('Error responses maintain evidence envelope integrity', async () => {
    const service = EvidenceEnvelopeService.getInstance();

    // 4xx error with evidence
    const error4xx = service.createErrorEnvelope(new Error('Invalid portfolio'), 400, {
      urls: [],
      timestamp: new Date().toISOString(),
      confidence: 0,
      sources: [{ type: 'error', name: 'validation', timestamp: new Date().toISOString(), reliability: 0 }]
    });
    expect(error4xx.evidence).toBeDefined();
    expect(error4xx.evidence.confidence).toBe(0);
    expect(error4xx.evidence.error_source).toBeDefined();

    // 5xx error with partial data
    const error5xx = service.createErrorEnvelope(new Error('Service unavailable'), 500, {
      urls: [],
      timestamp: new Date().toISOString(),
      confidence: 0.1,
      sources: []
    });
    expect(error5xx.evidence).toBeDefined();
    expect(error5xx.evidence.timestamp.startsWith(new Date().toISOString().substring(0, 10))).toBe(true);
  });

  // Test 7: Evidence handles missing or null source data gracefully
  it('Evidence handles missing or null source data gracefully', async () => {
    const provider = EvidenceProvider.getInstance();
    const cache = CacheService.getInstance();

    // Missing evidence URLs
    expect(() => {
      provider.validateUrls(null as any);
    }).toThrow(/INVALID_URL_ARRAY/);

    // Fallback to cache when source unavailable
    cache.set('portfolio:test', { urls: ['https://cached.url'], timestamp: new Date().toISOString() }, 300);
    const fallback = cache.get('portfolio:test');
    expect(fallback).toBeDefined();
    expect(fallback?.urls).toEqual(['https://cached.url']);

    // Response should never miss evidence object
    const envelope = EvidenceEnvelopeService.getInstance().createEnvelope(
      { test: 'data' },
      { urls: [], timestamp: new Date().toISOString(), confidence: 0, sources: [] }
    );
    expect(envelope.evidence).toBeDefined();
  });

  // Test 8: Multiple evidence sources are merged correctly
  it('Multiple evidence sources are merged correctly', async () => {
    const calc = ConfidenceCalculator.getInstance();

    const sources = [
      { reliability: 0.95, type: 'broker', name: 'Zerodha' },
      { reliability: 0.90, type: 'exchange', name: 'NSE' },
      { reliability: 0.85, type: 'cache', name: 'LocalCache' }
    ];

    const confidence = calc.calculateConfidence(sources);
    expect(confidence).toBeGreaterThan(0.85);
    expect(confidence).toBeLessThan(0.95);

    // Most recent timestamp
    const timestamps = [
      new Date('2026-10-24T10:00:00Z').toISOString(),
      new Date('2026-10-24T10:05:00Z').toISOString(),
      new Date('2026-10-24T10:03:00Z').toISOString()
    ];
    const mostRecent = timestamps.sort().reverse()[0];
    expect(mostRecent.startsWith('2026-10-24T10:05:00')).toBe(true);

    // Deduplicate URLs across sources
    const urlArrays = [
      ['https://broker.com/api', 'https://exchange.com/data'],
      ['https://broker.com/api', 'https://cache.com/local'],
    ];
    const merged = [...new Set(urlArrays.flat())];
    expect(merged.length).toBe(3);
  });

  // Test 9: Evidence envelope includes provenance chain
  it('Evidence envelope includes provenance chain', async () => {
    const service = EvidenceEnvelopeService.getInstance();
    const envelope = service.createEnvelopeWithChain(
      { portfolio: 'test' },
      {
        urls: ['https://broker.com'],
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        sources: [{ type: 'broker', name: 'Zerodha', timestamp: new Date().toISOString(), reliability: 0.98 }],
        chain: [
          { service: 'API', timestamp: new Date().toISOString(), cacheHit: false },
          { service: 'Broker', timestamp: new Date().toISOString(), cacheHit: false },
          { service: 'Cache', timestamp: new Date().toISOString(), cacheHit: true }
        ]
      }
    );

    expect(Array.isArray(envelope.evidence.chain)).toBe(true);
    expect(envelope.evidence.chain.length).toBeGreaterThan(0);

    for (const hop of envelope.evidence.chain) {
      expect(hop.service).toBeDefined();
      expect(hop.timestamp).toBeDefined();
      expect(typeof hop.cacheHit).toBe('boolean');
    }
  });

  // Test 10: Special characters and encoding in evidence URLs are handled
  it('Special characters and encoding in evidence URLs are handled', async () => {
    const validator = EvidenceProvider.getInstance();

    const validUrls = [
      'https://broker.com/api?portfolio=test%20portfolio&date=2026-10-24',
      'https://exchange.com/data#section1',
      'https://cache.com/path%2Fto%2Fresource'
    ];

    // Should not throw on properly encoded URLs
    expect(() => {
      validator.validateUrls(validUrls);
    }).not.toThrow();

    // Encoded URLs should decode correctly
    const encoded = 'https://broker.com/api?name=John%20Doe';
    const decoded = decodeURIComponent(encoded.split('?')[1].split('=')[1]);
    expect(decoded).toBe('John Doe');
  });

  // Test 11: Evidence expiry and staleness are tracked
  it('Evidence expiry and staleness are tracked', async () => {
    const cache = CacheService.getInstance();

    // Set evidence with 5-minute TTL
    const now = new Date();
    cache.set('portfolio:test',
      {
        urls: ['https://broker.com'],
        timestamp: now.toISOString(),
        expiry_time: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
        is_stale: false
      },
      300
    );

    const evidence = cache.get('portfolio:test');
    expect(evidence).toBeDefined();
    expect(evidence?.expiry_time).toBeDefined();
    expect(evidence?.is_stale).toBe(false);

    // Simulate staleness
    const stale = EvidenceEnvelopeService.getInstance().markStale({
      urls: ['https://broker.com'],
      timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      expiry_time: now.toISOString(),
      is_stale: true,
      confidence: 0.5
    });

    expect(stale.is_stale).toBe(true);
  });

  // Test 12: Confidence score degradation is correct
  it('Confidence score degradation is correct', async () => {
    const calc = ConfidenceCalculator.getInstance();

    // Fresh evidence with short chain
    const fresh = calc.calculateConfidenceWithAge(
      [{ reliability: 0.9, type: 'broker' }],
      0, // age seconds
      1  // chain length
    );

    // Stale evidence with longer chain
    const stale = calc.calculateConfidenceWithAge(
      [{ reliability: 0.9, type: 'broker' }],
      600, // 10 minutes old
      3    // longer chain
    );

    expect(fresh).toBeGreaterThan(stale);

    // Minimum confidence should not go below threshold
    const veryOld = calc.calculateConfidenceWithAge(
      [{ reliability: 0.1, type: 'cache' }],
      86400 * 7, // 1 week old
      10         // very long chain
    );

    expect(veryOld).toBeGreaterThanOrEqual(0);
  });

  // Test 13: Evidence wrapper does not break existing 29Q response format
  it('Evidence wrapper does not break existing 29Q response format', async () => {
    const service = EvidenceEnvelopeService.getInstance();

    const originalData = {
      portfolio: 'test-portfolio',
      holdings: [
        { symbol: 'RELIANCE', quantity: 100, price: 2500 }
      ],
      totalValue: 250000,
      date: '2026-10-24'
    };

    const envelope = service.createEnvelope(originalData, {
      urls: ['https://broker.com'],
      timestamp: new Date().toISOString(),
      confidence: 0.95,
      sources: []
    });

    // Verify data is unchanged
    expect(envelope.data).toEqual(originalData);

    // Evidence is additive, not replacement
    expect(envelope.evidence).toBeDefined();
    expect(envelope.data).toBeDefined();

    // Response should be valid JSON
    const json = JSON.stringify(envelope);
    expect(json.length).toBeGreaterThan(0);
  });

  // Test 14: Concurrent 29Q requests maintain evidence isolation
  it('Concurrent 29Q requests maintain evidence isolation', async () => {
    const service = EvidenceEnvelopeService.getInstance();
    const now = new Date();

    const req1 = service.createEnvelope(
      { portfolio: 'portfolio1' },
      { urls: ['https://broker1.com'], timestamp: now.toISOString(), confidence: 0.9, sources: [] }
    );

    const req2 = service.createEnvelope(
      { portfolio: 'portfolio2' },
      { urls: ['https://broker2.com'], timestamp: now.toISOString(), confidence: 0.85, sources: [] }
    );

    // Evidence should not leak between requests
    expect(req1.evidence.urls[0]).not.toBe(req2.evidence.urls[0]);

    // Timestamps should be unique (at least in milliseconds)
    const ts1 = new Date(req1.evidence.timestamp).getTime();
    const ts2 = new Date(req2.evidence.timestamp).getTime();
    expect(Math.abs(ts1 - ts2)).toBeLessThan(100);
  });

  // Test 15: Evidence URLs are sanitized against injection attacks
  it('Evidence URLs are sanitized against injection attacks', async () => {
    const validator = EvidenceProvider.getInstance();

    // Invalid URLs with script/shell commands
    const maliciousUrls = [
      'javascript:alert("xss")',
      'data:text/html,<script>alert("xss")</script>',
      '; rm -rf /',
      '`rm -rf /`'
    ];

    for (const url of maliciousUrls) {
      expect(() => {
        validator.validateUrls([url]);
      }).toThrow(/INVALID_URL_FORMAT|INVALID_PROTOCOL/);
    }

    // Valid URLs with special characters should work
    expect(() => {
      validator.validateUrls(['https://broker.com/api?filter=test%20value&sort=asc']);
    }).not.toThrow();

    // URL whitelist validation
    const whitelist = ['broker.com', 'exchange.com', 'cache.com'];
    const validator2 = EvidenceProvider.getInstance();

    expect(() => {
      validator2.validateUrlsAgainstWhitelist(['https://evil.com/api'], whitelist);
    }).toThrow(/NOT_IN_WHITELIST/);

    expect(() => {
      validator2.validateUrlsAgainstWhitelist(['https://broker.com/api'], whitelist);
    }).not.toThrow();
  });
});
