/**
 * Quant Module Index — NRI WealthOS v5.4.1 Master Architecture
 * Centralized exports for institutional execution, sizing, moat screening, valuation,
 * momentum path smoothness, dynamic barbell regime governor, and sleeve guards.
 */

export * from './AdaptiveTradeLifecycleManager.js';
export * from './InstitutionalRiskParitySizer.js';
export * from './FastMemoryArrayBufferScanner.js';
export * from './NEoWaveEngine.js';

// v5.4.1 Enhancements
export * from './FundamentalMoatQualityScreener.js';
export * from './NormalizedReverseDCFEngine.js';
export * from './AlphaArchitectQmomFilter.js';
export * from './DynamicBarbellCapitalGovernor.js';
export * from './SleeveAFundamentalThesisGuard.js';
export * from './OpportunityDataIntegrityGate.js';

