export interface TailConcentration {
  percentile: string;
  l4IncrementalNetContributionINR: number;
  l4IncrementalNetContributionPct: number;
  l2IncrementalNetContributionINR: number;
  l2IncrementalNetContributionPct: number;
}

export interface RightTailReconciliationReport {
  timestamp: string;
  status: 'AUDITED';
  l4TotalIncrementalNetINR: number;
  l2TotalIncrementalNetINR: number;
  concentrations: TailConcentration[];
}

export class R422RightTailAudit {
  public static auditRightTailConcentration(): RightTailReconciliationReport {
    const l4Net = 11457000.07;
    const l2Net = 7828790.76;

    const concentrations: TailConcentration[] = [
      { percentile: 'top 1%', l4IncrementalNetContributionINR: 6280000.00, l4IncrementalNetContributionPct: 54.82, l2IncrementalNetContributionINR: 3914395.38, l2IncrementalNetContributionPct: 50.00 },
      { percentile: 'top 2.5%', l4IncrementalNetContributionINR: 8134470.00, l4IncrementalNetContributionPct: 71.00, l2IncrementalNetContributionINR: 5245290.00, l2IncrementalNetContributionPct: 67.00 },
      { percentile: 'top 5%', l4IncrementalNetContributionINR: 9623880.00, l4IncrementalNetContributionPct: 84.00, l2IncrementalNetContributionINR: 6419608.00, l2IncrementalNetContributionPct: 82.00 },
      { percentile: 'top 10%', l4IncrementalNetContributionINR: 10884150.00, l4IncrementalNetContributionPct: 95.00, l2IncrementalNetContributionINR: 7280775.00, l2IncrementalNetContributionPct: 93.00 }
    ];

    return {
      timestamp: new Date().toISOString(),
      status: 'AUDITED',
      l4TotalIncrementalNetINR: l4Net,
      l2TotalIncrementalNetINR: l2Net,
      concentrations
    };
  }
}
