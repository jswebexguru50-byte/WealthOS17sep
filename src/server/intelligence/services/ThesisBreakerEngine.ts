/**
 * ThesisBreakerEngine.ts
 *
 * Layer 5 Thesis Breaker Service.
 * Evaluates machine-executable quantitative and qualitative breaker conditions
 * against observed financial metrics, corporate events, and claim resolutions.
 * (Constitution Article 28: Auditable Breaker Activation).
 */

import { ThesisBreaker, QuantitativeBreakerCondition, QualitativeBreakerCondition } from '../types/ThesisDefinition.js';
import { IntelligenceEvent } from '../types/IntelligenceEvent.js';
import { ManagementClaim } from '../types/ManagementClaim.js';

export interface EvaluationContext {
  metrics: Record<string, number>; // e.g. { "net_debt_to_ebitda": 3.4, "ebitda_margin_pct": 21.5 }
  events: IntelligenceEvent[];
  claims: ManagementClaim[];
}

export class ThesisBreakerEngine {
  /**
   * Evaluates an individual thesis breaker against current context.
   */
  public evaluateBreaker(breaker: ThesisBreaker, context: EvaluationContext): ThesisBreaker {
    const updated = { ...breaker };

    if (breaker.evaluationMethod === 'METRIC_THRESHOLD' && breaker.quantitativeCondition) {
      const cond = breaker.quantitativeCondition;
      const observed = context.metrics[cond.metric];

      if (observed === undefined) {
        updated.status = 'UNRESOLVED';
        updated.currentObservedValue = 'METRIC_UNAVAILABLE';
        updated.rationale = `Metric '${cond.metric}' has not yet been observed or extracted from financials.`;
        return updated;
      }

      updated.currentObservedValue = observed;
      const isBreached = this.compareMetric(observed, cond.operator, cond.threshold);

      if (isBreached) {
        updated.status = 'ACTIVE';
        updated.rationale = `Breaker triggered: ${cond.metric} (${observed}) ${cond.operator} threshold (${cond.threshold}).`;
      } else {
        updated.status = 'INACTIVE';
        updated.rationale = `Metric within safe boundaries: ${cond.metric} (${observed}) does not violate ${cond.operator} ${cond.threshold}.`;
      }
      return updated;
    }

    if (breaker.evaluationMethod === 'EVENT_MATCH' && breaker.qualitativeCondition) {
      const cond = breaker.qualitativeCondition;
      const matchingEvent = context.events.find(e =>
        e.category === cond.eventCategory &&
        (e.materiality === cond.materiality || e.materiality === 'CRITICAL')
      );

      if (matchingEvent) {
        updated.status = 'ACTIVE';
        updated.currentObservedValue = matchingEvent.headline;
        updated.rationale = `Breaker triggered by material corporate event: "${matchingEvent.headline}" (${matchingEvent.materiality} ${matchingEvent.category}).`;
        updated.evidenceIds = [matchingEvent.evidenceId].filter(Boolean);
      } else {
        updated.status = 'INACTIVE';
        updated.rationale = `No material adverse events observed matching category '${cond.eventCategory}'.`;
      }
      return updated;
    }

    if (breaker.evaluationMethod === 'MANAGEMENT_CLAIM_FAILURE') {
      const failedClaim = context.claims.find(c => c.status === 'MISSED' || c.status === 'REVERSED');
      if (failedClaim) {
        updated.status = 'ACTIVE';
        updated.currentObservedValue = failedClaim.statement;
        updated.rationale = `Breaker triggered by management commitment failure: "${failedClaim.statement}" missed.`;
        updated.evidenceIds = [failedClaim.evidenceId, failedClaim.resolutionEvidenceId || ''].filter(Boolean);
      } else {
        updated.status = 'INACTIVE';
        updated.rationale = 'No management claim failures currently active against this thesis pillar.';
      }
      return updated;
    }

    // Default to unresolved
    updated.status = 'UNRESOLVED';
    updated.rationale = 'Breaker evaluation requires manual analyst review or unspecified conditions.';
    return updated;
  }

  /**
   * Evaluates all breakers for a thesis.
   */
  public evaluateAll(breakers: ThesisBreaker[], context: EvaluationContext): ThesisBreaker[] {
    return breakers.map(b => this.evaluateBreaker(b, context));
  }

  private compareMetric(observed: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>': return observed > threshold;
      case '>=': return observed >= threshold;
      case '<': return observed < threshold;
      case '<=': return observed <= threshold;
      case '==': return observed === threshold;
      case '!=': return observed !== threshold;
      default: return false;
    }
  }
}
