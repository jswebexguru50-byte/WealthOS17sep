/**
 * Unit tests for apiClient (src/lib/apiClient.ts) and cacheClient (src/lib/cacheClient.ts)
 *
 * fetch is stubbed globally so no network calls are made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub fetch globally before any module that transitively calls it is imported.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { apiClient } from '../../src/lib/apiClient.js';
import { cacheClient } from '../../src/lib/cacheClient.js';
import { safeFetchJson } from '../../src/lib/api.js';

/** Build a minimal Response-like object that safeFetchJson expects (calls res.text()). */
function makeRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// ── apiClient ─────────────────────────────────────────────────────────────────

describe('apiClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // ── get() ──────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('calls fetch with the correct URL when no params', async () => {
      mockFetch.mockResolvedValue(makeRes(200, { ok: true }));
      await apiClient.get('/api/test');
      expect(mockFetch).toHaveBeenCalledWith('/api/test', undefined);
    });

    it('appends query params to URL', async () => {
      mockFetch.mockResolvedValue(makeRes(200, {}));
      await apiClient.get('/api/test', { foo: 'bar', n: 42 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('foo=bar');
      expect(url).toContain('n=42');
    });

    it('omits undefined params from query string', async () => {
      mockFetch.mockResolvedValue(makeRes(200, {}));
      await apiClient.get('/api/test', { a: 'x', b: undefined });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('a=x');
      expect(url).not.toContain('b=');
    });

    it('returns parsed JSON data on 200', async () => {
      mockFetch.mockResolvedValue(makeRes(200, { value: 99 }));
      const data = await apiClient.get('/api/test');
      expect(data).toEqual({ value: 99 });
    });

    it('throws on 404 with server error message', async () => {
      mockFetch.mockResolvedValue(makeRes(404, { message: 'Not found' }));
      await expect(apiClient.get('/api/missing')).rejects.toThrow('Not found');
    });

    it('throws on 500', async () => {
      mockFetch.mockResolvedValue(makeRes(500, { message: 'Server error' }));
      await expect(apiClient.get('/api/broken')).rejects.toThrow();
    });
  });

  // ── post() ─────────────────────────────────────────────────────────────────

  describe('post()', () => {
    it('uses POST method', async () => {
      mockFetch.mockResolvedValue(makeRes(200, {}));
      await apiClient.post('/api/save', { name: 'test' });
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });

    it('sets Content-Type: application/json header', async () => {
      mockFetch.mockResolvedValue(makeRes(200, {}));
      await apiClient.post('/api/save', { name: 'test' });
      expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
        'Content-Type': 'application/json',
      });
    });

    it('serializes body to JSON string', async () => {
      mockFetch.mockResolvedValue(makeRes(200, {}));
      await apiClient.post('/api/save', { x: 1, y: 2 });
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ x: 1, y: 2 });
    });

    it('sends no body when called without body arg', async () => {
      mockFetch.mockResolvedValue(makeRes(200, {}));
      await apiClient.post('/api/trigger');
      expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
    });

    it('returns parsed JSON on 200', async () => {
      mockFetch.mockResolvedValue(makeRes(200, { created: true }));
      const data = await apiClient.post('/api/save', {});
      expect(data).toEqual({ created: true });
    });

    it('throws on 500 with server error', async () => {
      mockFetch.mockResolvedValue(makeRes(500, { message: 'Internal error' }));
      await expect(apiClient.post('/api/fail', {})).rejects.toThrow('Internal error');
    });
  });

  // ── put() ──────────────────────────────────────────────────────────────────

  describe('put()', () => {
    it('uses PUT method', async () => {
      mockFetch.mockResolvedValue(makeRes(200, {}));
      await apiClient.put('/api/item/1', { val: 'updated' });
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });

    it('serializes body to JSON', async () => {
      mockFetch.mockResolvedValue(makeRes(200, {}));
      await apiClient.put('/api/item/1', { val: 'updated' });
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ val: 'updated' });
    });

    it('returns parsed response on 200', async () => {
      mockFetch.mockResolvedValue(makeRes(200, { updated: true }));
      const data = await apiClient.put('/api/item/1', {});
      expect(data).toEqual({ updated: true });
    });

    it('throws on non-200', async () => {
      mockFetch.mockResolvedValue(makeRes(400, { error: 'Bad request' }));
      await expect(apiClient.put('/api/item/1', {})).rejects.toThrow();
    });
  });

  // ── delete() ───────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('uses DELETE method', async () => {
      mockFetch.mockResolvedValue(makeRes(200, {}));
      await apiClient.delete('/api/item/1');
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });

    it('calls the correct URL', async () => {
      mockFetch.mockResolvedValue(makeRes(200, {}));
      await apiClient.delete('/api/item/42');
      expect(mockFetch.mock.calls[0][0]).toBe('/api/item/42');
    });

    it('returns parsed response on 200', async () => {
      mockFetch.mockResolvedValue(makeRes(200, { deleted: true }));
      const data = await apiClient.delete('/api/item/42');
      expect(data).toEqual({ deleted: true });
    });

    it('throws on 403', async () => {
      mockFetch.mockResolvedValue(makeRes(403, { message: 'Forbidden' }));
      await expect(apiClient.delete('/api/item/42')).rejects.toThrow('Forbidden');
    });
  });
});

