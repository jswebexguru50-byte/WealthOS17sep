import { EntryResolutionEngine, RawBarObservation } from './EntryResolutionEngine';
import { ExitResolutionEngine, ExitResolutionResult } from './ExitResolutionEngine';
import { DateEffectiveCostEngine } from './DateEffectiveCostEngine';
import { TradeLedgerHasher } from './TradeLedgerHasher';
import { ReplayReconciliationEngine } from './ReplayReconciliationEngine';
import { CanonicalTradeRecord, ExitPolicy, CostBreakdown } from './OutcomeEvidenceTypes';
import { ImmutableSignal } from './FastTrackTypes';

export class StrategyReplayAdapter {
  constructor(
    private entryEngine: EntryResolutionEngine,
    private exitEngine: ExitResolutionEngine,
    private reconEngine: ReplayReconciliationEngine
  ) {}

  public executeReplay(
    signal: ImmutableSignal,
    availableBars: RawBarObservation[],
    exitPolicy: ExitPolicy,
    tradeType: 'DELIVERY' | 'INTRADAY'
  ): CanonicalTradeRecord | null {
    this.reconEngine.registerCandidate();

    // 1. Resolve Entry
    const entryResolution = this.entryEngine.resolveEntry(
      signal.strategyId,
      signal.securityId,
      signal.decisionDate,
      availableBars,
      undefined, // S10 intraday bars not passed for generic replay here, but could be
      true,
      signal.intradayTimestamp
    );

    if (entryResolution.status !== 'RESOLVED' || !entryResolution.observation) {
      if (entryResolution.status === 'DATA_INSUFFICIENT') {
        this.reconEngine.registerDataInsufficient();
      } else {
        this.reconEngine.registerRejected();
      }
      return null;
    }

    const entryObs = entryResolution.observation;
    
    // Filter post-entry bars
    const postEntryBars = availableBars.filter(b => b.timestamp >= entryObs.observationTimestamp);

    // 2. Resolve Exit
    const exitResolution = this.exitEngine.resolveExit(entryObs, postEntryBars, exitPolicy);

    if (exitResolution.status !== 'RESOLVED' || !exitResolution.observation) {
      if (exitResolution.status === 'DATA_INSUFFICIENT') {
        this.reconEngine.registerDataInsufficient();
      } else {
        this.reconEngine.registerRejected();
      }
      return null;
    }

    const exitObs = exitResolution.observation;

    // 3. Compute Costs
    const entryCost = DateEffectiveCostEngine.calculateCost(
      entryObs.price,
      1, // Normalized to 1 share for basic PnL tracking, could be extended
      tradeType,
      true, // isBuy
      entryObs.observationTimestamp
    );

    const exitCost = DateEffectiveCostEngine.calculateCost(
      exitObs.price,
      1,
      tradeType,
      false, // isBuy (sell)
      exitObs.observationTimestamp
    );

    // 4. Compute PnL
    const grossPnL = exitObs.price - entryObs.price;
    const grossReturnPct = grossPnL / entryObs.price;

    const netPnL = grossPnL - entryCost.totalCost - exitCost.totalCost;
    // Assuming investment was entryPrice + entryCost
    const netReturnPct = netPnL / (entryObs.price + entryCost.totalCost);

    // Calculate holding days roughly by taking day differences, 
    // real implementation would use trading calendar
    const entryTime = Date.parse(entryObs.observationTimestamp);
    const exitTime = Date.parse(exitObs.observationTimestamp);
    const holdingDays = Math.ceil((exitTime - entryTime) / (1000 * 3600 * 24));

    const record: Omit<CanonicalTradeRecord, 'tradeLedgerHash'> = {
      strategyId: signal.strategyId,
      securityId: signal.securityId,
      decisionTimestamp: signal.decisionDate,
      entryObservation: entryObs,
      exitObservation: exitObs,
      grossPnL,
      grossReturnPct,
      holdingDays,
      entryCost,
      exitCost,
      netPnL,
      netReturnPct
    };

    const tradeLedgerHash = TradeLedgerHasher.hashTradeRecord(record);

    this.reconEngine.registerExecutedTrade();

    return {
      ...record,
      tradeLedgerHash
    };
  }
}
