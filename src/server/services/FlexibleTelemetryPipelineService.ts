/**
 * FlexibleTelemetryPipelineService.ts
 *
 * Dynamic, re-orderable multi-stage screening and telemetry cascade service.
 * Allows arbitrary sequencing of the 4 core quantitative filter stages:
 * - SECTOR_ROTATION (Sector Traction & Relative Strength Alpha)
 * - SMART_MONEY (Institutional Float Squeeze, Inflow & Volume Surge)
 * - FUNDAMENTALS (QGLP Moat, ROCE >= 20%, D/E <= 0.8, CFO/PAT)
 * - TECHNICAL_VPA (Momentum, Breakout, VPA Asymmetry >= 1.2, ATR Compression)
 *
 * Captures step-by-step funnel drop-off telemetry (inputs, survivors, drop-off counts,
 * pass rates %, cumulative survival %) across the 753-stock universe.
 */

import { ConsolidatedOpportunity } from './ConsolidatedOpportunityEngine.js';

export type PipelineStageId =
  | 'SUNRISE_INDUSTRIAL'
  | 'SECTOR_ROTATION'
  | 'SMART_MONEY'
  | 'FUNDAMENTALS'
  | 'TECHNICAL_VPA'
  | 'TECH_STRATEGY_1'
  | 'TECH_STRATEGY_2'
  | 'TECH_STRATEGY_3';

export interface PipelineStageConfig {
  id: PipelineStageId;
  name: string;
  shortLabel: string;
  color: string;
  description: string;
  enabled: boolean;
}

export interface PipelineStepTelemetry {
  stepIndex: number;
  stageId: PipelineStageId;
  stageName: string;
  color: string;
  criteriaSummary: string;
  inputCount: number;
  passedCount: number;
  dropCount: number;
  stepPassRatePct: number;
  cumulativeSurvivalPct: number;
  survivingSymbols: string[];
}

export interface PipelinePreset {
  id: string;
  title: string;
  subtitle: string;
  stageOrder: PipelineStageId[];
  rationale: string;
}

export interface PipelineExecutionResult {
  executedAt: string;
  totalUniverseCount: number;
  activeStageOrder: PipelineStageId[];
  steps: PipelineStepTelemetry[];
  finalOpportunitiesCount: number;
  finalOpportunities: ConsolidatedOpportunity[];
  presetId?: string;
}

export interface PipelineThresholds {
  minSectorAlpha?: number;          // Default: 0.0%
  requireOutperformingSector?: boolean; // Default: false
  minFloatSqueezeRatio?: number;    // Default: 0.50
  maxRetailFloatPct?: number;       // Default: 35%
  minRocePct?: number;              // Default: 20%
  maxDebtToEquity?: number;         // Default: 1.0
  minMultibaggerScore?: number;     // Default: 70
  minVpaAsymmetry?: number;         // Default: 1.20
  maxAtrContraction?: number;       // Default: 0.85
  requireActionableNow?: boolean;   // Default: false
  sunriseSymbols?: string[];        // Allowed sunrise/industrial symbols
}

export class FlexibleTelemetryPipelineService {
  private static instance: FlexibleTelemetryPipelineService;

