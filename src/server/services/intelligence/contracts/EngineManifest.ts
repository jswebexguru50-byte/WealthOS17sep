/**
 * EngineManifest.ts — Workstream B4
 *
 * Establishes input dependency contracts for all analytical engines.
 * Enforces: ENGINE -> Canonical repositories -> NO arbitrary raw endpoint fallback.
 * Temporary fallbacks are tagged explicitly as LEGACY_FALLBACK with PARTIAL truth status.
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
  | 'MANAGEMENT_COMMITMENT'
  | 'LEGACY_FALLBACK';

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
    allowLegacyFallback: true, // Marked explicitly as LEGACY_FALLBACK
    notes: 'Prioritizes company_facts; uses raw fundamental_endpoint_snapshots only as documented LEGACY_FALLBACK'
  },
  ValuationEngine: {
    engineName: 'ValuationEngine',
    requiredCanonicalFacts: ['PE', 'PB', 'EV_EBITDA', 'PAT', 'EQUITY'],
    acceptedEvidenceTypes: ['CANONICAL_FACT', 'PRICE_SERIES', 'AUDITED_REPORT'],
    allowLegacyFallback: true,
    notes: 'Prioritizes company_facts; uses raw snapshots only as LEGACY_FALLBACK'
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
  }
};
