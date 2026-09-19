import { PointInTimeDataEngine } from '../research/PointInTimeDataEngine';
import { EntryObservation, ExitObservation, ExitRule, ExitPolicy, SameBarAmbiguityPolicy } from './OutcomeEvidenceTypes';
import { RawBarObservation, IntradayBreakoutBar } from './EntryResolutionEngine';

export interface ExitResolutionResult {
  status: 'RESOLVED' | 'DATA_INSUFFICIENT' | 'PIT_REJECTED' | 'INVALID';
  observation?: ExitObservation;
  reason?: string;
}

export class ExitResolutionEngine {
  constructor(private pitEngine?: PointInTimeDataEngine) {}

  public resolveExit(
    entry: EntryObservation,
    postEntryBars: RawBarObservation[],
    policy: ExitPolicy,
    intradayBars?: IntradayBreakoutBar[]
  ): ExitResolutionResult {
    if (!policy.hasDefinedExit) {
      return { status: 'INVALID', reason: 'EXIT_RULE_NOT_DEFINED' };
    }

    if (!postEntryBars || postEntryBars.length === 0) {
      return { status: 'DATA_INSUFFICIENT', reason: 'No post-entry bars available to evaluate exit.' };
    }

    const sortedBars = [...postEntryBars].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    let exitBar: RawBarObservation | undefined;
    let exitRule: ExitRule | undefined;
    let exitPrice: number = 0;
    let triggerPrice: number = 0;

    const stopLossThreshold = policy.stopLossPct ? entry.price * (1 + policy.stopLossPct) : undefined;
    const takeProfitThreshold = policy.takeProfitPct ? entry.price * (1 + policy.takeProfitPct) : undefined;
    
    // For trailing stop
    let activeTrail = stopLossThreshold;
    let highestHigh = entry.price;

    let elapsedDays = 0;

    for (const bar of sortedBars) {
      if (bar.timestamp.slice(0, 10) === entry.observationTimestamp.slice(0, 10)) {
        continue;
      }
      
      elapsedDays++;

      if (policy.trailingStopPct !== undefined) {
        if (bar.high > highestHigh) {
          highestHigh = bar.high;
          const newTrail = highestHigh * (1 - policy.trailingStopPct); // Assuming long only, so minus
          if (activeTrail === undefined || newTrail > activeTrail) {
            activeTrail = newTrail;
          }
        }
      }
      
      const activeStopLoss = activeTrail !== undefined ? activeTrail : stopLossThreshold;

      let hitStop = activeStopLoss !== undefined && bar.low <= activeStopLoss;
      let hitTarget = takeProfitThreshold !== undefined && bar.high >= takeProfitThreshold;

      if (hitStop && hitTarget) {
        if (policy.ambiguityPolicy === 'FAIL_CLOSED') {
          return { status: 'DATA_INSUFFICIENT', reason: 'Same-bar ambiguity on STOP vs TARGET and policy is FAIL_CLOSED' };
        } else if (policy.ambiguityPolicy === 'CONSERVATIVE_STOP_FIRST') {
          hitTarget = false; // Ignore target, hit stop first
        } else if (policy.ambiguityPolicy === 'RESOLVE_FROM_INTRADAY') {
          if (!intradayBars || intradayBars.length === 0) {
             return { status: 'DATA_INSUFFICIENT', reason: 'Same-bar ambiguity but no intraday data available to resolve' };
          }
          // Stubs for actual intraday resolution logic if we have intraday ticks
          // Here we fail closed if we can't definitively resolve from intraday bars
          return { status: 'DATA_INSUFFICIENT', reason: 'Intraday resolution not fully implemented for this granularity' };
        }
      }

      if (hitStop) {
        exitRule = policy.trailingStopPct !== undefined && activeStopLoss !== stopLossThreshold ? 'TRAILING_STOP' : 'STOP_LOSS';
        exitBar = bar;
        triggerPrice = bar.low;
        exitPrice = bar.open <= activeStopLoss! ? bar.open : activeStopLoss!;
        break;
      }

      if (hitTarget) {
        exitRule = 'TAKE_PROFIT';
        exitBar = bar;
        triggerPrice = bar.high;
        exitPrice = bar.open >= takeProfitThreshold! ? bar.open : takeProfitThreshold!;
        break;
      }

      if (policy.maxHoldingDays !== undefined && elapsedDays >= policy.maxHoldingDays) {
        exitRule = 'TIME_EXPIRY';
        exitBar = bar;
        triggerPrice = bar.close;
        exitPrice = bar.close;
        break;
      }
    }

    if (!exitBar) {
      return { status: 'DATA_INSUFFICIENT', reason: 'End of available data reached without triggering any defined exit rule' };
    }

    if (!this.pitEngine) {
      return { status: 'DATA_INSUFFICIENT', reason: 'PIT engine not provided; fail-closed protection active for exit resolution.' };
    }

    const pitResult = this.pitEngine.validateObservation(
      entry.securityId,
      exitBar.timestamp,
      exitBar.timestamp
    );

    if (!pitResult.valid) {
      return { status: 'PIT_REJECTED', reason: `PIT validation failed for exit observation: ${pitResult.reason}` };
    }

    const observation: ExitObservation = {
      strategyId: entry.strategyId,
      securityId: entry.securityId,
      entryTimestamp: entry.observationTimestamp,
      exitRule: exitRule!,
      observationTimestamp: exitBar.timestamp,
      price: exitPrice,
      triggerPrice,
      barId: `BAR-${exitBar.timestamp}`,
      sourceArtifact: exitBar.sourceArtifact || 'daily_ohlcv_feed',
      sourceHash: exitBar.sourceHash || 'default_source_hash',
      pitValid: true,
      corporateActionValid: entry.corporateActionValid
    };

    return { status: 'RESOLVED', observation };
  }
}
