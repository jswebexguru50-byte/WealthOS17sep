/**
 * src/server/routes/shared.ts
 * Shared utilities re-exported for route modules.
 * All routes import from here instead of directly from parent files.
 */
import type express from 'express';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';
import { UnifiedValuationService } from '../services/UnifiedValuationService.js';

/** Returns the current database instance */
export function db() { return getDB(); }

/** Sanitize ISIN string */
export function sanitizeIsin(isin: string | null | undefined): string {
  if (!isin) return '';
  let cleaned = isin.trim().toUpperCase();
  if (cleaned.includes('[')) cleaned = cleaned.split('[')[0].trim();
  return cleaned;
}

/**
 * Resolve portfolios from request query/body.
 * - 'all' / 'combined' / missing → scoped to member allowed portfolios (default Member 1 / Gopal)
 * - 'none' → no portfolios (empty selection)
 * - comma-separated list → those specific portfolios
 */
export async function getSelectedPortfolios(req: express.Request): Promise<string[] | null> {
  const database = getDB();
  const portfolios = req.query.portfolios || req.body?.portfolios || req.query.portfolio || req.body?.portfolio;
  const memberIdRaw = req.query.member_id || req.headers['x-member-id'];

  if (portfolios && String(portfolios).toLowerCase() !== 'all' && String(portfolios).toLowerCase() !== 'combined') {
    if (portfolios === 'none') return ['__NONE_SELECTED__'];

    let list: string[] = Array.isArray(portfolios)
      ? portfolios.map(p => String(p).trim())
      : String(portfolios).split(',').map(p => p.trim()).filter(Boolean);

    try {
      const allPorts = await dbAll(database, "SELECT DISTINCT portfolio FROM Holdings UNION SELECT DISTINCT portfolio FROM Transactions UNION SELECT name FROM Portfolios");
      const portMap = new Map<string, string>();
      allPorts.forEach((p: any) => {
        const pName = p.portfolio || p.name;
        if (pName) portMap.set(pName.toLowerCase(), pName);
      });
      return list.map(item => portMap.get(item.toLowerCase()) || item);
    } catch {
      return list;
    }
  }

  // Member-scoped allowed portfolios via UnifiedValuationService
  const { allowedPortNames } = await UnifiedValuationService.getInstance().getAllowedPortfoliosForMember(database, memberIdRaw || 1);
  if (allowedPortNames.length > 0) return allowedPortNames;

  const fallbackPorts = await dbAll(database, "SELECT DISTINCT portfolio FROM Holdings WHERE portfolio IS NOT NULL UNION SELECT DISTINCT portfolio FROM Transactions WHERE portfolio IS NOT NULL");
  if (fallbackPorts.length > 0) return fallbackPorts.map((p: any) => p.portfolio);
  return ['__NO_ACTIVE_PORTFOLIOS__'];
}

/** Standard async route error wrapper */
export function asyncRoute(
  fn: (req: express.Request, res: express.Response) => Promise<void>
): express.RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export { dbAll, dbGet, dbRun };
