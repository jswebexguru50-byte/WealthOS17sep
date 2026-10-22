/**
 * AttentionEngine.ts — Wave 3 Agent E
 *
 * Generates explainable attention signals from detected issues.
 *
 * Constitution invariants:
 * - C15: No opaque attention score — reason chains only
 * - C18: Change is more useful than static state
 * - Priority is determined by: materiality + driver relevance + thesis relevance
 * - No numeric "attention score" (83.72 etc.) is produced
 */

import {
  AttentionItem,
  AttentionResult,
  AttentionSignal,
} from '../contracts/AttentionContracts.js';
import { IntelligenceDelta } from '../contracts/DeltaContracts.js';
import { Contradiction } from '../contracts/ContradictionContracts.js';
import { CommitmentStatus } from '../contracts/ManagementContracts.js';
import crypto from 'crypto';

// ─── Input ────────────────────────────────────────────────────────────────────

export interface AttentionInput {
  symbol: string;
  securityId: string;

  materialDeltas?: IntelligenceDelta[];
  openContradictions?: Contradiction[];

  missedCommitments?: Array<{
    originalStatement: string;
    metric: string | null;
    status: CommitmentStatus;
    explanation?: string;
    affectsDriver?: string;
  }>;

  dueCommitments?: Array<{
    originalStatement: string;
    metric: string | null;
    targetPeriod: string | null;
  }>;

  thesisWeakened?: Array<{
    pillarTitle: string;
    explanation: string;
  }>;

  thesisStrengthened?: Array<{
    pillarTitle: string;
    explanation: string;
  }>;

  valuationExtreme?: {
    metric: string;
    currentPercentile: number;
    contextNote: string;
  } | null;

  importantDataGaps?: Array<{
    metric: string;
    reason: string;
  }>;

  primaryDriverIds?: string[];
}

// ─── Engine ────────────────────────────────────────────────────────────────────

export class AttentionEngine {
  private static instance: AttentionEngine;

  private constructor() {}

  public static getInstance(): AttentionEngine {
    if (!AttentionEngine.instance) {
      AttentionEngine.instance = new AttentionEngine();
    }
    return AttentionEngine.instance;
  }

