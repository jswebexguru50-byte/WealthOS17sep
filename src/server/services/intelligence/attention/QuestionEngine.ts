/**
 * QuestionEngine.ts — Wave 3 Agent E
 *
 * Generates investigation questions from detected evidence patterns.
 *
 * Design principle:
 * PATTERN DETECTION (deterministic) → QUESTION INTENT → LLM WORDING
 *
 * The engine NEVER calls an LLM directly to "generate investment questions."
 * It detects specific situations, assigns an intent, and produces a structured
 * question from a template. LLM may refine the final wording downstream.
 */

import {
  InvestigationQuestion,
  QuestionIntent,
} from '../contracts/AttentionContracts.js';
import { Contradiction } from '../contracts/ContradictionContracts.js';
import { IntelligenceDelta } from '../contracts/DeltaContracts.js';
import { CommitmentStatus } from '../contracts/ManagementContracts.js';
import { EvidenceReference } from '../contracts/Provenance.js';
import crypto from 'crypto';

// ─── Input ────────────────────────────────────────────────────────────────────

export interface QuestionInput {
  symbol: string;
  securityId: string;

  contradictions?: Contradiction[];
  materialDeltas?: IntelligenceDelta[];
  missedCommitments?: Array<{
    metric: string | null;
    status: CommitmentStatus;
    explanation?: string;
  }>;
  thesisPillarQuestions?: Array<{ pillar: string; unansweredQuestions: string[] }>;
  dataGaps?: Array<{ metric: string; reason: string }>;
}

// ─── Template Map (intent → question wording) ─────────────────────────────────

const QUESTION_TEMPLATES: Record<QuestionIntent, (context: Record<string, string>) => string> = {
  INVESTIGATE_CASH_CONVERSION: (c) =>
    `Why has cash conversion weakened despite ${c.patGrowth || 'reported profit growth'}? How much of the CFO shortfall is attributable to receivables vs inventory vs payables?`,

  INVESTIGATE_CAPEX_RETURNS: (c) =>
    `The company is investing ₹${c.capex || 'significant'} cr in capacity. What is the expected ROCE on this incremental capital, and over what payback period?`,

  INVESTIGATE_MANAGEMENT_COMMITMENT: (c) =>
    `Management guided ${c.commitment || 'a specific target'}. Actual was ${c.actual || 'below guidance'}. What explains the gap, and has the committed timeline been revised?`,

  INVESTIGATE_MARGIN_SUSTAINABILITY: (c) =>
    `EBITDA margin changed ${c.marginChange || 'materially'}. Is this structural (mix/pricing) or transient (input costs/one-offs)? What does the forward trajectory look like?`,

  INVESTIGATE_DEBT_TRAJECTORY: (c) =>
    `Net debt is ${c.debtTrend || 'rising'} despite management's deleveraging narrative. What drove the increase, and what is the realistic debt-free timeline?`,

  INVESTIGATE_DEMAND_INDICATORS: (c) =>
    `Management describes demand as ${c.demandDesc || 'healthy'}, but the order book declined ${c.orderBookDecline || 'materially'}. What is the current demand environment by geography/segment?`,

  INVESTIGATE_VALUATION_PREMIUM: (c) =>
    `The stock trades at ${c.percentile || 'an elevated'} percentile vs its own history (${c.valuationNote || 'above median'}). What warrants this premium, and what assumptions must hold to sustain it?`,

  INVESTIGATE_COMPETITOR_IMPACT: (c) =>
    `Market share or pricing may be under pressure. How is competitive intensity changing in ${c.segment || 'the key segment'}?`,

  INVESTIGATE_REGULATORY_EXPOSURE: (c) =>
    `There is regulatory exposure in ${c.area || 'the business'}. What is the financial impact and management's preparation strategy?`,

  INVESTIGATE_WORKING_CAPITAL: (c) =>
    `Working capital days expanded from ${c.prior || 'prior period'} to ${c.current || 'current period'}. Is this seasonal or structural? How does this compare to the company's stated targets?`,

  OTHER: (c) =>
    c.customQuestion || 'What additional evidence or management clarification is required to resolve this open question?',
};

// ─── Engine ───────────────────────────────────────────────────────────────────

export class QuestionEngine {
  private static instance: QuestionEngine;

  private constructor() {}

  public static getInstance(): QuestionEngine {
    if (!QuestionEngine.instance) {
      QuestionEngine.instance = new QuestionEngine();
    }
    return QuestionEngine.instance;
  }

