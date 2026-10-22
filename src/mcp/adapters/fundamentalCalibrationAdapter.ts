/**
 * WealthOS Fundamental Calibration Adapter
 * Master Specification — Section 7: Review Plane Tools
 *
 * Bridges the FundamentalReviewEngine and FundamentalReviewPackageBuilder
 * to the MCP Review Plane.
 */

import { FundamentalReviewPackageBuilder } from '../fundamentalCalibration/fundamentalReviewPackageBuilder.js';
import { FundamentalReviewEngine } from '../fundamentalCalibration/fundamentalReviewEngine.js';
import { ReviewedClaimResult } from '../fundamentalCalibration/types.js';

export class FundamentalCalibrationAdapter {
  static async getReviewInputs(symbol: string, asOfDate?: string) {
    return FundamentalReviewPackageBuilder.buildReviewPackage(symbol, asOfDate);
  }

  static createReviewRun(
    name: string,
    phase: 'PILOT' | 'CALIBRATION' | 'FULL' = 'PILOT',
    cohort: Array<{ symbol: string; companyName: string; sector: string | null; capCategory: string; rationale: string; }>
  ) {
    return FundamentalReviewEngine.createReviewRun(name, phase, cohort);
  }

  static recordReviews(runId: string, reviews: ReviewedClaimResult[]) {
    return FundamentalReviewEngine.recordReviews(runId, reviews);
  }

  static getReviewRun(runId: string) {
    return FundamentalReviewEngine.getReviewRun(runId);
  }

  static getReviewFindings(runId: string, filter?: 'ALL' | 'QUESTIONED_OR_UNSUPPORTED') {
    const run = FundamentalReviewEngine.getReviewRun(runId);
    if (filter === 'QUESTIONED_OR_UNSUPPORTED') {
      return run.reviewedClaims.filter(c => c.reviewStatus === 'QUESTIONABLE' || c.reviewStatus === 'UNSUPPORTED');
    }
    return run.reviewedClaims;
  }

  static getReviewClusters(runId: string) {
    const run = FundamentalReviewEngine.getReviewRun(runId);
    return run.clusters;
  }

  static freezeRun(runId: string) {
    return FundamentalReviewEngine.freezeRun(runId);
  }
}
