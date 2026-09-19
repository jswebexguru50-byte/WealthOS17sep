import { CanonicalTrade } from './CanonicalTradeLedger';
import { ResearchRun } from './ResearchRun';

export interface SuppressedOpportunity {
  tradeId: string;
  originalQuantity: number;
  approvedQuantity: number;
  suppressionReason: string;
  eventualPnl: number;
  eventualR: number;
  outcome: "WIN" | "LOSS" | "FLAT";
}

export interface SuppressionAnalysisResult {
  suppressedWinners: number;
  suppressedLosers: number;
  capitalSaved: number;
  pnlLost: number;
  rLost: number;
  drawdownAvoided: number;
  opportunities: SuppressedOpportunity[];
}

export class OpportunitySuppressionAnalyzer {
  public run(
    runContext: ResearchRun,
    proposedTrades: CanonicalTrade[],
    executedTrades: CanonicalTrade[]
  ): SuppressionAnalysisResult {
    let suppressedWinners = 0;
    let suppressedLosers = 0;
    let capitalSaved = 0;
    let pnlLost = 0;
    let rLost = 0;
    
    // Stubbed representation of full analysis 
    // It compares proposed trades (before risk overlay) vs executed trades (after).
    
    return {
      suppressedWinners,
      suppressedLosers,
      capitalSaved,
      pnlLost,
      rLost,
      drawdownAvoided: 0,
      opportunities: []
    };
  }
}
