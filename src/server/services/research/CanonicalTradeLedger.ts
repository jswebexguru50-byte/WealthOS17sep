export interface CanonicalTrade {
  tradeId: string;
  decisionId: string;

  strategyId: string;
  configurationId: string;
  engineId?: string;

  securityId: string;
  symbol: string;

  decisionDate: string;
  decisionTimestamp: string;

  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;

  actualEntryPrice?: number;
  actualExitPrice?: number;
  exitPrice: number;

  quantity: number;

  side: "LONG" | "HEDGE";

  grossPnl?: number;
  costs?: number;
  netPnl?: number;

  entryEvidenceHash: string;
  exitEvidenceHash?: string;

  pitContextHash: string;

  sourceRecordHash: string;
}
