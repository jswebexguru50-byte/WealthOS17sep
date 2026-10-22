/**
 * src/server/services/phase2fasttrack/OutcomeEvidenceHasher.ts
 *
 * Deterministic outcome evidence hasher.
 * Strips all random entropy, UUIDs, and nondeterministic timestamps.
 */

import crypto from 'crypto';
import { EntryObservation, OutcomeEvidence } from './OutcomeEvidenceTypes';

export class OutcomeEvidenceHasher {
  public static hashEntry(entry: EntryObservation): string {
    const preimage = [
      entry.strategyId,
      entry.securityId,
      entry.decisionTimestamp,
      entry.entryRule,
      entry.observationTimestamp,
      entry.price.toFixed(4),
      entry.sourceHash,
      entry.pitValid ? 'PIT_VALID' : 'PIT_INVALID',
      entry.corporateActionValid ? 'CA_VALID' : 'CA_INVALID'
    ].join('::');

    return crypto.createHash('sha256').update(preimage).digest('hex');
  }

  public static hashOutcome(
    entry: EntryObservation,
    exitPrice?: number,
    returnPct?: number,
    holdingDays?: number,
    qualityLabel?: string
  ): string {
    const entryHash = this.hashEntry(entry);
    const outcomePreimage = [
      entryHash,
      exitPrice !== undefined ? exitPrice.toFixed(4) : 'NO_EXIT',
      returnPct !== undefined ? returnPct.toFixed(6) : 'NO_RETURN',
      holdingDays !== undefined ? holdingDays.toString() : 'NO_HOLDING',
      qualityLabel || 'UNLABELED'
    ].join('::');

    return crypto.createHash('sha256').update(outcomePreimage).digest('hex');
  }
}
