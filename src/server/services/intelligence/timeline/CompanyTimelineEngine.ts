/**
 * CompanyTimelineEngine.ts — Gate B.1 Integrity Fix
 *
 * Chronological timeline engine.
 * Constitution Article C6:
 * - Real events are anchored to verifiable dates.
 * - Unknown dates are NEVER defaulted to today's date (now.substring(0, 10)).
 * - Undated events carry `dateStatus: 'UNKNOWN'` and are separated from chronological ordering.
 */

import { ManagementCommitment } from '../types/ManagementPayload.js';
import { Contradiction } from '../contracts/ContradictionContracts.js';
import { ThesisChange } from '../contracts/ThesisContracts.js';
import { Catalyst } from '../catalysts/CatalystEngine.js';

export type TimelineEventType =
  | 'MANAGEMENT_GUIDANCE'
  | 'COMMITMENT_OUTCOME'
  | 'CONTRADICTION'
  | 'THESIS_CHANGE'
  | 'CATALYST'
  | 'RESULT';

export interface TimelineEvent {
  eventId: string;
  date: string | null;
  dateStatus?: 'EXACT' | 'APPROXIMATE' | 'UNKNOWN';
  type: TimelineEventType;
  title: string;
  summary: string;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence?: any[];
  metadata?: Record<string, any>;
}

export interface CompanyTimeline {
  securityId: string;
  symbol: string;
  events: TimelineEvent[];
  undatedEvents: TimelineEvent[];
  totalEvents: number;
  startDate: string | null;
  endDate: string | null;
  generatedAt: string;
}

import { CompanyEvent } from '../contracts/CompanyEvent.js';

export interface TimelineBuildInput {
  securityId: string;
  symbol: string;
  corporateEvents?: CompanyEvent[];
  commitments?: ManagementCommitment[];
  contradictions?: Contradiction[];
  thesisChanges?: ThesisChange[];
  catalysts?: Catalyst[];
  financialPeriods?: Array<{ period: string; date?: string; revenueCr?: number; patCr?: number }>;
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

