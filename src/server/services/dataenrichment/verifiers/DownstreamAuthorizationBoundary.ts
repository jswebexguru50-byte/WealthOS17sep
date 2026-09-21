import { DatasetPromotionPersistence, DatasetPromotionManifest } from '../../data/DatasetPromotionPersistence.js';

export enum DownstreamAuthorizationError {
  DOWNSTREAM_BLOCKED_UNVERIFIED_DATA = 'DOWNSTREAM_BLOCKED_UNVERIFIED_DATA',
  DOWNSTREAM_BLOCKED_STALE_PROMOTION = 'DOWNSTREAM_BLOCKED_STALE_PROMOTION',
  DOWNSTREAM_BLOCKED_RAW_HASH_MISMATCH = 'DOWNSTREAM_BLOCKED_RAW_HASH_MISMATCH',
  DOWNSTREAM_BLOCKED_CANONICAL_HASH_MISMATCH = 'DOWNSTREAM_BLOCKED_CANONICAL_HASH_MISMATCH',
  DOWNSTREAM_BLOCKED_MISSING_VERIFICATION = 'DOWNSTREAM_BLOCKED_MISSING_VERIFICATION',
  DOWNSTREAM_BLOCKED_PARTIAL_DATA = 'DOWNSTREAM_BLOCKED_PARTIAL_DATA',
  DOWNSTREAM_BLOCKED_INSUFFICIENT_DATA = 'DOWNSTREAM_BLOCKED_INSUFFICIENT_DATA',
  DOWNSTREAM_BLOCKED_FORGED_PROMOTION = 'DOWNSTREAM_BLOCKED_FORGED_PROMOTION'
}

export type AuthorizationResult = 
  | { authorized: true; reason?: never }
  | { authorized: false; reason: DownstreamAuthorizationError };

export class DownstreamAuthorizationBoundary {
  
  /**
   * Authorizes a dataset for downstream consumption strictly based on its independent verification evidence.
   * Does NOT trust a caller-provided or manifest-only "PROMOTED" status without matching verification predicates.
   */
  static async authorizeVerifiedDataset(datasetId: string): Promise<AuthorizationResult> {
    
    // 1. Authoritative persistence reload
    const datasetEvidence = await DatasetPromotionPersistence.reload(datasetId);

    // 2. Missing evidence entirely
    if (!datasetEvidence) {
      return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_MISSING_VERIFICATION };
    }

    // 3. Reject unverified states
    if (datasetEvidence.promotion_decision === 'PARTIAL_DATA_READY') {
      return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_PARTIAL_DATA };
    }
    
    if (datasetEvidence.promotion_decision === 'DATA_INSUFFICIENT') {
      return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_INSUFFICIENT_DATA };
    }

    if (datasetEvidence.promotion_decision === 'BLOCKED' || datasetEvidence.promotion_decision === 'FAILED' || datasetEvidence.promotion_decision === 'ACQUIRING') {
      return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_UNVERIFIED_DATA };
    }

    // 3. Prevent forgery: A manifest saying PROMOTED must have all required predicates
    let predicates: string[] = [];
    try {
      predicates = JSON.parse(datasetEvidence.verification_predicates_json || '[]');
    } catch {
      return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_MISSING_VERIFICATION };
    }

    // Assuming a strict contract that PROMOTED datasets MUST have passed certain core predicates in Lane B
    const requiredPredicates = ['NO_GAPS', 'CALENDAR_SYNC', 'HASH_MATCH'];
    for (const req of requiredPredicates) {
      if (!predicates.includes(req)) {
        return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_FORGED_PROMOTION };
      }
    }

    // 4. Missing Hashes
    if (!datasetEvidence.raw_sha256 || !datasetEvidence.canonical_sha256) {
      return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_MISSING_VERIFICATION };
    }

    // 5. Must strictly be PROMOTED at this point
    if (datasetEvidence.promotion_decision !== 'PROMOTED') {
      return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_UNVERIFIED_DATA };
    }

    // Note: Physical rehashing of the actual array occurs where the contract explicitly requires it (e.g. before strategy entry)
    // rather than indiscriminately here, preserving the boundary as an evidence check.
    
    return { authorized: true };
  }
}
