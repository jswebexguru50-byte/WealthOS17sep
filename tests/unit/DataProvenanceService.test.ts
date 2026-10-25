import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/server/services/ObservabilityHub.js', () => ({
  obs: { increment: vi.fn(), info: vi.fn(), timing: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// DataProviderRegistry may not exist standalone; mock it too
vi.mock('../../src/server/services/DataProviderRegistry.js', () => ({
  PROVIDER: { YAHOO: 'yahoo', UPSTOX: 'upstox', NSE: 'nse' },
  DATA_CLASS: { OHLCV: 'ohlcv', FUNDAMENTALS: 'fundamentals', TICKER: 'ticker' },
}));

import { DataProvenanceService, ProvenanceRecord } from '../../src/server/services/DataProvenanceService.js';

function makeEntry(overrides: Partial<Omit<ProvenanceRecord, 'id' | 'ts'>> = {}): Omit<ProvenanceRecord, 'id' | 'ts'> {
  return {
    symbol: 'INFY',
    dataClass: 'ohlcv',
    provider: 'yahoo',
    latencyMs: 50,
    success: true,
    cached: false,
    ...overrides,
  };
}

describe('DataProvenanceService', () => {
  beforeEach(() => {
    (DataProvenanceService as any).instance = undefined;
  });

  it('getInstance() returns a singleton', () => {
    const a = DataProvenanceService.getInstance();
    const b = DataProvenanceService.getInstance();
    expect(a).toBe(b);
  });

  it('record() — entry appears in query() results', () => {
    const svc = DataProvenanceService.getInstance();
    svc.record(makeEntry());
    const results = svc.query({ symbol: 'INFY' });
    expect(results.length).toBe(1);
  });

  it('record() — auto-assigns id and ts', () => {
    const svc = DataProvenanceService.getInstance();
    svc.record(makeEntry());
    const results = svc.query();
    expect(results[0].id).toBeTruthy();
    expect(typeof results[0].id).toBe('string');
    expect(results[0].ts).toBeTruthy();
    expect(() => new Date(results[0].ts)).not.toThrow();
  });

  it('query({ symbol }) — filters by uppercase symbol', () => {
    const svc = DataProvenanceService.getInstance();
    svc.record(makeEntry({ symbol: 'INFY' }));
    svc.record(makeEntry({ symbol: 'TCS' }));

    // lowercase query should still match because service uppercases
    const results = svc.query({ symbol: 'infy' });
    expect(results.length).toBe(1);
    expect(results[0].symbol).toBe('INFY');
  });

  it('query({ provider }) — filters by provider', () => {
    const svc = DataProvenanceService.getInstance();
    svc.record(makeEntry({ provider: 'yahoo' }));
    svc.record(makeEntry({ provider: 'upstox' }));

    const results = svc.query({ provider: 'yahoo' });
    expect(results.length).toBe(1);
    expect(results[0].provider).toBe('yahoo');
  });

  it('query({ limit: 2 }) — respects limit and returns most-recent-first', () => {
    const svc = DataProvenanceService.getInstance();
    svc.record(makeEntry({ latencyMs: 1 }));
    svc.record(makeEntry({ latencyMs: 2 }));
    svc.record(makeEntry({ latencyMs: 3 }));

    const results = svc.query({ limit: 2 });
    expect(results.length).toBe(2);
    // most recent first — latencyMs 3 and 2
    expect(results[0].latencyMs).toBe(3);
    expect(results[1].latencyMs).toBe(2);
  });

  it('query({ since }) — filters by ISO timestamp', async () => {
    const svc = DataProvenanceService.getInstance();
    svc.record(makeEntry({ latencyMs: 1 }));
    // wait so the first record's ts is strictly before the cutoff
    await new Promise(r => setTimeout(r, 10));
    const cutoff = new Date().toISOString();
    await new Promise(r => setTimeout(r, 10));
    svc.record(makeEntry({ latencyMs: 2 }));

    const results = svc.query({ since: cutoff });
    expect(results.length).toBe(1);
    expect(results[0].latencyMs).toBe(2);
  });

  it('stats() — returns total, byProvider counts, and hitRate', () => {
    const svc = DataProvenanceService.getInstance();
    svc.record(makeEntry({ provider: 'yahoo', cached: true }));
    svc.record(makeEntry({ provider: 'yahoo', cached: false }));
    svc.record(makeEntry({ provider: 'upstox', cached: false }));

    const stats = svc.stats();
    expect(stats.total).toBe(3);
    expect(stats.byProvider['yahoo']).toBe(2);
    expect(stats.byProvider['upstox']).toBe(1);
    expect(stats.hitRate).toBeCloseTo(1 / 3);
  });

  it('stats().hitRate is 0 when no records', () => {
    const svc = DataProvenanceService.getInstance();
    expect(svc.stats().hitRate).toBe(0);
    expect(svc.stats().total).toBe(0);
  });

  it('ring buffer — inserting 2 records keeps both (no overflow yet)', () => {
    const svc = DataProvenanceService.getInstance();
    svc.record(makeEntry({ latencyMs: 1 }));
    svc.record(makeEntry({ latencyMs: 2 }));
    expect(svc.stats().total).toBe(2);
  });

  it('ring buffer — oldest record is evicted after MAX_RECORDS exceeded', () => {
    const svc = DataProvenanceService.getInstance();
    const MAX = 5000;
    // Insert MAX+1 records — the first one should be evicted
    for (let i = 0; i <= MAX; i++) {
      svc.record(makeEntry({ latencyMs: i }));
    }
    expect(svc.stats().total).toBe(MAX);
    // The very first entry (latencyMs=0) should be gone; latest should survive
    const all = svc.query({ limit: MAX });
    const latencies = all.map(r => r.latencyMs);
    expect(latencies).not.toContain(0);
    expect(latencies).toContain(MAX);
  });
});