  /**
   * Generate investigation questions from evidence patterns.
   * Step 1: Detect pattern (deterministic).
   * Step 2: Assign intent (deterministic).
   * Step 3: Generate wording from template (deterministic; LLM can refine downstream).
   */
  public generate(input: QuestionInput): InvestigationQuestion[] {
    const questions: InvestigationQuestion[] = [];
    const now = new Date().toISOString();

    // ── Pattern: Contradiction → Question ──────────────────────────────────

    for (const con of (input.contradictions || [])) {
      if (con.status !== 'OPEN') continue;

      let intent: QuestionIntent = 'OTHER';
      let context: Record<string, string> = {};
      let evidence: EvidenceReference[] = con.evidence;

      switch (con.patternId) {
        case 'PAT_VS_CFO':
          intent = 'INVESTIGATE_CASH_CONVERSION';
          context = {};
          break;
        case 'GUIDANCE_VS_ACTUAL':
          intent = 'INVESTIGATE_MANAGEMENT_COMMITMENT';
          context = { commitment: con.observationA, actual: con.observationB };
          break;
        case 'DELEVERAGING_CLAIM_VS_DEBT':
          intent = 'INVESTIGATE_DEBT_TRAJECTORY';
          context = { debtTrend: 'rising despite deleveraging narrative' };
          break;
        case 'DEMAND_NARRATIVE_VS_KPI':
          intent = 'INVESTIGATE_DEMAND_INDICATORS';
          context = {};
          break;
        case 'CAPACITY_VS_UTILISATION':
          intent = 'INVESTIGATE_CAPEX_RETURNS';
          context = {};
          break;
        case 'GROWTH_VS_WORKING_CAPITAL':
          intent = 'INVESTIGATE_WORKING_CAPITAL';
          context = {};
          break;
      }

      questions.push({
        questionId: crypto.randomUUID(),
        intent,
        question: QUESTION_TEMPLATES[intent](context),
        triggerEvidence: evidence,
        priority: con.severity === 'MATERIAL' ? 'HIGH' : 'MEDIUM',
        generatedAt: now,
      });
    }

    // ── Pattern: Material delta on primary driver → Question ───────────────

    for (const delta of (input.materialDeltas || [])) {
      if (delta.materiality !== 'HIGH' || !delta.affectsThesis) continue;

      let intent: QuestionIntent = 'INVESTIGATE_MARGIN_SUSTAINABILITY';
      let context: Record<string, string> = {};

      if (delta.metric?.includes('margin')) {
        intent = 'INVESTIGATE_MARGIN_SUSTAINABILITY';
        context = { marginChange: delta.explanation };
      } else if (delta.metric?.includes('debt')) {
        intent = 'INVESTIGATE_DEBT_TRAJECTORY';
        context = { debtTrend: delta.direction === 'DETERIORATED' ? 'rising' : 'falling' };
      } else if (delta.metric?.includes('cfo') || delta.metric?.includes('cash')) {
        intent = 'INVESTIGATE_CASH_CONVERSION';
      }

      questions.push({
        questionId: crypto.randomUUID(),
        intent,
        question: QUESTION_TEMPLATES[intent](context),
        triggerEvidence: delta.evidence,
        relatedDriverIds: delta.affectedDriverIds,
        priority: 'HIGH',
        generatedAt: now,
      });
    }

    // ── Pattern: Missed commitment → Question ──────────────────────────────

    for (const c of (input.missedCommitments || [])) {
      if (c.status !== 'MISSED') continue;
      const context = { commitment: c.metric || 'the target', actual: c.explanation || 'below guidance' };
      questions.push({
        questionId: crypto.randomUUID(),
        intent: 'INVESTIGATE_MANAGEMENT_COMMITMENT',
        question: QUESTION_TEMPLATES['INVESTIGATE_MANAGEMENT_COMMITMENT'](context),
        triggerEvidence: [],
        priority: 'HIGH',
        generatedAt: now,
      });
    }

    // ── Pattern: Thesis unanswered questions ───────────────────────────────

    for (const t of (input.thesisPillarQuestions || [])) {
      for (const q of t.unansweredQuestions) {
        questions.push({
          questionId: crypto.randomUUID(),
          intent: 'OTHER',
          question: q,
          triggerEvidence: [],
          priority: 'MEDIUM',
          generatedAt: now,
        });
      }
    }

    // ── Pattern: Important data gap → Question ────────────────────────────

    for (const gap of (input.dataGaps || [])) {
      questions.push({
        questionId: crypto.randomUUID(),
        intent: 'OTHER',
        question: `Data gap on ${gap.metric}: ${gap.reason}. What is the best available source to obtain this data?`,
        triggerEvidence: [],
        priority: 'LOW',
        generatedAt: now,
      });
    }

    // Sort by priority
    const score = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return questions.sort((a, b) => (score[b.priority] || 0) - (score[a.priority] || 0));
  }
}
