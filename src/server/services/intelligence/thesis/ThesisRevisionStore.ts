/**
 * ThesisRevisionStore.ts — P0.1 Section 3.4
 *
 * Immutable thesis revision store.
 * Replaces same-date overwrite behavior with an append-only revision ledger.
 *
 * Constitution invariants:
 * - Never overwrite a prior revision
 * - Persist only when thesis state changes (stateHash != priorStateHash)
 * - Preserve complete investment thesis evolution over time
 */

import { getDB, dbAll, dbGet, dbRun } from '../../../database.js';
import { CompanyThesis } from '../contracts/ThesisContracts.js';
import crypto from 'crypto';

export interface ThesisRevision {
  revisionId: string;
  securityId: string;
  asOfDate: string;
  stateHash: string;
  createdAt: string;
  thesis: CompanyThesis;
}

export class ThesisRevisionStore {
  private static instance: ThesisRevisionStore;
  private constructor() {}

  public static getInstance(): ThesisRevisionStore {
    if (!ThesisRevisionStore.instance) {
      ThesisRevisionStore.instance = new ThesisRevisionStore();
    }
    return ThesisRevisionStore.instance;
  }

  /**
   * Deterministic state hash of thesis essence.
   * Ignores volatile timestamps so same analytical state produces same hash.
   */
  public computeStateHash(thesis: CompanyThesis): string {
    const canonicalState = {
      summary: thesis.summary,
      pillars: thesis.thesisPillars.map(p => ({
        id: p.pillarId,
        title: p.title,
        status: p.status,
        assumptions: p.assumptions,
        supportingEvidence: p.supportingEvidence.map(e => e.evidenceId).sort(),
        contradictingEvidence: p.contradictingEvidence.map(e => e.evidenceId).sort(),
      })),
      risks: thesis.risks.map(r => r.title).sort(),
      disconfirmingEvidenceCount: thesis.disconfirmingEvidence.length,
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonicalState))
      .digest('hex')
      .substring(0, 16);
  }

  private tableInitialized = false;

  public async ensureTable(): Promise<void> {
    if (this.tableInitialized) return;
    const db = getDB();
    if (!db) return;
    try {
      await dbRun(
        db,
        `CREATE TABLE IF NOT EXISTS company_thesis_revisions (
           revision_id TEXT PRIMARY KEY,
           security_id TEXT NOT NULL,
           as_of_date TEXT NOT NULL,
           state_hash TEXT NOT NULL,
           created_at TEXT NOT NULL,
           thesis_json TEXT NOT NULL
         )`
      );
      await dbRun(
        db,
        `CREATE INDEX IF NOT EXISTS idx_thesis_rev_security
         ON company_thesis_revisions(security_id, created_at DESC)`
      );
      this.tableInitialized = true;
    } catch {
      // Table may already exist
    }
  }

  /**
   * Persists a new revision ONLY IF the thesis state changed.
   * Never overwrites prior revisions.
   */
  public async saveIfChanged(
    securityId: string,
    asOfDate: string,
    thesis: CompanyThesis
  ): Promise<{ saved: boolean; revisionId: string; stateHash: string }> {
    await this.ensureTable();
    const db = getDB();
    if (!db) {
      return { saved: false, revisionId: thesis.thesisId, stateHash: '' };
    }

    const stateHash = this.computeStateHash(thesis);

    try {
      const prior = await dbGet<any>(
        db,
        `SELECT revision_id, state_hash FROM company_thesis_revisions
         WHERE security_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [securityId]
      );

      if (prior && prior.state_hash === stateHash) {
        // State unchanged — do not create duplicate revision
        return { saved: false, revisionId: prior.revision_id, stateHash };
      }

      const revisionId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      await dbRun(
        db,
        `INSERT INTO company_thesis_revisions (
           revision_id, security_id, as_of_date, state_hash, created_at, thesis_json
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          revisionId,
          securityId,
          asOfDate,
          stateHash,
          createdAt,
          JSON.stringify(thesis),
        ]
      );

      return { saved: true, revisionId, stateHash };
    } catch (err) {
      console.warn('[ThesisRevisionStore] Error saving thesis revision:', err);
      return { saved: false, revisionId: thesis.thesisId, stateHash };
    }
  }

  /**
   * Retrieves the most recent thesis revision for a security.
   */
  public async getLatestRevision(securityId: string): Promise<ThesisRevision | null> {
    await this.ensureTable();
    const db = getDB();
    if (!db) return null;

    try {
      const row = await dbGet<any>(
        db,
        `SELECT revision_id, security_id, as_of_date, state_hash, created_at, thesis_json
         FROM company_thesis_revisions
         WHERE security_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [securityId]
      );

      if (!row) return null;

      return {
        revisionId: row.revision_id,
        securityId: row.security_id,
        asOfDate: row.as_of_date,
        stateHash: row.state_hash,
        createdAt: row.created_at,
        thesis: JSON.parse(row.thesis_json),
      };
    } catch {
      return null;
    }
  }

  /**
   * Retrieves complete chronological history of thesis revisions for a security.
   */
  public async getRevisionHistory(securityId: string, limit = 20): Promise<ThesisRevision[]> {
    await this.ensureTable();
    const db = getDB();
    if (!db) return [];

    try {
      const rows = await dbAll<any>(
        db,
        `SELECT revision_id, security_id, as_of_date, state_hash, created_at, thesis_json
         FROM company_thesis_revisions
         WHERE security_id = ?
         ORDER BY created_at DESC LIMIT ?`,
        [securityId, limit]
      );

      return (rows || []).map(r => ({
        revisionId: r.revision_id,
        securityId: r.security_id,
        asOfDate: r.as_of_date,
        stateHash: r.state_hash,
        createdAt: r.created_at,
        thesis: JSON.parse(r.thesis_json),
      }));
    } catch {
      return [];
    }
  }
}