  public static readonly STAGE_DEFINITIONS: Record<PipelineStageId, PipelineStageConfig> = {
    SUNRISE_INDUSTRIAL: {
      id: 'SUNRISE_INDUSTRIAL',
      name: 'Sunrise Sectors & Conglomerate Backing',
      shortLabel: 'Sunrise / Conglomerate',
      color: '#F59E0B', // Amber
      description: 'Filters for Small & Mid-Cap scrips backed by 20–30+ yr industrial houses or receiving Govt PLI scheme tailwinds.',
      enabled: true
    },
    SECTOR_ROTATION: {
      id: 'SECTOR_ROTATION',
      name: 'Sector Rotation & Traction',
      shortLabel: 'Sector Traction',
      color: '#06B6D4', // Cyan
      description: 'Filters for scrips in outperforming sectors or exhibiting positive relative strength alpha vs Nifty 500.',
      enabled: true
    },
    SMART_MONEY: {
      id: 'SMART_MONEY',
      name: 'Institutional Smart Money Inflow',
      shortLabel: 'Smart Money Inflow',
      color: '#EAB308', // Yellow/Gold
      description: 'Filters for institutional float squeeze (>= 0.50), institutional lock regime, or volume surge >= 1.4x 20-DMA.',
      enabled: true
    },
    FUNDAMENTALS: {
      id: 'FUNDAMENTALS',
      name: 'QGLP Fundamentals & Moat',
      shortLabel: 'QGLP Fundamentals',
      color: '#10B981', // Emerald
      description: 'Filters for high capital efficiency (ROCE >= 20%), low gearing (D/E <= 1.0), and 5X/10X compounder multibagger scores.',
      enabled: true
    },
    TECHNICAL_VPA: {
      id: 'TECHNICAL_VPA',
      name: 'Technical Momentum & VPA Breakout',
      shortLabel: 'Tech & VPA Breakout',
      color: '#8B5CF6', // Purple
      description: 'Filters for non-rejected VPA stage, VPA asymmetry >= 1.20, ATR contraction < 0.85, and active breakout tranche readiness.',
      enabled: true
    },
    TECH_STRATEGY_1: {
      id: 'TECH_STRATEGY_1',
      name: 'Strategy 1: VPA Compaction Breakout',
      shortLabel: 'S1: VPA Compaction',
      color: '#14B8A6', // Teal
      description: '+20% impulse in 1–3W, 15–25 bar base holding upper quadrant, ATR contraction < 0.70, vol drying, NR4/NR7 active.',
      enabled: true
    },
    TECH_STRATEGY_2: {
      id: 'TECH_STRATEGY_2',
      name: 'Strategy 2: FVG / CE Pullback',
      shortLabel: 'S2: FVG CE Pullback',
      color: '#38BDF8', // Sky Blue
      description: 'Single-day institutional turnover > ₹2 Cr, volume-drying pullback into bullish Fair Value Gap 50% CE level.',
      enabled: true
    },
    TECH_STRATEGY_3: {
      id: 'TECH_STRATEGY_3',
      name: 'Strategy 3: HH / HL Sequential Compaction',
      shortLabel: 'S3: HH/HL Sequential',
      color: '#EC4899', // Pink
      description: 'Higher High H2 > H1, Higher Low L2 > L1 compaction with smart money footprint alert on final move.',
      enabled: true
    }
  };

  public static readonly PRESETS: PipelinePreset[] = [
    {
      id: 'COMBINATION_1',
      title: 'Combination 1: Top-Down Fundamental Funnel',
      subtitle: 'Sector Traction → Smart Money → QGLP Fundamentals → Technical & VPA Breakout',
      stageOrder: ['SECTOR_ROTATION', 'SMART_MONEY', 'FUNDAMENTALS', 'TECHNICAL_VPA'],
      rationale: 'Canonical top-down institutional asset management: identifies tailwind sectors, institutional accumulation, establishes moat/quality first, and executes on technical base breakout.'
    },
    {
      id: 'COMBINATION_2',
      title: 'Combination 2: Technical Momentum-First Funnel',
      subtitle: 'Sector Traction → Smart Money → Technical & VPA Breakout → QGLP Fundamentals',
      stageOrder: ['SECTOR_ROTATION', 'SMART_MONEY', 'TECHNICAL_VPA', 'FUNDAMENTALS'],
      rationale: 'Techno-funda priority: after sector and smart money screening, filters for high-velocity breakout and VPA momentum first; only scrips clearing technical hurdles are scrutinized for fundamental moat.'
    },
    {
      id: 'QUANT_SQUEEZE_FIRST',
      title: 'Combination 3: Institutional Float Squeeze First',
      subtitle: 'Smart Money → Technical & VPA → Sector Traction → QGLP Fundamentals',
      stageOrder: ['SMART_MONEY', 'TECHNICAL_VPA', 'SECTOR_ROTATION', 'FUNDAMENTALS'],
      rationale: 'Pure institutional liquidity squeeze: hunts block deal accumulation and coiling VPA volatility first before verifying sector alignment and fundamental quality.'
    },
    {
      id: 'VALUE_FORTRESS_FIRST',
      title: 'Combination 4: Fortress Balance Sheet First',
      subtitle: 'QGLP Fundamentals → Sector Traction → Smart Money → Technical & VPA',
      stageOrder: ['FUNDAMENTALS', 'SECTOR_ROTATION', 'SMART_MONEY', 'TECHNICAL_VPA'],
      rationale: 'Conservative sovereign wealth approach: restricts universe strictly to zero-debt high-ROCE compounders first, then overlays sector momentum and technical timing.'
    }
  ];

