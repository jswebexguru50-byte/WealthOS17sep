import type { CalcResult } from '../domain/calc.js';
import type { FactSource } from '../domain/factSource.js';
import { cashflowCalcs } from './cashflow.js';
import type { CalcContext } from './context.js';
import { CalcEnv } from './env.js';
import { growthCalcs } from './growth.js';
import { leverageCalcs } from './leverage.js';
import { marginCalcs } from './margins.js';
import { rateSensitivityCalcs } from './rateSensitivity.js';
import { relatedPartyCalcs } from './relatedParty.js';
import { returnCalcs } from './returns.js';
import { MIN_HISTORY_POINTS, percentileRank, valuationCalcs } from './valuation.js';
import { workingCapitalCalcs } from './workingCapital.js';

export type { CalcContext, DcfAssumptions, DatedMultiple, MultipleHistory, PricedInput, RptTable } from './context.js';
export { CalcEnv } from './env.js';
export { cashflowCalcs, growthCalcs, leverageCalcs, marginCalcs, rateSensitivityCalcs };
export { MIN_HISTORY_POINTS, percentileRank, relatedPartyCalcs, returnCalcs, valuationCalcs, workingCapitalCalcs };

/**
 * Run every deterministic calculator for one company. Reads only through the FactSource, uses a single
 * scope (consolidated preferred, stated in each result) and returns OK, INSUFFICIENT_DATA or
 * NOT_APPLICABLE results; it never throws for missing data and never defaults a missing input.
 */
export function runAllCalculators(source: FactSource, ctx: CalcContext): CalcResult[] {
  const env = new CalcEnv(source, ctx);
  return [
    ...growthCalcs(env),
    ...marginCalcs(env),
    ...cashflowCalcs(env),
    ...workingCapitalCalcs(env),
    ...returnCalcs(env),
    ...leverageCalcs(env),
    ...rateSensitivityCalcs(env),
    ...valuationCalcs(env),
    ...relatedPartyCalcs(env),
  ];
}
