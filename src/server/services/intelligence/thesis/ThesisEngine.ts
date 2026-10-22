/**
 * ThesisEngine.ts — P0 / P0.1 Fix
 *
 * Living Investment Thesis — evidence-driven, never recommendation-making.
 *
 * Design:
 * - Pillars come from business driver definitions + management commitments
 * - Status is derived deterministically from supporting vs contradicting evidence
 * - Evaluates proposition truth strictly (STABLE does not imply SUPPORT if proposition expects growth)
 * - Never produces BUY/SELL/HOLD
 * - Immutable thesis revisions persisted via ThesisRevisionStore only when requested (persist: true)
 */

import crypto from 'crypto';
import {
  CompanyThesis,
  ThesisPillar,
  ThesisPillarStatus,
  ThesisChange,
  ThesisChangeType,
} from '../contracts/ThesisContracts.js';
import { EvidenceReference } from '../contracts/Provenance.js';
import { CompanyAnalyticalState } from '../assembler/CompanyAnalyticalStateAssembler.js';
import { BusinessDriver } from '../contracts/BusinessDriverContracts.js';
import { Contradiction } from '../contracts/ContradictionContracts.js';
import { IntelligenceDelta } from '../contracts/DeltaContracts.js';
import { ThesisRevisionStore } from './ThesisRevisionStore.js';

// ─── Thesis Payload ─────────────────────────────────────────────────────────

export interface ThesisPayload {
  thesis: CompanyThesis | null;
  pillars: ThesisPillar[];
  changes: ThesisChange[];
  evaluatedAt: string;
  coverage: 'FULL' | 'PARTIAL' | 'MINIMAL';
  limitations: string[];
  patternsEvaluable: number;
  patternsEvaluated: number;
}

// ─── Input ───────────────────────────────────────────────────────────────────

export interface ThesisEngineInput {
  state: CompanyAnalyticalState;
  primaryDrivers: BusinessDriver[];
  openContradictions: Contradiction[];
  materialDeltas: IntelligenceDelta[];
  persist?: boolean;
}

// ─── Pillar Template ──────────────────────────────────────────────────────────

interface PillarTemplate {
  title: string;
  proposition: string;
  relatedMetrics: string[];
  assumptions: string[];
}

const SECTOR_PILLAR_TEMPLATES: Record<string, PillarTemplate[]> = {
  BANK: [
    { title: 'Deposit Franchise Strength',
      proposition: 'Low-cost CASA deposit franchise sustains loan growth without margin compression',
      relatedMetrics: ['deposit_cr', 'casa_ratio_pct'],
      assumptions: ['Branch network remains effective at deposit mobilization', 'CASA ratio does not deteriorate significantly'] },
    { title: 'NIM Defense',
      proposition: 'Net interest margin held through pricing power and liability management',
      relatedMetrics: ['nim_pct'],
      assumptions: ['Cost of funds remains stable relative to lending yields', 'No aggressive price competition on prime loans'] },
    { title: 'Underwriting Quality',
      proposition: 'Asset quality remains controlled through the cycle; credit costs within historical bounds',
      relatedMetrics: ['gnpa_pct', 'nnpa_pct', 'credit_cost_pct'],
      assumptions: ['No systemic deterioration in retail or SME borrower health', 'Provision coverage is adequate'] },
    { title: 'Capital Efficiency',
      proposition: 'Capital adequacy supports planned growth without dilutive equity raises',
      relatedMetrics: ['capital_adequacy_pct', 'roe_pct'],
      assumptions: ['Internal capital generation matches balance sheet growth rate'] },
  ],
  IT_SERVICES: [
    { title: 'Growth Momentum & Deal Pipeline',
      proposition: 'Large deal total contract value (TCV) converts to constant-currency revenue growth',
      relatedMetrics: ['large_deal_tcv_cr', 'deal_tcv_cr', 'cc_revenue_growth_yoy'],
      assumptions: ['Deal ramp-ups follow historical patterns', 'Discretionary spending does not freeze'] },
    { title: 'Margin Sustainability',
      proposition: 'EBIT margins held through utilisation, pyramid, and pricing',
      relatedMetrics: ['ebit_margin_pct', 'employee_utilisation_pct', 'attrition_pct'],
      assumptions: ['Wage inflation manageable', 'Offshoring mix maintained'] },
  ],
  MANUFACTURING: [
    { title: 'Volume & Revenue Growth',
      proposition: 'Revenue growth reflects market share and demand, not just price',
      relatedMetrics: ['revenue_cr', 'revenue_growth_yoy'],
      assumptions: ['Demand environment does not sharply weaken'] },
    { title: 'Margin Trajectory',
      proposition: 'Operating margins expand or hold as scale benefits absorb costs',
      relatedMetrics: ['ebitda_margin_pct', 'ebit_margin_pct'],
      assumptions: ['Input costs do not re-accelerate sharply'] },
    { title: 'Capex Returns',
      proposition: 'Capital investment generates returns above cost of capital',
      relatedMetrics: ['capex_cr', 'roce_pct'],
      assumptions: ['Capacity utilisation ramps as guided'] },
    { title: 'Deleveraging / Balance Sheet',
      proposition: 'Operating cash flow reduces leverage toward sustainable targets',
      relatedMetrics: ['net_debt_cr', 'cfo_cr'],
      assumptions: ['Working capital does not absorb excess cash'] },
  ],
};

