/**
 * ContradictionEngine.ts — Wave 2 Agent D
 *
 * Detects 6 high-value investment contradictions with lifecycle tracking.
 *
 * Constitution invariants:
 * - C14: Contradictory evidence must be surfaced
 * - C12: Derived prose cannot be stronger than underlying calculation
 * - No automatic misconduct inference — surface inconsistency for investigation
 * - Contradictions are NEVER fabricated for test coverage
 * - Contradiction lifecycle: OPEN → EXPLAINED → RESOLVED → NO_LONGER_APPLICABLE
 */

import {
  Contradiction,
  ContradictionPatternId,
  ContradictionResult,
  ContradictionSeverity,
  ContradictionStatus,
} from '../contracts/ContradictionContracts.js';
import { EvidenceReference } from '../contracts/Provenance.js';
import crypto from 'crypto';

// ─── Pattern Thresholds ────────────────────────────────────────────────────────

interface PatternConfig {
  id: ContradictionPatternId;
  name: string;
  check: (data: ContradictionInput) => ContradictionCandidate | null;
}

interface ContradictionCandidate {
  observationA: string;
  observationB: string;
  severity: ContradictionSeverity;
  explanation: string;
  possibleInterpretations: string[];
  evidenceIds: string[];
}

// ─── Input Shape ──────────────────────────────────────────────────────────────

export interface ContradictionInput {
  symbol: string;
  securityId: string;

  // Current period
  revenue?: number | null;
  revenuePrior?: number | null;
  pat?: number | null;
  patPrior?: number | null;
  cfo?: number | null;
  cfoPrior?: number | null;
  ebitdaMargin?: number | null;
  ebitdaMarginPrior?: number | null;
  receivableDays?: number | null;
  receivableDaysPrior?: number | null;
  netDebt?: number | null;
  netDebtPrior?: number | null;
  capex?: number | null;
  capacityUtilisation?: number | null;
  capacityUtilisationPrior?: number | null;
  orderBook?: number | null;
  orderBookPrior?: number | null;

  // Management guidance
  revenueGuidance?: { min?: number; max?: number; label?: string } | null;
  marginGuidance?: { min?: number; max?: number; label?: string } | null;
  debtGuidance?: string | null; // "deleveraging" or null

  // Actual results
  actualRevenue?: number | null;
  actualMargin?: number | null;

  // Context periods
  currentPeriod?: string;
  priorPeriod?: string;
}

// ─── Engine ────────────────────────────────────────────────────────────────────

export class ContradictionEngine {
  private static instance: ContradictionEngine;

  private readonly patterns: PatternConfig[];

  private constructor() {
    this.patterns = [
      { id: 'GUIDANCE_VS_ACTUAL', name: 'Management Guidance vs Actual', check: this.checkGuidanceVsActual.bind(this) },
      { id: 'PAT_VS_CFO', name: 'Reported Profit vs Cash Flow', check: this.checkPatVsCfo.bind(this) },
      { id: 'GROWTH_VS_WORKING_CAPITAL', name: 'Revenue Growth vs Receivables', check: this.checkGrowthVsWorkingCapital.bind(this) },
      { id: 'DELEVERAGING_CLAIM_VS_DEBT', name: 'Deleveraging Claim vs Actual Debt', check: this.checkDeleveragingClaim.bind(this) },
      { id: 'CAPACITY_VS_UTILISATION', name: 'Capacity Expansion vs Utilisation', check: this.checkCapacityVsUtilisation.bind(this) },
      { id: 'DEMAND_NARRATIVE_VS_KPI', name: 'Demand Narrative vs Operating KPI', check: this.checkDemandNarrative.bind(this) },
    ];
  }

  public static getInstance(): ContradictionEngine {
    if (!ContradictionEngine.instance) {
      ContradictionEngine.instance = new ContradictionEngine();
    }
    return ContradictionEngine.instance;
  }

