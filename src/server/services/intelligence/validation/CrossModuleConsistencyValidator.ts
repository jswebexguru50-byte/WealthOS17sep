/**
 * CrossModuleConsistencyValidator.ts — Constitution Article C7 & Section 30
 *
 * Audits quantitative metrics across multiple analytical modules to ensure
 * internal consistency across Fundamental, Business Drivers, Valuation, Thesis, and Overview.
 */

export interface MetricObservation {
  module: string;
  metric: string;
  value: number;
  period?: string | null;
  scope?: string | null;
  factId?: string | null;
}

export interface MetricConsistencyConflict {
  metric: string;
  observations: MetricObservation[];
  discrepancyType: 'VALUE_MISMATCH' | 'PERIOD_AMBIGUITY' | 'SCOPE_CONFLICT';
  message: string;
}

export interface ConsistencyValidationReport {
  isConsistent: boolean;
  conflicts: MetricConsistencyConflict[];
  verifiedMetrics: string[];
}

export class CrossModuleConsistencyValidator {
  private static instance: CrossModuleConsistencyValidator;

  // Maximum acceptable floating-point tolerance for same period/scope metrics (e.g. 0.05%)
  private static readonly EPSILON = 0.05;

  private constructor() {}

  public static getInstance(): CrossModuleConsistencyValidator {
    if (!CrossModuleConsistencyValidator.instance) {
      CrossModuleConsistencyValidator.instance = new CrossModuleConsistencyValidator();
    }
    return CrossModuleConsistencyValidator.instance;
  }

  /**
   * Cross-checks a collection of metric observations reported by different modules.
   */
  public validate(observations: MetricObservation[]): ConsistencyValidationReport {
    const conflicts: MetricConsistencyConflict[] = [];
    const verifiedMetrics: Set<string> = new Set();

    // Group observations by metric
    const byMetric: Record<string, MetricObservation[]> = {};
    for (const obs of observations) {
      const key = obs.metric.toUpperCase();
      if (!byMetric[key]) byMetric[key] = [];
      byMetric[key].push(obs);
    }

    for (const [metric, obsList] of Object.entries(byMetric)) {
      if (obsList.length < 2) {
        verifiedMetrics.add(metric);
        continue;
      }

      // Group by period and scope to compare identical horizons
      const byHorizon: Record<string, MetricObservation[]> = {};
      for (const obs of obsList) {
        const horizon = `${obs.period || 'UNKNOWN'}|${obs.scope || 'CONSOLIDATED'}`;
        if (!byHorizon[horizon]) byHorizon[horizon] = [];
        byHorizon[horizon].push(obs);
      }

      let metricHasConflict = false;

      for (const [horizon, list] of Object.entries(byHorizon)) {
        if (list.length < 2) continue;

        const baseVal = list[0].value;
        for (let i = 1; i < list.length; i++) {
          const diff = Math.abs(list[i].value - baseVal);
          if (diff > CrossModuleConsistencyValidator.EPSILON) {
            metricHasConflict = true;
            conflicts.push({
              metric,
              observations: list,
              discrepancyType: 'VALUE_MISMATCH',
              message: `Cross-module conflict for ${metric} (${horizon}): ${list[0].module} reports ${baseVal} while ${list[i].module} reports ${list[i].value}`,
            });
            break;
          }
        }
      }

      if (!metricHasConflict) {
        verifiedMetrics.add(metric);
      }
    }

    return {
      isConsistent: conflicts.length === 0,
      conflicts,
      verifiedMetrics: Array.from(verifiedMetrics),
    };
  }
}