// ─── Engine ───────────────────────────────────────────────────────────────────

export class ThesisEngine {
  private static instance: ThesisEngine;

  private constructor() {}

  public static getInstance(): ThesisEngine {
    if (!ThesisEngine.instance) {
      ThesisEngine.instance = new ThesisEngine();
    }
    return ThesisEngine.instance;
  }

  public async evaluate(input: ThesisEngineInput): Promise<ThesisPayload> {
    const { state, primaryDrivers, openContradictions, materialDeltas, persist = false } = input;
    const now = new Date().toISOString();

    // 1. Load prior thesis revision (immutable history)
    const priorRevision = await ThesisRevisionStore.getInstance().getLatestRevision(state.securityId);
    const priorThesis = priorRevision?.thesis ?? null;

    // 2. Select pillar templates based on business model
    const templates = SECTOR_PILLAR_TEMPLATES[state.businessModel] ||
                      SECTOR_PILLAR_TEMPLATES.MANUFACTURING;

    let patternsEvaluated = 0;
    const changes: ThesisChange[] = [];

    // 3. Build pillars from templates + actual evidence
    const pillars: ThesisPillar[] = [];

    for (const template of templates) {
      const { pillar, evaluated } = this.buildPillar(
        template,
        state,
        primaryDrivers,
        openContradictions,
        materialDeltas,
        now,
      );
      if (evaluated) patternsEvaluated++;
      pillars.push(pillar);
    }

    // 4. Detect thesis changes vs prior
    if (priorThesis) {
      for (const pillar of pillars) {
        const priorPillar = priorThesis.thesisPillars.find(p => p.pillarId === pillar.pillarId);
        if (!priorPillar) continue;
        if (priorPillar.status !== pillar.status) {
          const changeType: ThesisChangeType =
            pillar.status === 'CHALLENGED' || pillar.status === 'BROKEN' ? 'PILLAR_CHALLENGED'
            : pillar.status === 'SUPPORTED' ? 'STRENGTHENED'
            : 'WEAKENED';

          changes.push({
            changeType,
            affectedPillarId: pillar.pillarId,
            reason: `Pillar "${pillar.title}" changed from ${priorPillar.status} to ${pillar.status}.`,
            asOfDate: now,
            evidence: pillar.contradictingEvidence.slice(0, 2),
          });
        }
      }
    }

    // 5. Disconfirming evidence (from contradictions)
    const disconfirmingEvidence = openContradictions.map(con => ({
      title: `Contradiction: ${con.patternId.replace(/_/g, ' ')}`,
      explanation: con.explanation,
      evidence: con.evidence,
    }));

    // 6. Unresolved questions from unanswered pillar questions
    const unresolvedQuestions = pillars
      .flatMap(p => p.unansweredQuestions.map(q => ({
        question: q,
        relevance: `Relevant to pillar: ${p.title}`,
      })));

    // 7. Build thesis summary
    const challengedCount = pillars.filter(p => p.status === 'CHALLENGED' || p.status === 'BROKEN').length;
    const supportedCount = pillars.filter(p => p.status === 'SUPPORTED' || p.status === 'PARTIALLY_SUPPORTED').length;

    const summary = challengedCount === 0 && supportedCount >= pillars.length * 0.7
      ? `${state.symbol} thesis pillars largely supported by available evidence.`
      : challengedCount > 0
      ? `${state.symbol} has ${challengedCount} challenged thesis pillar(s) requiring attention.`
      : `${state.symbol} thesis has partial evidence — key pillars remain to be verified.`;

    // 8. Construct thesis object
    // Deterministic thesis identity: sha256(securityId + "THESIS_V2"), truncated to 16 hex chars.
    // The same security always maps to the same thesis lineage — randomUUID() is explicitly forbidden.
    const thesisId = priorRevision?.revisionId ||
      crypto.createHash('sha256').update(`${state.securityId}:THESIS_V2`).digest('hex').substring(0, 16);

    const thesis: CompanyThesis = {
      thesisId,
      securityId: state.securityId,
      asOfDate: state.asOfDate,
      summary,
      thesisPillars: pillars,
      catalysts: [],
      risks: openContradictions.map(c => ({
        title: c.observationB.substring(0, 60),
        explanation: c.explanation,
        evidence: c.evidence,
      })),
      disconfirmingEvidence,
      unresolvedQuestions,
      thesisChanges: changes,
      evidence: pillars.flatMap(p => p.supportingEvidence).slice(0, 10),
      previousThesisHash: priorRevision?.stateHash,
      createdAt: priorThesis?.createdAt ?? now,
      updatedAt: now,
    };

    // 9. Persist revision ONLY if requested (Explicit flow: Read does NOT mutate)
    if (persist) {
      await ThesisRevisionStore.getInstance().saveIfChanged(
        state.securityId,
        state.asOfDate || now.split('T')[0],
        thesis
      );
    }

    const coverage = patternsEvaluated >= templates.length * 0.8 ? 'FULL'
      : patternsEvaluated >= templates.length * 0.4 ? 'PARTIAL'
      : 'MINIMAL';

    return {
      thesis,
      pillars,
      changes,
      evaluatedAt: now,
      coverage,
      limitations: state.evidenceCoverage.limitations,
      patternsEvaluable: templates.length,
      patternsEvaluated,
    };
  }

