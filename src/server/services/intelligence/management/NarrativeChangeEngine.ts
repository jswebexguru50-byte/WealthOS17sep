/**
 * NarrativeChangeEngine.ts — Section 6 Management Walk-The-Talk V3
 *
 * Tracks topic-level management commentary shifts across successive concalls and reports.
 *
 * Topics tracked:
 * - DEMAND, MARGINS, CAPEX, ORDERS, WORKING_CAPITAL, DEBT, CAPACITY, PRICING, REGULATORY
 *
 * Tone / trajectory output:
 * - STRENGTHENING, STABLE, SOFTENING, MIXED
 *
 * Constitution:
 * - Honest excerpts with explicit source attribution
 * - Do NOT infer dishonesty or criminal intent; report factual divergence in language.
 */

import { EvidenceReference } from '../contracts/Provenance.js';

export type NarrativeTopic =
  | 'DEMAND'
  | 'MARGINS'
  | 'CAPEX'
  | 'ORDERS'
  | 'WORKING_CAPITAL'
  | 'DEBT'
  | 'CAPACITY'
  | 'PRICING'
  | 'REGULATORY';

export type NarrativeTrajectory =
  | 'STRENGTHENING'
  | 'STABLE'
  | 'SOFTENING'
  | 'MIXED';

export interface NarrativeTopicShift {
  topic: NarrativeTopic;
  trajectory: NarrativeTrajectory;
  summary: string;
  priorCommentary?: {
    statement: string;
    period: string;
    speaker?: string;
  };
  latestCommentary: {
    statement: string;
    period: string;
    speaker?: string;
  };
  evidence: EvidenceReference[];
}

export class NarrativeChangeEngine {
  private static instance: NarrativeChangeEngine;

  public static getInstance(): NarrativeChangeEngine {
    if (!NarrativeChangeEngine.instance) {
      NarrativeChangeEngine.instance = new NarrativeChangeEngine();
    }
    return NarrativeChangeEngine.instance;
  }

  /**
   * Evaluates topic commentary shifts given management statements across periods.
   */
  public evaluateShifts(
    statements: Array<{
      topic: NarrativeTopic;
      statement: string;
      period: string;
      speaker?: string;
      evidence?: EvidenceReference;
    }>
  ): NarrativeTopicShift[] {
    if (!statements || statements.length === 0) return [];

    // Group statements by topic
    const grouped = new Map<NarrativeTopic, typeof statements>();
    for (const stmt of statements) {
      const list = grouped.get(stmt.topic) || [];
      list.push(stmt);
      grouped.set(stmt.topic, list);
    }

    const shifts: NarrativeTopicShift[] = [];

    for (const [topic, topicStatements] of grouped.entries()) {
      // Sort chronologically ascending
      topicStatements.sort((a, b) => a.period.localeCompare(b.period));

      const evidenceBacked = topicStatements.filter(statement =>
        Boolean(statement.evidence?.evidenceId && statement.evidence?.sourceId && statement.evidence?.timestamp)
      );
      // Commentary without a persisted document/transcript reference cannot
      // become a customer-visible narrative conclusion.
      if (evidenceBacked.length === 0) continue;

      const latest = evidenceBacked[evidenceBacked.length - 1];
      const prior = evidenceBacked.length > 1 ? evidenceBacked[evidenceBacked.length - 2] : undefined;

      const trajectory = this.determineTrajectory(latest.statement, prior?.statement);

      const evidence: EvidenceReference[] = [latest.evidence!];

      shifts.push({
        topic,
        trajectory,
        summary: `Management narrative on ${topic.replace(/_/g, ' ')} is ${trajectory.toLowerCase()}.`,
        priorCommentary: prior ? {
          statement: prior.statement,
          period: prior.period,
          speaker: prior.speaker,
        } : undefined,
        latestCommentary: {
          statement: latest.statement,
          period: latest.period,
          speaker: latest.speaker,
        },
        evidence,
      });
    }

    return shifts;
  }

  private determineTrajectory(current: string, prior?: string): NarrativeTrajectory {
    const text = current.toLowerCase();

    const bullishWords = ['strong', 'accelerat', 'expand', 'robust', 'record', 'ahead', 'outperform', 'headroom', 'tailwinds', 'traction'];
    const bearishWords = ['cautious', 'soft', 'slowdown', 'delay', 'headwinds', 'pressure', 'moderation', 'subdued', 'challenging', 'compress'];

    const hasBull = bullishWords.some(w => text.includes(w));
    const hasBear = bearishWords.some(w => text.includes(w));

    if (hasBull && hasBear) return 'MIXED';
    if (hasBull) return 'STRENGTHENING';
    if (hasBear) return 'SOFTENING';

    return 'STABLE';
  }
}
