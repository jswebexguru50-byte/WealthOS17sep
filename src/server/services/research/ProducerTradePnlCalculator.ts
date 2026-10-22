import { CanonicalTrade } from './CanonicalTradeLedger';

export interface CostModel {
  calculate(trade: CanonicalTrade, entryPrice: number, exitPrice: number): number;
}

export interface TradePnl {
  entry: number;
  exit: number;
  gross: number;
  costs: number;
  net: number;
}

export class ProducerTradePnlCalculator {
  /**
   * Strictly uses nullish coalescing to avoid the precedence bug
   * e.g., t.actualExitPrice || t.exitPrice (which fails when 0)
   */
  public static calculateTradePnl(
    trade: CanonicalTrade,
    costModel: CostModel
  ): TradePnl {
    const entry = trade.actualEntryPrice ?? trade.entryPrice;
    const exit = trade.actualExitPrice ?? trade.exitPrice;

    const gross = (exit - entry) * trade.quantity;
    const costs = costModel.calculate(trade, entry, exit);
    const net = gross - costs;

    return {
      entry,
      exit,
      gross,
      costs,
      net
    };
  }
}
