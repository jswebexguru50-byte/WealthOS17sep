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
      const revEv = fundamental?.historicalSeries?.['Revenue']?.[0]?.provenance || [];
      evidenceRefs.push(...revEv);
      whyInteresting.push({
        id: 'INF_REV_ACCEL',
        type: 'POSITIVE_INFLECTION',
        category: 'FUNDAMENTAL',
        headline: `Revenue growth accelerating (+${revTraj.latestGrowthPct}% YoY)`,
        detail: `YoY top-line growth accelerated (${revTraj.periodsCompared || 'recent periods'}).`,
        confidence: 'HIGH',
        sourceModule: 'FUNDAMENTAL',
        evidence: revEv,
      });
    }

    // 2. Fundamental Margin Expansion
    const marginTraj = fundamental?.trajectory?.marginTrajectory;
    if (marginTraj?.status === 'EXPANDING' && marginTraj.bpsChange !== null) {
      const marginEv = fundamental?.historicalSeries?.[marginTraj.metricUsed === 'NIM' ? 'NIM' : 'EBITDA']?.[0]?.provenance ||
        fundamental?.historicalSeries?.['Revenue']?.[0]?.provenance || [];
      evidenceRefs.push(...marginEv);
      whyInteresting.push({
        id: 'INF_MARGIN_EXP',
        type: 'POSITIVE_INFLECTION',
        category: 'FUNDAMENTAL',
        headline: `Margin expanded by ${marginTraj.bpsChange} bps`,
        detail: `Operating margin expanded significantly (${marginTraj.metricUsed}).`,
        confidence: 'HIGH',
        sourceModule: 'FUNDAMENTAL',
        evidence: marginEv,
      });
    }

    // 3. Technical Strategy Signals Active
    const qualifiedSignals = (technical?.signals || []).filter(s => s.qualified);
    if (qualifiedSignals.length > 0) {
      const topSig = qualifiedSignals[0];
      const techSigEv: EvidenceReference = {
        evidenceId: `TECH_SIG_${topSig.strategyId}`,
        sourceType: 'DUCKDB_OHLCV',
        sourceId: topSig.strategyId,
        timestamp: technical?.dataAsOf || evaluationTimestamp,
        notes: `Qualified under strategy ${topSig.strategyId}: ${topSig.name}`,
      };
      evidenceRefs.push(techSigEv);
      whyInteresting.push({
        id: `INF_TECH_${topSig.strategyId}`,
        type: 'POSITIVE_INFLECTION',
        category: 'TECHNICAL',
        headline: `${topSig.name} breakout active`,
        detail: `Qualified under pure strategy ${topSig.strategyId} with stop loss & target defined.`,
        confidence: 'HIGH',
        sourceModule: 'TECHNICAL',
        evidence: [techSigEv],
      });
    } else if (technical?.trend === 'BULLISH') {
      const techTrendEv: EvidenceReference = {
        evidenceId: 'TECH_TREND_BULLISH',
        sourceType: 'DUCKDB_OHLCV',
        sourceId: 'TECHNICAL_ANALYSIS',
        timestamp: technical?.dataAsOf || evaluationTimestamp,
        notes: 'Price action and short-to-intermediate moving averages in bullish alignment',
      };
      evidenceRefs.push(techTrendEv);
      whyInteresting.push({
        id: 'INF_TECH_BULLISH',
        type: 'POSITIVE_INFLECTION',
        category: 'TECHNICAL',
        headline: `Technical structural trend is Bullish`,
        detail: `Short-term and medium-term moving average structure indicates positive price momentum.`,
        confidence: 'MEDIUM',
        sourceModule: 'TECHNICAL',
        evidence: [techTrendEv],
      });
    }

    // 4. High Quality Return Profile
    const returnProfile = fundamental?.trajectory?.returnProfile;
    if (returnProfile?.status === 'HIGH_QUALITY' && returnProfile.latestValue !== null) {
      const returnEv = fundamental?.historicalSeries?.[returnProfile.metric]?.[0]?.provenance || [];
      evidenceRefs.push(...returnEv);
      whyInteresting.push({
        id: 'INF_RETURN_PROFILE',
        type: 'POSITIVE_INFLECTION',
        category: 'FUNDAMENTAL',
        headline: `High Capital Efficiency (${returnProfile.metric}: ${returnProfile.latestValue}%)`,
        detail: `Generates high returns on capital above hurdle benchmark.`,
        confidence: 'HIGH',
        sourceModule: 'FUNDAMENTAL',
        evidence: returnEv,
      });
    }

    // 5. Market / Sector Tailwind
    if (market?.sectorTrend === 'BULLISH' && market.sectorName) {
      const sectorEv: EvidenceReference = {
        evidenceId: `SECTOR_TAILWIND_${market.sectorName}`,
        sourceType: 'SECTOR_SERVICE',
        sourceId: market.sectorName,
        timestamp: market.dataAsOf || evaluationTimestamp,
        notes: `Sector ${market.sectorName} classified as Bullish momentum`,
      };
      evidenceRefs.push(sectorEv);
      whyInteresting.push({
        id: 'INF_SECTOR_TAILWIND',
        type: 'POSITIVE_INFLECTION',
        category: 'MARKET',
        headline: `${market.sectorName} sector showing Bullish momentum`,
        detail: `Stock belongs to ${market.sectorName} which exhibits positive technical momentum.`,
        confidence: 'MEDIUM',
        sourceModule: 'MARKET_CONTEXT',
        evidence: [sectorEv],
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
      const bearEv: EvidenceReference = {
        evidenceId: 'TECH_TREND_BEARISH',
        sourceType: 'DUCKDB_OHLCV',
        sourceId: 'TECHNICAL_ANALYSIS',
        timestamp: technical?.dataAsOf || evaluationTimestamp,
        notes: 'Intermediate trend classified as Bearish',
      };
      evidenceRefs.push(bearEv);
      whatNeedsAttention.push({
        id: 'ATTN_TECH_BEARISH',
        type: 'NEGATIVE_INFLECTION',
        category: 'TECHNICAL',
        headline: 'Technical structural trend is Bearish',
        detail: 'Price action below key intermediate moving averages with negative slope.',
        confidence: 'HIGH',
        sourceModule: 'TECHNICAL',
        evidence: [bearEv],
      });
    }

    // 3. Margin Contraction or Top-Line Deceleration
    if (revTraj?.status === 'DECELERATING') {
      const decelEv = fundamental?.historicalSeries?.['Revenue']?.[0]?.provenance || [];
      evidenceRefs.push(...decelEv);
      whatNeedsAttention.push({
        id: 'ATTN_REV_DECEL',
        type: 'WATCH_ITEM',
        category: 'FUNDAMENTAL',
        headline: 'Top-line growth decelerating',
        detail: 'Recent revenue growth has slowed relative to prior comparative periods.',
        confidence: 'MEDIUM',
        sourceModule: 'FUNDAMENTAL',
        evidence: decelEv,
      });
    }

    // 4. Management Commitments Pending Verification
    const commitments = management?.commitments || [];
    const pendingCommitments = commitments.filter(c => c.status === 'PENDING' || c.status === 'NOT_YET_DUE');
    if (pendingCommitments.length > 0) {
      const mgmtEv = pendingCommitments.slice(0, 1).map(c => c.sourceDocument);
      evidenceRefs.push(...mgmtEv);
      whatNeedsAttention.push({
        id: 'ATTN_MGMT_PENDING',
        type: 'WATCH_ITEM',
        category: 'MANAGEMENT',
        headline: `${pendingCommitments.length} Management commitment(s) pending delivery`,
        detail: `Forward guidance on ${pendingCommitments.map(c => c.category).slice(0, 3).join(', ')} awaiting realization.`,
        confidence: 'LOW',
        sourceModule: 'MANAGEMENT',
        evidence: mgmtEv,
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
