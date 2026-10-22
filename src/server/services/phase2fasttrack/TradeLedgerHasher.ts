import crypto from 'crypto';
import { CanonicalTradeRecord } from './OutcomeEvidenceTypes';

export class TradeLedgerHasher {
  /**
   * Deterministic SHA-256 hash of a CanonicalTradeRecord.
   * Ensures physical properties of the trade are immutable and cannot be tampered with.
   */
  public static hashTradeRecord(trade: Omit<CanonicalTradeRecord, 'tradeLedgerHash'>): string {
    const payload = {
      decisionTimestamp: trade.decisionTimestamp,
      entryObservation: {
        strategyId: trade.entryObservation.strategyId,
        securityId: trade.entryObservation.securityId,
        entryRule: trade.entryObservation.entryRule,
        observationTimestamp: trade.entryObservation.observationTimestamp,
        price: trade.entryObservation.price,
        sourceHash: trade.entryObservation.sourceHash
      },
      exitObservation: {
        exitRule: trade.exitObservation.exitRule,
        observationTimestamp: trade.exitObservation.observationTimestamp,
        price: trade.exitObservation.price,
        sourceHash: trade.exitObservation.sourceHash
      },
      grossPnL: trade.grossPnL,
      grossReturnPct: trade.grossReturnPct,
      holdingDays: trade.holdingDays,
      entryCost: trade.entryCost.totalCost,
      exitCost: trade.exitCost.totalCost,
      netPnL: trade.netPnL,
      netReturnPct: trade.netReturnPct
    };

    return crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
  }
}
