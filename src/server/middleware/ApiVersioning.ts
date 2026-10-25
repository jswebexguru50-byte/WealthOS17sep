import type { Request, Response, NextFunction } from 'express';

/** Adds an explicit API version header and deprecation metadata for legacy GETs. */
export function apiVersioning(defaultVersion = 'v1') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const match = req.path.match(/\/api\/(v\d+)\//i);
    const version = (match?.[1] || defaultVersion).toLowerCase();
    res.setHeader('X-API-Version', version);
    res.setHeader('Vary', 'Accept');
    if (version === 'v1' && req.method === 'GET') {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', '2027-01-01T00:00:00Z');
    }
    next();
  };
}

export default apiVersioning;
