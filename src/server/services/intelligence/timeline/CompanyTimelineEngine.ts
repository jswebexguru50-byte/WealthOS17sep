/**
 * CompanyTimelineEngine.ts — Section 16 Company Event Timeline
 *
 * Synthesizes a unified, chronological investment narrative timeline from:
 * - Financial results & filings
 * - Management commitments & guidance updates
 * - Commitment delivery outcomes (achievements, misses, deferrals)
 * - Contradictions detected & resolved
 * - Thesis changes (pillars challenged, strengthened, weakened)
 * - Catalysts (expected, delivered, delayed)
 * - Valuation and technical inflection milestones
 */

import { EvidenceReference } from '../contracts/Provenance.js';
import { ManagementCommitment } from '../types/ManagementPayload.js';
import { Contradiction } from '../contracts/ContradictionContracts.js';
import { ThesisChange } from '../contracts/ThesisContracts.js';
import { Catalyst } from '../catalysts/CatalystEngine.js';

export type TimelineEventType =
  | 'RESULT'
  | 'MANAGEMENT_GUIDANCE'
  | 'COMMITMENT_OUTCOME'
  | 'CONTRADICTION'
  | 'THESIS_CHANGE'
  | 'CATALYST'
  | 'VALUATION_INFLECTION'
  | 'TECHNICAL_SIGNAL'
  | 'CORPORATE_ACTION';

export interface TimelineEvent {
  eventId: string;
  date: string; // ISO date YYYY-MM-DD
  type: TimelineEventType;
  title: string;
  summary: string;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence?: EvidenceReference[];
  metadata?: Record<string, any>;
}

export interface CompanyTimeline {
  securityId: string;
  symbol: string;
  events: TimelineEvent[];
  totalEvents: number;
  startDate: string;
  endDate: string;
  generatedAt: string;
}

export class CompanyTimelineEngine {
  private static instance: CompanyTimelineEngine;

  private constructor() {}

  public static getInstance(): CompanyTimelineEngine {
    if (!CompanyTimelineEngine.instance) {
      CompanyTimelineEngine.instance = new CompanyTimelineEngine();
    }
    return CompanyTimelineEngine.instance;
  }

  /**
   * Assembles a unified chronological timeline from analytical components.
   */
  public buildTimeline(params: {
    securityId: string;
    symbol: string;
    commitments?: ManagementCommitment[];
    contradictions?: Contradiction[];
    thesisChanges?: ThesisChange[];
    catalysts?: Catalyst[];
    financialPeriods?: Array<{ period: string; date: string; revenueCr?: number; patCr?: number }>;
  }): CompanyTimeline {
    const {
      securityId,
      symbol,
      commitments = [],
      contradictions = [],
      thesisChanges = [],
      catalysts = [],
      financialPeriods = [],
    } = params;

    const events: TimelineEvent[] = [];
    const now = new Date().toISOString();

    // 1. Management commitments (Guidance statements & outcomes)
    for (const c of commitments) {
      const eventDate = c.statementDate ? c.statementDate.substring(0, 10) : now.substring(0, 10);
      events.push({
        eventId: `ev_stmt_${c.id}`,
        date: eventDate,
        type: 'MANAGEMENT_GUIDANCE',
        title: `Management Guidance: ${c.category || 'Target'}`,
        summary: c.statement,
        importance: 'MEDIUM',
        evidence: c.sourceDocument ? [c.sourceDocument] : [],
        metadata: { status: c.status, targetMetric: c.targetMetric, targetPeriod: c.targetPeriod },
      });

      // If commitment reached an outcome (DELIVERED, MISSED, SUPERSEDED)
      if (c.status === 'MISSED' || c.status === 'ACHIEVED' || c.status === 'ACHIEVED_LATE' || c.status === 'SUPERSEDED') {
        const outcomeDate = c.targetPeriod || c.deadline || eventDate;
        events.push({
          eventId: `ev_outcome_${c.id}`,
          date: outcomeDate.length === 10 ? outcomeDate : eventDate,
          type: 'COMMITMENT_OUTCOME',
          title: `Guidance Outcome: ${c.status.replace(/_/g, ' ')}`,
          summary: `Outcome for "${c.statement}": ${c.status} (Actual: ${c.actualValue ?? 'N/A'} vs Target: ${c.targetValue ?? 'N/A'})`,
          importance: c.status === 'MISSED' ? 'HIGH' : 'MEDIUM',
          evidence: c.actualEvidence || [],
          metadata: { status: c.status },
        });
      }
    }

    // 2. Contradictions
    for (const con of contradictions) {
      const detectedDate = con.firstDetectedAt ? con.firstDetectedAt.substring(0, 10) : now.substring(0, 10);
      events.push({
        eventId: `ev_contra_${con.contradictionId.substring(0, 8)}`,
        date: detectedDate,
        type: 'CONTRADICTION',
        title: `Contradiction: ${con.patternId.replace(/_/g, ' ')}`,
        summary: con.explanation,
        importance: con.severity === 'MATERIAL' ? 'HIGH' : 'MEDIUM',
        evidence: con.evidence,
        metadata: { severity: con.severity, status: con.status },
      });
    }

    // 3. Thesis Changes
    for (const tc of thesisChanges) {
      const changeDate = tc.asOfDate ? tc.asOfDate.substring(0, 10) : now.substring(0, 10);
      events.push({
        eventId: `ev_thesis_${changeDate}_${tc.affectedPillarId}`,
        date: changeDate,
        type: 'THESIS_CHANGE',
        title: `Thesis ${tc.changeType.replace(/_/g, ' ')}: ${tc.affectedPillarId}`,
        summary: tc.reason,
        importance: (tc.changeType as string) === 'PILLAR_CHALLENGED' || (tc.changeType as string) === 'PILLAR_BROKEN' ? 'HIGH' : 'MEDIUM',
        evidence: tc.evidence,
        metadata: { changeType: tc.changeType },
      });
    }

    // 4. Catalysts
    for (const cat of catalysts) {
      if (cat.expectedDate) {
        events.push({
          eventId: `ev_cat_${cat.catalystId}`,
          date: cat.expectedDate.length === 10 ? cat.expectedDate : now.substring(0, 10),
          type: 'CATALYST',
          title: `Catalyst: ${cat.title}`,
          summary: cat.description || cat.title,
          importance: cat.state === 'DELAYED' || cat.state === 'FAILED' ? 'HIGH' : 'MEDIUM',
          evidence: cat.evidence,
          metadata: { state: cat.state, type: cat.type },
        });
      }
    }

    // 5. Financial Results
    for (const fp of financialPeriods) {
      events.push({
        eventId: `ev_res_${fp.period}`,
        date: fp.date || now.substring(0, 10),
        type: 'RESULT',
        title: `Financial Results: ${fp.period}`,
        summary: `Results reported for ${fp.period}${fp.revenueCr ? ` — Revenue: ₹${fp.revenueCr.toFixed(0)}cr` : ''}${fp.patCr ? `, PAT: ₹${fp.patCr.toFixed(0)}cr` : ''}.`,
        importance: 'MEDIUM',
      });
    }

    // Sort descending by date (most recent first)
    events.sort((a, b) => b.date.localeCompare(a.date));

    const startDate = events.length > 0 ? events[events.length - 1].date : now.substring(0, 10);
    const endDate = events.length > 0 ? events[0].date : now.substring(0, 10);

    return {
      securityId,
      symbol,
      events,
      totalEvents: events.length,
      startDate,
      endDate,
      generatedAt: now,
    };
  }
}
