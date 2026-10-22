export class StopTheLineError extends Error {
  public readonly reason: string;

  constructor(reason: string, message?: string) {
    super(`STOP_THE_LINE: ${reason}${message ? ` - ${message}` : ''}`);
    this.name = 'StopTheLineError';
    this.reason = reason;
  }
}

export const MasterStopTheLineConditions = [
  "FROZEN_CONTROL_HASH_MISMATCH",
  "CANONICAL_LEDGER_MISSING",
  "CANONICAL_LEDGER_HASH_MISMATCH",
  "PIT_LOOKAHEAD",
  "PIT_IDENTITY_MISMATCH",
  "PIT_MISSING_PROVENANCE",
  "PIT_COVERAGE_FAILURE",
  "CURRENT_UNIVERSE_FALLBACK",
  "DATA_SOURCE_SUBSTITUTION",
  "PRODUCER_AUDITOR_MISMATCH",
  "LINEAGE_BREAK",
  "SYNTHETIC_REPLAY",
  "SYNTHETIC_REGIME",
  "SYNTHETIC_COST_TEST",
  "OOS_CONFIGURATION_MUTATION",
  "RESEARCH_CONTAMINATION",
  "BH_FDR_INPUT_INVALID",
  "WFO_INPUT_INVALID",
  "GRAPH_CYCLE",
  "GRAPH_NONDETERMINISM",
  "RISK_RECONCILIATION_FAILURE",
  "OPPORTUNITY_RECONCILIATION_FAILURE",
  "PRODUCTION_GATE_BYPASS",
  "NONDETERMINISTIC_ARTIFACT",
  "PLACEHOLDER_HASH",
  "MISSING_RAW_INPUT"
] as const;

export type StopTheLineCondition = typeof MasterStopTheLineConditions[number];
