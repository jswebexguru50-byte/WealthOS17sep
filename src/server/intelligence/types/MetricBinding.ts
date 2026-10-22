export type BindingType = 'DETERMINISTIC_LEXICAL' | 'ONTOLOGICAL' | 'HUMAN_OVERRIDE';
export type BindingStrength = 'HIGH' | 'MEDIUM' | 'LOW';

export interface HumanOverrideProvenance {
  overrideId: string;
  overriddenBy: string;
  overriddenAt: string;
  priorBinding: MetricBinding;
  newBinding: MetricBinding;
  overrideReason: string;
  evidenceRef: string;
  authorizationId: string;
}

export interface NumericMention {
  numericMentionId: string;
  sourceEvidenceId: string;
  verbatimExpression: string;
  normalizedBaseValue: number;
  detectedCurrency?: string;
  matchIndex: number;
  surroundingClause: string;
}

export interface MetricBinding {
  bindingId: string;
  numericMentionId: string;
  metricId: string;
  bindingType: BindingType;
  bindingEvidence: string;
  /**
   * Qualitative strength of the deterministic classification rule.
   * NOT a statistical probability.
   */
  bindingStrength: BindingStrength;
  /**
   * Deterministic rule match score (0.0 to 1.0) representing rule specificity.
   * Explicitly documented as a rule heuristic, NOT a calibrated posterior probability.
   */
  bindingRuleScore: number;
  /**
   * Legacy alias retained for backwards-compatibility with v3.2 consumers.
   */
  bindingConfidence?: number;
  bindingRuleVersion: string;
  /**
   * Required audit provenance if bindingType === 'HUMAN_OVERRIDE'
   */
  humanOverrideProvenance?: HumanOverrideProvenance;
}
