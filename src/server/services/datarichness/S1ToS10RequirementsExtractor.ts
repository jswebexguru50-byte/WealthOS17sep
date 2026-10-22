import * as fs from 'node:fs';
import * as path from 'node:path';

export interface StrategyDataRequirement {
  strategyId: string;
  sourceFile: string;
  sourceFunction: string;
  parameterName: string;
  sourceField: string;
  formula: string;
  lookback: string;
  frequency: string;
  requiredHistory: string;
  PITRequired: boolean;
  availabilityTimestampRequired: boolean;
  dependencyType: 'OHLCV' | 'INTRADAY' | 'FINANCIAL' | 'BENCHMARK' | 'CORPORATE_ACTION' | 'UNIVERSE';
}

export class S1ToS10RequirementsExtractor {
  private baseDir: string;

  constructor(baseDir = 'reports/v674-s110') {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public extractAllRequirements(): Record<string, StrategyDataRequirement[]> {
    const requirements: Record<string, StrategyDataRequirement[]> = {
      S1: [
        {
          strategyId: 'S1',
          sourceFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
          sourceFunction: 'evaluateS1',
          parameterName: 'dailyOHLCV',
          sourceField: 'close,volume',
          formula: '20-day SMA Price Breakout + 1.5x Volume Multiplier',
          lookback: '20D',
          frequency: 'DAILY',
          requiredHistory: '2018-01-01 to 2026-04-05',
          PITRequired: true,
          availabilityTimestampRequired: true,
          dependencyType: 'OHLCV',
        },
      ],
      S2: [
        {
          strategyId: 'S2',
          sourceFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
          sourceFunction: 'evaluateS2',
          parameterName: 'dailyOHLCV',
          sourceField: 'close',
          formula: '50-day EMA Cross Above 200-day EMA (Golden Cross)',
          lookback: '200D',
          frequency: 'DAILY',
          requiredHistory: '2018-01-01 to 2026-04-05',
          PITRequired: true,
          availabilityTimestampRequired: true,
          dependencyType: 'OHLCV',
        },
      ],
      S3: [
        {
          strategyId: 'S3',
          sourceFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
          sourceFunction: 'evaluateS3',
          parameterName: 'dailyOHLCV',
          sourceField: 'high,low,close',
          formula: '14-day RSI oversold rebound (<30 to >35)',
          lookback: '14D',
          frequency: 'DAILY',
          requiredHistory: '2018-01-01 to 2026-04-05',
          PITRequired: true,
          availabilityTimestampRequired: true,
          dependencyType: 'OHLCV',
        },
      ],
      S4: [
        {
          strategyId: 'S4',
          sourceFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
          sourceFunction: 'evaluateS4',
          parameterName: 'dailyOHLCV,indexOHLCV',
          sourceField: 'close',
          formula: 'Relative Strength vs NIFTY 500 > 80 percentile',
          lookback: '63D',
          frequency: 'DAILY',
          requiredHistory: '2018-01-01 to 2026-04-05',
          PITRequired: true,
          availabilityTimestampRequired: true,
          dependencyType: 'BENCHMARK',
        },
      ],
      S5: [
        {
          strategyId: 'S5',
          sourceFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
          sourceFunction: 'evaluateS5',
          parameterName: 'dailyOHLCV',
          sourceField: 'high,low,close',
          formula: '20-day Donchian Channel Breakout',
          lookback: '20D',
          frequency: 'DAILY',
          requiredHistory: '2018-01-01 to 2026-04-05',
          PITRequired: true,
          availabilityTimestampRequired: true,
          dependencyType: 'OHLCV',
        },
      ],
      S6: [
        {
          strategyId: 'S6',
          sourceFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
          sourceFunction: 'evaluateS6',
          parameterName: 'dailyOHLCV,indexOHLCV',
          sourceField: 'close,volume',
          formula: 'Dual Momentum (Absolute + Relative 12-month ROC)',
          lookback: '252D',
          frequency: 'DAILY',
          requiredHistory: '2018-01-01 to 2026-04-05',
          PITRequired: true,
          availabilityTimestampRequired: true,
          dependencyType: 'BENCHMARK',
        },
      ],
      S7: [
        {
          strategyId: 'S7',
          sourceFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
          sourceFunction: 'evaluateS7',
          parameterName: 'dailyOHLCV,financialsPIT',
          sourceField: 'close,pe_ratio,roe,debt_to_equity',
          formula: 'Quality Value Rebound (ROE>15%, D/E<0.5, PE<HistAvg)',
          lookback: '4Q',
          frequency: 'DAILY',
          requiredHistory: '2018-01-01 to 2026-04-05',
          PITRequired: true,
          availabilityTimestampRequired: true,
          dependencyType: 'FINANCIAL',
        },
      ],
      S8: [
        {
          strategyId: 'S8',
          sourceFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
          sourceFunction: 'evaluateS8',
          parameterName: 'dailyOHLCV,sectorOHLCV',
          sourceField: 'close,sector',
          formula: 'Sector Rotation Momentum (Top 3 Sector Constituents)',
          lookback: '63D',
          frequency: 'DAILY',
          requiredHistory: '2018-01-01 to 2026-04-05',
          PITRequired: true,
          availabilityTimestampRequired: true,
          dependencyType: 'BENCHMARK',
        },
      ],
      S9: [
        {
          strategyId: 'S9',
          sourceFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
          sourceFunction: 'evaluateS9',
          parameterName: 'dailyOHLCV,deliveryData',
          sourceField: 'volume,delivery_pct,open_interest',
          formula: 'Smart Money Institutional Accumulation Spike',
          lookback: '10D',
          frequency: 'DAILY',
          requiredHistory: '2018-01-01 to 2026-04-05',
          PITRequired: true,
          availabilityTimestampRequired: true,
          dependencyType: 'OHLCV',
        },
      ],
      S10: [
        {
          strategyId: 'S10',
          sourceFile: 'src/server/services/PureTechnicalStrategiesEngine.ts',
          sourceFunction: 'evaluateS10',
          parameterName: 'intraday5MinBars',
          sourceField: 'timestamp,open,high,low,close,volume',
          formula: 'Opening Range Breakout (09:15-09:30 ORB) + VWAP Support',
          lookback: '75 bars (1D)',
          frequency: '5MIN',
          requiredHistory: '2018-01-01 to 2026-04-05',
          PITRequired: true,
          availabilityTimestampRequired: true,
          dependencyType: 'INTRADAY',
        },
      ],
    };

    for (const [stratId, list] of Object.entries(requirements)) {
      const filePath = path.join(this.baseDir, `${stratId}_DATA_REQUIREMENTS.json`);
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
    }

    return requirements;
  }
}
