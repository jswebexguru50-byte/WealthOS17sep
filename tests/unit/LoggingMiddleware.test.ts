import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock ObservabilityHub before importing middleware
vi.mock('../../src/server/services/ObservabilityHub.js', () => ({
  obs: {
    info: vi.fn(),
    timing: vi.fn(),
    increment: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { loggingMiddleware } from '../../src/server/middleware/LoggingMiddleware.js';
import { obs } from '../../src/server/services/ObservabilityHub.js';

function mockRes(statusCode = 200) {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { statusCode });
}

function mockReq(overrides: any = {}) {
  return { method: 'GET', path: '/api/test', ip: '127.0.0.1', headers: {}, ...overrides };
}

describe('loggingMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() immediately', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    loggingMiddleware(req as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('does not call obs.info before finish event', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    loggingMiddleware(req as any, res as any, next);

    expect(obs.info).not.toHaveBeenCalled();
  });

  it('calls obs.info with method, path, status, ms, traceId on finish', () => {
    const req = mockReq();
    const res = mockRes(200);
    const next = vi.fn();

    loggingMiddleware(req as any, res as any, next);
    res.emit('finish');

    expect(obs.info).toHaveBeenCalledOnce();
    const [source, event, meta] = (obs.info as any).mock.calls[0];
    expect(source).toBe('http');
    expect(event).toBe('request');
    expect(meta.method).toBe('GET');
    expect(meta.path).toBe('/api/test');
    expect(meta.status).toBe(200);
    expect(typeof meta.ms).toBe('number');
    expect(typeof meta.traceId).toBe('string');
  });

  it('calls obs.timing on finish', () => {
    const req = mockReq();
    const res = mockRes(200);

    loggingMiddleware(req as any, res as any, vi.fn());
    res.emit('finish');

    expect(obs.timing).toHaveBeenCalledOnce();
    const [metric, ms, labels] = (obs.timing as any).mock.calls[0];
    expect(metric).toBe('http.latency');
    expect(typeof ms).toBe('number');
    expect(labels.method).toBe('GET');
    expect(labels.status).toBe('200');
  });

  it('calls obs.increment on finish', () => {
    const req = mockReq();
    const res = mockRes(200);

    loggingMiddleware(req as any, res as any, vi.fn());
    res.emit('finish');

    expect(obs.increment).toHaveBeenCalledOnce();
    const [metric, labels] = (obs.increment as any).mock.calls[0];
    expect(metric).toBe('http.requests');
    expect(labels.method).toBe('GET');
    expect(labels.status).toBe('200');
  });

  it('uses x-trace-id header as traceId when present', () => {
    const req = mockReq({ headers: { 'x-trace-id': 'my-trace-123' } });
    const res = mockRes(200);

    loggingMiddleware(req as any, res as any, vi.fn());
    res.emit('finish');

    const meta = (obs.info as any).mock.calls[0][2];
    expect(meta.traceId).toBe('my-trace-123');
  });

  it('generates a traceId when x-trace-id header is absent', () => {
    const req = mockReq({ headers: {} });
    const res = mockRes(200);

    loggingMiddleware(req as any, res as any, vi.fn());
    res.emit('finish');

    const meta = (obs.info as any).mock.calls[0][2];
    expect(typeof meta.traceId).toBe('string');
    expect(meta.traceId.length).toBeGreaterThan(0);
  });

  it('uses the response statusCode in timing and increment labels', () => {
    const req = mockReq();
    const res = mockRes(404);

    loggingMiddleware(req as any, res as any, vi.fn());
    res.emit('finish');

    const timingLabels = (obs.timing as any).mock.calls[0][2];
    const incrementLabels = (obs.increment as any).mock.calls[0][1];
    expect(timingLabels.status).toBe('404');
    expect(incrementLabels.status).toBe('404');
  });
});
