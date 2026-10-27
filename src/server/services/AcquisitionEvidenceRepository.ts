import { dbAll } from '../database.js';

/**
 * Read-only acquisition metadata boundary.  This repository may inspect the
 * raw snapshot ledger for lineage only; it never returns response payloads or
 * analytical values.  Engines must use company_facts for all calculations.
 */
export class AcquisitionEvidenceRepository {
  async listForSymbol(db: any, symbol: string): Promise<Array<{ provider: string; endpoint: string; fetchedAt: string }>> {
    if (!db) return [];
    try {
      const sql = `
        SELECT provider, endpoint, fetched_at AS fetchedAt
        FROM fundamental_endpoint_snapshots
        WHERE UPPER(symbol) = ?
        ORDER BY fetched_at DESC`;
      if (typeof db.prepare === 'function') return db.prepare(sql).all(symbol.toUpperCase()) as any[];
      return await dbAll<any>(db, sql, [symbol.toUpperCase()]);
    } catch {
      return [];
    }
  }
}

export default AcquisitionEvidenceRepository;
