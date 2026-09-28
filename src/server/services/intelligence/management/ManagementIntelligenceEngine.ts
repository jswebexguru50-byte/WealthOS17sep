/**
 * ManagementIntelligenceEngine.ts — Wave 1 Agent B
 *
 * Longitudinal management credibility history.
 * Reads management_claim_candidate and verified_xbrl_fact from fere_evidence.db.
 *
 * Constitution invariants:
 * - C17: Management credibility is earned longitudinally (history, not a score)
 * - C13: Deterministic code owns arithmetic comparisons
 * - C10: Extraction ≠ verification — actual facts determine delivery status
 * - Output is descriptive counts, NOT a "credibility score"
 */

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { CommitmentMatcher, CommitmentEvaluationInput } from './CommitmentMatcher.js';
import {
  ManagementCommitment,
  ManagementDeliveryHistory,
  CommitmentStatus,
  CommitmentType,
  CommitmentMetricMapping,
  ManagementNarrativeChange,
} from '../contracts/ManagementContracts.js';
import { EvidenceReference } from '../contracts/Provenance.js';

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface ClaimRow {
  id: string;
  claimDate: string;
  sourceUrl: string | null;
  sourceSha256: string | null;
  evidenceText: string;
  metric: string | null;
  target: string | null;
  unit: string | null;
  deadline: string | null;
  decision: string;
}

interface XbrlFactRow {
  id: string;
  metric: string;
  value: string;
  unit: string | null;
  periodEnd: string;
  availableAt: string;
  sourceUrl: string | null;
  filingSha256: string | null;
}

// ─── Engine ────────────────────────────────────────────────────────────────────

export class ManagementIntelligenceEngine {
  private static instance: ManagementIntelligenceEngine;
  private readonly fereDbPath: string;

  private constructor() {
    this.fereDbPath = path.resolve(process.cwd(), 'data', 'fere', 'verified_filings', 'fere_evidence.db');
  }

  public static getInstance(): ManagementIntelligenceEngine {
    if (!ManagementIntelligenceEngine.instance) {
      ManagementIntelligenceEngine.instance = new ManagementIntelligenceEngine();
    }
    return ManagementIntelligenceEngine.instance;
  }

  /**
   * Returns longitudinal delivery history.
   * Never returns a "credibility score" — only descriptive counts + examples.
   */
  public async getDeliveryHistory(symbol: string): Promise<ManagementDeliveryHistory | null> {
    if (!fs.existsSync(this.fereDbPath)) return null;

    let db: Database.Database;
    try {
      db = new Database(this.fereDbPath, { readonly: true, fileMustExist: true });
    } catch {
      return null;
    }

    try {
      const cleanSym = symbol.toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');

      // 1. Fetch claim candidates
      const candidates = db.prepare(`
        SELECT id, claim_date AS claimDate, source_url AS sourceUrl,
               source_sha256 AS sourceSha256, evidence_text AS evidenceText,
               detected_metric AS metric, detected_target AS target,
               detected_unit AS unit, detected_deadline AS deadline, decision
        FROM management_claim_candidate
        WHERE symbol = ? OR isin = ?
        ORDER BY claim_date DESC
        LIMIT 100
      `).all(cleanSym, cleanSym) as ClaimRow[];

      if (!candidates.length) return null;

      // 2. Fetch XBRL facts for matching
      const xbrlFacts = db.prepare(`
        SELECT id, metric, value, unit, period_end AS periodEnd,
               available_at AS availableAt, source_url AS sourceUrl,
               filing_sha256 AS filingSha256
        FROM verified_xbrl_fact
        WHERE symbol = ? OR isin = ?
        ORDER BY period_end DESC
      `).all(cleanSym, cleanSym) as XbrlFactRow[];

      // Index facts by metric for fast lookup
      const factsByMetric = new Map<string, XbrlFactRow[]>();
      for (const f of xbrlFacts) {
        const key = (f.metric || '').toLowerCase();
        if (!factsByMetric.has(key)) factsByMetric.set(key, []);
        factsByMetric.get(key)!.push(f);
      }

      // 3. Evaluate each commitment
      const commitments: Array<{ status: CommitmentStatus; category: string; commitment: ManagementCommitment }> = [];

      for (const c of candidates) {
        const evaluated = this.evaluateClaim(c, factsByMetric, cleanSym);
        commitments.push(evaluated);
      }

      // 4. Build summary (counts by status and category)
      const history = this.buildDeliveryHistory(symbol, commitments);
      db.close();
      return history;

    } catch {
      try { db.close(); } catch {}
      return null;
    }
  }

  // ─── Claim Evaluation ─────────────────────────────────────────────────────

