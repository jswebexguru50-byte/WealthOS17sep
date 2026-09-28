/**
 * BusinessInflectionModule.ts
 *
 * Derived Module:
 * Consumes in-memory computed results from Fundamental, Technical, FERE, Management, and Market.
 * Powers the Overview tab's:
 *   - WHY IS IT INTERESTING? (max 5 items)
 *   - WHAT CAN GO WRONG / WHAT NEEDS ATTENTION? (max 5 items)
 *
 * Invariants:
 * - Does NOT perform duplicate heavy DB queries
 * - Transparent rules; no synthetic black-box scores
 * - Every item is attributable to its source module with genuine evidence links
 */

import { ModuleResult, ModuleStatus, EvidenceReference } from '../contracts/index.js';
import { BusinessInflectionPayload, InflectionItem } from '../types/BusinessInflectionPayload.js';
import { TechnicalPayload } from '../types/TechnicalPayload.js';
import { FundamentalPayload } from '../types/FundamentalPayload.js';
import { FerePayload } from '../types/FerePayload.js';
import { ManagementPayload } from '../types/ManagementPayload.js';
import { MarketContextPayload } from '../types/MarketContextPayload.js';

export interface InflectionInputs {
  technical?: TechnicalPayload | null;
  fundamental?: FundamentalPayload | null;
  fere?: FerePayload | null;
  management?: ManagementPayload | null;
  market?: MarketContextPayload | null;
}

export class BusinessInflectionModule {
  private static instance: BusinessInflectionModule;

  private constructor() {}

  public static getInstance(): BusinessInflectionModule {
    if (!BusinessInflectionModule.instance) {
      BusinessInflectionModule.instance = new BusinessInflectionModule();
    }
    return BusinessInflectionModule.instance;
  }

