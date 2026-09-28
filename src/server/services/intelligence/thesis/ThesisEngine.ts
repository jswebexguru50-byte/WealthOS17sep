/**
 * ThesisEngine.ts — P0 New
 *
 * Living Investment Thesis — evidence-driven, never recommendation-making.
 *
 * Design:
 * - Pillars come from business driver definitions + management commitments
 * - Status is derived deterministically from supporting vs contradicting evidence
 * - Never produces BUY/SELL/HOLD
 * - History is preserved: new evidence updates, never silently replaces
 * - Persisted in company_thesis table
 */

import crypto from 'crypto';
import { getDB } from '../../../database.js';
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
}

// ─── Pillar builders by sector ────────────────────────────────────────────────

const SECTOR_THESIS_TEMPLATES: Record<string, Array<{ title: string; proposition: string; relatedMetrics: string[]; assumptions: string[] }>> = {
  BANK: [
    { title: 'Loan Growth Quality',
      proposition: 'Loan book grows while maintaining asset quality',
      relatedMetrics: ['loan_book_cr', 'loan_growth_yoy', 'gnpa_pct', 'nnpa_pct'],
      assumptions: ['Credit underwriting standards remain consistent', 'Macro environment does not sharply deteriorate'] },
    { title: 'Margin Resilience',
      proposition: 'Net interest margin stays stable through rate and competitive cycles',
      relatedMetrics: ['nim_pct'],
      assumptions: ['CASA franchise provides funding cost advantage'] },
    { title: 'Capital Adequacy',
      proposition: 'Capital buffer supports growth ambitions without dilution',
      relatedMetrics: ['capital_adequacy_pct', 'roe_pct'],
      assumptions: ['RBI regulatory norms maintained'] },
  ],
  IT_SERVICES: [
    { title: 'Revenue Momentum',
      proposition: 'CC revenue growth reflects genuine demand expansion, not just currency',
      relatedMetrics: ['cc_revenue_growth_yoy', 'revenue_growth_yoy'],
      assumptions: ['Client spend on technology remains resilient'] },
    { title: 'Deal Pipeline Strength',
      proposition: 'Large deal TCV sustains medium-term revenue visibility',
      relatedMetrics: ['large_deal_tcv_cr', 'deal_tcv_cr'],
      assumptions: ['Deal ramp-ups follow historical patterns'] },
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
      proposition: 'Free cash flow converts to debt reduction',
      relatedMetrics: ['net_debt_cr', 'cfo_cr'],
      assumptions: ['No major acquisitions or unexpected capex overruns'] },
  ],
  NBFC: [
    { title: 'AUM Growth Quality',
      proposition: 'Loan book grows in targeted segments without credit deterioration',
      relatedMetrics: ['aum_cr', 'gnpa_pct'],
      assumptions: ['Target segment demand stable'] },
    { title: 'Spread Sustainability',
      proposition: 'NIM or spread remains healthy through funding cost cycles',
      relatedMetrics: ['nim_pct', 'cost_of_funds_pct'],
      assumptions: ['Funding access not disrupted'] },
  ],
};

