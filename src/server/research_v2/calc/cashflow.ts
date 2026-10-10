import type { CalcResult } from '../domain/calc.js';
import type { CalcEnv } from './env.js';
import { specLabel } from './env.js';
import {
  averageOrClosing, capexMeasure, combine, ebitdaMeasure, fcfMeasure, flow, measureResult, noPeriod, patMeasure,
  pit, ratioResult,
} from './measures.js';
import { fmt } from './result.js';

/**
 * Cash-flow quality for the latest fiscal year: CFO/PAT (attributable), CFO/EBITDA, accruals on average
 * total assets, free cash flow (CFO - capex, capex basis flagged) and the reinvestment rate.
 */
export function cashflowCalcs(env: CalcEnv): CalcResult[] {
  const spec = env.annualSpec();
  if (!spec) return [noPeriod(env, 'cfo_to_pat', 'CFO / PAT', 'X', 'annual facts')];
  const period = specLabel(spec);
  const cfo = flow(env, spec, 'cfo');

  const cfoToPat = ratioResult(env, {
    key: 'cfo_to_pat', name: 'CFO / PAT (attributable)', period, unit: 'X',
    numerator: cfo, denominator: patMeasure(env, spec, 'ATTRIBUTABLE'),
    numeratorLabel: 'cfo', denominatorLabel: 'pat_attributable_to_owners', positiveDenominator: true,
  });
  const cfoToEbitda = ratioResult(env, {
    key: 'cfo_to_ebitda', name: 'CFO / EBITDA', period, unit: 'X',
    numerator: cfo, denominator: ebitdaMeasure(env, spec),
    numeratorLabel: 'cfo', denominatorLabel: 'ebitda_derived', positiveDenominator: true,
    note: 'same fiscal-year duration basis; EBITDA before exceptional items',
  });
  const accruals = ratioResult(env, {
    key: 'accruals_ratio', name: 'Accruals / average total assets', period, unit: 'PCT', scale: 100,
    numerator: combine([patMeasure(env, spec, 'TOTAL'), cfo], v => v[0] - v[1]),
    denominator: averageOrClosing(env, spec.end, (e, end) => pit(e, end, 'total_assets')),
    numeratorLabel: '(PAT - CFO)', denominatorLabel: 'total_assets', positiveDenominator: true,
    note: 'positive = earnings exceed cash flow',
  });
  const fcf = fcfMeasure(env, spec);
  const fcfResult = measureResult(env, 'fcf', 'Free cash flow (CFO - capex)', period, 'INR_CR', fcf,
    fcf.ok ? `cfo - capex_cash_outflow = ${fmt(fcf.value)}` : 'cfo - capex_cash_outflow',
    'a negative value is a real outcome, not missing data');
  const reinvestment = ratioResult(env, {
    key: 'reinvestment_rate', name: 'Reinvestment rate (capex / CFO)', period, unit: 'PCT', scale: 100,
    numerator: capexMeasure(env, spec), denominator: cfo,
    numeratorLabel: 'capex_cash_outflow', denominatorLabel: 'cfo', positiveDenominator: true,
  });
  return [cfoToPat, cfoToEbitda, accruals, fcfResult, reinvestment];
}
