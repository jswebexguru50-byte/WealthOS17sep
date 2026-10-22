/**
 * src/server/services/audit/EvidenceHierarchy.ts
 *
 * WealthOS v6.7.1 Evidence Hierarchy Specification.
 * Enforces standardized epistemic levels on all empirical and research claims.
 */

export type EvidenceLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface EvidenceClassification {
  level: EvidenceLevel;
  name: string;
  description: string;
  isProductionEligible: boolean;
}

export const EVIDENCE_LEVELS: Record<EvidenceLevel, EvidenceClassification> = {
  L0: {
    level: 'L0',
    name: 'CLAIM',
    description: 'Report or documentation assertion only without independent execution evidence.',
    isProductionEligible: false
  },
  L1: {
    level: 'L1',
    name: 'TESTED',
    description: 'A formal unit or integration test exists and passes in the test suite.',
    isProductionEligible: false
  },
  L2: {
    level: 'L2',
    name: 'REPRODUCED',
    description: 'An independent process or replay reproducer reproduces the exact result from input data.',
    isProductionEligible: false
  },
  L3: {
    level: 'L3',
    name: 'ADVERSARIALLY_VERIFIED',
    description: 'An adversarial testing engine or red team actively attempts to falsify or corrupt the result and fails.',
    isProductionEligible: false
  },
  L4: {
    level: 'L4',
    name: 'RESEARCH_ELIGIBLE',
    description: 'Satisfies L0-L3 plus PIT integrity, walk-forward OOS, statistical significance, accounting equality, capacity scaling, and zero contamination.',
    isProductionEligible: false
  },
  L5: {
    level: 'L5',
    name: 'PRODUCTION_ELIGIBLE',
    description: 'Authorized for live production deployment. STRICTLY UNAVAILABLE IN v6.7.1 while productionPromotionAuthorized remains false.',
    isProductionEligible: true
  }
};

export class EvidenceHierarchyValidator {
  public static validateEvidence(
    level: EvidenceLevel,
    productionPromotionAuthorized: boolean
  ): { valid: boolean; assignedLevel: EvidenceLevel; reason?: string } {
    if (level === 'L5' && !productionPromotionAuthorized) {
      return {
        valid: false,
        assignedLevel: 'L4',
        reason: 'L5 PRODUCTION_ELIGIBLE is hard-blocked: productionPromotionAuthorized === false. Result downgraded to L4.'
      };
    }
    return {
      valid: true,
      assignedLevel: level
    };
  }
}
