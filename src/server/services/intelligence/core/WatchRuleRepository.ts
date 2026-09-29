/**
 * WatchRuleRepository.ts — Section 10 & Stage 6 Monitoring Loop
 *
 * Persistent SQLite repository for user-configured watch rules,
 * stateful evaluations, and triggered watch events.
 *
 * Invariants:
 * - Backed by SQLite (watch_rules, watch_evaluations, watch_events).
 * - Survives process restarts; no in-memory Map as primary store.
 * - Deterministic evaluation IDs and watch event IDs.
 * - Captures triggering evidence IDs for audit trail.
 */

import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import {
  WatchRule,
  WatchEvaluation,
  WatchEvent,
  WatchRuleStatus,
} from '../contracts/WatchContracts.js';

const PORTFOLIO_DB_PATH = path.resolve('portfolio.db');

export class WatchRuleRepository {
  private static instance: WatchRuleRepository;

  private constructor() {}

  public static getInstance(): WatchRuleRepository {
    if (!WatchRuleRepository.instance) {
      WatchRuleRepository.instance = new WatchRuleRepository();
    }
    return WatchRuleRepository.instance;
  }

  /**
   * Deterministic ID for a watch evaluation.
   */
  public computeEvaluationId(watchId: string, evaluatedAt: string, currentState: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${watchId}:${evaluatedAt}:${currentState}`)
      .digest('hex')
      .substring(0, 12);
    return `weval_${watchId}_${hash}`;
  }

  /**
   * Deterministic ID for a triggered watch event.
   */
  public computeEventId(watchId: string, occurredAt: string, summary: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${watchId}:${occurredAt}:${summary}`)
      .digest('hex')
      .substring(0, 12);
    return `wevt_${watchId}_${hash}`;
  }

  /**
   * Persists or updates a watch rule.
   */
  public async saveRule(rule: WatchRule): Promise<void> {
    const db = new Database(PORTFOLIO_DB_PATH);
    try {
      db.prepare(`
        INSERT INTO watch_rules (
          watch_id, user_id, security_id, symbol, subject_type, subject,
          operator, threshold, unit, status, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(watch_id) DO UPDATE SET
          user_id = excluded.user_id,
          security_id = excluded.security_id,
          symbol = excluded.symbol,
          subject_type = excluded.subject_type,
          subject = excluded.subject,
          operator = excluded.operator,
          threshold = excluded.threshold,
          unit = excluded.unit,
          status = excluded.status,
          description = excluded.description,
          updated_at = excluded.updated_at
      `).run(
        rule.watchId,
        rule.userId || null,
        rule.securityId,
        rule.symbol,
        rule.subjectType,
        rule.subject,
        rule.operator || null,
        rule.threshold !== undefined ? String(rule.threshold) : null,
        rule.unit || null,
        rule.status || 'ACTIVE',
        rule.description || '',
        rule.createdAt || new Date().toISOString(),
        rule.updatedAt || new Date().toISOString()
      );
    } finally {
      try { db.close(); } catch {}
    }
  }

  /**
   * Retrieves all rules for a given security (by ISIN or symbol).
   */
  public async getRulesForSecurity(securityId: string): Promise<WatchRule[]> {
    const db = new Database(PORTFOLIO_DB_PATH, { readonly: true });
    try {
      const rows = db.prepare(`
        SELECT * FROM watch_rules
        WHERE security_id = ? OR symbol = ?
        ORDER BY created_at DESC
      `).all(securityId, securityId) as any[];

      return rows.map(r => this.mapRowToRule(r));
    } finally {
      try { db.close(); } catch {}
    }
  }

  /**
   * Retrieves all active rules across the universe.
   */
  public async getActiveRules(): Promise<WatchRule[]> {
    const db = new Database(PORTFOLIO_DB_PATH, { readonly: true });
    try {
      const rows = db.prepare(`
        SELECT * FROM watch_rules
        WHERE status = 'ACTIVE'
        ORDER BY created_at DESC
      `).all() as any[];

      return rows.map(r => this.mapRowToRule(r));
    } finally {
      try { db.close(); } catch {}
    }
  }

  /**
   * Retrieves a rule by its ID.
   */
  public async getRuleById(watchId: string): Promise<WatchRule | null> {
    const db = new Database(PORTFOLIO_DB_PATH, { readonly: true });
    try {
      const row = db.prepare(`
        SELECT * FROM watch_rules WHERE watch_id = ?
      `).get(watchId) as any;

      return row ? this.mapRowToRule(row) : null;
    } finally {
      try { db.close(); } catch {}
    }
  }

  /**
   * Updates status of a watch rule.
   */
  public async updateRuleStatus(watchId: string, status: WatchRuleStatus): Promise<void> {
    const db = new Database(PORTFOLIO_DB_PATH);
    try {
      db.prepare(`
        UPDATE watch_rules
        SET status = ?, updated_at = ?
        WHERE watch_id = ?
      `).run(status, new Date().toISOString(), watchId);
    } finally {
      try { db.close(); } catch {}
    }
  }

  /**
   * Persists an evaluation result.
   */
  public async saveEvaluation(evaluation: WatchEvaluation): Promise<void> {
    const db = new Database(PORTFOLIO_DB_PATH);
    const evalId = this.computeEvaluationId(
      evaluation.watchId,
      evaluation.evaluatedAt,
      evaluation.currentState
    );
    try {
      db.prepare(`
        INSERT INTO watch_evaluations (
          evaluation_id, watch_id, security_id, symbol,
          evaluated_at, previous_state, current_state,
          triggering_evidence_ids, explanation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(evaluation_id) DO NOTHING
      `).run(
        evalId,
        evaluation.watchId,
        evaluation.securityId,
        evaluation.symbol,
        evaluation.evaluatedAt,
        evaluation.previousState || null,
        evaluation.currentState,
        JSON.stringify(evaluation.triggeringEvidenceIds || []),
        evaluation.explanation || null
      );
    } finally {
      try { db.close(); } catch {}
    }
  }

  /**
   * Gets the most recent evaluation for a watch rule.
   */
  public async getLatestEvaluation(watchId: string): Promise<WatchEvaluation | null> {
    const db = new Database(PORTFOLIO_DB_PATH, { readonly: true });
    try {
      const row = db.prepare(`
        SELECT * FROM watch_evaluations
        WHERE watch_id = ?
        ORDER BY evaluated_at DESC
        LIMIT 1
      `).get(watchId) as any;

      if (!row) return null;

      return {
        watchId: row.watch_id,
        securityId: row.security_id,
        symbol: row.symbol,
        evaluatedAt: row.evaluated_at,
        previousState: row.previous_state || undefined,
        currentState: row.current_state,
        triggeringEvidenceIds: row.triggering_evidence_ids ? JSON.parse(row.triggering_evidence_ids) : [],
        explanation: row.explanation || '',
      };
    } finally {
      try { db.close(); } catch {}
    }
  }

  /**
   * Persists a triggered watch event.
   */
  public async saveWatchEvent(event: WatchEvent): Promise<void> {
    const db = new Database(PORTFOLIO_DB_PATH);
    const eventId = event.eventId || this.computeEventId(event.watchId, event.occurredAt, event.summary);
    try {
      db.prepare(`
        INSERT INTO watch_events (
          event_id, watch_id, security_id, symbol,
          occurred_at, summary, severity, evidence_ids
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO NOTHING
      `).run(
        eventId,
        event.watchId,
        event.securityId,
        event.symbol,
        event.occurredAt,
        event.summary,
        event.severity,
        JSON.stringify(event.evidenceIds || [])
      );
    } finally {
      try { db.close(); } catch {}
    }
  }

  /**
   * Gets recent watch events for a security.
   */
  public async getWatchEvents(securityId: string, limit = 50): Promise<WatchEvent[]> {
    const db = new Database(PORTFOLIO_DB_PATH, { readonly: true });
    try {
      const rows = db.prepare(`
        SELECT * FROM watch_events
        WHERE security_id = ? OR symbol = ?
        ORDER BY occurred_at DESC
        LIMIT ?
      `).all(securityId, securityId, limit) as any[];

      return rows.map(r => ({
        eventId: r.event_id,
        watchId: r.watch_id,
        securityId: r.security_id,
        symbol: r.symbol,
        occurredAt: r.occurred_at,
        summary: r.summary,
        severity: r.severity as 'INFO' | 'ALERT' | 'CRITICAL',
        evidenceIds: r.evidence_ids ? JSON.parse(r.evidence_ids) : [],
      }));
    } finally {
      try { db.close(); } catch {}
    }
  }

  private mapRowToRule(row: any): WatchRule {
    return {
      watchId: row.watch_id,
      userId: row.user_id || undefined,
      securityId: row.security_id,
      symbol: row.symbol,
      subjectType: row.subject_type,
      subject: row.subject,
      operator: row.operator || undefined,
      threshold: row.threshold !== null && !isNaN(Number(row.threshold)) ? Number(row.threshold) : row.threshold,
      unit: row.unit || undefined,
      status: row.status,
      description: row.description || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at || undefined,
    };
  }
}
