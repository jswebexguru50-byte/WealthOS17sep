import crypto from 'crypto';
import { EvidenceBus } from './EvidenceBus';
import { OutcomeRecord } from './FastTrackTypes';

export class EconomicStatisticsEngine {
  constructor(private evidenceBus: EvidenceBus) {}

  public async calculateEconomics(): Promise<void> {
    const outcomeEvidence = this.evidenceBus.getEvidenceByType<OutcomeRecord>("OUTCOME_LEDGER");
    const outcomes = outcomeEvidence.map(e => e.payload);

    // Group by strategy
    const strategyStats = new Map<string, any>();
    
    for (const outcome of outcomes) {
        if (!strategyStats.has(outcome.strategyId)) {
            strategyStats.set(outcome.strategyId, {
                signalCount: 0,
                winningTrades: 0,
                totalReturn: 0,
                mfeTotal: 0,
                maeTotal: 0
            });
        }
        
        const stats = strategyStats.get(outcome.strategyId);
        
        // Handle DATA_INSUFFICIENT
        if (!outcome.forwardReturns) {
            continue; 
        }

        stats.signalCount++;
        
        // Use 20D as a proxy for the economic return for this stub
        const ret = outcome.forwardReturns['20D'] || 0;
        stats.totalReturn += ret;
        if (ret > 0) stats.winningTrades++;
        
        stats.mfeTotal += (outcome.mfe || 0);
        stats.maeTotal += (outcome.mae || 0);
    }

    // Publish Economic Evidence
    for (const [strategyId, stats] of strategyStats.entries()) {
        const hitRate = stats.signalCount > 0 ? stats.winningTrades / stats.signalCount : 0;
        const meanReturn = stats.signalCount > 0 ? stats.totalReturn / stats.signalCount : 0;

        const economicData = {
            strategyId,
            signalCount: stats.signalCount,
            hitRate,
            meanReturn,
            expectancy: meanReturn, // simplified
            profitFactor: 1.5, // mocked
            averageMfe: stats.signalCount > 0 ? stats.mfeTotal / stats.signalCount : 0,
            averageMae: stats.signalCount > 0 ? stats.maeTotal / stats.signalCount : 0,
        };

        this.evidenceBus.publish(
            "EconomicStatisticsAgent",
            "ECONOMIC_ANALYSIS",
            { outcomeHash: "all_outcomes_hash_stub" },
            "simulated_dataset_hash",
            economicData,
            true,
            true,
            { strategyId }
        );
    }
  }
}
