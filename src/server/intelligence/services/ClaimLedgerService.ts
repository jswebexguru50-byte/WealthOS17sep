/**
 * ClaimLedgerService.ts
 *
 * Layer 3 & Layer 4 Service:
 * Manages the lifecycle of Management Claims and computes the categorical
 * Management Credibility Scorecard without false numerical decimals.
 * Enforces temporal semantics (Constitution Article 26) and evidence lineage.
 */

import sqlite3 from 'sqlite3';
import { ManagementClaim, ClaimStatus, ManagementCredibilityScorecard, CredibilityGrade } from '../types/ManagementClaim.js';

export class ClaimLedgerService {
  private db: sqlite3.Database;

  constructor(db: sqlite3.Database) {
    this.db = db;
  }

  /**
   * Records a new management claim anchored strictly to an evidenceId.
   */
  public async recordClaim(claim: Omit<ManagementClaim, 'createdAt'>): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO ManagementClaims (
          claim_id, symbol, issuer_bse_code, period, category, statement,
          target_metric, baseline_value, expected_value, expected_outcome,
          expected_timeframe, evidence_id, status, actual_outcome_metric,
          actual_outcome_description, resolution_evidence_id, resolved_at,
          claim_date, expected_period_start, expected_period_end,
          evaluation_date, evaluation_basis, evaluation_evidence_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      const params = [
        claim.claimId,
        claim.issuerNseSymbol,
        claim.issuerBseCode || null,
        claim.period,
        claim.category,
        claim.statement,
        claim.targetMetric || null,
        claim.baselineValue ?? null,
        claim.expectedValue ?? null,
        claim.expectedOutcome || null,
        claim.expectedTimeframe || null,
        claim.evidenceId,
        claim.status || 'OPEN',
        claim.actualOutcomeMetric ?? null,
        claim.actualOutcomeDescription || null,
        claim.resolutionEvidenceId || null,
        claim.resolvedAt || null,
        claim.claimDate || null,
        claim.expectedPeriodStart || null,
        claim.expectedPeriodEnd || null,
        claim.evaluationDate || null,
        claim.evaluationBasis || null,
        claim.evaluationEvidenceId || null
      ];
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Resolves a claim against subsequent disclosed evidence with temporal validation.
   */
  public async resolveClaim(
    claimId: string,
    actualOutcomeMetric: number | null,
    actualOutcomeDescription: string,
    resolutionEvidenceId: string,
    status: ClaimStatus,
    currentDate = new Date().toISOString().split('T')[0]
  ): Promise<void> {
    // Check temporal constraint
    const claim = await this.getClaimById(claimId);
    if (!claim) throw new Error(`Claim '${claimId}' not found`);

    if (status === 'MISSED' && claim.expectedPeriodEnd && currentDate < claim.expectedPeriodEnd) {
      throw new Error(`Cannot mark claim '${claimId}' as MISSED: current date (${currentDate}) is before expected period end (${claim.expectedPeriodEnd})`);
    }

    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE ManagementClaims
        SET status = ?,
            actual_outcome_metric = ?,
            actual_outcome_description = ?,
            resolution_evidence_id = ?,
            evaluation_evidence_id = ?,
            evaluation_date = ?,
            evaluation_basis = ?,
            resolved_at = CURRENT_TIMESTAMP
        WHERE claim_id = ?;
      `;
      this.db.run(sql, [
        status,
        actualOutcomeMetric,
        actualOutcomeDescription,
        resolutionEvidenceId,
        resolutionEvidenceId,
        currentDate,
        actualOutcomeDescription,
        claimId
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async getClaimById(claimId: string): Promise<ManagementClaim | null> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM ManagementClaims WHERE claim_id = ?;`;
      this.db.get(sql, [claimId], (err, r: any) => {
        if (err) return reject(err);
        if (!r) return resolve(null);
        resolve(this.mapRowToClaim(r));
      });
    });
  }

  /**
   * Retrieves all claims for an issuer.
   */
  public async getClaimsForIssuer(symbol: string): Promise<ManagementClaim[]> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM ManagementClaims WHERE symbol = ? ORDER BY period ASC, created_at ASC;`;
      this.db.all(sql, [symbol], (err, rows: any[]) => {
        if (err) return reject(err);
        const mapped: ManagementClaim[] = (rows || []).map(r => this.mapRowToClaim(r));
        resolve(mapped);
      });
    });
  }

  private mapRowToClaim(r: any): ManagementClaim {
    return {
      claimId: r.claim_id,
      issuerNseSymbol: r.symbol,
      issuerBseCode: r.issuer_bse_code,
      period: r.period,
      category: r.category,
      statement: r.statement,
      targetMetric: r.target_metric,
      baselineValue: r.baseline_value,
      expectedValue: r.expected_value,
      expectedOutcome: r.expected_outcome,
      expectedTimeframe: r.expected_timeframe,
      claimDate: r.claim_date,
      expectedPeriodStart: r.expected_period_start,
      expectedPeriodEnd: r.expected_period_end,
      evaluationDate: r.evaluation_date,
      evaluationBasis: r.evaluation_basis,
      evaluationEvidenceId: r.evaluation_evidence_id,
      evidenceId: r.evidence_id,
      status: r.status,
      actualOutcomeMetric: r.actual_outcome_metric,
      actualOutcomeDescription: r.actual_outcome_description,
      resolutionEvidenceId: r.resolution_evidence_id,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at
    };
  }

  /**
   * Evaluates the categorical Management Credibility Scorecard.
   * Enforces Article 12 & 13: Prefer categorical grades over false decimal precision.
   */
  public async getCredibilityScorecard(symbol: string): Promise<ManagementCredibilityScorecard> {
    const claims = await this.getClaimsForIssuer(symbol);

    let achieved = 0;
    let partial = 0;
    let missed = 0;
    let reversed = 0;
    let open = 0;
    let dueForEvaluation = 0;
    let unresolved = 0;

    claims.forEach(c => {
      if (c.status === 'ACHIEVED') achieved++;
      else if (c.status === 'PARTIALLY_ACHIEVED') partial++;
      else if (c.status === 'MISSED') missed++;
      else if (c.status === 'REVERSED') reversed++;
      else if (c.status === 'DUE_FOR_EVALUATION') dueForEvaluation++;
      else if (c.status === 'OPEN') open++;
      else unresolved++;
    });

    const totalEvaluated = achieved + partial + missed + reversed;
    let grade: CredibilityGrade = 'INSUFFICIENT_HISTORY';

    if (totalEvaluated < 2) {
      grade = 'INSUFFICIENT_HISTORY';
    } else {
      const successRatio = (achieved + (partial * 0.5)) / totalEvaluated;
      if (successRatio >= 0.80 && missed === 0) {
        grade = 'STRONG';
      } else if (successRatio >= 0.60) {
        grade = 'GENERALLY_CREDIBLE';
      } else if (successRatio >= 0.40) {
        grade = 'MIXED';
      } else {
        grade = 'WEAK';
      }
    }

    const keyExamples = claims
      .filter(c => c.status !== 'OPEN' && c.status !== 'DUE_FOR_EVALUATION')
      .slice(0, 5)
      .map(c => ({
        claimId: c.claimId,
        statement: c.statement,
        period: c.period,
        expected: c.expectedOutcome || c.statement,
        actual: c.actualOutcomeDescription || 'Disclosed financial outcome',
        status: c.status,
        evidenceLineage: `Evidence#${c.evidenceId} -> Resolution#${c.resolutionEvidenceId || c.evaluationEvidenceId || 'PENDING'}`
      }));

    return {
      symbol,
      grade,
      totalClaims: claims.length,
      achievedCount: achieved,
      partiallyAchievedCount: partial,
      missedCount: missed,
      reversedCount: reversed,
      openCount: open,
      dueForEvaluationCount: dueForEvaluation,
      unresolvedCount: unresolved,
      keyEvidencedExamples: keyExamples
    };
  }
}
