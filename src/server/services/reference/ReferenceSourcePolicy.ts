/**
 * WealthOS v6.6–v6.7 - Reference Source Policy
 * External Reference Acceleration Layer
 * 
 * Defines operational boundaries and permissions for external reference frameworks:
 * - PKScreener: Discovery & Parity permitted; Trade Authorization strictly false.
 * - Fenix: Execution research only; Trade Authorization strictly false pending promotion.
 */

export interface ReferenceSourcePolicy {
  sourceId: string;
  allowedForDiscovery: boolean;
  allowedForParity: boolean;
  allowedForResearchEvidence: boolean;
  allowedForTradeAuthorization: boolean;
  allowedForEconomicValidation: boolean;
  requiresPITValidation: boolean;
  requiresProvenance: boolean;
  requiresVersionPinning: boolean;
}

export const PKSCREENER_POLICY: ReferenceSourcePolicy = {
  sourceId: 'PKSCREENER',
  allowedForDiscovery: true,
  allowedForParity: true,
  allowedForResearchEvidence: true,
  allowedForTradeAuthorization: false, // HARD INVARIANT
  allowedForEconomicValidation: false, // WealthOS simulator remains authoritative
  requiresPITValidation: true,
  requiresProvenance: true,
  requiresVersionPinning: true
};

export const FENIX_POLICY: ReferenceSourcePolicy = {
  sourceId: 'FENIX',
  allowedForDiscovery: false,
  allowedForParity: false,
  allowedForResearchEvidence: false,
  allowedForTradeAuthorization: false, // HARD INVARIANT
  allowedForEconomicValidation: false,
  requiresPITValidation: false,
  requiresProvenance: true,
  requiresVersionPinning: true
};
