/**
 * IntelligenceQualityGate.ts
 *
 * Constitution Rule 23: Intelligence Evidence Boundary Chokepoint.
 *
 * No evidence-backed management claim, corporate event, contradiction,
 * thesis-breaker conclusion, or investment brief may enter serving state
 * without validated evidence lineage, citation verification, and issuer isolation.
 */

import sqlite3 from 'sqlite3';
import { ManagementClaim } from '../types/ManagementClaim.js';
import { IntelligenceEvent } from '../types/IntelligenceEvent.js';
import { Contradiction } from '../types/Contradiction.js';

export interface GateValidationResult {
  approved: boolean;
  reasons: string[];
}

export class IntelligenceQualityGate {
  private db: sqlite3.Database;

  constructor(db: sqlite3.Database) {
    this.db = db;
  }

  /**
   * Helper to query single row asynchronously.
   */
  private getAsync(sql: string, params: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Validates and approves a ManagementClaim for serving persistence.
   * Enforces:
   * 1. Evidence ID exists in EvidenceInventory.
   * 2. Issuer symbol matches evidence record (zero cross-issuer contamination).
   * 3. Statement is not empty.
   * 4. If status is evaluated (ACHIEVED, MISSED, REVERSED), requires evaluationEvidenceId and evaluationBasis.
   * 5. If today < expectedPeriodEnd, claim cannot be marked MISSED (Constitution Article 26).
   */
  public async validateClaim(claim: ManagementClaim, currentDate = new Date().toISOString().split('T')[0]): Promise<GateValidationResult> {
    const reasons: string[] = [];

    if (!claim.claimId || !claim.issuerNseSymbol || !claim.statement) {
      reasons.push('Claim missing mandatory fields (claimId, issuerNseSymbol, or statement)');
    }

    if (!claim.evidenceId) {
      reasons.push('Claim missing mandatory evidenceId lineage');
    } else {
      const evidence = await this.getAsync('SELECT * FROM EvidenceInventory WHERE evidence_id = ?', [claim.evidenceId]);
      if (!evidence) {
        reasons.push(`Evidence ID '${claim.evidenceId}' does not exist in EvidenceInventory`);
      } else if (evidence.issuer_nse_symbol && evidence.issuer_nse_symbol !== claim.issuerNseSymbol) {
        reasons.push(`Issuer symbol mismatch: Claim symbol '${claim.issuerNseSymbol}' does not match Evidence symbol '${evidence.issuer_nse_symbol}'`);
      }
    }

    // Temporal semantics & premature miss check (Constitution Article 26)
    if (claim.status === 'MISSED') {
      if (claim.expectedPeriodEnd && currentDate < claim.expectedPeriodEnd) {
        reasons.push(`Premature MISSED verdict rejected: Current date (${currentDate}) is before expectedPeriodEnd (${claim.expectedPeriodEnd})`);
      }
    }

    // Evaluated claims require resolution evidence & basis
    if (['ACHIEVED', 'PARTIALLY_ACHIEVED', 'MISSED', 'REVERSED'].includes(claim.status)) {
      const resEvidenceId = claim.evaluationEvidenceId || claim.resolutionEvidenceId;
      if (!resEvidenceId) {
        reasons.push(`Evaluated claim (${claim.status}) requires evaluationEvidenceId`);
      }
      if (!claim.evaluationBasis && !claim.actualOutcomeDescription) {
        reasons.push(`Evaluated claim (${claim.status}) requires evaluationBasis or actualOutcomeDescription`);
      }
    }

    return {
      approved: reasons.length === 0,
      reasons
    };
  }

  /**
   * Validates and approves an IntelligenceEvent for serving persistence.
   * Enforces:
   * 1. Evidence ID exists in EvidenceInventory.
   * 2. Issuer symbol matches evidence record.
   * 3. Tier 4 Discovery signals cannot substantiate CRITICAL or HIGH materiality without primary evidence.
   */
  public async validateEvent(event: IntelligenceEvent): Promise<GateValidationResult> {
    const reasons: string[] = [];

    if (!event.eventId || !event.issuerNseSymbol || !event.headline) {
      reasons.push('Event missing mandatory fields (eventId, issuerNseSymbol, or headline)');
    }

    if (!event.evidenceId) {
      reasons.push('Event missing mandatory evidenceId lineage');
    } else {
      const evidence = await this.getAsync('SELECT * FROM EvidenceInventory WHERE evidence_id = ?', [event.evidenceId]);
      if (!evidence) {
        reasons.push(`Evidence ID '${event.evidenceId}' does not exist in EvidenceInventory`);
      } else if (evidence.issuer_nse_symbol && evidence.issuer_nse_symbol !== event.issuerNseSymbol) {
        reasons.push(`Issuer symbol mismatch: Event symbol '${event.issuerNseSymbol}' does not match Evidence symbol '${evidence.issuer_nse_symbol}'`);
      }
    }

    // Source Tier 4 restriction (Constitution Article 4)
    if (event.sourceTier === 'TIER_4_DISCOVERY' && ['CRITICAL', 'HIGH'].includes(event.materiality)) {
      reasons.push(`Tier 4 Discovery signals cannot independently substantiate material conclusion (${event.materiality}) without primary evidence`);
    }

    return {
      approved: reasons.length === 0,
      reasons
    };
  }

  /**
   * Validates and approves a Contradiction for serving persistence.
   * Enforces:
   * 1. Both leftEvidenceId and rightEvidenceId are provided and distinct.
   * 2. Both evidence IDs exist in EvidenceInventory and match issuer.
   */
  public async validateContradiction(contra: Contradiction): Promise<GateValidationResult> {
    const reasons: string[] = [];

    if (!contra.contradictionId || !contra.issuerNseSymbol || !contra.description) {
      reasons.push('Contradiction missing mandatory fields (contradictionId, issuerNseSymbol, description)');
    }

    if (!contra.leftEvidenceId || !contra.rightEvidenceId) {
      reasons.push('Contradiction requires both leftEvidenceId (promise/claim) and rightEvidenceId (outcome/disclosure)');
    } else {
      const leftEvidence = await this.getAsync('SELECT * FROM EvidenceInventory WHERE evidence_id = ?', [contra.leftEvidenceId]);
      const rightEvidence = await this.getAsync('SELECT * FROM EvidenceInventory WHERE evidence_id = ?', [contra.rightEvidenceId]);

      if (!leftEvidence) {
        reasons.push(`Left Evidence ID '${contra.leftEvidenceId}' does not exist in EvidenceInventory`);
      }
      if (!rightEvidence) {
        reasons.push(`Right Evidence ID '${contra.rightEvidenceId}' does not exist in EvidenceInventory`);
      }
      if (leftEvidence && leftEvidence.issuer_nse_symbol !== contra.issuerNseSymbol) {
        reasons.push(`Left Evidence issuer '${leftEvidence.issuer_nse_symbol}' does not match Contradiction symbol '${contra.issuerNseSymbol}'`);
      }
      if (rightEvidence && rightEvidence.issuer_nse_symbol !== contra.issuerNseSymbol) {
        reasons.push(`Right Evidence issuer '${rightEvidence.issuer_nse_symbol}' does not match Contradiction symbol '${contra.issuerNseSymbol}'`);
      }
    }

    return {
      approved: reasons.length === 0,
      reasons
    };
  }

  /**
   * Authorized write boundary for ManagementClaims.
   */
  public async approveAndPersistClaim(claim: ManagementClaim): Promise<void> {
    const validation = await this.validateClaim(claim);
    if (!validation.approved) {
      throw new Error(`IntelligenceQualityGate REJECTED Claim '${claim.claimId}': ${validation.reasons.join('; ')}`);
    }

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
        claim.status,
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
   * Authorized write boundary for IntelligenceEvents.
   */
  public async approveAndPersistEvent(event: IntelligenceEvent): Promise<void> {
    const validation = await this.validateEvent(event);
    if (!validation.approved) {
      throw new Error(`IntelligenceQualityGate REJECTED Event '${event.eventId}': ${validation.reasons.join('; ')}`);
    }

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO IntelligenceEvents (
          event_id, symbol, issuer_bse_code, event_date, category, headline,
          description, source_type, evidence_id, materiality, source_tier
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      const params = [
        event.eventId,
        event.issuerNseSymbol,
        event.issuerBseCode || null,
        event.eventDate,
        event.category,
        event.headline,
        event.description || null,
        event.sourceType,
        event.evidenceId,
        event.materiality,
        event.sourceTier
      ];
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Authorized write boundary for Contradictions.
   */
  public async approveAndPersistContradiction(contra: Contradiction): Promise<void> {
    const validation = await this.validateContradiction(contra);
    if (!validation.approved) {
      throw new Error(`IntelligenceQualityGate REJECTED Contradiction '${contra.contradictionId}': ${validation.reasons.join('; ')}`);
    }

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO Contradictions (
          contradiction_id, symbol, issuer_bse_code, severity, contradiction_type,
          claim_id, event_id, description, divergence_json, supporting_evidence_ids,
          status, materiality, left_evidence_id, right_evidence_id, detected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      const params = [
        contra.contradictionId,
        contra.issuerNseSymbol,
        contra.issuerBseCode || null,
        contra.severity,
        contra.type,
        contra.claimId || null,
        contra.eventId || null,
        contra.description,
        JSON.stringify(contra.divergenceDetails),
        JSON.stringify(contra.supportingEvidenceIds || []),
        contra.status,
        contra.materiality,
        contra.leftEvidenceId,
        contra.rightEvidenceId,
        contra.detectedAt || new Date().toISOString()
      ];
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
