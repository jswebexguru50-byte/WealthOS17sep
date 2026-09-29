/**
 * CompanyRefreshCoordinator.ts — Section 14 & 15 Dependency-Based Recomputation
 *
 * Operational spine of WealthOS:
 * Disclosures / Price Updates → Ingest & Persist → Identify Affected Modules →
 * Run Recomputation Pipeline → Assertions / Safety Gate → Snapshot & Delta →
 * Evaluate Watch Rules → Return Updated Cockpit
 */

import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { CompanyIntelligenceResponse } from '../types/CompanyIntelligenceResponse.js';
import { CompanyIntelligenceOrchestrator } from '../CompanyIntelligenceOrchestrator.js';
import { CompanySnapshotRepository } from '../core/CompanySnapshotRepository.js';
import { CompanyDeltaEngine } from '../delta/CompanyDeltaEngine.js';
import { ClaimSafetyGate } from '../safety/ClaimSafetyGate.js';
import {
  WatchRule,
  WatchEvaluation,
  WatchEvent,
  WatchSubjectType,
  WatchConditionOperator,
} from '../contracts/WatchContracts.js';

const PORTFOLIO_DB_PATH = path.resolve('portfolio.db');

export type RefreshTrigger =
  | 'PRICE_UPDATE'
  | 'FINANCIAL_RESULTS'
  | 'CORPORATE_ANNOUNCEMENT'
  | 'EARNINGS_TRANSCRIPT'
  | 'MANUAL_REFRESH';

export interface IngestedFact {
  metric: string;
  value: number | string;
  unit: string;
  periodEnd: string;
  periodType: 'ANNUAL' | 'QUARTERLY' | 'TTM';
  publishedDate: string;
  availableAt: string;
  sourceDocumentId?: string;
  sourceType?: string;
  evidenceText?: string;
}

export interface IngestedCorporateEvent {
  eventType: string;
  headline: string;
  eventDate: string;
  description: string;
  sourceUrl?: string;
  impactScope?: string;
}

export interface IngestedDisclosurePayload {
  sourceType: 'AUDITED_FINANCIAL_STATEMENT' | 'EXCHANGE_FILING' | 'EARNINGS_TRANSCRIPT' | 'ANNUAL_REPORT' | 'PRICE_TICK';
  documentDate: string;
  availableAt: string;
  sourceName: string;
  sourceUrl?: string;
  facts?: IngestedFact[];
  events?: IngestedCorporateEvent[];
}

export interface RefreshResult {
  securityId: string;
  symbol: string;
  trigger: RefreshTrigger;
  affectedModules: string[];
  unaffectedModules: string[];
  newFactsStored: number;
  newEventsStored: number;
  snapshotId: string;
  deltaSummary: string[];
  watchEvaluations: WatchEvaluation[];
  triggeredWatches: WatchEvent[];
  updatedResponse: CompanyIntelligenceResponse;
}

export class CompanyRefreshCoordinator {
  private static instance: CompanyRefreshCoordinator;
  private readonly watchRules: Map<string, WatchRule[]> = new Map();
  /**
   * Persists the most recent WatchEvaluation per watchId across invocations.
   * Required for stateful transition detection (SATISFIED→TRIGGERED, TRIGGERED→SATISFIED).
   */
  private readonly lastEvaluations: Map<string, WatchEvaluation> = new Map();

  private constructor() {
    // No DYCL-specific or any symbol-specific watch rules here.
    // Watch rules must be loaded via registerWatchRule() from a WatchRuleRepository or test fixtures.
  }

  public static getInstance(): CompanyRefreshCoordinator {
    if (!CompanyRefreshCoordinator.instance) {
      CompanyRefreshCoordinator.instance = new CompanyRefreshCoordinator();
    }
    return CompanyRefreshCoordinator.instance;
  }

  /**
   * Registers a user or system watch rule for continuous monitoring.
   */
  public registerWatchRule(rule: WatchRule): void {
    const list = this.watchRules.get(rule.securityId) || [];
    list.push(rule);
    this.watchRules.set(rule.securityId, list);
  }

  public getWatchRules(securityId: string): WatchRule[] {
    return this.watchRules.get(securityId) || [];
  }

