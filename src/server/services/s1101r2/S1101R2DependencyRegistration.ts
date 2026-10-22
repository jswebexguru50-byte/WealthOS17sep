import { R2C2DependencyGraph } from './R2C2DependencyGraph';

export function createS1101R2DependencyGraph(): R2C2DependencyGraph {
  const graph = new R2C2DependencyGraph();

  /*
   * DATASETS
   */
  graph.register({
    id: 'D1_SECURITY_IDENTITY',
    type: 'DATASET',
    dependsOn: [],
  });

  graph.register({
    id: 'D2_DAILY_OHLCV',
    type: 'DATASET',
    dependsOn: [],
  });

  graph.register({
    id: 'D3_BENCHMARK',
    type: 'DATASET',
    dependsOn: [],
  });

  graph.register({
    id: 'D4_CORPORATE_ACTIONS',
    type: 'DATASET',
    dependsOn: [],
  });

  graph.register({
    id: 'D5_NIFTY500_PIT',
    type: 'DATASET',
    dependsOn: [
      'D1_SECURITY_IDENTITY',
      'D4_CORPORATE_ACTIONS',
    ],
  });

  graph.register({
    id: 'D6_FINANCIAL_PIT',
    type: 'DATASET',
    dependsOn: [
      'D1_SECURITY_IDENTITY',
    ],
  });

  graph.register({
    id: 'D7_INTRADAY',
    type: 'DATASET',
    dependsOn: [
      'D1_SECURITY_IDENTITY',
      'D4_CORPORATE_ACTIONS',
    ],
  });

  graph.register({
    id: 'D8_DERIVATIVES',
    type: 'DATASET',
    dependsOn: [
      'D1_SECURITY_IDENTITY',
    ],
  });

  graph.register({
    id: 'D9_DELIVERY',
    type: 'DATASET',
    dependsOn: [
      'D1_SECURITY_IDENTITY',
    ],
  });

  /*
   * STRATEGIES
   */
  for (const strategy of [
    'S1',
    'S2',
    'S3',
    'S4',
    'S5',
    'S7',
    'S8',
    'S9',
  ]) {
    graph.register({
      id: strategy,
      type: 'STRATEGY',
      dependsOn: [
        'D1_SECURITY_IDENTITY',
        'D2_DAILY_OHLCV',
        'D4_CORPORATE_ACTIONS',
        'D5_NIFTY500_PIT',
      ],
    });
  }

  graph.register({
    id: 'S6',
    type: 'STRATEGY',
    dependsOn: [
      'D1_SECURITY_IDENTITY',
      'D2_DAILY_OHLCV',
      'D3_BENCHMARK',
      'D4_CORPORATE_ACTIONS',
      'D5_NIFTY500_PIT',
    ],
  });

  graph.register({
    id: 'S10',
    type: 'STRATEGY',
    dependsOn: [
      'D1_SECURITY_IDENTITY',
      'D2_DAILY_OHLCV',
      'D4_CORPORATE_ACTIONS',
      'D5_NIFTY500_PIT',
      'D7_INTRADAY',
    ],
  });

  /*
   * DOWNSTREAM ENGINES
   */
  graph.register({
    id: 'SIGNAL_QUALITY_OVERLAY',
    type: 'ENGINE',
    dependsOn: [
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'S7',
      'S8',
      'S9',
      'S10',
    ],
  });

  graph.register({
    id: 'FERE',
    type: 'ENGINE',
    dependsOn: [
      'D6_FINANCIAL_PIT',
    ],
  });

  graph.register({
    id: 'QGLP',
    type: 'ENGINE',
    dependsOn: [
      'D6_FINANCIAL_PIT',
      'FERE',
    ],
  });

  graph.register({
    id: 'SMART_MONEY',
    type: 'ENGINE',
    dependsOn: [
      'D1_SECURITY_IDENTITY',
    ],
  });

  graph.register({
    id: 'MOMENTUM',
    type: 'ENGINE',
    dependsOn: [
      'D2_DAILY_OHLCV',
      'D3_BENCHMARK',
    ],
  });

  graph.register({
    id: 'SECTOR_ROTATION',
    type: 'ENGINE',
    dependsOn: [
      'D2_DAILY_OHLCV',
      'D3_BENCHMARK',
    ],
  });

  graph.register({
    id: 'DECISION_GRAPH',
    type: 'ENGINE',
    dependsOn: [
      'SIGNAL_QUALITY_OVERLAY',
      'FERE',
      'QGLP',
      'SMART_MONEY',
      'MOMENTUM',
      'SECTOR_ROTATION',
    ],
  });

  graph.register({
    id: 'PORTFOLIO_RISK',
    type: 'ENGINE',
    dependsOn: [
      'DECISION_GRAPH',
    ],
  });

  graph.register({
    id: 'CAPITAL_PROTECTION',
    type: 'ENGINE',
    dependsOn: [
      'PORTFOLIO_RISK',
    ],
  });

  graph.register({
    id: 'FRACTIONAL_KELLY',
    type: 'ENGINE',
    dependsOn: [
      'CAPITAL_PROTECTION',
    ],
  });

  graph.register({
    id: 'SHADOW_SAFETY',
    type: 'ENGINE',
    dependsOn: [
      'FRACTIONAL_KELLY',
    ],
  });

  /*
   * FINAL REPORT / ARTIFACTS
   */
  graph.register({
    id: 'S1101R2_FINAL_STATUS',
    type: 'REPORT',
    dependsOn: [
      'SHADOW_SAFETY',
    ],
  });

  return graph;
}
