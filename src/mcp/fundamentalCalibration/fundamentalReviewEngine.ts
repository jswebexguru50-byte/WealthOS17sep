/**
 * WealthOS Fundamental Interpretation Calibration Engine
 * Master Specification — Section 4, 5, 6, 7, 12: Review Runs & Systemic Clustering
 *
 * Persists review runs, stores reviewed claims, clusters systemic defects,
 * and maintains audit traceability without losing progress on restart.
 */

import fs from 'fs';
import path from 'path';
import {
  FundamentalReviewRun,
  ReviewedClaimResult,
  SystemicCluster,
  ReviewOutcome,
  FailureTaxonomy
} from './types.js';

const STORAGE_DIR = path.resolve('reports/fundamental-review');
const RUNS_FILE = path.join(STORAGE_DIR, 'calibration_runs.json');

function ensureDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function loadRuns(): Record<string, FundamentalReviewRun> {
  ensureDir();
  if (fs.existsSync(RUNS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(RUNS_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveRuns(runs: Record<string, FundamentalReviewRun>) {
  ensureDir();
  fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2));
}

export class FundamentalReviewEngine {
  /**
   * Initializes and persists a new fundamental calibration review run.
   */
  static createReviewRun(
    name: string,
    phase: 'PILOT' | 'CALIBRATION' | 'FULL' = 'PILOT',
    cohort: Array<{ symbol: string; companyName: string; sector: string | null; capCategory: string; rationale: string; }>,
    customRunId?: string
  ): FundamentalReviewRun {
    const runs = loadRuns();
    const count = Object.keys(runs).length + 1;
    const runId = customRunId || (phase === 'PILOT' ? 'PILOT_RUN_001' : `RUN_${phase}_${String(count).padStart(3, '0')}`);

    const newRun: FundamentalReviewRun = {
      runId,
      name,
      phase,
      createdAt: new Date().toISOString(),
      status: 'IN_PROGRESS',
      cohort,
      totalCompanies: cohort.length,
      totalClaimsReviewed: 0,
      outcomesSummary: {
        SUPPORTED: 0,
        REASONABLE: 0,
        QUESTIONABLE: 0,
        UNSUPPORTED: 0,
        INSUFFICIENT_EVIDENCE: 0
      },
      moduleBreakdown: {},
      issueTypeCounts: {
        DATA_ERROR: 0,
        DERIVATION_ERROR: 0,
        PERIOD_ALIGNMENT_ERROR: 0,
        SCOPE_ERROR: 0,
        UNIT_ERROR: 0,
        INTERPRETATION_RULE_ERROR: 0,
        CONTEXT_MISSING: 0,
        SECTOR_CONTEXT_MISSING: 0,
        EVIDENCE_ERROR: 0,
        STALE_DATA: 0,
        INSUFFICIENT_EVIDENCE: 0,
        OTHER: 0
      },
      reviewedClaims: [],
      clusters: []
    };

    runs[runId] = newRun;
    saveRuns(runs);
    return newRun;
  }

  /**
   * Records reviewed claims into a run and updates outcome and issue distributions.
   */
  static recordReviews(runId: string, reviews: ReviewedClaimResult[]): FundamentalReviewRun {
    const runs = loadRuns();
    const run = runs[runId];
    if (!run) {
      throw new Error(`RUN_NOT_FOUND: Review run '${runId}' does not exist.`);
    }

    for (const rev of reviews) {
      // Check if already reviewed (idempotent update)
      const existingIdx = run.reviewedClaims.findIndex(c => c.claimId === rev.claimId);
      if (existingIdx >= 0) {
        run.reviewedClaims[existingIdx] = rev;
      } else {
        run.reviewedClaims.push(rev);
      }
    }

    // Recompute summaries
    run.totalClaimsReviewed = run.reviewedClaims.length;
    run.outcomesSummary = {
      SUPPORTED: 0,
      REASONABLE: 0,
      QUESTIONABLE: 0,
      UNSUPPORTED: 0,
      INSUFFICIENT_EVIDENCE: 0
    };

    run.issueTypeCounts = {
      DATA_ERROR: 0,
      DERIVATION_ERROR: 0,
      PERIOD_ALIGNMENT_ERROR: 0,
      SCOPE_ERROR: 0,
      UNIT_ERROR: 0,
      INTERPRETATION_RULE_ERROR: 0,
      CONTEXT_MISSING: 0,
      SECTOR_CONTEXT_MISSING: 0,
      EVIDENCE_ERROR: 0,
      STALE_DATA: 0,
      INSUFFICIENT_EVIDENCE: 0,
      OTHER: 0
    };

    run.moduleBreakdown = {};

    for (const claim of run.reviewedClaims) {
      if (run.outcomesSummary[claim.reviewStatus] !== undefined) {
        run.outcomesSummary[claim.reviewStatus]++;
      }
      if (Array.isArray(claim.issueTypes)) {
        for (const issue of claim.issueTypes) {
          if (run.issueTypeCounts[issue] !== undefined) {
            run.issueTypeCounts[issue]++;
          }
        }
      } else if (claim.issueType && run.issueTypeCounts[claim.issueType] !== undefined) {
        run.issueTypeCounts[claim.issueType]++;
      }

      if (!run.moduleBreakdown[claim.module]) {
        run.moduleBreakdown[claim.module] = { supported: 0, questionedOrUnsupported: 0, missing: 0 };
      }
      if (claim.reviewStatus === 'SUPPORTED' || claim.reviewStatus === 'REASONABLE') {
        run.moduleBreakdown[claim.module].supported++;
      } else if (claim.reviewStatus === 'QUESTIONABLE' || claim.reviewStatus === 'UNSUPPORTED') {
        run.moduleBreakdown[claim.module].questionedOrUnsupported++;
      } else {
        run.moduleBreakdown[claim.module].missing++;
      }
    }

    // Generate clusters automatically from current findings
    run.clusters = this.generateSystemicClusters(run.reviewedClaims);

    runs[runId] = run;
    saveRuns(runs);
    return run;
  }

  /**
   * Clusters questionable and unsupported findings by systemic root causes (Section 12)
   */
  static generateSystemicClusters(claims: ReviewedClaimResult[]): SystemicCluster[] {
    const problematic = claims.filter(c => c.reviewStatus === 'QUESTIONABLE' || c.reviewStatus === 'UNSUPPORTED');
    const clusters: SystemicCluster[] = [];

    // 1. Sector Context Missing (e.g. Banking / Financials evaluated with non-financial rules)
    const sectorIssues = problematic.filter(c => c.issueTypes.includes('SECTOR_CONTEXT_MISSING'));
    if (sectorIssues.length > 0) {
      clusters.push({
        clusterId: 'CLUSTER_SECTOR_CONTEXT_01',
        clusterName: 'Financial / Banking Sector Rule Incompatibility',
        category: 'SECTOR_CONTEXT',
        affectedSymbols: Array.from(new Set(sectorIssues.map(c => c.symbol))),
        affectedClaimIds: sectorIssues.map(c => c.claimId),
        rootCauseSummary: 'Generic non-financial balance sheet or margin rules applied to banks/NBFCs without adapting for NIM or loan book leverage.',
        issueTypes: ['SECTOR_CONTEXT_MISSING', 'INTERPRETATION_RULE_ERROR'],
        suggestedGeneralRemediation: 'Ensure BusinessModelClassifier routes banks and NBFCs to dedicated banking ratio evaluation (NIM, Cost-to-Income, Gross NPA) instead of EBITDA margin.',
        forbiddenCompanyHardcoding: ['Do NOT write `if (symbol === "HDFCBANK")`', 'Use businessModel === "BANK" or "NBFC"']
      });
    }

    // 2. Margin Trajectory Rule (e.g. Small bps variations labeled STABLE vs CONTRACTING)
    const marginIssues = problematic.filter(c => c.dimension === 'MARGIN_TRAJECTORY');
    if (marginIssues.length > 0) {
      clusters.push({
        clusterId: 'CLUSTER_MARGIN_INTERPRETATION_02',
        clusterName: 'Margin Delta Threshold & Scale Sensitivity',
        category: 'MARGIN_INTERPRETATION',
        affectedSymbols: Array.from(new Set(marginIssues.map(c => c.symbol))),
        affectedClaimIds: marginIssues.map(c => c.claimId),
        rootCauseSummary: 'Fixed 50 bps threshold treats tiny delta in high-margin businesses the same as razor-thin margin businesses.',
        issueTypes: ['INTERPRETATION_RULE_ERROR'],
        suggestedGeneralRemediation: 'Adopt proportional margin delta (e.g. delta relative to baseline margin) alongside absolute bps threshold.',
        forbiddenCompanyHardcoding: ['Do NOT write symbol-specific margin thresholds']
      });
    }

    // 3. Return Profile / ROCE Missing in Financials
    const returnIssues = problematic.filter(c => c.dimension === 'RETURN_PROFILE');
    if (returnIssues.length > 0) {
      clusters.push({
        clusterId: 'CLUSTER_ROCE_ROE_03',
        clusterName: 'Capital Efficiency Metric Selection & Thresholds',
        category: 'ROCE_ROE_INTERPRETATION',
        affectedSymbols: Array.from(new Set(returnIssues.map(c => c.symbol))),
        affectedClaimIds: returnIssues.map(c => c.claimId),
        rootCauseSummary: 'Static 18% ROCE threshold labels capital-intensive utilities or regulated infrastructure as low return without considering cost of capital or regulatory ROE.',
        issueTypes: ['INTERPRETATION_RULE_ERROR', 'CONTEXT_MISSING'],
        suggestedGeneralRemediation: 'Introduce sector-specific return benchmarks (e.g. 12-14% for regulated utilities/infra, 15%+ for banks, 18%+ for asset-light FMCG/IT).',
        forbiddenCompanyHardcoding: ['Do NOT hardcode utility company names']
      });
    }

    // 4. Data / Evidence Missing in Partial Data Equities
    const dataIssues = problematic.filter(c => c.issueTypes.includes('INSUFFICIENT_EVIDENCE') || c.issueTypes.includes('DATA_ERROR'));
    if (dataIssues.length > 0) {
      clusters.push({
        clusterId: 'CLUSTER_DATA_SANITY_04',
        clusterName: 'Sparse Statement History & Multi-Period Fallback',
        category: 'DATA_SANITY',
        affectedSymbols: Array.from(new Set(dataIssues.map(c => c.symbol))),
        affectedClaimIds: dataIssues.map(c => c.claimId),
        rootCauseSummary: 'Companies with single-year or partial snapshots lack multi-year comparative trajectory, triggering DATA_INSUFFICIENT.',
        issueTypes: ['INSUFFICIENT_EVIDENCE', 'DATA_ERROR'],
        suggestedGeneralRemediation: 'Clearly label single-period analysis as LEVEL_ONLY without inferring trajectory or acceleration.',
        forbiddenCompanyHardcoding: ['Do NOT invent synthetic prior periods for sparse stocks']
      });
    }

    return clusters;
  }

  /**
   * Retrieves a review run by ID.
   */
  static getReviewRun(runId: string): FundamentalReviewRun {
    const runs = loadRuns();
    const run = runs[runId];
    if (!run) {
      throw new Error(`RUN_NOT_FOUND: Review run '${runId}' not found.`);
    }
    return run;
  }

  /**
   * Freezes a run so its baseline cannot be modified.
   */
  static freezeRun(runId: string): FundamentalReviewRun {
    const runs = loadRuns();
    const run = runs[runId];
    if (!run) throw new Error(`RUN_NOT_FOUND: Review run '${runId}' not found.`);
    run.status = 'FROZEN';
    runs[runId] = run;
    saveRuns(runs);
    return run;
  }
}
