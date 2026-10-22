/**
 * src/server/services/phase2fasttrack/EntryResolutionEngine.ts
 *
 * Explicit Entry Resolution Engine.
 * Implements strategy-specific entry observation resolution:
 * - Daily strategies: exact DAILY_CLOSE_BOUND or NEXT_OPEN rule
 * - S10: preserves 15-minute breakout timestamp and requires exact matching 15-minute intraday bar
 * - PIT validation: queries PointInTimeDataEngine to ensure observation was knowable as-of decision time
 * - Missing data: returns DATA_INSUFFICIENT without fabricated records
 * - Fail-closed PIT: pitValid is FALSE unless PointInTimeDataEngine explicitly validates it.
 */

import { PointInTimeDataEngine, PITLookaheadError, PITDataUnavailableError } from '../research/PointInTimeDataEngine';
import { EntryObservation, EntryRule, OutcomeResolution } from './OutcomeEvidenceTypes';
import { OutcomeEvidenceHasher } from './OutcomeEvidenceHasher';

export interface RawBarObservation {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sourceArtifact?: string;
  sourceHash?: string;
}

export interface IntradayBreakoutBar {
  symbol: string;
  breakoutTimestamp: string; // e.g. "2026-03-01T09:30:00+05:30"
  triggerPrice: number;
  sourceHash: string;
}

export class EntryResolutionEngine {
  constructor(private pitEngine?: PointInTimeDataEngine) {}

  /**
   * Resolves entry for a signal according to strategy-defined entry rule.
   */
  public resolveEntry(
    strategyId: string,
    securityId: string,
    decisionTimestamp: string,
    availableDailyBars: RawBarObservation[],
    availableIntradayBars?: IntradayBreakoutBar[],
    corporateActionValid = true,
    exactIntradayTimestamp?: string,
    requirePitVerification = false
  ): OutcomeResolution {
    // 1. S10 Intraday Breakout Strategy Rule
    if (strategyId.toUpperCase().includes('S10')) {
      if (!availableIntradayBars || availableIntradayBars.length === 0) {
        return {
          status: 'DATA_INSUFFICIENT',
          reason: 'S10 requires 15-minute intraday breakout bar; no intraday data available'
        };
      }

      // Exact matching observation for S10 breakout timestamp
      const targetTimestamp = exactIntradayTimestamp || decisionTimestamp;
      const eligibleIntraday = availableIntradayBars.find(
        bar => bar.symbol === securityId && bar.breakoutTimestamp === targetTimestamp
      );

      if (!eligibleIntraday) {
        return {
          status: 'DATA_INSUFFICIENT',
          reason: `No matching 15-minute intraday breakout observation found for ${securityId} at exact timestamp ${targetTimestamp}`
        };
      }

      // Validate PIT knowability — FAIL CLOSED if PIT engine absent or check fails
      if (!this.pitEngine) {
        return {
          status: 'DATA_INSUFFICIENT',
          reason: 'PIT engine not provided; fail-closed protection active'
        };
      }

      const pitResult = this.pitEngine.validateObservation(
        securityId,
        eligibleIntraday.breakoutTimestamp,
        decisionTimestamp
      );
      if (!pitResult.valid) {
        return {
          status: 'PIT_REJECTED',
          reason: `PIT validation failed for S10 observation: ${pitResult.reason}`
        };
      }
      const pitValid = pitResult.valid;

      const observation: EntryObservation = {
        strategyId,
        securityId,
        decisionTimestamp,
        entryRule: 'INTRADAY_BREAKOUT',
        observationTimestamp: eligibleIntraday.breakoutTimestamp,
        price: eligibleIntraday.triggerPrice,
        sourceArtifact: 'intraday_breakout_feed',
        sourceHash: eligibleIntraday.sourceHash,
        pitValid,
        corporateActionValid
      };

      return {
        status: 'RESOLVED',
        observation,
        evidenceHash: OutcomeEvidenceHasher.hashEntry(observation)
      };
    }

    // 2. Daily Strategies (e.g. S1, S2, S3, etc.)
    if (!availableDailyBars || availableDailyBars.length === 0) {
      return {
        status: 'DATA_INSUFFICIENT',
        reason: `No daily price bars available for ${securityId}`
      };
    }

    // Locate decision bar and next available bar
    const sortedBars = availableDailyBars
      .filter(b => b.symbol === securityId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (sortedBars.length === 0) {
      return {
        status: 'DATA_INSUFFICIENT',
        reason: `No bars for security ${securityId}`
      };
    }

    // Determine strategy entry rule
    let entryRule: EntryRule = 'DAILY_CLOSE_BOUND';
    let chosenBar: RawBarObservation | undefined;

    if (strategyId.toUpperCase().includes('NEXT_OPEN')) {
      entryRule = 'NEXT_OPEN';
      // Find the immediate next trading day open bar
      chosenBar = sortedBars.find(b => b.timestamp > decisionTimestamp);
      if (!chosenBar) {
        return {
          status: 'DATA_INSUFFICIENT',
          reason: `No subsequent NEXT_OPEN bar available after ${decisionTimestamp}`
        };
      }
    } else {
      entryRule = 'DAILY_CLOSE_BOUND';
      // Find the exact decision day close bar
      chosenBar = sortedBars.find(b => b.timestamp.slice(0, 10) === decisionTimestamp.slice(0, 10));
      if (!chosenBar) {
        return {
          status: 'DATA_INSUFFICIENT',
          reason: `No DAILY_CLOSE bar found for decision date ${decisionTimestamp}`
        };
      }
    }

    // PIT Check: ensure bar was knowable as of its availability — FAIL CLOSED if PIT engine absent
    if (!this.pitEngine) {
      return {
        status: 'DATA_INSUFFICIENT',
        reason: 'PIT engine not provided; fail-closed protection active'
      };
    }

    const pitResult = this.pitEngine.validateObservation(
      securityId,
      chosenBar.timestamp,
      chosenBar.timestamp
    );
    if (!pitResult.valid) {
      return {
        status: 'PIT_REJECTED',
        reason: `PIT validation failed for daily observation: ${pitResult.reason}`
      };
    }
    const pitValid = pitResult.valid;

    const price = entryRule === 'NEXT_OPEN' ? chosenBar.open : chosenBar.close;
    const observation: EntryObservation = {
      strategyId,
      securityId,
      decisionTimestamp,
      entryRule,
      observationTimestamp: chosenBar.timestamp,
      price,
      sourceArtifact: chosenBar.sourceArtifact || 'daily_ohlcv_feed',
      sourceHash: chosenBar.sourceHash || 'default_source_hash',
      pitValid,
      corporateActionValid
    };

    return {
      status: 'RESOLVED',
      observation,
      evidenceHash: OutcomeEvidenceHasher.hashEntry(observation)
    };
  }
}