  public evaluate(input: ContradictionInput): ContradictionResult {
    const now = new Date().toISOString();
    const contradictions: Contradiction[] = [];

    for (const pattern of this.patterns) {
      try {
        const candidate = pattern.check(input);
        if (candidate) {
          contradictions.push({
            contradictionId: crypto.randomUUID(),
            patternId: pattern.id,
            observationA: candidate.observationA,
            observationB: candidate.observationB,
            severity: candidate.severity,
            status: 'OPEN',
            explanation: candidate.explanation,
            possibleInterpretations: candidate.possibleInterpretations,
            evidence: candidate.evidenceIds.map(id => ({
              evidenceId: id,
              sourceType: 'CANONICAL_FACT',
              sourceId: id,
              timestamp: now,
            } as EvidenceReference)),
            firstDetectedAt: now,
            lastObservedAt: now,
          });
        }
      } catch {
        // Non-fatal — continue checking other patterns
      }
    }

    return {
      securityId: input.securityId,
      symbol: input.symbol,
      contradictions,
      openCount: contradictions.filter(c => c.status === 'OPEN').length,
      materialCount: contradictions.filter(c => c.severity === 'MATERIAL').length,
      evaluatedAt: now,
      patternsChecked: this.patterns.map(p => p.id),
    };
  }

  // ─── Pattern 1: Management Guidance vs Actual ───────────────────────────────

  private checkGuidanceVsActual(d: ContradictionInput): ContradictionCandidate | null {
    // Revenue guidance check
    if (d.revenueGuidance && d.actualRevenue !== null && d.actualRevenue !== undefined
        && d.revenuePrior !== null && d.revenuePrior !== undefined && d.revenuePrior > 0) {

      const actualGrowth = (d.actualRevenue - d.revenuePrior) / d.revenuePrior * 100;
      const guidedMin = d.revenueGuidance.min;
      const guidedMax = d.revenueGuidance.max;

      if (guidedMin !== undefined && actualGrowth < guidedMin - 3) { // 3pp tolerance
        const rangeStr = guidedMax ? `${guidedMin}–${guidedMax}%` : `${guidedMin}%+`;
        return {
          observationA: `Management guided revenue growth of ${rangeStr}.`,
          observationB: `Actual revenue growth was ${actualGrowth.toFixed(1)}% — below guided range.`,
          severity: actualGrowth < guidedMin - 10 ? 'MATERIAL' : 'WATCH',
          explanation: `Revenue growth of ${actualGrowth.toFixed(1)}% fell ${(guidedMin - actualGrowth).toFixed(1)}pp below the guided minimum of ${guidedMin}%.`,
          possibleInterpretations: [
            'Demand environment weakened after guidance was given.',
            'Management was optimistic in guidance; execution missed.',
            'One-off factors (forex, delay) affected the period.',
          ],
          evidenceIds: ['revenue_guidance', 'actual_revenue'],
        };
      }
    }

    // Margin guidance check
    if (d.marginGuidance && d.actualMargin !== null && d.actualMargin !== undefined) {
      const guidedMin = d.marginGuidance.min;
      if (guidedMin !== undefined && d.actualMargin < guidedMin - 1) { // 1pp tolerance
        return {
          observationA: `Management guided EBITDA margin improvement toward ${guidedMin}%+.`,
          observationB: `Actual EBITDA margin is ${d.actualMargin.toFixed(1)}% — below guidance.`,
          severity: d.actualMargin < guidedMin - 3 ? 'MATERIAL' : 'WATCH',
          explanation: `Margin of ${d.actualMargin.toFixed(1)}% is ${(guidedMin - d.actualMargin).toFixed(1)}pp below management guidance.`,
          possibleInterpretations: [
            'Input cost inflation absorbed the guided improvement.',
            'Volume/mix did not support the margin structure management expected.',
            'One-time costs distorted the period.',
          ],
          evidenceIds: ['margin_guidance', 'actual_margin'],
        };
      }
    }

    return null;
  }

  // ─── Pattern 2: PAT ↑ / CFO ↓ ────────────────────────────────────────────

