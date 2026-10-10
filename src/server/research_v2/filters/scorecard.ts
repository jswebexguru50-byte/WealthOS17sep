import type { ScorecardRow } from '../domain/index.js';
import { cashflowRow } from './cashflowRow.js';
import { FactReader } from './factReader.js';
import type { ScorecardInput, ScorecardRowX, ThresholdOverrides } from './inputs.js';
import { institutionalRow, pledgeRow, promoterRow } from './ownershipRows.js';
import { profitabilityRow } from './profitabilityRow.js';
import { roceRow, roeRow } from './returnsRows.js';
import { resolveThresholds } from './thresholds.js';

export { DEFAULT_THRESHOLDS, resolveThresholds } from './thresholds.js';
export type {
  OwnershipSource, PledgePoint, InstitutionalPoint, PromoterPoint, ProviderRoce, ScorecardInput, ScorecardRowX,
} from './inputs.js';

const EVALUABLE = new Set(['MEETS_THRESHOLD', 'BELOW_THRESHOLD', 'ABOVE_THRESHOLD']);

/**
 * Build the seven informational filter rows, in filter order. There is no overall pass/fail,
 * no ranking and no filtering of scrips; unknowns are UNVERIFIABLE with a reason, never defaults.
 */
export function buildScorecard(input: ScorecardInput, thresholds?: ThresholdOverrides): ScorecardRowX[] {
  const t = resolveThresholds(thresholds);
  const reader = new FactReader(input);
  return [
    promoterRow(input, t),
    profitabilityRow(input, reader, t),
    roceRow(input, reader, t),
    roeRow(input, reader, t),
    pledgeRow(input, t),
    institutionalRow(input, t),
    cashflowRow(input, reader, t),
  ];
}

/**
 * Descriptive sentence, for example "3 of 5 evaluable checks meet their thresholds; 2 unverifiable".
 * It is NOT a gate and must never be used to include, exclude or rank a scrip.
 */
export function summaryLine(rows: ScorecardRow[]): string {
  const evaluable = rows.filter(r => EVALUABLE.has(r.status));
  const meeting = evaluable.filter(r => r.status === 'MEETS_THRESHOLD').length;
  const unverifiable = rows.filter(r => r.status === 'UNVERIFIABLE').length;
  return `${meeting} of ${evaluable.length} evaluable checks meet their thresholds; ${unverifiable} unverifiable`;
}