  public buildTimeline(params: TimelineBuildInput): CompanyTimeline {
    const {
      securityId,
      symbol,
      corporateEvents = [],
      commitments = [],
      contradictions = [],
      thesisChanges = [],
      catalysts = [],
      financialPeriods = [],
    } = params;

    const datedEvents: TimelineEvent[] = [];
    const undatedEvents: TimelineEvent[] = [];
    const now = new Date().toISOString();

    // 0. Primary Corporate Events from CompanyEventRepository
    for (const ce of corporateEvents) {
      const evtDate = ce.occurredAt && ce.occurredAt.length >= 10 ? ce.occurredAt.substring(0, 10) : null;
      const type: TimelineEventType =
        ce.eventType === 'FINANCIAL_RESULT' ? 'RESULT'
        : ce.eventType === 'MANAGEMENT_GUIDANCE' ? 'MANAGEMENT_GUIDANCE'
        : (ce.eventType as any);

      const evt: TimelineEvent = {
        eventId: ce.eventId,
        date: evtDate,
        dateStatus: evtDate ? 'EXACT' : 'UNKNOWN',
        type,
        title: ce.title,
        summary: ce.description,
        importance: ce.materiality,
        evidence: ce.evidenceRefs,
        metadata: { eventType: ce.eventType, affectedDomains: ce.affectedDomains },
      };

      if (evtDate) datedEvents.push(evt);
      else undatedEvents.push(evt);
    }

    // 1. Management commitments (Guidance statements & outcomes)
    for (const c of commitments) {
      const eventDate = c.statementDate && c.statementDate.length >= 10
        ? c.statementDate.substring(0, 10)
        : null;

      const evt: TimelineEvent = {
        eventId: `ev_stmt_${c.id}`,
        date: eventDate,
        dateStatus: eventDate ? 'EXACT' : 'UNKNOWN',
        type: 'MANAGEMENT_GUIDANCE',
        title: `Management Guidance: ${c.category || 'Target'}`,
        summary: c.statement,
        importance: 'MEDIUM',
        evidence: c.sourceDocument ? [c.sourceDocument] : [],
        metadata: { status: c.status, targetMetric: c.targetMetric, targetPeriod: c.targetPeriod },
      };

      if (eventDate) datedEvents.push(evt);
      else undatedEvents.push(evt);

      // If commitment reached an outcome (DELIVERED, MISSED, SUPERSEDED)
      if (c.status === 'MISSED' || c.status === 'ACHIEVED' || c.status === 'ACHIEVED_LATE' || c.status === 'SUPERSEDED') {
        const outcomeDate = (c.targetPeriod && c.targetPeriod.length >= 10)
          ? c.targetPeriod.substring(0, 10)
          : (c.deadline && c.deadline.length >= 10 ? c.deadline.substring(0, 10) : eventDate);

        const outcomeEvt: TimelineEvent = {
          eventId: `ev_outcome_${c.id}`,
          date: outcomeDate,
          dateStatus: outcomeDate ? 'EXACT' : 'UNKNOWN',
          type: 'COMMITMENT_OUTCOME',
          title: `Guidance Outcome: ${c.status.replace(/_/g, ' ')}`,
          summary: `Outcome for "${c.statement}": ${c.status} (Actual: ${c.actualValue ?? 'N/A'} vs Target: ${c.targetValue ?? 'N/A'})`,
          importance: c.status === 'MISSED' ? 'HIGH' : 'MEDIUM',
          evidence: c.actualEvidence || [],
          metadata: { status: c.status },
        };

        if (outcomeDate) datedEvents.push(outcomeEvt);
        else undatedEvents.push(outcomeEvt);
      }
    }

    // 2. Contradictions
    for (const con of contradictions) {
      const detectedDate = con.firstDetectedAt && con.firstDetectedAt.length >= 10
        ? con.firstDetectedAt.substring(0, 10)
        : null;

      const evt: TimelineEvent = {
        eventId: `ev_contra_${con.contradictionId.substring(0, 8)}`,
        date: detectedDate,
        dateStatus: detectedDate ? 'EXACT' : 'UNKNOWN',
        type: 'CONTRADICTION',
        title: `Contradiction: ${con.patternId.replace(/_/g, ' ')}`,
        summary: con.explanation,
        importance: con.severity === 'MATERIAL' ? 'HIGH' : 'MEDIUM',
        evidence: con.evidence,
        metadata: { severity: con.severity, status: con.status },
      };

      if (detectedDate) datedEvents.push(evt);
      else undatedEvents.push(evt);
    }

    // 3. Thesis Changes
    for (const tc of thesisChanges) {
      const changeDate = tc.asOfDate && tc.asOfDate.length >= 10
        ? tc.asOfDate.substring(0, 10)
        : null;

      const evt: TimelineEvent = {
        eventId: `ev_thesis_${changeDate || 'nodate'}_${tc.affectedPillarId}`,
        date: changeDate,
        dateStatus: changeDate ? 'EXACT' : 'UNKNOWN',
        type: 'THESIS_CHANGE',
        title: `Thesis ${tc.changeType.replace(/_/g, ' ')}: ${tc.affectedPillarId}`,
        summary: tc.reason,
        importance: (tc.changeType as string) === 'PILLAR_CHALLENGED' || (tc.changeType as string) === 'PILLAR_BROKEN' ? 'HIGH' : 'MEDIUM',
        evidence: tc.evidence,
        metadata: { changeType: tc.changeType },
      };

      if (changeDate) datedEvents.push(evt);
      else undatedEvents.push(evt);
    }

    // 4. Catalysts
    for (const cat of catalysts) {
      if (cat.expectedDate && cat.expectedDate.length === 10) {
        datedEvents.push({
          eventId: `ev_cat_${cat.catalystId}`,
          date: cat.expectedDate,
          dateStatus: 'EXACT',
          type: 'CATALYST',
          title: `Catalyst: ${cat.title}`,
          summary: cat.description || cat.title,
          importance: cat.state === 'DELAYED' || cat.state === 'FAILED' ? 'HIGH' : 'MEDIUM',
          evidence: cat.evidence,
          metadata: { state: cat.state, type: cat.type },
        });
      } else {
        undatedEvents.push({
          eventId: `ev_cat_${cat.catalystId}`,
          date: null,
          dateStatus: 'UNKNOWN',
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
      const resDate = fp.date && fp.date.length >= 10 ? fp.date.substring(0, 10) : null;
      const evt: TimelineEvent = {
        eventId: `ev_res_${fp.period}`,
        date: resDate,
        dateStatus: resDate ? 'EXACT' : 'UNKNOWN',
        type: 'RESULT',
        title: `Financial Results: ${fp.period}`,
        summary: `Results reported for ${fp.period}${fp.revenueCr ? ` — Revenue: ₹${fp.revenueCr.toFixed(0)}cr` : ''}${fp.patCr ? `, PAT: ₹${fp.patCr.toFixed(0)}cr` : ''}.`,
        importance: 'MEDIUM',
      };

      if (resDate) datedEvents.push(evt);
      else undatedEvents.push(evt);
    }

    // Sort descending by date (most recent first)
    datedEvents.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const startDate = datedEvents.length > 0 ? datedEvents[datedEvents.length - 1].date : null;
    const endDate = datedEvents.length > 0 ? datedEvents[0].date : null;

    return {
      securityId,
      symbol,
      events: datedEvents,
      undatedEvents,
      totalEvents: datedEvents.length + undatedEvents.length,
      startDate,
      endDate,
      generatedAt: now,
    };
  }
}
