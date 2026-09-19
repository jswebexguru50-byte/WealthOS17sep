/**
 * WealthOS v6.6 - Engine Capability Contracts
 * Agent E Deliverable
 * 
 * SPEC MANDATE:
 * Explicitly defines what each engine is allowed to do.
 * Prevents signal engines from sizing positions or overriding risk controls.
 */

export type EngineRole =
  | 'SIGNAL'
  | 'FILTER'
  | 'SCORER'
  | 'CONFIRMATION'
  | 'CONTEXT'
  | 'RISK_CONTROL'
  | 'PORTFOLIO_CONSTRUCTION'
  | 'EXECUTION_GATE'
  | 'REFERENCE_VALIDATOR';

export type EvidenceType =
  | 'TECHNICAL_SIGNAL'
  | 'FERE_QUALITY_AUDIT'
  | 'QGLP_COMPOSITE_SCORE'
  | 'FUNDAMENTAL_FACTS'
  | 'VALUATION_MARGIN_OF_SAFETY'
  | 'DOUBLE_MOMENTUM_RANK'
  | 'SECTOR_RELATIVE_STRENGTH'
  | 'SMART_MONEY_ACCUMULATION'
  | 'PORTFOLIO_RISK_BUDGET'
  | 'CONCENTRATION_LIMIT'
  | 'LIQUIDITY_LIMIT'
  | 'DRAWDOWN_PROTECTION_GATE'
  | 'EXECUTION_BLOCK'
  | 'EXECUTION_ALLOCATION';

export interface EngineCapability {
  engineId: string;
  produces: EvidenceType[];
  consumes: EvidenceType[];
  roles: EngineRole[];
  independentMode: boolean;       // Can run completely standalone
  composableMode: boolean;        // Can participate in a multi-engine decision graph
  requiresPriorEngine: boolean;   // e.g. a filter requires a signal engine to precede it
  canReject: boolean;             // Can emit hard rejection (e.g. FERE filter)
  canOverride: boolean;           // Can reverse a previous decision (strictly audited)
  canSizePosition: boolean;       // Must be false for signal/filter engines
  canBlockExecution: boolean;     // Only true for Risk Control & Capital Protection
}
