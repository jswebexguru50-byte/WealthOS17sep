/**
 * Clean-Room Independent Financial Metric Verifier Oracle
 * Master Developer Specification — Section AC
 */

import { VerificationComparison } from './xirrVerifier.js';

export function verifyFinancialMetricOracle(
  metricName: string,
  rawInputs: Record<string, number>,
  productionResult: number | null,
  tolerance: number = 0.01 // 1% relative or absolute tolerance
): VerificationComparison {
  let independent: number | null = null;
  let basis = '';

  switch (metricName.toUpperCase()) {
    case 'CAGR': {
      const { startValue, endValue, periods } = rawInputs;
      if (startValue > 0 && endValue > 0 && periods > 0) {
        independent = (Math.pow(endValue / startValue, 1 / periods) - 1) * 100;
        basis = '((End / Start) ^ (1 / N) - 1) * 100';
      }
      break;
    }

    case 'YOY_GROWTH': {
      const { current, previous } = rawInputs;
      if (previous && previous !== 0) {
        independent = ((current - previous) / Math.abs(previous)) * 100;
        basis = '((Current - Previous) / |Previous|) * 100';
      }
      break;
    }

    case 'EBITDA_MARGIN_PCT': {
      const { ebitda, revenue } = rawInputs;
      if (revenue && revenue > 0) {
        independent = (ebitda / revenue) * 100;
        basis = '(EBITDA / Revenue) * 100';
      }
      break;
    }

    case 'PAT_MARGIN_PCT': {
      const { pat, revenue } = rawInputs;
      if (revenue && revenue > 0) {
        independent = (pat / revenue) * 100;
        basis = '(PAT / Revenue) * 100';
      }
      break;
    }

    case 'ROE_PCT': {
      const { pat, shareholderEquity } = rawInputs;
      if (shareholderEquity && shareholderEquity > 0) {
        independent = (pat / shareholderEquity) * 100;
        basis = '(PAT / Net Worth) * 100';
      }
      break;
    }

    case 'ROCE_PCT': {
      const { ebit, capitalEmployed } = rawInputs;
      if (capitalEmployed && capitalEmployed > 0) {
        independent = (ebit / capitalEmployed) * 100;
        basis = '(EBIT / Capital Employed) * 100';
      }
      break;
    }

    case 'CFO_TO_PAT_PCT': {
      const { cfo, pat } = rawInputs;
      if (pat && pat > 0) {
        independent = (cfo / pat) * 100;
        basis = '(CFO / PAT) * 100';
      }
      break;
    }

    default:
      return {
        productionResult,
        independentResult: null,
        difference: null,
        tolerance,
        status: 'INCONCLUSIVE',
        basis: `Unsupported metric ${metricName}`,
        notes: 'Supported: CAGR, YOY_GROWTH, EBITDA_MARGIN_PCT, PAT_MARGIN_PCT, ROE_PCT, ROCE_PCT, CFO_TO_PAT_PCT'
      };
  }

  if (independent === null || productionResult === null) {
    return {
      productionResult,
      independentResult: independent,
      difference: null,
      tolerance,
      status: 'INCONCLUSIVE',
      basis,
      notes: 'Missing required raw financial inputs for independent recomputation'
    };
  }

  const diff = Math.abs(productionResult - independent);
  const status = diff <= tolerance ? 'MATCH' : 'DISCREPANCY';

  return {
    productionResult: Number(productionResult.toFixed(4)),
    independentResult: Number(independent.toFixed(4)),
    difference: Number(diff.toFixed(4)),
    tolerance,
    status,
    basis,
    notes: status === 'MATCH' ? 'Verified independent financial math' : 'Calculated ratio deviates from production value'
  };
}