  /**
   * Primary entry point: Ingests new disclosure or trigger and runs selective recomputation pipeline.
   */
  public async refreshCompany(
    identity: SecurityIdentity,
    trigger: RefreshTrigger,
    payload?: IngestedDisclosurePayload,
    asOfDate?: string
  ): Promise<RefreshResult> {
    const isin = identity.isin;
    const sym = identity.nseSymbol || identity.bseCode || '';
    const now = new Date().toISOString();
    const effectiveAsOf = asOfDate || now.split('T')[0];

    // 1. Dependency-based determination of affected vs unaffected modules
    const { affected, unaffected } = this.resolveAffectedModules(trigger);

    // 2. Ingest and persist new facts/events if provided
    let newFactsStored = 0;
    let newEventsStored = 0;
    if (payload?.facts && payload.facts.length > 0) {
      newFactsStored = await this.persistIngestedFacts(identity, payload.facts, payload);
    }
    if (payload?.events && payload.events.length > 0) {
      newEventsStored = await this.persistIngestedEvents(identity, payload.events, payload);
    }

    // 3. Query prior snapshot for delta generation
    const snapshotRepo = CompanySnapshotRepository.getInstance();
    const priorSnapshot = await snapshotRepo.getPreviousSnapshot(identity, effectiveAsOf);

    // 4. Run orchestrator recomputation (uses symbol-based entry point)
    const orchestrator = CompanyIntelligenceOrchestrator.getInstance();
    const updatedResponse = await orchestrator.getCompanyIntelligence(
      sym || isin,
      undefined,
      { asOfDate: effectiveAsOf, persist: true }
    );

    // 5. Run ClaimSafetyGate verification on all assertions in the response
    const allAssertions = (updatedResponse as any)?.assertions || [];
    if (allAssertions.length > 0) {
      ClaimSafetyGate.getInstance().filterAssertions(allAssertions);
    }

    // 6. Compute Delta between prior snapshot and current response
    const deltaSummary: string[] = [];
    if (priorSnapshot) {
      const currentFacts: Record<string, any> = priorSnapshot.payloadSummary || {};
      const previousFacts: Record<string, any> = priorSnapshot.payloadSummary || {};
      const deltaItems = CompanyDeltaEngine.getInstance().compare(
        currentFacts,
        previousFacts,
        'QOQ',
        'FUNDAMENTALS'
      );
      for (const d of deltaItems) {
        deltaSummary.push(`${d.category}: ${d.explanation}`);
      }
    }

    // 7. Evaluate Watch Rules — pass events for EVENT-type watches
    const events: any[] = (updatedResponse as any).timelineEvents || [];
    const { evaluations, triggered } = this.evaluateWatchRules(identity, updatedResponse, events);

    // Snapshot identity must be deterministic — fail explicitly if unavailable
    const snapshotId = updatedResponse.snapshot?.snapshotId;
    if (!snapshotId) {
      console.error('[CompanyRefreshCoordinator] Snapshot ID missing — deterministic snapshot was not generated. Aborting snapshot reference.');
    }

    return {
      securityId: isin,
      symbol: sym,
      trigger,
      affectedModules: affected,
      unaffectedModules: unaffected,
      newFactsStored,
      newEventsStored,
      snapshotId: snapshotId || 'SNAPSHOT_GENERATION_FAILED',
      deltaSummary: deltaSummary.length > 0 ? deltaSummary : ['No material changes detected'],
      watchEvaluations: evaluations,
      triggeredWatches: triggered,
      updatedResponse,
    };
  }