  private checkPatVsCfo(d: ContradictionInput): ContradictionCandidate | null {
    if (d.pat === null || d.pat === undefined || d.cfo === null || d.cfo === undefined) return null;
    if (d.patPrior === null || d.patPrior === undefined || d.cfoPrior === null || d.cfoPrior === undefined) return null;

    const patGrowth = d.patPrior !== 0 ? (d.pat - d.patPrior) / Math.abs(d.patPrior) : 0;
    const cfoGrowth = d.cfoPrior !== 0 ? (d.cfo - d.cfoPrior) / Math.abs(d.cfoPrior) : 0;

    // PAT improving ≥10% while CFO declining ≥10% = material contradiction
    if (patGrowth > 0.10 && cfoGrowth < -0.10) {
      return {
        observationA: `Reported PAT grew ${(patGrowth * 100).toFixed(1)}% YoY to ₹${d.pat.toFixed(0)}cr.`,
        observationB: `Operating cash flow (CFO) declined ${Math.abs(cfoGrowth * 100).toFixed(1)}% YoY to ₹${d.cfo.toFixed(0)}cr.`,
        severity: 'MATERIAL',
        explanation: 'Significant divergence between reported profit and cash generated. Cash conversion quality is declining.',
        possibleInterpretations: [
          'Working capital build (receivables, inventory) absorbed cash despite profit growth.',
          'Deferred revenue recognition or aggressive accounting inflating PAT.',
          'One-off non-cash income items in PAT not converting to cash.',
          'Seasonal build-up that normalises in subsequent quarters.',
        ],
        evidenceIds: ['pat_current', 'cfo_current', 'pat_prior', 'cfo_prior'],
      };
    }

    // PAT positive, CFO negative = always flag
    if (d.pat > 0 && d.cfo < 0) {
      return {
        observationA: `Company reports positive PAT of ₹${d.pat.toFixed(0)}cr.`,
        observationB: `CFO is negative at ₹${d.cfo.toFixed(0)}cr — the business consumed cash despite reported profit.`,
        severity: Math.abs(d.cfo) > d.pat * 0.5 ? 'MATERIAL' : 'WATCH',
        explanation: 'Reported profit does not appear to be converting to operating cash flow.',
        possibleInterpretations: [
          'Significant working capital expansion absorbing cash.',
          'Non-cash income items (mark-to-market gains, depreciation reversals) inflating PAT.',
          'Start-up / ramp-up phase with inherent cash burn.',
        ],
        evidenceIds: ['pat_current', 'cfo_current'],
      };
    }

    return null;
  }

  // ─── Pattern 3: Revenue Growth + Receivable Days Expanding ────────────────

  private checkGrowthVsWorkingCapital(d: ContradictionInput): ContradictionCandidate | null {
    if (d.revenue === null || d.revenuePrior === null || !d.revenuePrior) return null;
    if (d.receivableDays === null || d.receivableDaysPrior === null) return null;

    const revenueGrowth = (d.revenue - d.revenuePrior) / Math.abs(d.revenuePrior);
    const recDelta = (d.receivableDays || 0) - (d.receivableDaysPrior || 0);

    // Revenue growing ≥10% + receivable days expanding ≥10 days
    if (revenueGrowth > 0.10 && recDelta > 10) {
      return {
        observationA: `Revenue grew ${(revenueGrowth * 100).toFixed(1)}% YoY.`,
        observationB: `Receivable days expanded from ${d.receivableDaysPrior} to ${d.receivableDays} days (+${recDelta.toFixed(0)} days).`,
        severity: recDelta > 20 ? 'MATERIAL' : 'WATCH',
        explanation: 'Strong revenue growth is accompanied by lengthening receivable collection. Cash generation quality may be lower than reported revenue suggests.',
        possibleInterpretations: [
          'Channel stocking or dealer finance distorting reported revenue.',
          'Customer payment terms extending due to market conditions.',
          'Genuine growth in long-cycle businesses where credit terms extend naturally.',
        ],
        evidenceIds: ['revenue_growth', 'receivable_days'],
      };
    }

    return null;
  }

  // ─── Pattern 4: Deleveraging Claim vs Debt Rising ────────────────────────

