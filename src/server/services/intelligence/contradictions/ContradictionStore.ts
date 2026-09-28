/**
 * ContradictionStore.ts — P0 Fix (Contradiction Lifecycle Persistence)
 *
 * Stable contradiction identity over multiple runs.
 * Identity = hash(securityId + patternId + contextHash)
 *
 * Lifecycle: OPEN → EXPLAINED → RESOLVED → NO_LONGER_APPLICABLE
 *
 * Without this, every analysis run generates new UUID contradictions
 * and the OPEN→RESOLVED progression declared in ContradictionContracts is never real.
 */

import crypto from 'crypto';
import { getDB } from '../../../database.js';
import {
  Contradiction,
  ContradictionPatternId,
  ContradictionStatus,
} from '../contracts/ContradictionContracts.js';

// ─── Store ────────────────────────────────────────────────────────────────────

export class ContradictionStore {
  private static instance: ContradictionStore;

  private constructor() {}

  public static getInstance(): ContradictionStore {
    if (!ContradictionStore.instance) {
      ContradictionStore.instance = new ContradictionStore();
    }
    return ContradictionStore.instance;
  }

  /**
   * Ensure table exists (idempotent).
   */
  public ensureTable(): void {
    const db = getDB();
    if (!db) return;
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS company_contradiction (
          contradiction_id TEXT PRIMARY KEY,
          security_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          pattern_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN',
          severity TEXT NOT NULL,
          observation_a TEXT NOT NULL,
          observation_b TEXT NOT NULL,
          explanation TEXT NOT NULL,
          possible_interpretations TEXT,
          evidence_json TEXT,
          first_detected_at TEXT NOT NULL,
          last_observed_at TEXT NOT NULL,
          resolved_at TEXT,
          explanation_notes TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_contradiction_security
          ON company_contradiction(security_id, status);
      `);
    } catch { /* Table may already exist */ }
  }

  /**
   * Stable contradiction ID = sha256(securityId:patternId:contextWords).
   * Context words are derived from the first 60 chars of observationA to
   * distinguish same-pattern contradictions on different metrics.
   */
  public stableId(securityId: string, patternId: ContradictionPatternId, contextKey: string = ''): string {
    const input = `${securityId}:${patternId}:${contextKey.substring(0, 60)}`;
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 20);
  }

  /**
   * Reconcile new run's contradictions against persisted state.
   * - If contradiction is new: INSERT as OPEN
   * - If contradiction still active: UPDATE last_observed_at
   * - If prior contradiction is no longer triggered: mark NO_LONGER_APPLICABLE
   * Returns contradictions with stable IDs and current lifecycle status.
   */
  public async reconcile(
    securityId: string,
    symbol: string,
    newContradictions: Contradiction[],
  ): Promise<Contradiction[]> {
    this.ensureTable();
    const db = getDB();
    if (!db) return newContradictions;

    const now = new Date().toISOString();

    try {
      // 1. Assign stable IDs to new contradictions
      const withStableIds = newContradictions.map(c => ({
        ...c,
        contradictionId: this.stableId(securityId, c.patternId, c.observationA),
      }));

      // 2. Load prior OPEN/EXPLAINED contradictions
      const priorOpen = db.prepare(`
        SELECT contradiction_id, pattern_id, status, first_detected_at, explanation_notes
        FROM company_contradiction
        WHERE security_id = ? AND status IN ('OPEN', 'EXPLAINED')
      `).all(securityId) as unknown as Array<{
        contradiction_id: string;
        pattern_id: string;
        status: string;
        first_detected_at: string;
        explanation_notes: string | null;
      }>;

      const priorIds = new Set(priorOpen.map(r => r.contradiction_id));
      const newIds = new Set(withStableIds.map(c => c.contradictionId));

      // 3. Upsert new contradictions
      for (const c of withStableIds) {
        const isNew = !priorIds.has(c.contradictionId);
        const priorRecord = priorOpen.find(r => r.contradiction_id === c.contradictionId);
        const status: ContradictionStatus = priorRecord?.status as ContradictionStatus ?? 'OPEN';

        db.prepare(`
          INSERT OR REPLACE INTO company_contradiction
            (contradiction_id, security_id, symbol, pattern_id, status, severity,
             observation_a, observation_b, explanation, possible_interpretations,
             evidence_json, first_detected_at, last_observed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          c.contradictionId,
          securityId,
          symbol,
          c.patternId,
          status,
          c.severity,
          c.observationA,
          c.observationB,
          c.explanation,
          JSON.stringify(c.possibleInterpretations),
          JSON.stringify(c.evidence),
          isNew ? now : (priorRecord?.first_detected_at ?? now),
          now,
        );
      }

      // 4. Mark NO_LONGER_APPLICABLE for prior open contradictions not in current run
      for (const prior of priorOpen) {
        if (!newIds.has(prior.contradiction_id) && prior.status === 'OPEN') {
          db.prepare(`
            UPDATE company_contradiction
            SET status = 'NO_LONGER_APPLICABLE', resolved_at = ?
            WHERE contradiction_id = ?
          `).run(now, prior.contradiction_id);
        }
      }

      // 5. Return with lifecycle-correct status and stable IDs
      return withStableIds.map(c => {
        const prior = priorOpen.find(r => r.contradiction_id === c.contradictionId);
        return {
          ...c,
          status: (prior?.status as ContradictionStatus) ?? 'OPEN',
          firstDetectedAt: prior?.first_detected_at ?? now,
          lastObservedAt: now,
        };
      });

    } catch {
      return newContradictions; // Fallback to fresh (no lifecycle)
    }
  }

  /**
   * Load all currently OPEN contradictions for a company.
   * Used by ThesisEngine and Attention.
   */
  public async loadOpen(securityId: string): Promise<Contradiction[]> {
    const db = getDB();
    if (!db) return [];
    try {
      const rows = db.prepare(`
        SELECT * FROM company_contradiction
        WHERE security_id = ? AND status IN ('OPEN', 'EXPLAINED')
        ORDER BY first_detected_at DESC
      `).all(securityId) as unknown as any[];

      return rows.map(r => ({
        contradictionId: r.contradiction_id,
        patternId: r.pattern_id as ContradictionPatternId,
        observationA: r.observation_a,
        observationB: r.observation_b,
        severity: r.severity,
        status: r.status as ContradictionStatus,
        explanation: r.explanation,
        possibleInterpretations: JSON.parse(r.possible_interpretations || '[]'),
        evidence: JSON.parse(r.evidence_json || '[]'),
        firstDetectedAt: r.first_detected_at,
        lastObservedAt: r.last_observed_at,
      }));
    } catch { return []; }
  }

  /**
   * Mark a contradiction as EXPLAINED (user/analyst provided rationale).
   */
  public async explain(contradictionId: string, notes: string): Promise<void> {
    const db = getDB();
    if (!db) return;
    try {
      db.prepare(`
        UPDATE company_contradiction
        SET status = 'EXPLAINED', explanation_notes = ?
        WHERE contradiction_id = ?
      `).run(notes, contradictionId);
    } catch { /* Non-fatal */ }
  }

  /**
   * Mark a contradiction as RESOLVED.
   */
  public async resolve(contradictionId: string): Promise<void> {
    const db = getDB();
    if (!db) return;
    try {
      db.prepare(`
        UPDATE company_contradiction
        SET status = 'RESOLVED', resolved_at = ?
        WHERE contradiction_id = ?
      `).run(new Date().toISOString(), contradictionId);
    } catch { /* Non-fatal */ }
  }
}