describe('safeFetchJson failure and retry contracts', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('preserves caller headers and request options', async () => {
    const options = { headers: { Authorization: 'Bearer test-token' }, credentials: 'include' as const };
    mockFetch.mockResolvedValue(makeRes(200, { value: 1 }));
    await expect(safeFetchJson('/api/test', options)).resolves.toEqual({ ok: true, status: 200, data: { value: 1 } });
    expect(mockFetch).toHaveBeenCalledWith('/api/test', options);
  });

  it('accepts an empty 204 response', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    await expect(safeFetchJson('/api/test')).resolves.toEqual({ ok: true, status: 204, data: null });
  });

  it('rejects malformed successful JSON without retrying', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '<html>broken</html>' });
    await expect(safeFetchJson('/api/test')).resolves.toMatchObject({ ok: false, status: 200, data: null, error: expect.stringContaining('not valid JSON') });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries rate limits after exponential backoff plus jitter', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mockFetch.mockResolvedValueOnce(makeRes(429, { error: 'slow down' })).mockResolvedValueOnce(makeRes(200, { recovered: true }));
    const pending = safeFetchJson('/api/test', undefined, 1, 100);
    await vi.advanceTimersByTimeAsync(299);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ ok: true, data: { recovered: true } });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('reports exhausted rate limits with a bounded attempt count', async () => {
    mockFetch.mockResolvedValue(makeRes(429, {}));
    const pending = safeFetchJson('/api/test', undefined, 2, 100);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ ok: false, status: 429, data: null, error: 'Rate limit exceeded. Please try again shortly.' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries a network failure and returns the final error', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const pending = safeFetchJson('/api/test', undefined, 1, 100);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ ok: false, status: 0, data: null, error: 'offline' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ── cacheClient ───────────────────────────────────────────────────────────────

describe('cacheClient', () => {
  beforeEach(() => {
    cacheClient.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cacheClient.clear();
  });

  it('returns undefined for a key that was never set', () => {
    expect(cacheClient.get('missing')).toBeUndefined();
  });

  it('returns the stored value within TTL', () => {
    cacheClient.set('k', { data: 42 }, 60_000);
    expect(cacheClient.get<{ data: number }>('k')).toEqual({ data: 42 });
  });

  it('returns the value just before TTL boundary', () => {
    cacheClient.set('k', 'alive', 1_000);
    vi.advanceTimersByTime(999);
    expect(cacheClient.get('k')).toBe('alive');
  });

  it('returns undefined after TTL expires', () => {
    cacheClient.set('k', 'value', 5_000);
    vi.advanceTimersByTime(5_001);
    expect(cacheClient.get('k')).toBeUndefined();
  });

  it('expired entry is evicted so subsequent get also misses', () => {
    cacheClient.set('k', 'old', 1_000);
    vi.advanceTimersByTime(2_000);
    cacheClient.get('k'); // triggers eviction
    // A new set with the same key works independently
    cacheClient.set('k', 'new', 60_000);
    expect(cacheClient.get('k')).toBe('new');
  });

  it('delete removes a specific key', () => {
    cacheClient.set('k', 'x', 60_000);
    cacheClient.delete('k');
    expect(cacheClient.get('k')).toBeUndefined();
  });

  it('delete does not affect other keys', () => {
    cacheClient.set('a', 1, 60_000);
    cacheClient.set('b', 2, 60_000);
    cacheClient.delete('a');
    expect(cacheClient.get('b')).toBe(2);
  });

  it('clear removes all keys', () => {
    cacheClient.set('a', 1, 60_000);
    cacheClient.set('b', 2, 60_000);
    cacheClient.clear();
    expect(cacheClient.get('a')).toBeUndefined();
    expect(cacheClient.get('b')).toBeUndefined();
  });

  it('different keys are stored independently', () => {
    cacheClient.set('x', 'xval', 60_000);
    cacheClient.set('y', 'yval', 60_000);
    expect(cacheClient.get('x')).toBe('xval');
    expect(cacheClient.get('y')).toBe('yval');
  });

  it('set overwrites an existing key', () => {
    cacheClient.set('k', 'first', 60_000);
    cacheClient.set('k', 'second', 60_000);
    expect(cacheClient.get('k')).toBe('second');
  });
});
