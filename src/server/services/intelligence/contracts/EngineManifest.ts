/**
 * EngineManifest.ts — Gate B.1 Integrity Fix
 *
 * Establishes and enforces strict input dependency contracts for all analytical engines.
 * Enforces: ENGINE -> Canonical repositories -> NO arbitrary raw endpoint bypass.
 * Legacy fallbacks are strictly disabled: all analytical engines must consume canonical facts.
 */

export type CanonicalMetricKey =
  | 'REVENUE'
  | 'EBITDA'
  | 'EBIT'
  | 'PAT'
  | 'EPS'
  | 'ASSETS'
  | 'EQUITY'
  | 'DEBT'
  | 'CASH'
  | 'RECEIVABLES'
  | 'INVENTORY'
  | 'CFO'
  | 'CFI'
  | 'CFF'
  | 'CAPEX'
  | 'ROE'
  | 'ROCE'
  | 'MARGINS'
  | 'DEBT_EQUITY'
  | 'SHAREHOLDING'
  | 'PE'
  | 'PB'
  | 'EV_EBITDA';

export type EngineEvidenceType =
  | 'CANONICAL_FACT'
  | 'PRIMARY_XBRL'
  | 'AUDITED_REPORT'
  | 'PRICE_SERIES'
  | 'MANAGEMENT_COMMITMENT';

export interface EngineInputManifest {
  engineName: string;
  requiredCanonicalFacts: CanonicalMetricKey[];
  acceptedEvidenceTypes: EngineEvidenceType[];
  allowLegacyFallback: boolean;
  notes?: string;
}

export const ENGINE_MANIFESTS: Record<string, EngineInputManifest> = {
  FundamentalEngine: {
    engineName: 'FundamentalEngine',
    requiredCanonicalFacts: ['REVENUE', 'PAT', 'EBITDA', 'CFO', 'ROE', 'ROCE'],
    acceptedEvidenceTypes: ['CANONICAL_FACT', 'PRIMARY_XBRL', 'AUDITED_REPORT'],
    allowLegacyFallback: false,
    notes: 'Consumes solely canonical facts from company_facts and CanonicalFactRepository'
  },
  ValuationEngine: {
    engineName: 'ValuationEngine',
    requiredCanonicalFacts: ['PE', 'PB', 'EV_EBITDA', 'PAT', 'EQUITY'],
    acceptedEvidenceTypes: ['CANONICAL_FACT', 'PRICE_SERIES', 'AUDITED_REPORT'],
    allowLegacyFallback: false,
    notes: 'Consumes solely canonical facts; direct snapshot JSON bypass eliminated'
  },
  BusinessDriverEngine: {
    engineName: 'BusinessDriverEngine',
    requiredCanonicalFacts: ['REVENUE', 'EBITDA', 'MARGINS'],
    acceptedEvidenceTypes: ['CANONICAL_FACT', 'MANAGEMENT_COMMITMENT'],
    allowLegacyFallback: false,
    notes: 'Consumes solely canonical facts and verified commitments'
  },
  ManagementIntelligenceEngine: {
    engineName: 'ManagementIntelligenceEngine',
    requiredCanonicalFacts: ['REVENUE', 'PAT', 'MARGINS'],
    acceptedEvidenceTypes: ['MANAGEMENT_COMMITMENT', 'CANONICAL_FACT'],
    allowLegacyFallback: false,
    notes: 'Evaluates normalized commitments against subsequent canonical facts'
  },
  ContradictionEngine: {
    engineName: 'ContradictionEngine',
    requiredCanonicalFacts: ['REVENUE', 'PAT', 'CFO', 'MARGINS', 'DEBT'],
    acceptedEvidenceTypes: ['CANONICAL_FACT', 'MANAGEMENT_COMMITMENT'],
    allowLegacyFallback: false,
    notes: 'Evaluates contradictions strictly from typed canonical state'
  },
  ThesisEngine: {
    engineName: 'ThesisEngine',
    requiredCanonicalFacts: ['REVENUE', 'PAT', 'ROCE', 'MARGINS'],
    acceptedEvidenceTypes: ['CANONICAL_FACT', 'MANAGEMENT_COMMITMENT'],
    allowLegacyFallback: false,
    notes: 'Synthesizes thesis pillars with engine-emitted typed assertion metadata'
  }
};

/**
 * Validates that an engine input satisfies the manifest requirements.
 */
export function validateEngineInput(
  engineName: string,
  providedFacts: string[],
  evidenceTypes: EngineEvidenceType[]
): { valid: boolean; missingFacts: string[]; disallowedEvidence: string[] } {
  const manifest = ENGINE_MANIFESTS[engineName];
  if (!manifest) {
    return { valid: true, missingFacts: [], disallowedEvidence: [] };
  }

  const normalizedProvided = new Set(providedFacts.map(f => f.toUpperCase().replace('_CR', '').replace('_PCT', '')));
  const missingFacts = manifest.requiredCanonicalFacts.filter(f => !normalizedProvided.has(f));

  const allowedTypes = new Set(manifest.acceptedEvidenceTypes);
  const disallowedEvidence = evidenceTypes.filter(t => !allowedTypes.has(t));

  return {
    valid: missingFacts.length === 0 && disallowedEvidence.length === 0,
    missingFacts,
    disallowedEvidence,
  };
}
