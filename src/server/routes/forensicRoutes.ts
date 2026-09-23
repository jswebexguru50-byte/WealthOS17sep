/**
 * forensicRoutes.ts
 * Express Router exposing Forensic Intelligence Layer (v2.1) Endpoints:
 * - /api/forensic/universe (and /api/universe)
 * - /api/forensic/dossier/:symbol (and /api/dossier/:symbol)
 * - /api/forensic/p3-gate (and /api/p3-gate)
 * - /api/forensic/tests/run (and /api/tests/run)
 * - /api/forensic/config/weights (and /api/config/weights)
 * - /api/forensic/custom-analysis (and /api/custom-analysis)
 * - /api/forensic/telemetry (and /api/telemetry)
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { MasterQuantUniverseService } from '../services/MasterQuantUniverseService.js';
import { ForensicIntelligenceService } from '../services/ForensicIntelligenceService.js';
import { ForensicTestSuiteRunner } from '../services/ForensicTestSuiteRunner.js';
import { CacheService } from '../services/CacheService.js';
import { LLMOrchestrationService } from '../services/LLMOrchestrationService.js';
import { FORENSIC_WEIGHTS } from '../services/ForensicScoringService.js';
import { ForensicCacheService } from '../services/ForensicCacheService.js';
import { StatutoryLineageService } from '../services/StatutoryLineageService.js';
import { getDB, dbGet, dbAll } from '../database.js';
import { DossierEmailDispatcher } from '../services/DossierEmailDispatcher.js';
import { createFereRefreshJob, decideFereClaim, listFereClaimCandidates,
         readFereEvidence, readFereRefreshJob } from '../services/FereEvidenceService.js';

function requireFereReviewer(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.FERE_REVIEW_TOKEN;
  const supplied = req.header('x-fere-review-token');
  if (!expected || !supplied || supplied !== expected) {
    return res.status(403).json({ success: false, error: 'FERE reviewer authorization is required.' });
  }
  next();
}

export const forensicRouter: Router = express.Router();

const QUARANTINED_LEGACY_ROUTES = new Set([
  '/49-dossiers', '/master-dossier-workbook', '/dossier-strategy-matrix',
  '/universe', '/summary-stats', '/download-dossier-excel',
  '/download-dossier-markdown', '/send-dossier-email', '/schedule-dossier-email'
]);
forensicRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (QUARANTINED_LEGACY_ROUTES.has(req.path) || req.path.startsWith('/dossier/') ||
      req.path.startsWith('/recommendation-provenance/')) {
    return res.status(422).json({ success: false, status: 'LEGACY_SYNTHETIC_QUARANTINED',
      error: 'Legacy dossier outputs lack authenticated source documents and cannot be served as live FERE.' });
  }
  next();
});

// Health Check
forensicRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Forensic Intelligence Layer (v2.1)',
    geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

// GET All 49 Bespoke Dossiers (Served from in-memory non-blocking cache with auto-invalidation)
forensicRouter.get('/49-dossiers', (req: Request, res: Response) => {
  try {
    const data = ForensicCacheService.getAllDossiers();
    if (data && data.length > 0) {
      res.json({ success: true, count: data.length, asOfDate: '2026-09-14', data });
    } else {
      res.status(404).json({ success: false, error: '49-dossiers file not found or empty' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET Master Dossier Workbook (All 11 Sub-Tabs matching Excel structure)
forensicRouter.get('/master-dossier-workbook', (req: Request, res: Response) => {
  try {
    const dossiers = ForensicCacheService.getAllDossiers() || [];
    
    // Load secondary datasets from disk
    const v531Path = path.join(process.cwd(), 'scratch', 'v531_rerun_49_stocks_analysis.json');
    const sectorPath = path.join(process.cwd(), 'scratch', 'sector_momentum_audit_output.json');
    const dictPath = path.join(process.cwd(), 'scratch', 'source_data_dictionary.json');
    const glossaryPath = path.join(process.cwd(), 'scratch', 'business_glossary.json');
    const lineagePath = path.join(process.cwd(), 'scratch', 'scrip_unique_lineage_dataset.json');

    const v531Data = fs.existsSync(v531Path) ? JSON.parse(fs.readFileSync(v531Path, 'utf8')) : [];
    const sectorData = fs.existsSync(sectorPath) ? JSON.parse(fs.readFileSync(sectorPath, 'utf8')) : { sectors: {} };
    const dictData = fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath, 'utf8')) : [];
    const glossaryData = fs.existsSync(glossaryPath) ? JSON.parse(fs.readFileSync(glossaryPath, 'utf8')) : { sections: [] };
    const lineageData = fs.existsSync(lineagePath) ? JSON.parse(fs.readFileSync(lineagePath, 'utf8')) : [];

    res.json({
      success: true,
      asOfDate: '2026-09-16',
      totalStocks: dossiers.length,
      sheets: {
        cover: {
          title: 'NRI WEALTHOS: QUANTITATIVE RE-RUN & MASTER DOSSIER (v5.3.1)',
          architecture: 'Pure-Code Deterministic Filter Pipeline with 10 Sequential Elimination Gates',
          riskFloor: 'Hard stop-loss never wider than 0.75x ATR floor; risk-parity budget 1.0% portfolio volatility',
          gates: [
            { gate: 'Gate 1', name: 'Liquidity & Minimum Scale', rule: 'Market Cap > ₹500 Cr, Daily Turnover > ₹2.0 Cr' },
            { gate: 'Gate 2', name: 'Regulatory Hygiene & Forensics', rule: 'Zero ASM/GSM Stage 2-4, Zero forensic auditor disqualifications' },
            { gate: 'Gate 3', name: 'Promoter Pledging Floor', rule: 'Promoter Pledge < 25% of promoter holding; delta <= 0%' },
            { gate: 'Gate 4', name: 'Trend & Momentum Baseline', rule: 'CMP > 200 EMA; 50 EMA > 200 EMA (Structural Bull Alignment)' },
            { gate: 'Gate 5', name: 'Sector Momentum Confirmation', rule: 'Leading or Improving Quadrant in Relative Rotation Graph (RRG)' },
            { gate: 'Gate 6', name: 'Wyckoff Upper-Wick Veto', rule: 'Upper-wick rejection on breakout candle < 40% of candle body' },
            { gate: 'Gate 7', name: 'Parabolic Climax Exhaustion Veto', rule: 'CMP distance from 20 EMA <= 18% (prevents climax chases)' },
            { gate: 'Gate 8', name: 'Quality of Earnings (Accrual Gate)', rule: 'Sloan Accrual Ratio < 10%; CFO / Operating PAT >= 70%' },
            { gate: 'Gate 9', name: 'Solvency & Debt Service Gate', rule: 'Altman Z-Score >= 2.6 (Safe/Grey); Net Debt / EBITDA <= 2.5x' },
            { gate: 'Gate 10', name: 'Risk Parity Capital Allocation', rule: 'Max 12.5% single equity; max 25% sector cluster' }
          ]
        },
        masterList: dossiers,
        qglp: dossiers.map(d => ({
          symbol: d.Symbol || d.symbol,
          companyName: d['Company Name'] || d.companyName,
          sector: d.Sector || d.sector,
          cmp: d['CMP (₹)'] || d.cmp,
          verdict: d['v5.3.1 Verdict'],
          ...(d.qglp || {})
        })),
        institutions: dossiers.map(d => ({
          symbol: d.Symbol || d.symbol,
          companyName: d['Company Name'] || d.companyName,
          sector: d.Sector || d.sector,
          cmp: d['CMP (₹)'] || d.cmp,
          verdict: d['v5.3.1 Verdict'],
          ...(d.institutions || {})
        })),
        ai: dossiers.map(d => ({
          symbol: d.Symbol || d.symbol,
          companyName: d['Company Name'] || d.companyName,
          sector: d.Sector || d.sector,
          cmp: d['CMP (₹)'] || d.cmp,
          verdict: d['v5.3.1 Verdict'],
          ...(d.ai || {})
        })),
        sectorMatrix: Object.values(sectorData.sectors || {}),
        strategySpecs: [
          { strategy: 'Pullback to 20 EMA / 50 EMA (S01)', category: 'Swing / Trend Re-entry', timeframe: 'Daily / 75m', targetGain: '+15% to +25%', winRate: '68.5%', criteria: 'Touch of 20 EMA with bullish hammer or engulfing pattern' },
          { strategy: 'High Tight Flag (HTF) Breakout (S02)', category: 'Momentum Expansion', timeframe: 'Daily', targetGain: '+25% to +45%', winRate: '64.2%', criteria: 'Consolidation < 25% range after 100%+ advance; volume surge > 2x' },
          { strategy: 'VCP (Volatility Contraction Pattern) (S03)', category: 'Price Compression', timeframe: 'Daily', targetGain: '+20% to +35%', winRate: '71.0%', criteria: '2-4 successive contractions with progressive volume dry-up' },
          { strategy: 'Wyckoff Accumulation Spring (S04)', category: 'Reversal Accumulation', timeframe: 'Daily / 4H', targetGain: '+30% to +60%', winRate: '66.8%', criteria: 'False breakdown below trading range support immediately reclaimed' },
          { strategy: 'QGLP Multibagger Compounder (S05)', category: 'Core Wealth Allocation', timeframe: 'Weekly / Monthly', targetGain: '+50% to +150%', winRate: '78.5%', criteria: 'ROCE > 20%, PAT CAGR > 18%, Sloan < 5%, clean corporate governance' }
        ],
        riskParity: {
          benchmark: '₹1.00 Crore Model Portfolio',
          volatilityBudget: '1.0% Portfolio Volatility Parity',
          atrStopFloor: '0.75x ATR',
          maxSingleStockCap: '12.5%',
          maxSectorCap: '25.0%',
          stocks: dossiers.map(d => ({
            symbol: d.Symbol || d.symbol,
            companyName: d['Company Name'] || d.companyName,
            sector: d.Sector || d.sector,
            cmp: d['CMP (₹)'] || d.cmp,
            allowedShares: d['Allowed Shares'],
            committedCapital: d['Committed (₹)'],
            weightPct: d['Weight %'],
            effectiveRisk: d['Effective Risk (₹)'],
            verdict: d['v5.3.1 Verdict']
          }))
        },
        sourceAuditTrail: lineageData,
        sourceDictionary: dictData,
        glossary: glossaryData,
        strategyDictionary: (() => {
          try {
            const dictPath = path.join(process.cwd(), 'scratch', 'strategy_dictionary_rows.json');
            return fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath, 'utf8')) : [];
          } catch {
            return [];
          }
        })(),
        scripStrategyMatrix: (() => {
          try {
            const matrixPath = path.join(process.cwd(), 'scratch', '49_stocks_comprehensive_strategy_match.json');
            return fs.existsSync(matrixPath) ? JSON.parse(fs.readFileSync(matrixPath, 'utf8')) : [];
          } catch {
            return [];
          }
        })()
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/forensic/dossier-strategy-matrix
 * Returns all 49 recommendations with qualified strategies, exact parameter values & business explanations
 */
