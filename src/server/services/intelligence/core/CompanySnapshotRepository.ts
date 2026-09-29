/**
 * CompanySnapshotRepository.ts — Constitution Article C6 (Delta & Snapshots)
 *
 * Repository for immutable analytical snapshots and historical state comparisons.
 * Invariants:
 * - Snapshots are immutable representations of company state.
 * - Identity: same dataCutoff + same canonical facts + same evidence = same analytical hash.
 * - `createdAt` must NOT affect analytical hash or analytical identity.
 * - First-run comparison does NOT manufacture false deltas.
 * - V2 snapshots persist canonical_fact_hash and evidence_hash independently.
 *   Legacy rows (with only content_hash) are read through a compat adapter;
 *   they are flagged as LEGACY and their hashes are NOT aliased to appear independent.
 */

import Database from 'better-sqlite3';
import path from 'path';
import * as crypto from 'crypto';
import { CompanyImmutableSnapshot } from '../contracts/CompanySnapshot.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';

const PORTFOLIO_DB_PATH = path.resolve('portfolio.db');

/** Ensures V2 columns exist. Runs once on first access; idempotent via IF NOT EXISTS. */
function ensureV2Columns(db: InstanceType<typeof Database>): void {
  try {
    db.exec(`
      ALTER TABLE company_intelligence_snapshot ADD COLUMN canonical_fact_hash TEXT;
    `);
  } catch { /* column already exists */ }
  try {
    db.exec(`
      ALTER TABLE company_intelligence_snapshot ADD COLUMN evidence_hash TEXT;
    `);
  } catch { /* column already exists */ }
  try {
    db.exec(`
      ALTER TABLE company_intelligence_snapshot ADD COLUMN module_hashes TEXT;
    `);
  } catch { /* column already exists */ }
  try {
    db.exec(`
      ALTER TABLE company_intelligence_snapshot ADD COLUMN analytical_hash TEXT;
    `);
  } catch { /* column already exists */ }
  try {
    db.exec(`
      ALTER TABLE company_intelligence_snapshot ADD COLUMN payload_summary TEXT;
    `);
  } catch { /* column already exists */ }
}

export class CompanySnapshotRepository {
  private static instance: CompanySnapshotRepository;
  private v2MigrationDone = false;

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

  private ensureMigration(db: InstanceType<typeof Database>): void {
    if (!this.v2MigrationDone) {
      ensureV2Columns(db);
      this.v2MigrationDone = true;
    }
  }

