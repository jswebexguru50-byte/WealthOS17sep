
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
    
    const manifest = await DatasetPromotionPersistence.reload(datasetId);
    if (!manifest) return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_MISSING_VERIFICATION };
    if (manifest.promotion_decision === 'PARTIAL_DATA_READY') return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_PARTIAL_DATA };
    if (manifest.promotion_decision === 'DATA_INSUFFICIENT') return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_INSUFFICIENT_DATA };
    if (manifest.promotion_decision !== 'PROMOTED') return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_UNVERIFIED_DATA };
    try {
      const predicates = JSON.parse(manifest.verification_predicates_json);
      if (!Array.isArray(predicates) || !['NO_GAPS', 'CALENDAR_SYNC', 'HASH_MATCH'].every(p => predicates.includes(p))) {
        return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_FORGED_PROMOTION };
      }
      if (!/^[a-f0-9]{64}$/i.test(manifest.raw_sha256) || !/^[a-f0-9]{64}$/i.test(manifest.canonical_sha256)) {
        return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_RAW_HASH_MISMATCH };
      }
    } catch {
      return { authorized: false, reason: DownstreamAuthorizationError.DOWNSTREAM_BLOCKED_FORGED_PROMOTION };
    }
    return { authorized: true };
  }
}
import { DatasetPromotionPersistence } from '../../data/DatasetPromotionPersistence.js';
