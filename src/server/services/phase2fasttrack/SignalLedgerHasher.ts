import crypto from 'crypto';
import { ImmutableSignal, EnrichedImmutableSignal } from './FastTrackTypes';

export class SignalLedgerHasher {
  public static hashRecord(signal: ImmutableSignal): string {
    // Deterministic representation
    const recordString = `${signal.securityId}|${signal.decisionDate}|${signal.strategyId}|${signal.signal}`;
    return crypto.createHash('sha256').update(recordString).digest('hex');
  }

  public static hashEnrichedRecord(signal: EnrichedImmutableSignal): string {
    const baseHash = this.hashRecord(signal);
    let enrichedPayload = baseHash;
    
    if (signal.intradayTimestamp) {
        enrichedPayload += `|${JSON.stringify(signal.intradayTimestamp)}`;
    }
    if (signal.s10Metadata) {
        enrichedPayload += `|${JSON.stringify(signal.s10Metadata)}`;
    }
    
    return crypto.createHash('sha256').update(enrichedPayload).digest('hex');
  }

  public static hashLedger(signals: ImmutableSignal[]): string {
    const hashes = signals.map(s => this.hashRecord(s));
    // Ordered ledger hash
    return crypto.createHash('sha256').update(hashes.join(',')).digest('hex');
  }
}
