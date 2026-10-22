import * as fs from 'fs';
import * as path from 'path';

export interface StrategyDependency {
  strategyId: string; // 'S1' | 'S2' | ... | 'S10'
  name: string;
  sourceFiles: string[];
  requiredFields: string[];
  domainsConsumed: string[]; // ['D1', 'D2', 'D3', 'D4', 'D5', 'D7', 'D9']
  lookbackDays: number;
  benchmarkDependency: boolean;
  volumeDependency: boolean;
  deliveryDependency: boolean;
  intradayDependency: boolean;
  indexDependency: boolean;
  financialDependency: boolean;
  availabilityTimestampRequired: boolean;
  pitRequired: boolean;
}

export class S110DependencyAuditor {
  private static readonly STRATEGIES: StrategyDependency[] = [
    {
      strategyId: 'S1',
      name: 'VPA Base Compaction',
      sourceFiles: ['src/server/services/PureTechnicalStrategiesEngine.ts', 'src/server/services/MomentumVpaEngine.ts'],
      requiredFields: ['open', 'high', 'low', 'close', 'volume'],
      domainsConsumed: ['D1', 'D2', 'D4', 'D5'],
      lookbackDays: 60,
      benchmarkDependency: false,
      volumeDependency: true,
      deliveryDependency: false,
      intradayDependency: false,
      indexDependency: false,
      financialDependency: false,
      availabilityTimestampRequired: true,
      pitRequired: true
    },
    {
      strategyId: 'S2',
      name: 'Institutional FVG / 50% Consequent Encroachment',
      sourceFiles: ['src/server/services/PureTechnicalStrategiesEngine.ts', 'src/server/services/SmartMoneyConceptsEngine.ts'],
      requiredFields: ['open', 'high', 'low', 'close', 'volume'],
      domainsConsumed: ['D1', 'D2', 'D4', 'D5'],
      lookbackDays: 45,
      benchmarkDependency: false,
      volumeDependency: true,
      deliveryDependency: false,
      intradayDependency: false,
      indexDependency: false,
      financialDependency: false,
      availabilityTimestampRequired: true,
      pitRequired: true
    },
    {
      strategyId: 'S3',
      name: 'Dow Theory HH/HL Compaction',
      sourceFiles: ['src/server/services/PureTechnicalStrategiesEngine.ts'],
      requiredFields: ['open', 'high', 'low', 'close', 'volume'],
      domainsConsumed: ['D1', 'D2', 'D4', 'D5'],
      lookbackDays: 90,
      benchmarkDependency: false,
      volumeDependency: true,
      deliveryDependency: false,
      intradayDependency: false,
      indexDependency: false,
      financialDependency: false,
      availabilityTimestampRequired: true,
      pitRequired: true
    },
    {
      strategyId: 'S4',
      name: '200 SMA Proximity',
      sourceFiles: ['src/server/services/PureTechnicalStrategiesEngine.ts'],
      requiredFields: ['close', 'volume'],
      domainsConsumed: ['D1', 'D2', 'D4', 'D5'],
      lookbackDays: 200,
      benchmarkDependency: false,
      volumeDependency: false,
      deliveryDependency: false,
      intradayDependency: false,
      indexDependency: false,
      financialDependency: false,
      availabilityTimestampRequired: true,
      pitRequired: true
    },
    {
      strategyId: 'S5',
      name: '50 EMA VCP Pullback',
      sourceFiles: ['src/server/services/PureTechnicalStrategiesEngine.ts'],
      requiredFields: ['open', 'high', 'low', 'close', 'volume'],
      domainsConsumed: ['D1', 'D2', 'D4', 'D5'],
      lookbackDays: 60,
      benchmarkDependency: false,
      volumeDependency: true,
      deliveryDependency: false,
      intradayDependency: false,
      indexDependency: false,
      financialDependency: false,
      availabilityTimestampRequired: true,
      pitRequired: true
    },
    {
      strategyId: 'S6',
      name: '52-Week High Relative-Strength Breakout',
      sourceFiles: ['src/server/services/PureTechnicalStrategiesEngine.ts', 'src/server/services/TechnicalMomentumEngine.ts'],
      requiredFields: ['close', 'high', 'volume'],
      domainsConsumed: ['D1', 'D2', 'D3', 'D4', 'D5'],
      lookbackDays: 252,
      benchmarkDependency: true,
      volumeDependency: true,
      deliveryDependency: false,
      intradayDependency: false,
      indexDependency: true,
      financialDependency: false,
      availabilityTimestampRequired: true,
      pitRequired: true
    },
    {
      strategyId: 'S7',
      name: 'RSI Capitulation Mean Reversion',
      sourceFiles: ['src/server/services/PureTechnicalStrategiesEngine.ts'],
      requiredFields: ['close', 'low', 'volume'],
      domainsConsumed: ['D1', 'D2', 'D4', 'D5'],
      lookbackDays: 30,
      benchmarkDependency: false,
      volumeDependency: true,
      deliveryDependency: false,
      intradayDependency: false,
      indexDependency: false,
      financialDependency: false,
      availabilityTimestampRequired: true,
      pitRequired: true
    },
    {
      strategyId: 'S8',
      name: 'High-Tight Flag',
      sourceFiles: ['src/server/services/PureTechnicalStrategiesEngine.ts', 'src/server/services/MomentumVpaEngine.ts'],
      requiredFields: ['high', 'low', 'close', 'volume'],
      domainsConsumed: ['D1', 'D2', 'D4', 'D5'],
      lookbackDays: 60,
      benchmarkDependency: false,
      volumeDependency: true,
      deliveryDependency: false,
      intradayDependency: false,
      indexDependency: false,
      financialDependency: false,
      availabilityTimestampRequired: true,
      pitRequired: true
    },
    {
      strategyId: 'S9',
      name: 'Volume Dry-Up Rebound',
      sourceFiles: ['src/server/services/PureTechnicalStrategiesEngine.ts'],
      requiredFields: ['close', 'volume'],
      domainsConsumed: ['D1', 'D2', 'D4', 'D5'],
      lookbackDays: 40,
      benchmarkDependency: false,
      volumeDependency: true,
      deliveryDependency: false,
      intradayDependency: false,
      indexDependency: false,
      financialDependency: false,
      availabilityTimestampRequired: true,
      pitRequired: true
    },
    {
      strategyId: 'S10',
      name: 'Parabolic Trendline Compression + ORB',
      sourceFiles: ['src/server/services/PureTechnicalStrategiesEngine.ts', 'src/server/services/UpstoxIntradayIngestor.ts'],
      requiredFields: ['open', 'high', 'low', 'close', 'volume', 'intraday_5m'],
      domainsConsumed: ['D1', 'D2', 'D4', 'D5', 'D7'],
      lookbackDays: 30,
      benchmarkDependency: false,
      volumeDependency: true,
      deliveryDependency: false,
      intradayDependency: true,
      indexDependency: false,
      financialDependency: false,
      availabilityTimestampRequired: true,
      pitRequired: true
    }
  ];

  public static auditAllStrategies(): StrategyDependency[] {
    return this.STRATEGIES;
  }

  public static getDependencyMap(): Record<string, StrategyDependency> {
    const map: Record<string, StrategyDependency> = {};
    for (const dep of this.STRATEGIES) {
      map[dep.strategyId] = dep;
    }
    return map;
  }
}