  private evaluateClaim(
    c: ClaimRow,
    factsByMetric: Map<string, XbrlFactRow[]>,
    symbol: string
  ): { status: CommitmentStatus; category: string; commitment: ManagementCommitment } {

    const now = new Date();
    const deadline = c.deadline ? new Date(c.deadline) : null;
    const targetPeriodPassed = deadline ? deadline < now : false;

    // Build metric mapping from extracted data
    const metricMapping = this.buildMetricMapping(c.metric, c.target, c.unit);

    // Find actual value from XBRL facts
    let actualValue: number | null = null;
    let actualEvidence: EvidenceReference[] = [];
    let deliveredLate = false;

    if (metricMapping?.canonicalMetric) {
      const facts = factsByMetric.get(metricMapping.canonicalMetric.toLowerCase()) || [];
      // Pick the fact nearest to the deadline period
      const targetFact = deadline
        ? facts.find(f => {
            const fEnd = new Date(f.periodEnd);
            return Math.abs(fEnd.getTime() - deadline.getTime()) < 180 * 24 * 3600 * 1000; // within 6 months
          })
        : facts[0];

      if (targetFact) {
        const parsed = parseFloat(targetFact.value);
        if (!isNaN(parsed)) {
          actualValue = parsed;
          // Check if delivered late (evidence date after deadline)
          if (deadline && targetFact.availableAt) {
            deliveredLate = new Date(targetFact.availableAt) > deadline;
          }
          actualEvidence = [{
            evidenceId: `mgmt_actual_${targetFact.id}`,
            sourceType: 'XBRL_FILING',
            sourceId: targetFact.filingSha256 || targetFact.id,
            timestamp: targetFact.availableAt,
            field: targetFact.metric,
            asOfDate: targetFact.periodEnd,
            uri: targetFact.sourceUrl || undefined,
          }];
        }
      }
    }

    // Build commitment evaluation input
    const evalInput: CommitmentEvaluationInput = {
      commitmentType: this.inferCommitmentType(c),
      metricMapping,
      targetValue: c.target ? parseFloat(c.target) : null,
      baselineValue: null,
      targetPeriod: c.deadline,
    };

    const evaluation = CommitmentMatcher.evaluate(evalInput, actualValue, targetPeriodPassed, deliveredLate);

    const sourceEvidence: EvidenceReference = {
      evidenceId: `mgmt_claim_${c.id}`,
      sourceType: 'EXCHANGE_FILING',
      sourceId: c.sourceSha256 || c.id,
      timestamp: c.claimDate,
      uri: c.sourceUrl || undefined,
      notes: c.evidenceText?.substring(0, 200),
    };

    const commitment: ManagementCommitment = {
      commitmentId: c.id,
      securityId: symbol,
      statementDate: c.claimDate,
      source: sourceEvidence,
      originalStatement: c.evidenceText || '',
      category: this.inferCategory(c.metric),
      metricMapping,
      commitmentType: evalInput.commitmentType,
      targetValue: evalInput.targetValue,
      targetUnit: c.unit || null,
      targetPeriod: c.deadline,
      status: evaluation.status,
      actualValue: evaluation.actualValue,
      actualEvidence,
      evaluationExplanation: evaluation.explanation,
    };

    return { status: evaluation.status, category: commitment.category, commitment };
  }

  // ─── Summary Builder ──────────────────────────────────────────────────────

