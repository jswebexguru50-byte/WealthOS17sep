import { Request, Response, NextFunction } from 'express';
import { obs } from '../services/ObservabilityHub.js';

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const traceId = req.headers['x-trace-id'] as string | undefined
    ?? Math.random().toString(36).slice(2, 10);

  res.on('finish', () => {
    const ms = Date.now() - start;
    obs.info('http', 'request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms,
      traceId,
      ip: req.ip,
    });
    obs.timing('http.latency', ms, { method: req.method, status: String(res.statusCode) });
    obs.increment('http.requests', { method: req.method, status: String(res.statusCode) });
  });

  next();
}
