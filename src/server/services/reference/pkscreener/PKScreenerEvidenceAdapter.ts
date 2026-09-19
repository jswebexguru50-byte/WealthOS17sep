/**
 * WealthOS v6.6–v6.7 - PKScreener Evidence Adapter
 * External Reference Acceleration Layer
 * 
 * Adapts PKScreener observation payloads into canonical WealthOS Evidence objects.
 */

import { EvidenceBus } from '../../composable/EvidenceBus.js';
import { PITContext } from '../../composable/PITContext.js';
import { PKScreenerResponse } from './PKScreenerAdapter.js';

export class PKScreenerEvidenceAdapter {
  public static emitPKScreenerObservations(
    bus: EvidenceBus,
    context: PITContext,
    response: {
      securityId: string;
      symbol: string;
      observations: Array<{ capabilityId: string; value: unknown }>;
    },
    runId: string
  ): void {
    for (const obs of response.observations) {
      bus.emit({
        type: 'TECHNICAL_SIGNAL',
        engineId: 'REF_PKSCREENER',
        strategyId: obs.capabilityId,
        securityId: response.securityId,
        engineVersion: '0.45.20240315',
        engineSourceHash: 'pkscreener_v0.45_source_sha256_canonical',
        parameterHash: 'PK_PARAMS',
        dataSnapshotHash: 'SNAP_PRICES_V66',
        inputEvidenceIds: [],
        sourceRequirementIds: ['REQ_S1_DAILY_OHLCV'],
        pitContextHash: context.contextHash,
        decisionGraphHash: 'GRAPH_V66',
        runId,
        decisionDate: context.decisionDate,
        decisionTimestamp: context.decisionTimestamp,
        payload: {
          capabilityId: obs.capabilityId,
          value: obs.value,
          source: 'PKSCREENER',
          isReferenceCandidate: true,
          canAuthorizeTrade: false
        }
      });
    }
  }
}
