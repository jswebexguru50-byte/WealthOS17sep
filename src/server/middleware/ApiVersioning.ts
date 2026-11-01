import type { Request, Response, NextFunction } from 'express';

export function apiVersioningMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-API-Version', '2');
  next();
}