  /**
   * Maps each trigger to its exact affected vs unaffected analytical modules.
   */
  public resolveAffectedModules(trigger: RefreshTrigger): { affected: string[]; unaffected: string[] } {
    const allModules = [
      'fundamental',
      'businessDrivers',
      'management',
      'valuation',
      'technical',
      'contradictions',
      'thesis',
      'attention',
      'questions',
      'catalysts',
      'timeline',
      'delta',
    ];

    let affected: string[] = [];
    switch (trigger) {
      case 'PRICE_UPDATE':
        affected = ['technical', 'valuation', 'delta'];
        break;
      case 'FINANCIAL_RESULTS':
        affected = [
          'fundamental',
          'businessDrivers',
          'management',
          'valuation',
          'contradictions',
          'thesis',
          'attention',
          'questions',
          'delta',
        ];
        break;
      case 'EARNINGS_TRANSCRIPT':
        affected = [
          'management',
          'businessDrivers',
          'contradictions',
          'thesis',
          'questions',
          'delta',
        ];
        break;
      case 'CORPORATE_ANNOUNCEMENT':
        affected = ['catalysts', 'timeline', 'contradictions', 'delta'];
        break;
      case 'MANUAL_REFRESH':
      default:
        affected = allModules;
        break;
    }

    const unaffected = allModules.filter(m => !affected.includes(m));
    return { affected, unaffected };
  }

  private async persistIngestedFacts(
    identity: SecurityIdentity,
    facts: IngestedFact[],
    disclosure: IngestedDisclosurePayload
  ): Promise<number> {
    const db = new Database(PORTFOLIO_DB_PATH);
    let count = 0;
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO company_facts (
          factId, isin, symbol, metric, value, unit, periodType, periodEnd,
          asOfDate, reportedAt, availableAt, sourceDocumentId, sourceType, provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((rows: IngestedFact[]) => {
        for (const f of rows) {
          const factId = `fact_${identity.isin}_${f.metric}_${f.periodEnd.replace(/[^a-zA-Z0-9]/g, '_')}`;
          stmt.run(
            factId,
            identity.isin,
            identity.nseSymbol || identity.bseCode || '',
            f.metric,
            Number(f.value),
            f.unit,
            f.periodType,
            f.periodEnd,
            f.availableAt,
            f.publishedDate,
            f.availableAt,
            f.sourceDocumentId || disclosure.sourceName,
            f.sourceType || disclosure.sourceType,
            'DISCLOSURE_INGESTION'
          );
          count++;
        }
      });

      insertMany(facts);
    } catch (e) {
      console.warn('[CompanyRefreshCoordinator] Failed to insert company_facts:', e);
    } finally {
      try { db.close(); } catch {}
    }
    return count;
  }

  private async persistIngestedEvents(
    identity: SecurityIdentity,
    events: IngestedCorporateEvent[],
    disclosure: IngestedDisclosurePayload
  ): Promise<number> {
    const db = new Database(PORTFOLIO_DB_PATH);
    let count = 0;
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO corporate_events (
          eventId, isin, symbol, eventType, headline, eventDate, description,
          sourceUrl, impactScope, verificationStatus, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((rows: IngestedCorporateEvent[]) => {
        for (const ev of rows) {
          // Deterministic event identity: hash stable event inputs, never use Date.now()
          const identityPreimage = [
            identity.isin,
            ev.eventType,
            ev.eventDate,
            ev.headline.trim().toLowerCase().substring(0, 80),
            disclosure.sourceUrl || '',
          ].join('|');
          const eventId = `ev_${crypto.createHash('sha256').update(identityPreimage).digest('hex').substring(0, 16)}`;
          stmt.run(
            eventId,
            identity.isin,
            identity.nseSymbol || identity.bseCode || '',
            ev.eventType,
            ev.headline,
            ev.eventDate,
            ev.description,
            ev.sourceUrl || disclosure.sourceUrl || '',
            ev.impactScope || 'MATERIAL',
            'VERIFIED',
            new Date().toISOString()
          );
          count++;
        }
      });

      insertMany(events);
    } catch (e) {
      console.warn('[CompanyRefreshCoordinator] Failed to insert corporate_events:', e);
    } finally {
      try { db.close(); } catch {}
    }
    return count;
  }