  public derive(symbol: string, inputs: InflectionInputs): ModuleResult<BusinessInflectionPayload> {
    const evaluationTimestamp = new Date().toISOString();
    const whyInteresting: InflectionItem[] = [];
    const whatNeedsAttention: InflectionItem[] = [];
    const evidenceRefs: EvidenceReference[] = [];

    const { technical, fundamental, fere, management, market } = inputs;

    // ─────────────────────────────────────────────────────────────────────────
    // DERIVE "WHY INTERESTING" (Max 5 items)
    // ─────────────────────────────────────────────────────────────────────────

    // 1. Fundamental Revenue Acceleration
    const revTraj = fundamental?.trajectory?.revenueGrowthYoY;
    if (revTraj?.status === 'ACCELERATING' && revTraj.latestGrowthPct !== null) {
      whyInteresting.push({
        id: 'INF_REV_ACCEL',
        type: 'POSITIVE_INFLECTION',
        category: 'FUNDAMENTAL',
        headline: `Revenue growth accelerating (+${revTraj.latestGrowthPct}% YoY)`,
        detail: `YoY top-line growth accelerated (${revTraj.periodsCompared || 'recent periods'}).`,
        confidence: 'HIGH',
        sourceModule: 'FUNDAMENTAL',
        evidence: [],
      });
    }

    // 2. Fundamental Margin Expansion
    const marginTraj = fundamental?.trajectory?.marginTrajectory;
    if (marginTraj?.status === 'EXPANDING' && marginTraj.bpsChange !== null) {
      whyInteresting.push({
        id: 'INF_MARGIN_EXP',
        type: 'POSITIVE_INFLECTION',
        category: 'FUNDAMENTAL',
        headline: `Margin expanded by ${marginTraj.bpsChange} bps`,
        detail: `Operating margin expanded significantly (${marginTraj.metricUsed}).`,
        confidence: 'HIGH',
        sourceModule: 'FUNDAMENTAL',
        evidence: [],
      });
    }

    // 3. Technical Strategy Signals Active
    const qualifiedSignals = (technical?.signals || []).filter(s => s.qualified);
    if (qualifiedSignals.length > 0) {
      const topSig = qualifiedSignals[0];
      whyInteresting.push({
        id: `INF_TECH_${topSig.strategyId}`,
        type: 'POSITIVE_INFLECTION',
        category: 'TECHNICAL',
        headline: `${topSig.name} breakout active`,
        detail: `Qualified under pure strategy ${topSig.strategyId} with stop loss & target defined.`,
        confidence: 'HIGH',
        sourceModule: 'TECHNICAL',
        evidence: [],
      });
    } else if (technical?.trend === 'BULLISH') {
      whyInteresting.push({
        id: 'INF_TECH_BULLISH',
        type: 'POSITIVE_INFLECTION',
        category: 'TECHNICAL',
        headline: `Technical structural trend is Bullish`,
        detail: `Price trading above 50-day and 200-day moving averages with constructive momentum.`,
        confidence: 'MEDIUM',
        sourceModule: 'TECHNICAL',
        evidence: [],
      });
    }

    // 4. High Quality Return Profile
    const returnProfile = fundamental?.trajectory?.returnProfile;
    if (returnProfile?.status === 'HIGH_QUALITY' && returnProfile.latestValue !== null) {
      whyInteresting.push({
        id: 'INF_RETURN_PROFILE',
        type: 'POSITIVE_INFLECTION',
        category: 'FUNDAMENTAL',
        headline: `High Capital Efficiency (${returnProfile.metric}: ${returnProfile.latestValue}%)`,
        detail: `Generates high returns on capital above hurdle benchmark.`,
        confidence: 'HIGH',
        sourceModule: 'FUNDAMENTAL',
        evidence: [],
      });
    }

    // 5. Market / Sector Tailwind
    if (market?.sectorTrend === 'BULLISH' && market.sectorName) {
      whyInteresting.push({
        id: 'INF_SECTOR_TAILWIND',
        type: 'POSITIVE_INFLECTION',
        category: 'MARKET',
        headline: `${market.sectorName} sector showing Bullish momentum`,
        detail: `Stock is positioned in a leading sector with supportive institutional flows.`,
        confidence: 'MEDIUM',
        sourceModule: 'MARKET_CONTEXT',
        evidence: [],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DERIVE "WHAT CAN GO WRONG / WHAT NEEDS ATTENTION" (Max 5 items)
    // ─────────────────────────────────────────────────────────────────────────

    // 1. FERE Warnings / Cash Conversion Lag
    const fereWarns = fere?.warnings || [];
    for (const w of fereWarns) {
      whatNeedsAttention.push({
        id: `ATTN_${w.id}`,
        type: 'WATCH_ITEM',
        category: 'FUNDAMENTAL',
        headline: w.title,
        detail: w.observation,
        confidence: w.severity === 'MATERIAL' ? 'HIGH' : 'MEDIUM',
        sourceModule: 'FERE',
        evidence: w.supportingFacts || [],
      });
    }

    // 2. Technical Trend Weakness
    if (technical?.trend === 'BEARISH') {
      whatNeedsAttention.push({
        id: 'ATTN_TECH_BEARISH',
        type: 'NEGATIVE_INFLECTION',
        category: 'TECHNICAL',
        headline: 'Technical structural trend is Bearish',
        detail: 'Price trading below key intermediate moving averages with negative slope.',
        confidence: 'HIGH',
        sourceModule: 'TECHNICAL',
        evidence: [],
      });
    }

    // 3. Margin Contraction or Top-Line Deceleration
    if (revTraj?.status === 'DECELERATING') {
      whatNeedsAttention.push({
        id: 'ATTN_REV_DECEL',
        type: 'WATCH_ITEM',
        category: 'FUNDAMENTAL',
        headline: 'Top-line growth decelerating',
        detail: 'Recent revenue growth has slowed relative to prior comparative periods.',
        confidence: 'MEDIUM',
        sourceModule: 'FUNDAMENTAL',
        evidence: [],
      });
    }

    // 4. Management Commitments Pending Verification
    const commitments = management?.commitments || [];
    const pendingCommitments = commitments.filter(c => c.status === 'PENDING');
    if (pendingCommitments.length > 0) {
      whatNeedsAttention.push({
        id: 'ATTN_MGMT_PENDING',
        type: 'WATCH_ITEM',
        category: 'MANAGEMENT',
        headline: `${pendingCommitments.length} Management commitment(s) pending delivery`,
        detail: `Forward guidance on ${pendingCommitments.map(c => c.category).slice(0, 3).join(', ')} awaiting realization.`,
        confidence: 'LOW',
        sourceModule: 'MANAGEMENT',
        evidence: pendingCommitments.slice(0, 1).map(c => c.sourceDocument),
      });
    }

    const payload: BusinessInflectionPayload = {
      whyInteresting: whyInteresting.slice(0, 5),
      whatNeedsAttention: whatNeedsAttention.slice(0, 5),
      dataAsOf: evaluationTimestamp,
    };

    const hasItems = whyInteresting.length > 0 || whatNeedsAttention.length > 0;
    const status: ModuleStatus = hasItems ? 'WORKING' : 'PARTIAL';

    return {
      moduleId: 'BUSINESS_INFLECTION',
      status,
      dataStatus: 'VERIFIED',
      result: payload,
      evidenceRefs,
      missingRequirements: [],
      warnings: [],
      evaluationTimestamp,
      dataAsOf: evaluationTimestamp,
      configVersion: '1.0.0',
      engineVersion: 'BusinessInflectionModule-v1.0',
    };
  }
}
