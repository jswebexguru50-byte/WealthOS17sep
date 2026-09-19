import * as crypto from 'crypto';
import { CanonicalTradeRecord, ResearchBacktestEngine, ReplayedTrade, PortfolioReplaySummary } from './ResearchBacktestEngine';

export interface WFOWindowDefinition {
  windowId: string;
  name: string;
  isExtendedHoldout: boolean;
  trainStart: string;
  trainEnd: string;
  validationStart: string;
  validationEnd: string;
  oosStart: string;
  oosEnd: string;
  purgeDays: number;
  embargoDays: number;
  configurationHash: string;
  dataSnapshotHash: string;
}

export interface WFOWindowResult {
  window: WFOWindowDefinition;
  trainSummary: PortfolioReplaySummary;
  validationSummary: PortfolioReplaySummary;
  oosSummary: PortfolioReplaySummary;
  retainedOosTradeCount: number;
  suppressedOosTradeCount: number;
  status: 'PASS' | 'DATA_INSUFFICIENT' | 'FAILED';
}

export class ResearchWalkForwardEngine {
  public static readonly PREDECLARED_WFO_WINDOWS: WFOWindowDefinition[] = [
    {
      windowId: 'WFO-01',
      name: 'Rolling Window 1 (2020-2021)',
      isExtendedHoldout: false,
      trainStart: '2020-01-01',
      trainEnd: '2020-12-31',
      validationStart: '2021-01-01',
      validationEnd: '2021-06-30',
      oosStart: '2021-07-01',
      oosEnd: '2021-12-31',
      purgeDays: 5,
      embargoDays: 5,
      configurationHash: '07a341aa2595a52c48aff1491929a40ca655213262f978d7bbb94753b1015b58',
      dataSnapshotHash: 'SNP-R3-E08D3378468F3433'
    },
    {
      windowId: 'WFO-02',
      name: 'Rolling Window 2 (2020-2022)',
      isExtendedHoldout: false,
      trainStart: '2020-07-01',
      trainEnd: '2021-06-30',
      validationStart: '2021-07-01',
      validationEnd: '2021-12-31',
      oosStart: '2022-01-01',
      oosEnd: '2022-06-30',
      purgeDays: 5,
      embargoDays: 5,
      configurationHash: '07a341aa2595a52c48aff1491929a40ca655213262f978d7bbb94753b1015b58',
      dataSnapshotHash: 'SNP-R3-E08D3378468F3433'
    },
    {
      windowId: 'WFO-03',
      name: 'Rolling Window 3 (2021-2022)',
      isExtendedHoldout: false,
      trainStart: '2021-01-01',
      trainEnd: '2021-12-31',
      validationStart: '2022-01-01',
      validationEnd: '2022-06-30',
      oosStart: '2022-07-01',
      oosEnd: '2022-12-31',
      purgeDays: 5,
      embargoDays: 5,
      configurationHash: '07a341aa2595a52c48aff1491929a40ca655213262f978d7bbb94753b1015b58',
      dataSnapshotHash: 'SNP-R3-E08D3378468F3433'
    },
    {
      windowId: 'WFO-04',
      name: 'Rolling Window 4 (2021-2023)',
      isExtendedHoldout: false,
      trainStart: '2021-07-01',
      trainEnd: '2022-06-30',
      validationStart: '2022-07-01',
      validationEnd: '2022-12-31',
      oosStart: '2023-01-01',
      oosEnd: '2023-06-30',
      purgeDays: 5,
      embargoDays: 5,
      configurationHash: '07a341aa2595a52c48aff1491929a40ca655213262f978d7bbb94753b1015b58',
      dataSnapshotHash: 'SNP-R3-E08D3378468F3433'
    },
    {
      windowId: 'WFO-05',
      name: 'Rolling Window 5 (2022-2023)',
      isExtendedHoldout: false,
      trainStart: '2022-01-01',
      trainEnd: '2022-12-31',
      validationStart: '2023-01-01',
      validationEnd: '2023-06-30',
      oosStart: '2023-07-01',
      oosEnd: '2023-12-31',
      purgeDays: 5,
      embargoDays: 5,
      configurationHash: '07a341aa2595a52c48aff1491929a40ca655213262f978d7bbb94753b1015b58',
      dataSnapshotHash: 'SNP-R3-E08D3378468F3433'
    },
    {
      windowId: 'WFO-06',
      name: 'Extended Holdout Window (2024-2026)',
      isExtendedHoldout: true,
      trainStart: '2020-01-01',
      trainEnd: '2023-06-30',
      validationStart: '2023-07-01',
      validationEnd: '2023-12-31',
      oosStart: '2024-01-01',
      oosEnd: '2026-03-31',
      purgeDays: 10,
      embargoDays: 10,
      configurationHash: '07a341aa2595a52c48aff1491929a40ca655213262f978d7bbb94753b1015b58',
      dataSnapshotHash: 'SNP-R3-E08D3378468F3433'
    }
  ];

  public static evaluateWFO(
    trades: CanonicalTradeRecord[],
    filterIds: string[] = []
  ): WFOWindowResult[] {
    const results: WFOWindowResult[] = [];

    for (const w of this.PREDECLARED_WFO_WINDOWS) {
      const trainTrades = trades.filter(t => {
        const d = (t.decisionDate ?? t.decisionTimestamp ?? '').split('T')[0];
        return d >= w.trainStart && d <= w.trainEnd;
      });
      const valTrades = trades.filter(t => {
        const d = (t.decisionDate ?? t.decisionTimestamp ?? '').split('T')[0];
        return d >= w.validationStart && d <= w.validationEnd;
      });
      const oosTrades = trades.filter(t => {
        const d = (t.decisionDate ?? t.decisionTimestamp ?? '').split('T')[0];
        return d >= w.oosStart && d <= w.oosEnd;
      });

      const trainReplay = ResearchBacktestEngine.replayDataset(trainTrades, filterIds);
      const valReplay = ResearchBacktestEngine.replayDataset(valTrades, filterIds);
      const oosReplay = ResearchBacktestEngine.replayDataset(oosTrades, filterIds);

      results.push({
        window: w,
        trainSummary: trainReplay.summary,
        validationSummary: valReplay.summary,
        oosSummary: oosReplay.summary,
        retainedOosTradeCount: oosReplay.summary.retainedTradeCount,
        suppressedOosTradeCount: oosReplay.summary.suppressedTradeCount,
        status: oosTrades.length > 0 ? 'PASS' : 'DATA_INSUFFICIENT'
      });
    }

    return results;
  }
}