  private evaluateWatchRules(
    identity: SecurityIdentity,
    response: CompanyIntelligenceResponse,
    timelineEvents: any[] = []
  ): { evaluations: WatchEvaluation[]; triggered: WatchEvent[] } {
    const evaluations: WatchEvaluation[] = [];
    const triggered: WatchEvent[] = [];

    const isin = identity.isin;
    const rules = this.watchRules.get(isin) || [];
    const now = new Date().toISOString();

    const snapshot = response.snapshot;
    const facts = snapshot?.facts || {};

    for (const rule of rules) {
      let isTriggered = false;
      let observedValue: any = null;
      let triggerReason = '';
      let triggeringEvidenceIds: string[] = [];

      if (rule.subjectType === 'METRIC') {
        const fact = facts[rule.subject];
        if (fact && fact.value !== undefined) {
          observedValue = fact.value;
          const numObs = Number(observedValue);
          const numThresh = Number(rule.threshold);

          if (!isNaN(numObs) && !isNaN(numThresh)) {
            if (rule.operator === 'BELOW_THRESHOLD' && numObs < numThresh) {
              isTriggered = true;
              triggerReason = `Metric ${rule.subject} observed at ${numObs} ${rule.unit || ''} (below threshold ${numThresh})`;
            } else if (rule.operator === 'ABOVE_THRESHOLD' && numObs > numThresh) {
              isTriggered = true;
              triggerReason = `Metric ${rule.subject} observed at ${numObs} ${rule.unit || ''} (above threshold ${numThresh})`;
            } else if (rule.operator === 'MAINTAIN_ABOVE' && numObs >= numThresh) {
              isTriggered = true;
              triggerReason = `Metric ${rule.subject} maintained at ${numObs} >= ${numThresh}`;
            }
            // Carry evidence IDs from the triggering fact
            if (isTriggered && fact.evidenceRef?.evidenceId) {
              triggeringEvidenceIds = [fact.evidenceRef.evidenceId];
            }
          }
        }
      } else if (rule.subjectType === 'EVENT') {
        // EVENT watches inspect Timeline/CompanyEvents — NOT analytical Delta
        const matchingEvent = timelineEvents.find(
          (ev: any) =>
            ev.eventType === rule.subject ||
            ev.title?.toLowerCase().includes(rule.subject.toLowerCase())
        );
        if (matchingEvent) {
          isTriggered = true;
          observedValue = matchingEvent.title || 'Event Occurred';
          triggerReason = `Event watch triggered: ${observedValue}`;
          // Carry evidence IDs from the triggering CompanyEvent
          if (matchingEvent.evidenceRefs?.length > 0) {
            triggeringEvidenceIds = matchingEvent.evidenceRefs
              .map((r: any) => r.evidenceId)
              .filter(Boolean);
          }
          if (triggeringEvidenceIds.length === 0) {
            triggeringEvidenceIds = matchingEvent.eventId ? [matchingEvent.eventId] : [];
          }
        }
      }

      // Stateful transition: only emit alert on state changes
      const prevEval = this.lastEvaluations.get(rule.watchId);
      const previousState: WatchEvaluation['previousState'] =
        prevEval ? prevEval.currentState : 'UNKNOWN';
      const currentState: WatchEvaluation['currentState'] =
        isTriggered ? 'TRIGGERED' : 'SATISFIED';

      const evaluation: WatchEvaluation = {
        watchId: rule.watchId,
        securityId: rule.securityId,
        symbol: rule.symbol,
        evaluatedAt: now,
        previousState,
        currentState,
        triggeringEvidenceIds,
        explanation: isTriggered
          ? triggerReason
          : `Watch rule ${rule.watchId} evaluated — no threshold breach`,
      };
      evaluations.push(evaluation);
      this.lastEvaluations.set(rule.watchId, evaluation);

      // Only emit a WatchEvent when state TRANSITIONS (not on repeated identical state)
      const isTransition = previousState !== currentState;
      if (isTriggered && isTransition) {
        // Deterministic watch event identity: hash watchId + triggeringSnapshot + evidenceIds
        const watchIdentityPreimage = [
          rule.watchId,
          response.snapshot?.snapshotId || isin,
          currentState,
          triggeringEvidenceIds.join(','),
        ].join('|');
        const watchEventId = `we_${crypto.createHash('sha256').update(watchIdentityPreimage).digest('hex').substring(0, 16)}`;

        triggered.push({
          eventId: watchEventId,
          watchId: rule.watchId,
          securityId: rule.securityId,
          symbol: rule.symbol,
          occurredAt: now,
          summary: triggerReason,
          severity: 'ALERT' as const,
          evidenceIds: triggeringEvidenceIds,
        });
      }
    }

    return { evaluations, triggered };
  }
}
