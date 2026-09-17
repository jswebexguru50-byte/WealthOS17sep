/**
 * ContradictionEngine.ts
 *
 * Layer 4 Contradiction Engine Service.
 * Implements deterministic detection of material divergences between management assertions,
 * subsequent financial outcomes, and verified corporate disclosures.
 * Enforces Constitution Article 27: Multi-evidence symmetry (leftEvidenceId & rightEvidenceId).
 */

import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import { Contradiction, ContradictionSeverity, ContradictionType, ContradictionStatus } from '../types/Contradiction.js';
import { ManagementClaim } from '../types/ManagementClaim.js';

export class ContradictionEngine {
  private db: sqlite3.Database;

  constructor(db: sqlite3.Database) {
    this.db = db;
  }

  /**
   * Evaluates whether a resolved claim constitutes a material contradiction.
   * Deterministic logic enforcing multi-evidence symmetry.
   */
  public evaluateClaimContradiction(claim: ManagementClaim): Contradiction | null {
    if (claim.status !== 'MISSED' && claim.status !== 'REVERSED') {
      return null;
    }

    let severity: ContradictionSeverity = 'MEDIUM';
    let materiality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';

    if (claim.status === 'REVERSED') {
      severity = 'CRITICAL';
      materiality = 'CRITICAL';
    } else if (claim.category === 'MARGIN' || claim.category === 'CAPEX' || claim.category === 'GUIDANCE') {
      severity = 'HIGH';
      materiality = 'HIGH';
    }

    const description = `Management guided/claimed: "${claim.statement}" (${claim.period}), but subsequent disclosure confirmed: "${claim.actualOutcomeDescription}".`;
    const rightId = claim.evaluationEvidenceId || claim.resolutionEvidenceId || claim.evidenceId;
    const contraHash = crypto.createHash('sha256').update(`${claim.claimId}_${claim.status}_${rightId}`).digest('hex').substring(0, 8);

    return {
      contradictionId: `CONTRA_${claim.claimId}_${contraHash}`,
      issuerNseSymbol: claim.issuerNseSymbol,
      issuerBseCode: claim.issuerBseCode,
      severity,
      type: claim.status === 'REVERSED' ? 'DISCLOSURE_INCONSISTENCY' : 'CLAIM_VS_RESULT',
      claimId: claim.claimId,
      description,
      divergenceDetails: {
        whatManagementClaimed: claim.expectedOutcome || claim.statement,
        whatActuallyHappened: claim.actualOutcomeDescription || 'Target missed',
        deltaMetric: claim.targetMetric || undefined
      },
      leftEvidenceId: claim.evidenceId,
      rightEvidenceId: rightId,
      supportingEvidenceIds: [claim.evidenceId, rightId].filter(Boolean) as string[],
      status: 'OPEN',
      materiality,
      detectedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Persists a discovered contradiction into the database with multi-evidence columns.
   */
  public async recordContradiction(c: Contradiction): Promise<void> {
    if (!c.leftEvidenceId || !c.rightEvidenceId) {
      throw new Error(`Contradiction '${c.contradictionId}' rejected: Both leftEvidenceId and rightEvidenceId are required`);
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
        c.contradictionId,
        c.issuerNseSymbol,
        c.issuerBseCode || null,
        c.severity,
        c.type,
        c.claimId || null,
        c.eventId || null,
        c.description,
        JSON.stringify(c.divergenceDetails),
        JSON.stringify(c.supportingEvidenceIds || []),
        c.status,
        c.materiality,
        c.leftEvidenceId,
        c.rightEvidenceId,
        c.detectedAt || new Date().toISOString()
      ];
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Fetches open contradictions for an issuer.
   */
  public async getContradictionsForIssuer(symbol: string): Promise<Contradiction[]> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM Contradictions WHERE symbol = ? ORDER BY created_at DESC;`;
      this.db.all(sql, [symbol], (err, rows: any[]) => {
        if (err) return reject(err);
        const mapped: Contradiction[] = (rows || []).map(r => {
          let divergence = {};
          let evidenceIds: string[] = [];
          try { divergence = JSON.parse(r.divergence_json); } catch {}
          try { evidenceIds = JSON.parse(r.supporting_evidence_ids); } catch {}

          return {
            contradictionId: r.contradiction_id,
            issuerNseSymbol: r.symbol,
            issuerBseCode: r.issuer_bse_code,
            severity: r.severity,
            type: r.contradiction_type,
            claimId: r.claim_id,
            eventId: r.event_id,
            description: r.description,
            divergenceDetails: divergence,
            leftEvidenceId: r.left_evidence_id || r.evidence_id,
            rightEvidenceId: r.right_evidence_id || r.resolution_evidence_id,
            supportingEvidenceIds: evidenceIds,
            status: r.status,
            materiality: r.materiality,
            detectedAt: r.detected_at,
            createdAt: r.created_at,
            resolvedAt: r.resolved_at,
            resolutionBasis: r.resolution_note
          };
        });
        resolve(mapped);
      });
    });
  }
}