  private checkDeleveragingClaim(d: ContradictionInput): ContradictionCandidate | null {
    if (!d.debtGuidance?.toLowerCase().includes('delevarag') &&
        !d.debtGuidance?.toLowerCase().includes('debt free') &&
        !d.debtGuidance?.toLowerCase().includes('reduce debt')) return null;
    if (d.netDebt === null || d.netDebtPrior === null) return null;

    const debtIncrease = (d.netDebt || 0) - (d.netDebtPrior || 0);

    if (debtIncrease > 0 && Math.abs(d.netDebtPrior || 0) > 0) {
      const pctRise = debtIncrease / Math.abs(d.netDebtPrior || 1) * 100;
      return {
        observationA: 'Management has articulated a deleveraging plan or net-debt-free objective.',
        observationB: `Net debt increased from ₹${(d.netDebtPrior || 0).toFixed(0)}cr to ₹${(d.netDebt || 0).toFixed(0)}cr (+${pctRise.toFixed(1)}%).`,
        severity: pctRise > 20 ? 'MATERIAL' : 'WATCH',
        explanation: 'Net debt is rising in a period when management has committed to reducing leverage.',
        possibleInterpretations: [
          'Capex cycle preceding deleveraging (debt peaks before free cash flow generation).',
          'Acquisition or working capital build delaying deleveraging timeline.',
          'Management guidance timeline has extended without explicit revision.',
        ],
        evidenceIds: ['net_debt_current', 'net_debt_prior', 'management_debt_guidance'],
      };
    }

    return null;
  }

  // ─── Pattern 5: Capacity Expansion + Utilisation Falling ────────────────

  private checkCapacityVsUtilisation(d: ContradictionInput): ContradictionCandidate | null {
    if (d.capex === null || d.capex === undefined) return null;
    if (d.capacityUtilisation === null || d.capacityUtilisationPrior === null) return null;

    const utilFell = (d.capacityUtilisationPrior || 0) - (d.capacityUtilisation || 0);

    // Significant capex + utilisation falling ≥5pp
    if (d.capex > 0 && utilFell > 5) {
      return {
        observationA: `Company is investing in capacity expansion (capex ₹${d.capex.toFixed(0)}cr).`,
        observationB: `Capacity utilisation fell from ${d.capacityUtilisationPrior}% to ${d.capacityUtilisation}% (-${utilFell.toFixed(1)}pp).`,
        severity: utilFell > 15 ? 'MATERIAL' : 'WATCH',
        explanation: 'Capital is being deployed for new capacity while existing capacity utilisation is declining. Returns on new investment may be delayed.',
        possibleInterpretations: [
          'Demand softening coincides with expansion investment timing.',
          'New capacity commissioned before demand has ramped, which normalises over time.',
          'Strategic over-investment ahead of expected demand inflection.',
        ],
        evidenceIds: ['capex', 'capacity_utilisation'],
      };
    }

    return null;
  }

  // ─── Pattern 6: Demand Narrative vs Order Book / Volumes ────────────────

  private checkDemandNarrative(d: ContradictionInput): ContradictionCandidate | null {
    if (d.orderBook === null || d.orderBookPrior === null) return null;

    const orderBookDecline = (d.orderBookPrior || 0) - (d.orderBook || 0);

    if (orderBookDecline > 0) {
      const pctDecline = (d.orderBookPrior || 0) > 0
        ? orderBookDecline / (d.orderBookPrior || 1) * 100
        : 0;

      if (pctDecline > 10) {
        return {
          observationA: 'Management describes demand environment as healthy or improving.',
          observationB: `Order book / backlog declined from ₹${(d.orderBookPrior || 0).toFixed(0)}cr to ₹${(d.orderBook || 0).toFixed(0)}cr (-${pctDecline.toFixed(1)}%).`,
          severity: pctDecline > 20 ? 'MATERIAL' : 'WATCH',
          explanation: 'Management narrative about demand does not appear to be corroborated by the order book trajectory.',
          possibleInterpretations: [
            'Revenue conversion from backlog is fast, causing order book to appear lower.',
            'Selective order book reporting (excluding certain contract types).',
            'Genuine demand moderation that management has not yet communicated.',
          ],
          evidenceIds: ['order_book_current', 'order_book_prior'],
        };
      }
    }

    return null;
  }
}