  /**
   * Retrieves the most recent prior snapshot for a security.
   * V2 rows: reads independent canonical_fact_hash and evidence_hash.
   * Legacy rows: flags them explicitly; does NOT alias content_hash for both.
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
               canonical_fact_hash, evidence_hash, module_hashes, analytical_hash,
               payload_summary,
               fundamental_state, management_state, valuation_state,
               business_driver_state, technical_state, fere_state, created_at
        FROM company_intelligence_snapshot
        WHERE (security_id = ? OR symbol = ?) AND as_of_date < ?
        ORDER BY as_of_date DESC, id DESC
        LIMIT 1
      `).get(isin, sym, cutoff) as any;

      if (!row) return null;

      const isV2 = !!row.canonical_fact_hash && !!row.evidence_hash;

      // V2 path: use independently stored hashes
      if (isV2) {
        const storedModuleHashes: Record<string, string> = row.module_hashes
          ? JSON.parse(row.module_hashes)
          : {};
        const payloadSummary = row.payload_summary
          ? JSON.parse(row.payload_summary)
          : {};

        return {
          snapshotId: `snap_${row.id}_${row.analytical_hash?.substring(0, 8) || row.canonical_fact_hash.substring(0, 8)}`,
          securityId: row.security_id || isin,
          isin,
          asOf: row.as_of_date,
          dataCutoff: row.as_of_date,
          canonicalFactHash: row.canonical_fact_hash,
          evidenceHash: row.evidence_hash,
          moduleHashes: storedModuleHashes,
          createdAt: row.created_at,
          payloadSummary: {
            revenueTTM: payloadSummary.revenueTTM ?? null,
            patTTM: payloadSummary.patTTM ?? null,
            roceAnnual: payloadSummary.roceAnnual ?? null,
            debtToEquity: payloadSummary.debtToEquity ?? null,
            peTTM: payloadSummary.peTTM ?? null,
            marketCapCr: payloadSummary.marketCapCr ?? null,
            thesisSupportedCount: payloadSummary.thesisSupportedCount || 0,
            thesisChallengedCount: payloadSummary.thesisChallengedCount || 0,
            activeContradictionsCount: payloadSummary.activeContradictionsCount || 0,
          },
        };
      }

      // Legacy compat path: content_hash is NOT split into two independent hashes.
      // We derive module hashes from existing state columns but mark the origin clearly.
      const legacyHash = row.content_hash || 'LEGACY_UNKNOWN';
      const legacyModuleHashes: Record<string, string> = {};
      if (row.fundamental_state) legacyModuleHashes.fundamental = crypto.createHash('sha256').update(row.fundamental_state).digest('hex');
      if (row.management_state)  legacyModuleHashes.management  = crypto.createHash('sha256').update(row.management_state).digest('hex');
      if (row.valuation_state)   legacyModuleHashes.valuation   = crypto.createHash('sha256').update(row.valuation_state).digest('hex');
      if (row.business_driver_state) legacyModuleHashes.business = crypto.createHash('sha256').update(row.business_driver_state).digest('hex');
      if (row.technical_state)   legacyModuleHashes.technical   = crypto.createHash('sha256').update(row.technical_state).digest('hex');

      // For legacy rows the two hashes are NOT independent — flag this explicitly.
      const legacyFactHash = `LEGACY_COMPAT:${legacyHash}`;
      const legacyEvidenceHash = `LEGACY_COMPAT:${legacyHash}`;

      const summary = row.fundamental_state ? JSON.parse(row.fundamental_state) : {};

      return {
        snapshotId: `snap_legacy_${row.id}_${legacyHash.substring(0, 8)}`,
        securityId: row.security_id || isin,
        isin,
        asOf: row.as_of_date,
        dataCutoff: row.as_of_date,
        canonicalFactHash: legacyFactHash,
        evidenceHash: legacyEvidenceHash,
        moduleHashes: legacyModuleHashes,
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
   * Persists an immutable analytical snapshot.
   * V2 snapshots store canonical_fact_hash, evidence_hash, module_hashes, and analytical_hash
   * as independent columns. content_hash retains canonicalFactHash for legacy compat reads.
   */
  public async saveSnapshot(snapshot: CompanyImmutableSnapshot): Promise<void> {
    const db = new Database(PORTFOLIO_DB_PATH);
    try {
      this.ensureMigration(db);

      const analyticalHash = this.computeAnalyticalHash(
        snapshot.dataCutoff,
        snapshot.canonicalFactHash,
        snapshot.evidenceHash,
        snapshot.moduleHashes
      );

      // Check if identical analytical snapshot already exists
      const existing = db.prepare(`
        SELECT id FROM company_intelligence_snapshot
        WHERE security_id = ? AND as_of_date = ? AND analytical_hash = ?
      `).get(snapshot.securityId, snapshot.dataCutoff, analyticalHash) as any;

      if (!existing) {
        db.prepare(`
          INSERT INTO company_intelligence_snapshot (
            security_id, symbol, as_of_date, content_hash,
            canonical_fact_hash, evidence_hash, module_hashes, analytical_hash,
            payload_summary,
            fundamental_state, management_state, valuation_state,
            business_driver_state, technical_state, fere_state, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          snapshot.securityId,
          snapshot.isin,
          snapshot.dataCutoff,
          snapshot.canonicalFactHash,           // content_hash — legacy compat
          snapshot.canonicalFactHash,           // canonical_fact_hash — V2
          snapshot.evidenceHash,                // evidence_hash — V2 independent
          JSON.stringify(snapshot.moduleHashes),// module_hashes — V2
          analyticalHash,                       // analytical_hash — V2 deterministic identity
          JSON.stringify(snapshot.payloadSummary), // payload_summary — V2
          null,   // fundamental_state — legacy (not written for V2 rows)
          null,   // management_state  — legacy
          null,   // valuation_state   — legacy
          null,   // business_driver_state — legacy
          null,   // technical_state   — legacy
          null,   // fere_state        — legacy
          snapshot.createdAt
        );
      }
    } finally {
      try { db.close(); } catch {}
    }
  }
}