  public evaluate(input: AttentionInput): AttentionResult {
    const items: AttentionItem[] = [];
    const now = new Date().toISOString();

    // 1. Material deltas (fundamental changes)
    for (const delta of (input.materialDeltas || [])) {
      if (delta.materiality !== 'HIGH' && delta.materiality !== 'MEDIUM') continue;

      const reasonChain: string[] = [delta.explanation];
      if (delta.affectsThesis) reasonChain.push('Affects a PRIMARY business driver or thesis pillar.');
      if (delta.materiality === 'HIGH') reasonChain.push('Classified as HIGH materiality by metric-specific threshold.');

      items.push({
        itemId: crypto.randomUUID(),
        signal: 'MATERIAL_FUNDAMENTAL_CHANGE',
        headline: `${delta.item}: ${delta.direction === 'IMPROVED' ? '↑' : '↓'} ${delta.explanation.split(' ').slice(0, 8).join(' ')}`,
        reasonChain,
        materiality: delta.materiality,
        category: delta.category,
        relatedEvidenceIds: delta.evidence.map(e => e.evidenceId),
        detectedAt: now,
      });
    }

    // 2. Missed commitments
    for (const c of (input.missedCommitments || [])) {
      const isMissed = c.status === 'MISSED' || c.status === 'PARTIALLY_ACHIEVED';
      if (!isMissed) continue;

      const reasonChain = [
        c.explanation || `Management commitment ${c.status.toLowerCase().replace('_', ' ')}.`,
      ];
      if (c.affectsDriver) reasonChain.push(`Affects primary business driver: ${c.affectsDriver}.`);
      if (c.status === 'MISSED') reasonChain.push('Commitment was completely missed — not partially achieved.');

      items.push({
        itemId: crypto.randomUUID(),
        signal: 'MANAGEMENT_COMMITMENT_MISSED',
        headline: `Management commitment missed: ${(c.metric || c.originalStatement).substring(0, 60)}`,
        reasonChain,
        materiality: c.status === 'MISSED' ? 'HIGH' : 'MEDIUM',
        category: 'MANAGEMENT',
        relatedEvidenceIds: [],
        detectedAt: now,
      });
    }

    // 3. Due commitments
    for (const c of (input.dueCommitments || [])) {
      items.push({
        itemId: crypto.randomUUID(),
        signal: 'MANAGEMENT_COMMITMENT_DUE',
        headline: `Commitment due: ${(c.metric || c.originalStatement).substring(0, 60)}`,
        reasonChain: [
          `Management commitment due by ${c.targetPeriod || 'imminent period'}.`,
          'Verify actual delivery against commitment.',
        ],
        materiality: 'MEDIUM',
        category: 'MANAGEMENT',
        relatedEvidenceIds: [],
        detectedAt: now,
      });
    }

    // 4. Open contradictions
    for (const con of (input.openContradictions || [])) {
      if (con.status !== 'OPEN') continue;
      items.push({
        itemId: crypto.randomUUID(),
        signal: 'NEW_CONTRADICTION',
        headline: `Contradiction: ${con.explanation.substring(0, 80)}`,
        reasonChain: [
          con.observationA,
          con.observationB,
          `Severity: ${con.severity}. Status: OPEN (not yet explained or resolved).`,
        ],
        materiality: con.severity === 'MATERIAL' ? 'HIGH' : con.severity === 'WATCH' ? 'MEDIUM' : 'LOW',
        category: 'RISK',
        relatedEvidenceIds: con.evidence.map(e => e.evidenceId),
        detectedAt: now,
      });
    }

    // 5. Thesis weakened
    for (const t of (input.thesisWeakened || [])) {
      items.push({
        itemId: crypto.randomUUID(),
        signal: 'THESIS_WEAKENED',
        headline: `Thesis pillar challenged: "${t.pillarTitle}"`,
        reasonChain: [t.explanation, 'Review thesis assumptions and unanswered questions.'],
        materiality: 'HIGH',
        category: 'THESIS',
        relatedEvidenceIds: [],
        detectedAt: now,
      });
    }

    // 6. Thesis strengthened
    for (const t of (input.thesisStrengthened || [])) {
      items.push({
        itemId: crypto.randomUUID(),
        signal: 'THESIS_STRENGTHENED',
        headline: `Thesis pillar supported: "${t.pillarTitle}"`,
        reasonChain: [t.explanation],
        materiality: 'MEDIUM',
        category: 'THESIS',
        relatedEvidenceIds: [],
        detectedAt: now,
      });
    }

    // 7. Valuation extreme
    if (input.valuationExtreme) {
      const v = input.valuationExtreme;
      const isExtreme = v.currentPercentile >= 90 || v.currentPercentile <= 10;
      if (isExtreme) {
        items.push({
          itemId: crypto.randomUUID(),
          signal: 'VALUATION_EXTREME',
          headline: `Valuation at ${v.currentPercentile}th percentile (${v.metric})`,
          reasonChain: [v.contextNote, `${v.currentPercentile}th percentile vs 1Y history.`],
          materiality: 'MEDIUM',
          category: 'VALUATION',
          relatedEvidenceIds: [],
          detectedAt: now,
        });
      }
    }

    // 8. Important data gaps
    for (const gap of (input.importantDataGaps || [])) {
      items.push({
        itemId: crypto.randomUUID(),
        signal: 'IMPORTANT_DATA_GAP',
        headline: `Data gap: ${gap.metric}`,
        reasonChain: [gap.reason, 'Verify if data is available from an alternative source.'],
        materiality: 'LOW',
        category: 'DATA',
        relatedEvidenceIds: [],
        detectedAt: now,
      });
    }

    // Sort: HIGH materiality first, then MEDIUM, then LOW
    const sorted = items.sort((a, b) => {
      const score = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (score[b.materiality] || 0) - (score[a.materiality] || 0);
    });

    return {
      securityId: input.securityId,
      symbol: input.symbol,
      items: sorted,
      highCount: sorted.filter(i => i.materiality === 'HIGH').length,
      evaluatedAt: now,
    };
  }
}