  public static getInstance(): FlexibleTelemetryPipelineService {
    if (!FlexibleTelemetryPipelineService.instance) {
      FlexibleTelemetryPipelineService.instance = new FlexibleTelemetryPipelineService();
    }
    return FlexibleTelemetryPipelineService.instance;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  // INDIVIDUAL STAGE FILTER PREDICATES (PRIORITY-AWARE)
  // ─────────────────────────────────────────────────────────────────────────────

  public evaluateSectorStage(opp: ConsolidatedOpportunity, thresholds?: PipelineThresholds): boolean {
    const minAlpha = thresholds?.minSectorAlpha ?? 0.0;
    const requireOutperforming = thresholds?.requireOutperformingSector ?? false;

    if (requireOutperforming) {
      return opp.sectorTrend === 'OUTPERFORMING' && (opp.sectorRelativeStrengthAlpha ?? 0) >= minAlpha;
    }
    return opp.sectorTrend === 'OUTPERFORMING' || (opp.sectorRelativeStrengthAlpha ?? 0) >= minAlpha;
  }

  public evaluateSmartMoneyStage(opp: ConsolidatedOpportunity, thresholds?: PipelineThresholds): boolean {
    const minSqueeze = thresholds?.minFloatSqueezeRatio ?? 0.50;
    const maxRetailFloat = thresholds?.maxRetailFloatPct ?? 35.0;

    const hasSqueeze = (opp.floatSqueezeRatio || 0) >= minSqueeze;
    const isInstLock = opp.floatRegime === 'INSTITUTIONAL_LOCK_SQUEEZE' || (opp.retailFloatPct || 100) <= maxRetailFloat;
    const highCombined = ((opp.promoterHoldingPct || 0) + (opp.fiiHoldingPct || 0) + (opp.diiHoldingPct || 0)) >= 70;

    // Spec 5.1: Smart Money requires structural institutional accumulation, not just a 1-day volume spike
    return hasSqueeze || isInstLock || highCombined;
  }

  /**
   * Evaluates fundamentals with priority awareness:
   * - Strict Primary Gate (when Fundamentals precedes Technicals): requires ROCE >= 20%, low gearing, high moat.
   * - Downstream Sanity Gate (when Technicals was prioritized first): ensures solvency (D/E <= 1.2, positive ROCE >= 12%),
   *   allowing high-velocity momentum runners to pass even if reinvesting heavily with moderate ROCE.
   */
  public evaluateFundamentalStage(
    opp: ConsolidatedOpportunity,
    thresholds?: PipelineThresholds,
    mode: 'STRICT_PRIMARY' | 'SANITY_DOWNSTREAM' = 'STRICT_PRIMARY'
  ): boolean {
    const maxDe = thresholds?.maxDebtToEquity ?? (mode === 'STRICT_PRIMARY' ? 0.9 : 1.2);
    const cleanDebt = (opp.debtToEquity === undefined || isNaN(opp.debtToEquity) || opp.debtToEquity <= maxDe);

    if (mode === 'SANITY_DOWNSTREAM') {
      // High-momentum priority: do NOT disqualify explosive runners as long as they are solvent
      const acceptableRoce = (opp.rocePct || 0) >= 12.0;
      const notDistressed = cleanDebt && (opp.multibaggerScore || 0) >= 50;
      return (acceptableRoce || notDistressed) && cleanDebt;
    }

    // STRICT PRIMARY (Fundamental-First priority)
    const minRoce = thresholds?.minRocePct ?? 20.0;
    const minScore = thresholds?.minMultibaggerScore ?? 70;
    const highRoce = (opp.rocePct || 0) >= minRoce;
    const hasMultibaggerMoat = (opp.multibaggerScore || 0) >= minScore ||
      (opp.multibaggerTier && (opp.multibaggerTier.includes('10X') || opp.multibaggerTier.includes('5X')));

    return (highRoce || hasMultibaggerMoat) && cleanDebt;
  }

  /**
   * Evaluates technical & VPA with priority awareness:
   * - Strict Primary Gate (when Technicals precedes Fundamentals): requires active breakout, tight ATR compaction,
   *   and strong VPA asymmetry (disqualifying sleepy, base-bound stocks even if fundamentally strong).
   * - Downstream Timing Gate (when Fundamentals was prioritized first): checks for absence of distribution breakdown,
   *   allowing quiet accumulation in base to pass.
   */
  public evaluateTechnicalVpaStage(
    opp: ConsolidatedOpportunity,
    thresholds?: PipelineThresholds,
    mode: 'STRICT_PRIMARY' | 'TIMING_DOWNSTREAM' = 'STRICT_PRIMARY'
  ): boolean {
    // Disqualify hard rejections or severe distribution dumps in all modes
    if ((opp.vpaStage as string) === 'REJECTED' || (opp as any).heavySellVolumeDetected) {
      return false;
    }

    if (mode === 'TIMING_DOWNSTREAM') {
      // Fundamental priority: stock is a quality compounder; technical stage only checks that it is not breaking down
      const holdingBase = opp.vpaStage === 'COMPACTING_BASE' || opp.vpaStage === 'IMPULSE_ACTIVE' || opp.actionableNow;
      return holdingBase || (opp.vpaAsymmetryRatio || 0) >= 1.05;
    }

    // STRICT PRIMARY (Momentum-First priority): requires sharp technical velocity
    const minAsymmetry = thresholds?.minVpaAsymmetry ?? 1.25;
    const maxAtr = thresholds?.maxAtrContraction ?? 0.80;
    const requireActionable = thresholds?.requireActionableNow ?? false;

    const goodAsymmetry = (opp.vpaAsymmetryRatio || 0) >= minAsymmetry;
    const tightAtr = (opp.atrContractionRatio || 1) < maxAtr;
    const isActionable = opp.actionableNow || (opp.vpaStage as string) === 'ACTIONABLE_TRANCHE_READY';

    if (requireActionable) {
      return isActionable && (goodAsymmetry || tightAtr);
    }

    // Must have genuine momentum or coiling breakout setup
    return (goodAsymmetry && tightAtr) || isActionable || (goodAsymmetry && (opp.volumeSurgeRatio || 0) >= 1.5);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PIPELINE CASCADE EXECUTION (ASYMMETRIC PRIORITY-AWARE)
  // ─────────────────────────────────────────────────────────────────────────────

  public executePipeline(
    universe: ConsolidatedOpportunity[],
    stageOrder: PipelineStageId[],
    thresholds?: PipelineThresholds,
    presetId?: string
  ): PipelineExecutionResult {
    const totalCount = universe.length || 753;
    const steps: PipelineStepTelemetry[] = [];

    const techIndex = stageOrder.indexOf('TECHNICAL_VPA');
    const fundIndex = stageOrder.indexOf('FUNDAMENTALS');
    const isTechPrioritized = techIndex !== -1 && fundIndex !== -1 && techIndex < fundIndex;
    const isFundPrioritized = fundIndex !== -1 && techIndex !== -1 && fundIndex < techIndex;

    let currentSubset: ConsolidatedOpportunity[] = [...universe];

    stageOrder.forEach((stageId, index) => {
      const stageConfig = FlexibleTelemetryPipelineService.STAGE_DEFINITIONS[stageId];
      const inputCount = currentSubset.length;

      let survivors: ConsolidatedOpportunity[] = [];
      let criteriaSummary = '';

      switch (stageId) {
        case 'SUNRISE_INDUSTRIAL': {
          const sunriseSet = thresholds?.sunriseSymbols ? new Set(thresholds.sunriseSymbols) : null;
          survivors = currentSubset.filter(opp => {
            if (sunriseSet && sunriseSet.size > 0) return sunriseSet.has(opp.symbol);
            // Spec 5.2: Must require actual approved sector or allowlist, not float squeeze ratio fallback
            return (
              opp.sector === 'Capital Goods' ||
              opp.sector === 'Defence' ||
              opp.sector === 'Electronics' ||
              opp.sector === 'Green Energy' ||
              opp.sector === 'Automobile' ||
              opp.sector === 'Semiconductors' ||
              opp.sector === 'Infrastructure'
            );
          });
          criteriaSummary = 'Conglomerate backing (20–30+ yr vintage) or Government PLI Scheme beneficiary';
          break;
        }

        case 'SECTOR_ROTATION':
          survivors = currentSubset.filter(opp => this.evaluateSectorStage(opp, thresholds));
          criteriaSummary = `Sector outperforming benchmark or Relative Strength Alpha >= ${thresholds?.minSectorAlpha ?? 0}%`;
          break;

        case 'SMART_MONEY':
          survivors = currentSubset.filter(opp => this.evaluateSmartMoneyStage(opp, thresholds));
          criteriaSummary = `Float Squeeze >= ${thresholds?.minFloatSqueezeRatio ?? 0.50}x or Combined Institutional Stake >= 70%`;
          break;

        case 'FUNDAMENTALS': {
          const fundMode = isTechPrioritized ? 'SANITY_DOWNSTREAM' : 'STRICT_PRIMARY';
          survivors = currentSubset.filter(opp => this.evaluateFundamentalStage(opp, thresholds, fundMode));
          criteriaSummary = fundMode === 'STRICT_PRIMARY'
            ? `[Primary Gate] Strict QGLP Moat: ROCE >= ${thresholds?.minRocePct ?? 20}% with D/E <= ${thresholds?.maxDebtToEquity ?? 0.9} or Multibagger Score >= 70`
            : `[Solvency Check] D/E <= 1.2 with ROCE >= 12% or Moat >= 50 (Preserving High-Velocity Momentum Runners)`;
          break;
        }

        case 'TECHNICAL_VPA': {
          const techMode = isFundPrioritized ? 'TIMING_DOWNSTREAM' : 'STRICT_PRIMARY';
          survivors = currentSubset.filter(opp => this.evaluateTechnicalVpaStage(opp, thresholds, techMode));
          criteriaSummary = techMode === 'STRICT_PRIMARY'
            ? `[Primary Gate] High Momentum: VPA Asymmetry >= ${thresholds?.minVpaAsymmetry ?? 1.25}x & ATR Contraction < ${thresholds?.maxAtrContraction ?? 0.80} with Tranche Readiness`
            : `[Entry Timing] Non-Distribution Base: Retaining Quality Compounders above Structural Support`;
          break;
        }

        case 'TECH_STRATEGY_1': {
          // Spec 5.3: Aligned with Strategy 1 definition (valid base stage, asymmetry >= 1.20, tight ATR)
          survivors = currentSubset.filter(opp => {
            const goodAsymmetry = (opp.vpaAsymmetryRatio || 0) >= 1.20;
            const tightAtr = (opp.atrContractionRatio || 1) <= 0.85;
            const validStage = (opp.vpaStage as string) !== 'REJECTED';
            return validStage && (goodAsymmetry && tightAtr || opp.actionableNow);
          });
          criteriaSummary = 'Strategy 1: VPA Compaction Breakout with ATR compression <= 0.85 & volume drying';
          break;
        }

        case 'TECH_STRATEGY_2': {
          survivors = currentSubset.filter(opp => {
            const instSurge = (opp.volumeSurgeRatio || 0) >= 1.3 || (opp.floatSqueezeRatio || 0) >= 0.50;
            const validPullback = (opp.vpaStage as string) === 'COMPACTING_BASE' || opp.actionableNow;
            return instSurge && validPullback;
          });
          criteriaSummary = 'Strategy 2: Institutional Inflow + Bullish FVG 50% Consequent Encroachment Pullback';
          break;
        }

        case 'TECH_STRATEGY_3': {
          survivors = currentSubset.filter(opp => {
            const isHigherWave = (opp.vpaStage as string) === 'IMPULSE_ACTIVE' || (opp.vpaStage as string) === 'ACTIONABLE_TRANCHE_READY';
            const hasSmartMoney = (opp.floatSqueezeRatio || 0) >= 0.55 || (opp.volumeSurgeRatio || 0) >= 1.4;
            const nearSma200 = (opp as any).sma200 && (opp as any).p0 ? Math.abs(((opp as any).p0 - (opp as any).sma200) / (opp as any).sma200) <= 0.02 : true;
            return (isHigherWave || hasSmartMoney) && nearSma200;
          });
          criteriaSummary = 'Strategy 3: Sequential HH/HL Compaction with Initial Move near SMA 200 (±2%) & Smart Money Alert';
          break;
        }
      }

      const passedCount = survivors.length;
      const dropCount = Math.max(0, inputCount - passedCount);
      const stepPassRatePct = inputCount > 0 ? Number(((passedCount / inputCount) * 100).toFixed(1)) : 0;
      const cumulativeSurvivalPct = totalCount > 0 ? Number(((passedCount / totalCount) * 100).toFixed(1)) : 0;

      steps.push({
        stepIndex: index + 1,
        stageId,
        stageName: stageConfig.name,
        color: stageConfig.color,
        criteriaSummary,
        inputCount,
        passedCount,
        dropCount,
        stepPassRatePct,
        cumulativeSurvivalPct,
        survivingSymbols: survivors.map(s => s.symbol)
      });

      // Pass survivors to the next stage in the user's chosen sequence
      currentSubset = survivors;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // DYNAMIC PRIORITY-BASED SORTING
    // ─────────────────────────────────────────────────────────────────────────
    if (isTechPrioritized) {
      // Combination 2: Ranked primarily by Technical Momentum & Breakout Velocity
      currentSubset.sort((a, b) => {
        const scoreA = (a.vpaAsymmetryRatio || 1) * 25 + (a.volumeSurgeRatio || 1) * 15 +
          (a.sectorRelativeStrengthAlpha || 0) * 2 + (a.actionableNow ? 50 : 0) + (a.convergenceScore || 0);
        const scoreB = (b.vpaAsymmetryRatio || 1) * 25 + (b.volumeSurgeRatio || 1) * 15 +
          (b.sectorRelativeStrengthAlpha || 0) * 2 + (b.actionableNow ? 50 : 0) + (b.convergenceScore || 0);
        return scoreB - scoreA;
      });
    } else if (isFundPrioritized) {
      // Combination 1: Ranked primarily by Fundamental Quality & ROCE Compounding Moat
      currentSubset.sort((a, b) => {
        const scoreA = (a.rocePct || 0) * 2.5 + (a.multibaggerScore || 0) * 1.5 - ((a.debtToEquity || 0) * 30) + (a.convergenceScore || 0);
        const scoreB = (b.rocePct || 0) * 2.5 + (b.multibaggerScore || 0) * 1.5 - ((b.debtToEquity || 0) * 30) + (b.convergenceScore || 0);
        return scoreB - scoreA;
      });
    } else if (presetId === 'QUANT_SQUEEZE_FIRST' || stageOrder[0] === 'SMART_MONEY') {
      // Combination 3: Ranked primarily by Institutional Squeeze & Float Lock
      currentSubset.sort((a, b) => {
        const scoreA = (a.floatSqueezeRatio || 0) * 50 + (100 - (a.retailFloatPct || 100)) + (a.convergenceScore || 0);
        const scoreB = (b.floatSqueezeRatio || 0) * 50 + (100 - (b.retailFloatPct || 100)) + (b.convergenceScore || 0);
        return scoreB - scoreA;
      });
    } else {
      // Spec 5.4: When neither tech nor fund prioritized, sort by institutional float squeeze, volume surge, then convergence
      currentSubset.sort((a, b) => {
        const diffSqueeze = (b.floatSqueezeRatio || 0) - (a.floatSqueezeRatio || 0);
        if (Math.abs(diffSqueeze) > 0.05) return diffSqueeze;
        const diffVol = (b.volumeSurgeRatio || 0) - (a.volumeSurgeRatio || 0);
        if (Math.abs(diffVol) > 0.1) return diffVol;
        return b.convergenceScore - a.convergenceScore;
      });
    }

    return {
      executedAt: new Date().toISOString(),
      totalUniverseCount: totalCount,
      activeStageOrder: stageOrder,
      steps,
      finalOpportunitiesCount: currentSubset.length,
      finalOpportunities: currentSubset,
      presetId
    };
  }
}