  private buildDeliveryHistory(
    symbol: string,
    commitments: Array<{ status: CommitmentStatus; category: string; commitment: ManagementCommitment }>
  ): ManagementDeliveryHistory {

    const counts = {
      achieved: 0, achievedLate: 0, partiallyAchieved: 0,
      missed: 0, deferred: 0, notYetDue: 0, notVerifiable: 0,
    };

    const byCat: Record<string, typeof counts> = {};

    for (const { status, category } of commitments) {
      if (!byCat[category]) byCat[category] = { ...counts };

      switch (status) {
        case 'ACHIEVED':           counts.achieved++;           byCat[category].achieved++; break;
        case 'ACHIEVED_LATE':      counts.achievedLate++;       byCat[category].achievedLate++; break;
        case 'PARTIALLY_ACHIEVED': counts.partiallyAchieved++;  byCat[category].partiallyAchieved++; break;
        case 'MISSED':             counts.missed++;             byCat[category].missed++; break;
        case 'DEFERRED':           counts.deferred++;           byCat[category].deferred++; break;
        case 'NOT_YET_DUE':        counts.notYetDue++;          byCat[category].notYetDue++; break;
        case 'NOT_VERIFIABLE':     counts.notVerifiable++;      byCat[category].notVerifiable++; break;
      }
    }

    const total = commitments.length;
    const evaluable = total - counts.notYetDue - counts.notVerifiable;
    const achievedAll = counts.achieved + counts.achievedLate;

    // Descriptive label — NOT a score
    const descriptiveLabel = evaluable > 0
      ? `${achievedAll} of ${evaluable} evaluable commitments achieved` +
        (counts.achievedLate > 0 ? ` (${counts.achievedLate} achieved late)` : '') +
        (counts.missed > 0 ? `, ${counts.missed} missed` : '') +
        (counts.notVerifiable > 0 ? `, ${counts.notVerifiable} not verifiable` : '')
      : `${total} commitments — insufficient verified data to evaluate`;

    return {
      securityId: symbol,
      symbol,
      totalEvaluated: total,
      ...counts,
      byCategory: Object.entries(byCat).map(([category, c]) => ({
        category,
        ...c,
        total: Object.values(c).reduce((s, v) => s + v, 0),
      })),
      descriptiveLabel,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private inferCommitmentType(c: ClaimRow): CommitmentType {
    const text = (c.evidenceText || '').toLowerCase();
    if (c.deadline && (text.includes('by') || text.includes('commission') || text.includes('complet'))) return 'TIMELINE';
    if (text.includes('capex') || text.includes('capital expenditure') || text.includes('invest')) return 'CAPITAL_ALLOCATION';
    if (c.target && c.target.includes('–') || c.target?.includes('-')) return 'RANGE';
    if (c.target && !isNaN(parseFloat(c.target))) return 'NUMERIC_TARGET';
    if (text.includes('improv') || text.includes('increas') || text.includes('grow') || text.includes('expand')) return 'DIRECTIONAL';
    return 'OTHER';
  }

  private buildMetricMapping(
    extractedMetric: string | null,
    target: string | null,
    unit: string | null,
  ): CommitmentMetricMapping | null {
    if (!extractedMetric) return null;
    const m = extractedMetric.toLowerCase();

    // Map common management language to canonical metric keys
    const METRIC_MAP: Record<string, { canonicalMetric: string; comparisonType: CommitmentMetricMapping['comparisonType'] }> = {
      'revenue':              { canonicalMetric: 'revenue_cr', comparisonType: 'GROWTH' },
      'revenue growth':       { canonicalMetric: 'revenue_growth_yoy', comparisonType: 'GROWTH' },
      'ebitda margin':        { canonicalMetric: 'ebitda_margin_pct', comparisonType: 'LEVEL' },
      'ebit margin':          { canonicalMetric: 'ebit_margin_pct', comparisonType: 'LEVEL' },
      'net margin':           { canonicalMetric: 'pat_margin_pct', comparisonType: 'LEVEL' },
      'margins':              { canonicalMetric: 'ebitda_margin_pct', comparisonType: 'LEVEL' },
      'capex':                { canonicalMetric: 'capex_cr', comparisonType: 'MINIMUM' },
      'net debt':             { canonicalMetric: 'net_debt_cr', comparisonType: 'MAXIMUM' },
      'debt':                 { canonicalMetric: 'net_debt_cr', comparisonType: 'MAXIMUM' },
      'roce':                 { canonicalMetric: 'roce_pct', comparisonType: 'MINIMUM' },
      'roe':                  { canonicalMetric: 'roe_pct', comparisonType: 'MINIMUM' },
      'capacity':             { canonicalMetric: 'capacity_mn_t', comparisonType: 'MINIMUM' },
      'volume':               { canonicalMetric: 'volume_mn_t', comparisonType: 'MINIMUM' },
      'loan growth':          { canonicalMetric: 'loan_growth_yoy', comparisonType: 'GROWTH' },
      'nim':                  { canonicalMetric: 'nim_pct', comparisonType: 'LEVEL' },
      'gnpa':                 { canonicalMetric: 'gnpa_pct', comparisonType: 'MAXIMUM' },
    };

    for (const [key, mapping] of Object.entries(METRIC_MAP)) {
      if (m.includes(key)) {
        // Parse range target if present
        let targetMin: number | null = null;
        let targetMax: number | null = null;
        if (target) {
          const rangeMatch = target.match(/(\d+\.?\d*)\s*[-–to]+\s*(\d+\.?\d*)/);
          if (rangeMatch) {
            targetMin = parseFloat(rangeMatch[1]);
            targetMax = parseFloat(rangeMatch[2]);
          }
        }
        return {
          extractedMetric,
          canonicalMetric: mapping.canonicalMetric,
          comparisonType: (targetMin !== null && targetMax !== null) ? 'RANGE' : mapping.comparisonType,
          targetMin,
          targetMax,
          confidence: 'MEDIUM',
        };
      }
    }

    return {
      extractedMetric,
      canonicalMetric: null,
      comparisonType: 'DIRECTIONAL',
      confidence: 'LOW',
    };
  }

  private inferCategory(metric: string | null): string {
    if (!metric) return 'OTHER';
    const m = metric.toLowerCase();
    if (m.includes('revenue') || m.includes('sales')) return 'REVENUE';
    if (m.includes('margin') || m.includes('ebitda') || m.includes('ebit')) return 'MARGINS';
    if (m.includes('capex') || m.includes('capital')) return 'CAPEX';
    if (m.includes('debt') || m.includes('leverage')) return 'DEBT';
    if (m.includes('capacity') || m.includes('volume') || m.includes('production')) return 'CAPACITY';
    if (m.includes('loan') || m.includes('nim') || m.includes('gnpa')) return 'CREDIT';
    if (m.includes('cash') || m.includes('cfo') || m.includes('fcf')) return 'CASH_FLOW';
    return 'OTHER';
  }
}
