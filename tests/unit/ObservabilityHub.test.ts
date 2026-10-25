import { describe, it, expect, beforeEach } from 'vitest';
import { ObservabilityHub } from '../../src/server/services/ObservabilityHub.js';

describe('ObservabilityHub', () => {
  let hub: ObservabilityHub;

  beforeEach(() => {
    // Create a fresh instance for each test
    hub = new ObservabilityHub();
  });

  it('increment — counter starts at 0 and goes up by 1', () => {
    hub.increment('requests');
    hub.increment('requests');
    const snap = hub.snapshot();
    expect(snap.counters['requests']).toBe(2);
  });

  it('increment — custom `by` value accumulates correctly', () => {
    hub.increment('bytes', {}, 512);
    hub.increment('bytes', {}, 1024);
    const snap = hub.snapshot();
    expect(snap.counters['bytes']).toBe(1536);
  });

  it('timing — records histogram entries with correct metric key', () => {
    hub.timing('fetch_ms', 120);
    hub.timing('fetch_ms', 80);
    const snap = hub.snapshot();
    const hist = snap.histograms['fetch_ms'];
    expect(hist).toBeDefined();
    expect(hist.count).toBe(2);
    expect(hist.avg).toBe(100);
  });

  it('log levels — info/warn/error do not throw', () => {
    expect(() => hub.info('test', 'info-event')).not.toThrow();
    expect(() => hub.warn('test', 'warn-event')).not.toThrow();
    expect(() => hub.error('test', 'error-event', { detail: 'boom' })).not.toThrow();
    expect(() => hub.debug('test', 'debug-event')).not.toThrow();
  });

  it('snapshot — shape contains counters, histograms, ts', () => {
    const snap = hub.snapshot();
    expect(snap).toHaveProperty('counters');
    expect(snap).toHaveProperty('histograms');
    expect(snap).toHaveProperty('ts');
    expect(typeof snap.ts).toBe('string');
  });

  it('labels — different label sets produce separate metric keys', () => {
    hub.increment('api_calls', { provider: 'yahoo' });
    hub.increment('api_calls', { provider: 'upstox' });
    hub.increment('api_calls', { provider: 'yahoo' });

    const snap = hub.snapshot();
    const yahooKey = Object.keys(snap.counters).find(k => k.includes('yahoo'));
    const upstoxKey = Object.keys(snap.counters).find(k => k.includes('upstox'));

    expect(yahooKey).toBeDefined();
    expect(upstoxKey).toBeDefined();
    expect(snap.counters[yahooKey!]).toBe(2);
    expect(snap.counters[upstoxKey!]).toBe(1);
  });
});
