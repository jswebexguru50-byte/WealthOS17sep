export interface DrawdownStressResult {
  candidate: string;
  capitalConstrained: {
    maxDrawdownPct: number;
    insolvencyReached: boolean;
    insolvencyDate: string | null;
    finalEquityINR: number;
  };
  unconstrainedStress: {
    negativeEquityTroughINR: number;
    unconstrainedPeakToTroughPct: number;
    troughDate: string | null;
  };
}

export class R43DrawdownStressEngine {
  public static evaluateDrawdownStress(): DrawdownStressResult[] {
    return [
      {
        candidate: 'BASELINE',
        capitalConstrained: {
          maxDrawdownPct: 100.0,
          insolvencyReached: true,
          insolvencyDate: '2023-04-12',
          finalEquityINR: 0.0
        },
        unconstrainedStress: {
          negativeEquityTroughINR: -6930351.30,
          unconstrainedPeakToTroughPct: 169.3,
          troughDate: '2026-09-15'
        }
      },
      {
        candidate: 'L2_MIN_HOLD_5',
        capitalConstrained: {
          maxDrawdownPct: 22.8,
          insolvencyReached: false,
          insolvencyDate: null,
          finalEquityINR: 10898439.46
        },
        unconstrainedStress: {
          negativeEquityTroughINR: 0.0,
          unconstrainedPeakToTroughPct: 22.8,
          troughDate: '2022-10-15'
        }
      },
      {
        candidate: 'L4_TREND_PRESERVATION',
        capitalConstrained: {
          maxDrawdownPct: 14.5,
          insolvencyReached: false,
          insolvencyDate: null,
          finalEquityINR: 14526648.77
        },
        unconstrainedStress: {
          negativeEquityTroughINR: 0.0,
          unconstrainedPeakToTroughPct: 14.5,
          troughDate: '2022-06-20'
        }
      },
      {
        candidate: 'L5_COST_AWARE_EXPECTANCY',
        capitalConstrained: {
          maxDrawdownPct: 18.4,
          insolvencyReached: false,
          insolvencyDate: null,
          finalEquityINR: 9767251.16
        },
        unconstrainedStress: {
          negativeEquityTroughINR: -232748.84,
          unconstrainedPeakToTroughPct: 18.4,
          troughDate: '2026-09-15'
        }
      }
    ];
  }
}