// ─── Engine ──────────────────────────────────────────────────────────────────

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
    const now = new Date().toISOString();
    const { state, primaryDrivers, openContradictions, materialDeltas } = input;

    // 1. Get sector template
    const templates = SECTOR_THESIS_TEMPLATES[state.businessModel] ?? SECTOR_THESIS_TEMPLATES['MANUFACTURING'];
    const patternsEvaluable = templates.length;
    let patternsEvaluated = 0;

    // 2. Load prior thesis for delta comparison
    const priorThesis = await this.loadPriorThesis(state.securityId);
    const changes: ThesisChange[] = [];
    const limitations: string[] = [];

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
    const thesisId = crypto.createHash('sha256')
      .update(`${state.securityId}:${state.asOfDate}`)
      .digest('hex')
      .substring(0, 16);

    const thesis: CompanyThesis = {
      thesisId,
      securityId: state.securityId,
      asOfDate: state.asOfDate,
      summary,
      thesisPillars: pillars,
      catalysts: [],   // Catalyst Intelligence is Wave 5+
      risks: openContradictions.map(c => ({
        title: c.observationB.substring(0, 60),
        explanation: c.explanation,
        evidence: c.evidence,
      })),
      disconfirmingEvidence,
      unresolvedQuestions,
      thesisChanges: changes,
      evidence: pillars.flatMap(p => p.supportingEvidence).slice(0, 10),
      previousThesisHash: priorThesis?.thesisId,
      createdAt: priorThesis?.createdAt ?? now,
      updatedAt: now,
    };

    // 9. Persist
    await this.persistThesis(thesis);

    const coverage = patternsEvaluated >= templates.length * 0.8 ? 'FULL'
      : patternsEvaluated >= templates.length * 0.4 ? 'PARTIAL'
      : 'MINIMAL';

    return {
      thesis,
      pillars,
      changes,
      evaluatedAt: now,
      coverage,
      limitations,
      patternsEvaluable,
      patternsEvaluated,
    };
  }

  // ─── Pillar Builder ─────────────────────────────────────────────────────────

  private buildPillar(
    template: { title: string; proposition: string; relatedMetrics: string[]; assumptions: string[] },
    state: CompanyAnalyticalState,
    drivers: BusinessDriver[],
    contradictions: Contradiction[],
    deltas: IntelligenceDelta[],
    now: string,
  ): { pillar: ThesisPillar; evaluated: boolean } {

    const pillarId = `${state.securityId}_${template.title.replace(/\s+/g, '_').toLowerCase()}`;

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

    // Determine status
    let status: ThesisPillarStatus = 'UNKNOWN';
    let explanation = 'Insufficient evidence to assess this pillar.';
    let evaluated = false;

    if (relatedDriver) {
      evaluated = true;
      if (contradictingEvidence.length > 0) {
        status = 'CHALLENGED';
        explanation = `${template.title}: Evidence supports this pillar, but ${contradictingEvidence.length} active contradiction(s) raise concerns.`;
      } else if (relatedDriver.direction === 'IMPROVING' || relatedDriver.direction === 'STABLE') {
        status = supportingEvidence.length >= 2 ? 'SUPPORTED' : 'PARTIALLY_SUPPORTED';
        explanation = `${template.title}: ${relatedDriver.description || template.proposition}. Direction: ${relatedDriver.direction}.`;
      } else if (relatedDriver.direction === 'DETERIORATING') {
        status = 'CHALLENGED';
        explanation = `${template.title}: Driver is deteriorating — ${relatedDriver.name} shows ${relatedDriver.direction}.`;
      } else {
        status = 'PARTIALLY_SUPPORTED';
        explanation = `${template.title}: Driver exists but direction unclear (${relatedDriver.direction}).`;
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
      },
      evaluated,
    };
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  private async loadPriorThesis(securityId: string): Promise<CompanyThesis | null> {
    const db = getDB();
    if (!db) return null;
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS company_thesis (
          thesis_id TEXT PRIMARY KEY,
          security_id TEXT NOT NULL,
          thesis_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      const row = db.prepare(`
        SELECT thesis_json FROM company_thesis
        WHERE security_id = ? ORDER BY updated_at DESC LIMIT 1
      `).get(securityId) as unknown as { thesis_json: string } | undefined;

      return row ? JSON.parse(row.thesis_json) : null;
    } catch { return null; }
  }

  private async persistThesis(thesis: CompanyThesis): Promise<void> {
    const db = getDB();
    if (!db) return;
    try {
      db.prepare(`
        INSERT OR REPLACE INTO company_thesis (thesis_id, security_id, thesis_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        thesis.thesisId,
        thesis.securityId,
        JSON.stringify(thesis),
        thesis.createdAt,
        thesis.updatedAt,
      );
    } catch { /* Non-fatal */ }
  }
}
