import { CanonicalTrade } from './CanonicalTradeLedger';
import { CleanRoomEconomicReplay, EconomicReplayResult } from './CleanRoomEconomicReplay';
import { CostModel } from './ProducerTradePnlCalculator';
import { ResearchRun } from './ResearchRun';

export interface CostRobustnessResult {
  multiplier: number;
  result: EconomicReplayResult;
}

class MultiplierCostModel implements CostModel {
  constructor(private baseModel: CostModel, private multiplier: number) {}

  public calculate(trade: CanonicalTrade, entryPrice: number, exitPrice: number): number {
    return this.baseModel.calculate(trade, entryPrice, exitPrice) * this.multiplier;
  }
}

export class EconomicCostRobustnessEngine {
  private readonly MULTIPLIERS = [0.75, 1.00, 1.25, 1.50, 2.00];

  public run(
    runContext: ResearchRun,
    trades: CanonicalTrade[],
    baseCostModel: CostModel
  ): CostRobustnessResult[] {
    const replayEngine = new CleanRoomEconomicReplay();
    const results: CostRobustnessResult[] = [];

    for (const multiplier of this.MULTIPLIERS) {
      // Create a modified cost model that multiplies the transaction costs
      const costModel = new MultiplierCostModel(baseCostModel, multiplier);

      // Perform a full economic replay using the new cost model
      // We do NOT synthetically multiply the baseline result. We replay the trades.
      const result = replayEngine.run(runContext, trades, costModel);
      
      results.push({
        multiplier,
        result
      });
    }

    return results;
  }
}
