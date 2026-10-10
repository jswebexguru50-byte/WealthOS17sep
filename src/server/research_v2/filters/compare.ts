import type { ScorecardRow, ScorecardStatus, ThresholdConfig } from '../domain/index.js';

/** Result of comparing an observation with a threshold. */
export interface Comparison {
  status: ScorecardStatus;
  gap: number | null;
  /** True when the config has no threshold to apply (comparator info). */
  informational: boolean;
}

/** Round away binary float noise (1e-9) so gaps and boundary comparisons are stable. */
export const clean = (value: number): number => Math.round(value * 1e9) / 1e9;

function passes(observed: number, value: number, cfg: ThresholdConfig): boolean {
  const tol = cfg.tolerance ?? 0;
  switch (cfg.comparator) {
    case '>': return clean(observed - (value - tol)) > 0;
    case '>=': return clean(observed - (value - tol)) >= 0;
    case '<=': return clean(observed - (value + tol)) <= 0;
    case '==': return Math.abs(clean(observed - value)) <= tol;
    default: return false;
  }
}

/**
 * Compare an observation with a threshold. Tolerance is lenient: it widens the passing side.
 * Failing '>' / '>=' gives BELOW_THRESHOLD; failing '<=' gives ABOVE_THRESHOLD; '==' by direction.
 */
export function compareToThreshold(observed: number, cfg: ThresholdConfig): Comparison {
  if (cfg.comparator === 'info' || cfg.value === null) {
    return { status: 'NOT_APPLICABLE', gap: null, informational: true };
  }
  const gap = clean(observed - cfg.value);
  if (passes(observed, cfg.value, cfg)) return { status: 'MEETS_THRESHOLD', gap, informational: false };
  const above = cfg.comparator === '<=' || (cfg.comparator === '==' && gap > 0);
  return { status: above ? 'ABOVE_THRESHOLD' : 'BELOW_THRESHOLD', gap, informational: false };
}

/** Skeleton row for one filter: UNVERIFIABLE until a calculation fills it in. */
export function baseRow(
  filterId: ScorecardRow['filterId'], label: string, unit: string, cfg: ThresholdConfig, formula: string,
): ScorecardRow {
  return {
    filterId, label, observed: null, unit, threshold: cfg.value, comparator: cfg.comparator, gap: null,
    status: 'UNVERIFIABLE', basis: 'DERIVED', asOf: null, period: null, scope: null, sources: [], formula,
  };
}

/** Mark a row UNVERIFIABLE with a reason; `patch` may keep a displayable bound or partial detail. */
export function unverifiable<T extends ScorecardRow>(row: T, reason: string, patch: Partial<T> = {}): T {
  return { ...row, ...patch, status: 'UNVERIFIABLE', reasonIfUnverifiable: reason };
}

/** Mark a row NOT_APPLICABLE with the reason in `note`. */
export function notApplicable<T extends ScorecardRow>(row: T, note: string): T {
  return { ...row, status: 'NOT_APPLICABLE', observed: null, gap: null, note };
}
