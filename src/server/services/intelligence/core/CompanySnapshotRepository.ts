/**
 * CompanySnapshotRepository.ts — Constitution Article C6 (Delta & Snapshots)
 *
 * Repository for immutable analytical snapshots and historical state comparisons.
 * Invariants:
 * - Snapshots are immutable representations of company state.
 * - Identity: same dataCutoff + same canonical facts + same evidence = same analytical hash.
 * - `createdAt` must NOT affect analytical hash or analytical identity.
 * - First-run comparison does NOT manufacture false deltas.
 */

import Database from 'better-sqlite3';
import path from 'path';
import * as crypto from 'crypto';
import { CompanyImmutableSnapshot, CompanySnapshotDelta, DeltaChangeType } from '../contracts/CompanySnapshot.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';

const PORTFOLIO_DB_PATH = path.resolve('portfolio.db');

export class CompanySnapshotRepository {
  private static instance: CompanySnapshotRepository;

  private constructor() {}

  public static getInstance(): CompanySnapshotRepository {
    if (!CompanySnapshotRepository.instance) {
      CompanySnapshotRepository.instance = new CompanySnapshotRepository();
    }
    return CompanySnapshotRepository.instance;
  }

  /**
   * Computes deterministic analytical hash for snapshot identity.
   * `createdAt` is explicitly excluded.
   */
  public computeAnalyticalHash(
    dataCutoff: string,
    factHash: string,
    evidenceHash: string,
    moduleHashes: Record<string, string>
  ): string {
    const sortedModules = Object.keys(moduleHashes).sort().map(k => `${k}:${moduleHashes[k]}`).join('|');
    const preimage = `${dataCutoff}#${factHash}#${evidenceHash}#${sortedModules}`;
    return crypto.createHash('sha256').update(preimage).digest('hex');
  }

  /**
   * Retrieves the most recent prior snapshot for a security.
   */
  public async getPreviousSnapshot(
    identity: SecurityIdentity,
    beforeAsOf?: string
  ): Promise<CompanyImmutableSnapshot | null> {
    const isin = identity.isin;
    const sym = identity.nseSymbol || identity.bseCode || '';
    const cutoff = beforeAsOf || new Date().toISOString();

    const db = new Database(PORTFOLIO_DB_PATH, { readonly: true });
    try {
      const row = db.prepare(`
        SELECT id, security_id, symbol, as_of_date, content_hash,
               fundamental_state, management_state, valuation_state,
               business_driver_state, technical_state, fere_state, created_at
        FROM company_intelligence_snapshot
        WHERE (security_id = ? OR symbol = ?) AND as_of_date < ?
        ORDER BY as_of_date DESC, id DESC
        LIMIT 1
      `).get(isin, sym, cutoff) as any;

      if (!row) return null;

      const summary = row.fundamental_state ? JSON.parse(row.fundamental_state) : {};

      return {
        snapshotId: `snap_${row.id}_${row.content_hash.substring(0, 8)}`,
        securityId: row.security_id || isin,
        isin: isin,
        asOf: row.as_of_date,
        dataCutoff: row.as_of_date,
        canonicalFactHash: row.content_hash,
        evidenceHash: row.content_hash,
        moduleHashes: {
          fundamental: row.fundamental_state ? crypto.createHash('sha256').update(row.fundamental_state).digest('hex') : '',
          management: row.management_state ? crypto.createHash('sha256').update(row.management_state).digest('hex') : '',
          valuation: row.valuation_state ? crypto.createHash('sha256').update(row.valuation_state).digest('hex') : '',
          business: row.business_driver_state ? crypto.createHash('sha256').update(row.business_driver_state).digest('hex') : '',
          technical: row.technical_state ? crypto.createHash('sha256').update(row.technical_state).digest('hex') : '',
        },
        createdAt: row.created_at,
        payloadSummary: {
          revenueTTM: summary.revenueTTM ?? null,
          patTTM: summary.patTTM ?? null,
          roceAnnual: summary.roceAnnual ?? null,
          debtToEquity: summary.debtToEquity ?? null,
          peTTM: summary.peTTM ?? null,
          marketCapCr: summary.marketCapCr ?? null,
          thesisSupportedCount: summary.thesisSupportedCount || 0,
          thesisChallengedCount: summary.thesisChallengedCount || 0,
          activeContradictionsCount: summary.activeContradictionsCount || 0,
        },
      };
    } catch {
      return null;
    } finally {
      try { db.close(); } catch {}
    }
  }

  /**
   * Persists an immutable analytical snapshot if not already present.
   */
  public async saveSnapshot(snapshot: CompanyImmutableSnapshot): Promise<void> {
    const db = new Database(PORTFOLIO_DB_PATH);
    try {
      // Check if identical content hash exists for this security and cutoff
      const existing = db.prepare(`
        SELECT id FROM company_intelligence_snapshot
        WHERE security_id = ? AND as_of_date = ? AND content_hash = ?
      `).get(snapshot.securityId, snapshot.dataCutoff, snapshot.canonicalFactHash) as any;

      if (!existing) {
        db.prepare(`
          INSERT INTO company_intelligence_snapshot (
            security_id, symbol, as_of_date, content_hash,
            fundamental_state, management_state, valuation_state,
            business_driver_state, technical_state, fere_state, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          snapshot.securityId,
          snapshot.isin,
          snapshot.dataCutoff,
          snapshot.canonicalFactHash,
          JSON.stringify(snapshot.payloadSummary),
          JSON.stringify(snapshot.moduleHashes),
          null,
          null,
          null,
          null,
          snapshot.createdAt
        );
      }
    } finally {
      try { db.close(); } catch {}
    }
  }
}
