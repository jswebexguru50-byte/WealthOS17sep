/**
 * src/server/services/phase2fasttrack/SignalLedgerHasher.ts
 *
 * Deterministic canonical signal serializer and hasher.
 * Enforces cryptographic canonical identity across all material fields:
 * - signalId
 * - strategyId
 * - securityId
 * - pitSecurityId
 * - decisionDate
 * - signal
 * - parameterValues
 * - conditionResults
 * - dataSnapshotHash
 * - codeSha
 * - datasetHash
 * - provenanceHash
 *
 * Algorithm: Canonical JSON -> UTF-8 bytes -> SHA-256.
 * Enforces recursive key sorting, IEEE 754 number normalization, NFC unicode normalization.
 */

import crypto from 'crypto';
import { ImmutableSignal, EnrichedImmutableSignal } from './FastTrackTypes';

export class SignalLedgerHasher {
  /**
   * Deterministic Canonical JSON Serialization.
   * Recursively sorts object keys and normalizes primitive values.
   */
  public static canonicalJson(val: unknown): string {
    if (val === null || val === undefined) {
      return 'null';
    }
    if (typeof val === 'number') {
      if (Object.is(val, -0)) return '0';
      if (!Number.isFinite(val)) return 'null';
      return val.toString();
    }
    if (typeof val === 'boolean') {
      return val ? 'true' : 'false';
    }
    if (typeof val === 'string') {
      return JSON.stringify(val.normalize('NFC'));
    }
    if (Array.isArray(val)) {
      const items = val.map(item => this.canonicalJson(item));
      return `[${items.join(',')}]`;
    }
    if (typeof val === 'object') {
      const entries = Object.entries(val as Record<string, unknown>)
        .filter(([_, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));
      const serialized = entries.map(
        ([k, v]) => `${JSON.stringify(k.normalize('NFC'))}:${this.canonicalJson(v)}`
      );
      return `{${serialized.join(',')}}`;
    }
    return JSON.stringify(val);
  }

  /**
   * Extracts canonical representation of an ImmutableSignal covering ALL material fields.
   */
  public static getCanonicalPayload(signal: ImmutableSignal): Record<string, unknown> {
    return {
      codeSha: signal.codeSha ?? '',
      conditionResults: signal.conditionResults ?? [],
      dataSnapshotHash: signal.dataSnapshotHash ?? '',
      datasetHash: signal.datasetHash ?? '',
      decisionDate: signal.decisionDate,
      parameterValues: signal.parameterValues ?? {},
      pitSecurityId: signal.pitSecurityId ?? '',
      provenanceHash: signal.provenanceHash ?? '',
      securityId: signal.securityId,
      signal: Boolean(signal.signal),
      signalId: signal.signalId,
      strategyId: signal.strategyId
    };
  }

  /**
   * Computes SHA-256 hash of the complete canonical signal record.
   */
  public static hashRecord(signal: ImmutableSignal): string {
    const payload = this.getCanonicalPayload(signal);
    const serialized = this.canonicalJson(payload);
    return crypto.createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex');
  }

  /**
   * Computes hash for an EnrichedImmutableSignal without mutating canonical identity.
   * Canonical hash is strictly preserved; enriched metadata is hashed in an independent container.
   */
  public static hashEnrichedRecord(signal: EnrichedImmutableSignal): string {
    const canonicalHash = signal.canonicalSignalHash || this.hashRecord(signal);
    const enrichmentPayload = {
      acquiredAt: signal.acquiredAt ?? '',
      acquisitionAttemptId: signal.acquisitionAttemptId ?? '',
      canonicalSignalHash: canonicalHash,
      canonicalSignalId: signal.canonicalSignalId || signal.signalId,
      corporateActionState: signal.corporateActionState ?? '',
      corporateActionValidated: Boolean(signal.corporateActionValidated),
      dataSource: signal.dataSource ?? '',
      dataStatus: signal.dataStatus,
      dataStatusReason: signal.dataStatusReason ?? '',
      decisionTimestamp: signal.decisionTimestamp ?? '',
      enrichedRecordId: signal.enrichedRecordId,
      entryEligibleTimestamp: signal.entryEligibleTimestamp ?? '',
      pitMembershipValidated: Boolean(signal.pitMembershipValidated),
      pitUniverseVersion: signal.pitUniverseVersion ?? '',
      rawResponseHash: signal.rawResponseHash ?? '',
      resolution: signal.resolution ?? '',
      s10Metadata: signal.s10Metadata ?? null,
      securityIdentityVersion: signal.securityIdentityVersion ?? '',
      signalTimestamp: signal.signalTimestamp ?? '',
      sourceInstrumentId: signal.sourceInstrumentId ?? '',
      sourceObservationTimestamp: signal.sourceObservationTimestamp ?? '',
      sourceRecordHash: signal.sourceRecordHash ?? '',
      timezone: signal.timezone ?? ''
    };
    const serialized = this.canonicalJson(enrichmentPayload);
    return crypto.createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex');
  }

  /**
   * Computes deterministic aggregate hash of a ledger of signals.
   * Signals are ordered deterministically by (decisionDate, securityId, strategyId, signalId).
   */
  public static hashLedger(signals: ImmutableSignal[]): string {
    const sorted = [...signals].sort((a, b) => {
      const d = a.decisionDate.localeCompare(b.decisionDate);
      if (d !== 0) return d;
      const s = a.securityId.localeCompare(b.securityId);
      if (s !== 0) return s;
      const st = a.strategyId.localeCompare(b.strategyId);
      if (st !== 0) return st;
      return a.signalId.localeCompare(b.signalId);
    });

    const individualHashes = sorted.map(s => this.hashRecord(s));
    return crypto.createHash('sha256').update(individualHashes.join('\n'), 'utf8').digest('hex');
  }
}