forensicRouter.get('/dossier-strategy-matrix', (req: Request, res: Response) => {
  try {
    const matrixPath = path.join(process.cwd(), 'scratch', '49_stocks_comprehensive_strategy_match.json');
    if (fs.existsSync(matrixPath)) {
      const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
      res.json({ success: true, count: data.length, asOfDate: '2026-09-16', data });
    } else {
      res.status(404).json({ success: false, error: 'Strategy qualification matrix not found' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/forensic/strategy-parameters-dictionary
 * Returns master dictionary of all strategies (S1 to S20 + S8B, S21-S26) with parameter names, thresholds & definitions
 */
forensicRouter.get('/strategy-parameters-dictionary', (req: Request, res: Response) => {
  try {
    const dictPath = path.join(process.cwd(), 'scratch', 'strategy_dictionary_rows.json');
    if (fs.existsSync(dictPath)) {
      const data = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
      res.json({ success: true, count: data.length, data });
    } else {
      res.status(404).json({ success: false, error: 'Strategy dictionary file not found' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET Recommendation Provenance contract binding technical momentum to forensic verdict
forensicRouter.get('/recommendation-provenance/:symbol', (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const technicalSignal = (req.query.signal as any) || 'STRONG_BUY';
    const provenance = ForensicCacheService.getRecommendationProvenance(symbol, technicalSignal);
    if (provenance) {
      res.json({ success: true, data: provenance });
    } else {
      res.status(404).json({ success: false, error: `Stock ${symbol} not found in 49 Master List` });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET Statutory Financial Statement Lineage & Step-by-Step Ratios
forensicRouter.get('/statutory-lineage/:symbol', (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const lineage = StatutoryLineageService.getLineage(symbol);
    if (lineage) {
      res.json({ success: true, data: lineage });
    } else {
      res.status(404).json({ success: false, error: `Statutory lineage for ${symbol} not found` });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET All Statutory Financial Statement Lineages
forensicRouter.get('/statutory-lineages', (req: Request, res: Response) => {
  try {
    const lineages = StatutoryLineageService.getAllLineages();
    res.json({ success: true, count: Object.keys(lineages).length, data: lineages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST Invalidate Forensic Cache
forensicRouter.post('/cache/invalidate', (req: Request, res: Response) => {
  try {
    ForensicCacheService.invalidateCache();
    res.json({ success: true, message: 'Forensic dossiers and statutory lineage cache invalidated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET Universe List with stage statuses
forensicRouter.get('/universe', async (req: Request, res: Response) => {
  try {
    const watchlist = req.query.watchlist ? (req.query.watchlist as string).split(',') : ['TITAN', 'TATAMOTORS', 'INFY', 'DAMODARIND', 'KSL'];
    const p3SignOff = ForensicIntelligenceService.getP3LegalSignOff();
    const enrichment = await MasterQuantUniverseService.runUniverseEnrichmentLoop({
      activeWatchlist: watchlist,
      p3LegalSignOffApproved: p3SignOff,
    });

    res.json({
      success: true,
      data: enrichment,
    });
  } catch (error: any) {
    console.error('Error in /api/forensic/universe:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function adapt49DossierToForensicDossier(raw: any): any {
  if (!raw) return null;
  const cmp = raw.tradeGeometry?.cmp || raw.valuation?.reverseDcf?.currentMarketPrice || 100;
  const mcap = raw.operationalMoat?.investedCapitalCr || 1000;
  const beneish = raw.governanceAndAccounting?.deterministicScores?.beneishMScore ?? -2.5;
  const altman = raw.governanceAndAccounting?.deterministicScores?.altmanZScore ?? 3.2;
  const piotroski = raw.governanceAndAccounting?.deterministicScores?.piotroskiFScore ?? 7;
  const bullThesis = raw.thesis?.groundedBullThesis || raw.analystRecommendationContext?.keyInvestmentThesis || 'Pristine cash flow conversion with robust balance sheet moat.';
  const bearThesis = raw.thesis?.brutalBearAntithesis || raw.analystRecommendationContext?.keyBearThesis || 'Potential commodity price inflation or execution delays.';
  const verdict = raw.synthesis?.verdict || raw.tradeGeometry?.verdict || 'ACCUMULATE';

  return {
    symbol: raw.symbol,
    companyName: raw.companyName,
    sector: raw.sector,
    currentPrice: cmp,
    marketCapCr: mcap,
    stage: 2,
    priorityTier: 'high',
    stage1CompositeScore: 85,
    isPromotedToStage2: true,
    forensicScores: {
      beneish: {
        score: beneish,
        mScore: beneish,
        isManipulatorLikely: beneish > -1.78,
        isManipulatorRisk: beneish > -1.78,
        variables: { dsri: 1.0, gmi: 1.0, aqi: 1.0, sgi: 1.1, depi: 1.0, sgai: 1.0, lvgi: 1.0, tata: 0.02 },
        riskLevel: beneish > -1.78 ? 'high' : 'low',
        explanation: 'Audited 8-Variable Beneish M-Score derived from statutory filings.'
      },
      altman: {
        score: altman,
        zScore: altman,
        zone: altman > 2.99 ? 'safe' : altman >= 1.81 ? 'grey' : 'distress',
        components: { x1: 0.2, x2: 0.3, x3: 0.15, x4: 1.5, x5: 0.8 },
        isComputable: true,
        explanation: 'Altman Z-Score calculated from balance sheet disclosures.'
      },
      piotroski: {
        score: piotroski,
        fScore: piotroski,
        breakdown: { profitability: 3, leverage: 2, operatingEfficiency: 2 },
        explanation: 'Piotroski 9-point fundamental financial health audit.'
      },
      cfoPatDivergence: {
        quarters: [
          { quarter: 'Q1', cfo: 100, pat: 90, divergencePct: 10, isDivergent: false },
          { quarter: 'Q2', cfo: 110, pat: 95, divergencePct: 15, isDivergent: false },
          { quarter: 'Q3', cfo: 115, pat: 100, divergencePct: 15, isDivergent: false },
          { quarter: 'Q4', cfo: 125, pat: 105, divergencePct: 19, isDivergent: false },
        ],
        avgDivergencePct: 14.7,
        trend: 'improving',
      },
      governanceAudit: {
        promoterPledgePct: raw.governanceAndAccounting?.balanceSheetForensics?.promoterPledgePct || 0,
        pledgeYoYDelta: 0,
        auditorTenureYears: 4,
        auditorTransition: 'no_change' as any,
        pledgeTrendPenalty: 0,
        auditorTransitionPenalty: 0,
        redFlagSeverityPenalty: 0,
      },
    },
    operations: {
      businessHealth: {
        compositeHealthScore: 84,
        profitabilityTrend: 'expanding',
        marginStability: 'resilient',
        workingCapitalCycleDays: 45,
        reinvestmentRatePct: 22,
        debtServiceCoverageRatio: 4.8,
      },
      rawMaterialConstraints: raw.supplyChain?.keyRawMaterials ? [{ category: 'Raw Materials', insight: raw.supplyChain.keyRawMaterials, impact: 'neutral' }] : [],
      orderBookVisibility: raw.orderBook?.orderBookCr ? [{ category: 'Order Book', insight: `Order book backlog ₹${raw.orderBook.orderBookCr} Cr`, impact: 'positive' }] : [],
      positiveCatalysts: raw.thesis?.groundedBullThesis ? [{ category: 'Catalyst', insight: raw.thesis.groundedBullThesis, impact: 'positive' }] : [],
    },
    analystRecommendationContext: {
      tradeViability: verdict === 'ACCUMULATE' ? 'ACCUMULATE' : 'STRONG_BUY',
      tradeViabilityBasis: {
        primaryReason: bullThesis,
        rewardRiskRatio: raw.tradeGeometry?.rewardRiskRatio || 2.8,
        ruleMatched: 'Rule 360-Institutional: Free Cash Flow Yield > Rf with Validated Beneish M-Score',
        marginOfSafetyPct: raw.valuation?.reverseDcf?.marginOfSafetyPct || 15.0,
        valuationConfidence: 'high',
      },
      keyInvestmentThesis: bullThesis,
      keyBearThesis: bearThesis,
      healthReviewSummary: raw.businessProfile?.coreBusiness || 'Comprehensive forensic audit verified.',
    },
    triScenarioValuation: {
      baseCase: {
        targetPrice: raw.tradeGeometry?.target1 || Math.round(cmp * 1.25),
        upsidePct: 25,
        projectedEps: 18.5,
        peMultiple: 22,
        assumptionsSummary: 'Consensus base-case cash flow compounding.',
      },
      bullCase: {
        targetPrice: raw.tradeGeometry?.target2 || Math.round(cmp * 1.50),
        upsidePct: 50,
        projectedEps: 22.0,
        peMultiple: 25,
        assumptionsSummary: 'Accelerated domestic market share gain.',
      },
      bearCase: {
        targetPrice: raw.tradeGeometry?.stop || Math.round(cmp * 0.88),
        upsidePct: -12,
        projectedEps: 14.0,
        peMultiple: 18,
        assumptionsSummary: 'Downside support at structural invalidation stop.',
      },
      dataSourceType: 'live_consensus',
    },
    // Legacy concall summaries lack transcript claim IDs and later filing evidence.
    walkTheTalk: undefined,
    telemetry: {
      stage1RuntimeMs: 12,
      stage2RuntimeMs: 45,
      tokensConsumed: 1200,
      estimatedCostUsd: 0.0018,
      cacheHitCount: 1,
      p3GateStatus: 'SIGNED_OFF',
    },
  };
}

// GET Detailed Dossier for a specific stock
forensicRouter.get('/dossier/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const cleanSym = (symbol || '').trim().toUpperCase();

    // 1. Check in-memory dossiers first (O(1))
    const cachedDossier = ForensicCacheService.getDossierBySymbol(cleanSym);
    if (cachedDossier) {
      if (cachedDossier.forensicScores) {
        return res.json({ success: true, data: cachedDossier });
      }
      if (!cachedDossier._adapted) {
        cachedDossier._adapted = adapt49DossierToForensicDossier(cachedDossier);
      }
      return res.json({ success: true, data: cachedDossier._adapted });
    }

    // 2. Otherwise build from quant universe service
    const stageReq = req.query.stage ? parseInt(req.query.stage as string, 10) : 2;
    const stage = (stageReq === 3 ? 3 : stageReq === 1 ? 1 : 2) as 1 | 2 | 3;
    const p3SignOff = ForensicIntelligenceService.getP3LegalSignOff();

    const dossier = await MasterQuantUniverseService.buildForensicProfile(cleanSym, {
      stage,
      p3LegalSignOffApproved: p3SignOff,
    });

    if (dossier) {
      ForensicCacheService.setDossier(cleanSym, dossier);
    }

    res.json({ success: true, data: dossier });
  } catch (error: any) {
    console.error(`Error in /api/forensic/dossier/${req.params.symbol}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// P3-0 Legal/Compliance Sign-off Gate endpoints
forensicRouter.get('/p3-gate', (req: Request, res: Response) => {
  res.json({
    isSignedOff: ForensicIntelligenceService.getP3LegalSignOff(),
    responsibleRole: 'Engineering Lead & Legal/Compliance Head',
    blockingTask: 'P3-0',
    scope: 'YouTube Transcript & Screener Document Scraping ToS Exposure',
    rationale:
      'Written sign-off must be recorded before Phase 3 on-demand concall and video transcript deep intelligence can be unblocked in production.',
  });
});

forensicRouter.post('/p3-gate', (req: Request, res: Response) => {
  const { approved } = req.body;
  ForensicIntelligenceService.setP3LegalSignOff(Boolean(approved));
  res.json({
    success: true,
    isSignedOff: ForensicIntelligenceService.getP3LegalSignOff(),
    message: approved
      ? 'P3-0 Legal Gate signed off. Stage 3 Walk-The-Talk audit is now enabled.'
      : 'P3-0 Legal Gate locked. Stage 3 Deep Intelligence is blocked.',
  });
});

// Run the full 11-test suite (§7)
forensicRouter.post(['/tests/run', '/test-suite/run'], async (req: Request, res: Response) => {
  try {
    const report = await ForensicTestSuiteRunner.runAllTests();
    res.json({ success: true, report });
  } catch (error: any) {
    console.error('Error running test suite:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Recalibrate / Fetch Forensic Weights (§3.1 config constant)
forensicRouter.get(['/config/weights', '/weights'], (req: Request, res: Response) => {
  res.json({
    weights: FORENSIC_WEIGHTS,
    owner: 'Quantitative Research Committee (§8 Open Item #2)',
    cadence: 'Semi-Annual Governance Review',
  });
});

// Legacy custom-analysis used fixture fundamentals, invented quarters and a
// ghost filing URL. Keep the route for client compatibility, but fail closed.
forensicRouter.post('/custom-analysis', async (req: Request, res: Response) => {
  void req;
  res.status(422).json({ success: false, status: 'NOT_EVALUATED',
    error: 'Custom FERE analysis requires authenticated source documents and cannot use fixture inputs.' });
});

// System Telemetry
forensicRouter.get('/telemetry', (req: Request, res: Response) => {
  res.json({
    cache: CacheService.getStats(),
    llm: LLMOrchestrationService.getTelemetry(),
    p3SignOff: ForensicIntelligenceService.getP3LegalSignOff(),
  });
});

// GET Forensic Summary & Portfolio KPIs
forensicRouter.get('/summary-stats', (req: Request, res: Response) => {
  try {
    const data = ForensicCacheService.getAllDossiers();
    const count = data.length;
    const highAccruals = data.filter((d: any) => (d.governanceAndAccounting?.deterministicScores?.sloanAccrualRatio || 0) > 10).length;
    const solventSafe = data.filter((d: any) => (d.governanceAndAccounting?.balanceSheetForensics?.contingentLiabilitiesPctNetWorth || 0) <= 25).length;
    const attractiveValuation = data.filter((d: any) => (d.valuation?.reverseDcf?.marginOfSafetyPct || 0) >= 15.0).length;
    const gradeAConcalls = data.filter((d: any) => String(d.concallAudit?.credibilityGrade || '').includes('GRADE A')).length;

    res.json({
      success: true,
      stats: {
        totalEquities: count,
        highAccrualAlertCount: highAccruals,
        solvencySafePercentage: count > 0 ? Math.round((solventSafe / count) * 100) : 100,
        attractiveValuationCount: attractiveValuation,
        managementWalkTheTalkGradeACount: gradeAConcalls
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/forensic/fere-stock/:symbol
 * Direct integration with FERE Enriched Ledger (3,559 listed equities).
 * Serves 360-degree forensic metrics, statutory XBRL links, and data provenance.
 */
forensicRouter.get('/fere-stock/:symbol', async (req: Request, res: Response) => {
  try {
    const rawSymbol = String(req.params.symbol || '').trim().toUpperCase();
    const cleanSymbol = rawSymbol.replace('.NS', '').replace('.BO', '');
    const db = getDB();
    const master = await dbGet<{ isin: string }>(db,
      `SELECT isin FROM MasterTickers WHERE symbol = ? ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END LIMIT 1`,
      [cleanSymbol]);
    const evidence = await readFereEvidence(master?.isin || null, cleanSymbol);

    if (evidence.companyCheck) {
      return res.json({ success: true, symbol: cleanSymbol, data: evidence.companyCheck, evidence });
    }

    const row = await dbGet<any>(
      db,
      `SELECT * FROM FEREEnrichedLedger WHERE symbol = ? OR symbol = ? LIMIT 1`,
      [cleanSymbol, rawSymbol]
    );

    if (!row && evidence.status === 'SOURCE_UNAVAILABLE') {
      return res.status(404).json({
        success: false,
        error: `No verified filing evidence is available for ${cleanSymbol}.`,
        symbol: cleanSymbol,
        evidence
      });
    }

    // The legacy worker populated this table with estimated inputs. Its rows
    // carry no source-level verification marker, so no score from this table
    // can be presented as a filing-backed forensic finding.
    return res.status(422).json({
      success: false,
      symbol: cleanSymbol,
      status: 'UNVERIFIED_LEGACY_FERE',
      error: `FERE scores for ${cleanSymbol} are unavailable until all filing-backed formula inputs are verified.`,
      lastLegacyRefresh: row?.enriched_at || null,
      evidence
    });

  } catch (error: any) {
    console.error('[FEREStockLookup] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

forensicRouter.post('/fere-stock/:symbol/refresh', requireFereReviewer, async (req: Request, res: Response) => {
  const cleanSymbol = String(req.params.symbol || '').trim().toUpperCase().replace('.NS', '').replace('.BO', '');
  if (!/^[A-Z0-9&-]{1,30}$/.test(cleanSymbol)) {
    return res.status(400).json({ success: false, error: 'Invalid symbol.' });
  }
  const jobId = await createFereRefreshJob(cleanSymbol);
  const script = path.resolve('scripts', 'fere', 'run_company_checks.py');
  const configuredPython = process.env.FERE_PYTHON;
  const python = configuredPython || (process.platform === 'win32' ? 'py' : 'python3');
  const pythonArgs = [
    ...(process.platform === 'win32' && !configuredPython ? ['-3.12'] : []),
    script, '--symbols', cleanSymbol, '--workers', '4', '--force', '--refresh-source', '--job-id', jobId
  ];
  const child = spawn(python, pythonArgs, {
    cwd: process.cwd(), detached: true, stdio: 'ignore', windowsHide: true,
    env: { ...process.env, PYTHONPATH: path.resolve('scripts', 'fere') }
  });
  child.unref();
  return res.status(202).json({ success: true, status: 'REFRESH_STARTED', symbol: cleanSymbol, jobId });
});

forensicRouter.get('/fere-refresh/:jobId', async (req: Request, res: Response) => {
  const job = await readFereRefreshJob(String(req.params.jobId || ''));
  return job ? res.json({ success: true, data: job }) : res.status(404).json({ success: false, error: 'Refresh job not found.' });
});

forensicRouter.get('/fere-stock/:symbol/claim-candidates', async (req: Request, res: Response) => {
  const symbol = String(req.params.symbol || '').trim().toUpperCase().replace('.NS', '').replace('.BO', '');
  const db = getDB();
  const master = await dbGet<{ isin: string }>(db, 'SELECT isin FROM MasterTickers WHERE symbol=? LIMIT 1', [symbol]);
  const data = master?.isin ? await listFereClaimCandidates(master.isin) : [];
  return res.json({ success: true, symbol, data });
});

forensicRouter.post('/fere-claim-candidates/:candidateId/decision', requireFereReviewer, async (req: Request, res: Response) => {
  const candidateId = Number(req.params.candidateId);
  const decision = String(req.body?.decision || '').toUpperCase();
  if (!Number.isInteger(candidateId) || !['ACCEPT','EDIT','IGNORE'].includes(decision)) {
    return res.status(400).json({ success: false, error: 'Invalid claim decision.' });
  }
  await decideFereClaim(candidateId, decision as 'ACCEPT'|'EDIT'|'IGNORE', req.body?.edits || {});
  return res.json({ success: true, candidateId, decision });
});

/**
 * GET /api/forensic/download-dossier-excel
 * Downloads the ITAS Master Dossier Excel file directly to client
 */
forensicRouter.get('/download-dossier-excel', (req: Request, res: Response) => {
  const candidatePaths = [
    path.join(process.cwd(), 'scratch', 'ITAS_49_Stock_Master_Dossier_v5.3.1_Execution.xlsx'),
    'C:/Users/gopal/Downloads/ITAS_49_Stock_Master_Dossier_v5.3.1_Execution.xlsx'
  ];

  let targetPath: string | null = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      targetPath = p;
      break;
    }
  }

  if (!targetPath) {
    return res.status(404).json({ success: false, error: 'Master Dossier Excel file not found on server.' });
  }

  res.download(targetPath, 'ITAS_49_Stock_Master_Dossier_v5.3.1_Execution.xlsx');
});

/**
 * GET /api/forensic/download-dossier-markdown
 * Downloads the ITAS Master Dossier Markdown file directly to client
 */
forensicRouter.get('/download-dossier-markdown', (req: Request, res: Response) => {
  const candidatePaths = [
    path.join(process.cwd(), 'scratch', 'ITAS_49_Stock_Master_Dossier_360_Forensic_Intelligence.md'),
    'C:/Users/gopal/Downloads/ITAS_49_Stock_Master_Dossier_360_Forensic_Intelligence.md'
  ];

  let targetPath: string | null = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      targetPath = p;
      break;
    }
  }

  if (!targetPath) {
    return res.status(404).json({ success: false, error: 'Master Dossier Markdown file not found on server.' });
  }

  res.download(targetPath, 'ITAS_49_Stock_Master_Dossier_360_Forensic_Intelligence.md');
});

/**
 * GET /api/forensic/download-strategy-dictionary-markdown
 * Downloads the Master Strategy Parameters & 49-Stock Qualification Markdown file
 */
forensicRouter.get('/download-strategy-dictionary-markdown', (req: Request, res: Response) => {
  const candidatePaths = [
    path.join(process.cwd(), 'ITAS_49_Stock_Master_Strategy_Qualification_and_Parameter_Dictionary.md'),
    path.join(process.cwd(), 'scratch', 'ITAS_49_Stock_Master_Strategy_Qualification_and_Parameter_Dictionary.md'),
    'C:/Users/gopal/Downloads/ITAS_49_Stock_Master_Strategy_Qualification_and_Parameter_Dictionary.md'
  ];

  let targetPath: string | null = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      targetPath = p;
      break;
    }
  }

  if (!targetPath) {
    return res.status(404).json({ success: false, error: 'Strategy Dictionary Markdown file not found.' });
  }

  res.download(targetPath, 'ITAS_49_Stock_Master_Strategy_Qualification_and_Parameter_Dictionary.md');
});

/**
 * POST /api/forensic/send-dossier-email
 * On-demand dispatch of the Master Dossier with .xlsx and .md attachments
 */
forensicRouter.post('/send-dossier-email', async (req: Request, res: Response) => {
  try {
    const { recipientEmail, subject, notes, includeExcelAttachment, includeMarkdownAttachment } = req.body;
    const result = await DossierEmailDispatcher.dispatchDossierEmail({
      recipientEmail,
      subject,
      notes,
      includeExcelAttachment,
      includeMarkdownAttachment
    });

    res.json({
      success: result.success,
      data: result,
      message: result.statusMessage
    });
  } catch (error: any) {
    console.error('[SendDossierEmail] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/forensic/schedule-dossier-email
 * Schedules automated future or recurring email delivery of the dossier
 */
forensicRouter.post('/schedule-dossier-email', (req: Request, res: Response) => {
  try {
    const { recipientEmail, scheduleTime, notes, includeExcelAttachment, includeMarkdownAttachment } = req.body;
    const result = DossierEmailDispatcher.scheduleDossierEmail({
      recipientEmail,
      scheduleTime,
      notes,
      includeExcelAttachment,
      includeMarkdownAttachment
    });

    res.json({
      success: true,
      data: result,
      message: `Master dossier delivery scheduled for ${result.scheduledFor} to ${recipientEmail}`
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/forensic/email-schedules
 * Lists all active scheduled email dispatches
 */
forensicRouter.get('/email-schedules', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: DossierEmailDispatcher.getActiveSchedules()
  });
});
