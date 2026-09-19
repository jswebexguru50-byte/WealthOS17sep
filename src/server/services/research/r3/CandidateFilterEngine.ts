import * as crypto from 'crypto';
import { DataRequirement } from './ResearchSnapshotManager';

export interface StrategySignal {
  securityId: string;
  strategyId: string;
  timestamp: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  quantity?: number;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface PITResearchContext {
  securityId: string;
  timestamp: string;
  lookbackDays: number;
  dailyOHLCV: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  marketIndexOHLCV?: Array<{
    date: string;
    close: number;
    volume: number;
  }>;
  sectorIndexOHLCV?: Array<{
    date: string;
    close: number;
    volume: number;
  }>;
  financialStatements?: Array<{
    periodEnd: string;
    filingDate: string;
    eps: number;
    revenue: number;
    operatingCashFlow: number;
  }>;
}

export interface CandidateFilterResult {
  passed: boolean;
  score?: number;
  reasonCode: string;
  evidenceIds: string[];
  pitTimestamp: string;
  inputHash: string;
  deterministic: true;
}

export interface CandidateFilter {
  filterId: string;
  hypothesisId: string;
  inputRequirements: DataRequirement[];
  evaluate(
    context: PITResearchContext,
    signal: StrategySignal
  ): CandidateFilterResult;
}

export class CandidateFilterEngine {
  private static filters: Map<string, CandidateFilter> = new Map();

  public static registerFilter(filter: CandidateFilter): void {
    if (this.filters.has(filter.filterId)) {
      throw new Error(`STOP_THE_LINE: Duplicate filterId detected: ${filter.filterId}`);
    }
    this.filters.set(filter.filterId, Object.freeze(filter));
  }

  public static getFilter(filterId: string): CandidateFilter | undefined {
    return this.filters.get(filterId);
  }

  public static evaluateFilter(
    filterId: string,
    context: PITResearchContext,
    signal: StrategySignal
  ): CandidateFilterResult {
    const filter = this.filters.get(filterId);
    if (!filter) {
      throw new Error(`Filter not found: ${filterId}`);
    }

    // Pre-flight check: ensure context timestamp matches signal timestamp (prevent lookahead)
    if (context.timestamp > signal.timestamp) {
      throw new Error(`STOP_THE_LINE: Context timestamp ${context.timestamp} later than signal ${signal.timestamp} (lookahead breach)`);
    }

    // Verify mandatory data requirements
    for (const req of filter.inputRequirements) {
      if (req.mandatory && req.dataDomain === 'DAILY_OHLCV') {
        if (!context.dailyOHLCV || context.dailyOHLCV.length < req.lookbackDays) {
          return {
            passed: false,
            reasonCode: 'DATA_INSUFFICIENT_OHLCV',
            evidenceIds: [],
            pitTimestamp: context.timestamp,
            inputHash: 'DATA_INSUFFICIENT',
            deterministic: true
          };
        }
      }
    }

    return filter.evaluate(context, signal);
  }

  public static clear(): void {
    this.filters.clear();
  }
}
