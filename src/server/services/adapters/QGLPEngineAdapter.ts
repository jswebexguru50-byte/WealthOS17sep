/**
 * WealthOS v6.6 - QGLP Engine Adapter
 * Agent F Deliverable
 * 
 * Quality, Growth, Longevity, Price Framework Adapter.
 * Emits QGLP_COMPOSITE_SCORE evidence.
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

export class QGLPEngineAdapter implements ComposableEngine {
  public readonly engineId = 'QGLP';
  public readonly version = 'v6.6.4-qglp';

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['SCORER', 'FILTER'],
    produces: ['QGLP_COMPOSITE_SCORE'],
    consumes: [],
    independentMode: true,
    composableMode: true,
    requiresPriorEngine: false,
    canReject: true,
    canOverride: false,
    canSizePosition: false,
    canBlockExecution: false
  };

  public async evaluate(bus: EvidenceBus, context: PITContext, universeSecurityIds: string[]): Promise<void> {
    // This adapter is deliberately evidence-only. It does not manufacture a
    // universe or scores; the database-backed QGLP enrichment service is the
    // producer of verified QGLP results.
    const targets = universeSecurityIds;

    for (const sym of targets) {
      bus.emit({
        type: 'QGLP_COMPOSITE_SCORE',
        engineId: this.engineId,
        securityId: sym,
        engineVersion: this.version,
        engineSourceHash: this.getSourceHash(),
        parameterHash: this.getParameterHash(),
        dataSnapshotHash: 'NO_PERSISTED_QGLP_SNAPSHOT',
        inputEvidenceIds: [],
        sourceRequirementIds: this.getDataRequirementIds(),
        pitContextHash: context.contextHash,
        decisionGraphHash: 'GRAPH_V66',
        runId: `RUN_QGLP_${context.decisionDate}`,
        decisionDate: context.decisionDate,
        decisionTimestamp: context.decisionTimestamp,
        payload: {
          qglpScore: null,
          quality: null,
          growth: null,
          longevity: null,
          priceFairness: null,
          passed: null,
          status: 'DATA_INSUFFICIENT',
          reason: 'No persisted QGLP result was supplied to the adapter.'
        }
      });
    }
  }

  public getSourceHash(): string {
    return 'qglp_engine_source_sha256_canonical';
  }

  public getParameterHash(): string {
    return 'qglp_parameters_sha256_canonical';
  }

  public getDataRequirementIds(): string[] {
    return ['REQ_QGLP_FINANCIALS', 'REQ_QGLP_VALUATION'];
  }
}