  // ─── Private: build individual pillar ───────────────────────────────────────

  private buildPillar(
    template: PillarTemplate,
    state: CompanyAnalyticalState,
    drivers: BusinessDriver[],
    contradictions: Contradiction[],
    deltas: IntelligenceDelta[],
    now: string,
  ): { pillar: ThesisPillar; evaluated: boolean } {
    const pillarId = crypto.createHash('sha256')
      .update(`${template.title}:${state.securityId}`)
      .digest('hex')
      .substring(0, 12);

    // Find related driver
    const relatedDriver = drivers.find(d =>
      template.relatedMetrics.some(m => d.relatedMetrics.includes(m))
    );

    // Find contradicting evidence from contradictions
    const contradictingEvidence: EvidenceReference[] = contradictions
      .filter(c => c.status === 'OPEN')
      .filter(c => template.relatedMetrics.some(m => c.observationA.toLowerCase().includes(m) || c.observationB.toLowerCase().includes(m)))
      .flatMap(c => c.evidence)
      .slice(0, 3);

    // Find supporting evidence from driver
    const supportingEvidence: EvidenceReference[] = (relatedDriver?.evidence ?? []).slice(0, 3);

    // Determine status adhering to Section 11 constitution:
    // A driver being STABLE does NOT automatically imply SUPPORT if the proposition demands active expansion/deleveraging.
    let status: ThesisPillarStatus = 'UNKNOWN';
    let explanation = 'Insufficient evidence to assess this pillar.';
    let evaluated = false;

    const requiresActiveGrowth = /growth|expand|increas|accelerat|reduc|deleverag/i.test(template.proposition);
    const isMaintenanceOrDefense = /sustain|hold|maintain|defend|stable|within/i.test(template.proposition);

    if (relatedDriver) {
      evaluated = true;
      if (contradictingEvidence.length > 0) {
        status = 'CHALLENGED';
        explanation = `${template.title}: Evidence exists for this pillar, but ${contradictingEvidence.length} active contradiction(s) challenge the proposition.`;
      } else if (relatedDriver.direction === 'IMPROVING') {
        status = supportingEvidence.length >= 2 ? 'SUPPORTED' : 'PARTIALLY_SUPPORTED';
        explanation = `${template.title}: ${relatedDriver.name} is improving, supporting the proposition.`;
      } else if (relatedDriver.direction === 'STABLE') {
        if (isMaintenanceOrDefense) {
          status = supportingEvidence.length >= 2 ? 'SUPPORTED' : 'PARTIALLY_SUPPORTED';
          explanation = `${template.title}: ${relatedDriver.name} is stable, satisfying the sustainability proposition.`;
        } else if (requiresActiveGrowth) {
          status = 'PARTIALLY_SUPPORTED';
          explanation = `${template.title}: Metric is stable, but proposition asserts active growth/improvement (${template.proposition}).`;
        } else {
          status = 'PARTIALLY_SUPPORTED';
          explanation = `${template.title}: Driver is stable.`;
        }
      } else if (relatedDriver.direction === 'DETERIORATING') {
        status = 'CHALLENGED';
        explanation = `${template.title}: Driver is deteriorating — ${relatedDriver.name} shows ${relatedDriver.direction}.`;
      } else {
        status = 'PARTIALLY_SUPPORTED';
        explanation = `${template.title}: Driver exists but direction is unclear (${relatedDriver.direction}).`;
      }
    } else {
      // Check if facts available for direct assessment
      const hasAnyFact = template.relatedMetrics.some(m =>
        state.facts.latest[m]?.value !== null && state.facts.latest[m] !== undefined
      );
      if (!hasAnyFact) {
        status = 'UNKNOWN';
        explanation = `No evidence available for ${template.title} metrics: ${template.relatedMetrics.join(', ')}.`;
      }
    }

    // Generate unanswered questions
    const unansweredQuestions: string[] = [];
    if (status === 'UNKNOWN') {
      unansweredQuestions.push(`What data is available to assess "${template.title}"?`);
    }
    if (status === 'CHALLENGED') {
      unansweredQuestions.push(`What explains the contradiction in ${template.title}? Is it temporary or structural?`);
    }
    if (relatedDriver?.direction === 'DETERIORATING') {
      unansweredQuestions.push(`Is the deterioration in ${relatedDriver.name} structural or cyclical?`);
    }

    return {
      pillar: {
        pillarId,
        title: template.title,
        proposition: template.proposition,
        status,
        supportingEvidence,
        contradictingEvidence,
        assumptions: template.assumptions,
        unansweredQuestions,
        explanation,
        kind: supportingEvidence.length > 0 ? (relatedDriver ? 'DERIVED_FACT' : 'FACT') : 'HYPOTHESIS',
        confidence: supportingEvidence.length >= 2 ? 'HIGH' : supportingEvidence.length === 1 ? 'MEDIUM' : 'LOW',
        support: supportingEvidence.length >= 2 ? 'CORROBORATED' : supportingEvidence.length === 1 ? 'DIRECT' : 'UNSUPPORTED',
      },
      evaluated,
    };
  }
}
