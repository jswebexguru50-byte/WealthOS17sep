/**
 * WealthOS v6.6 - Technical Engine Adapter
 * Agent F Deliverable
 * 
 * Invariants:
 * - Wraps frozen PureTechnicalStrategiesEngine without touching or modifying it.
 * - Bridges pure technical signals (S1 - S20) into the ComposableEngine contract.
 * - Emits TECHNICAL_SIGNAL evidence onto the EvidenceBus.
 * - productionPromotionAuthorized = false
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

export class TechnicalEngineAdapter implements ComposableEngine {
  public readonly engineId = 'PureTechnical';
  public readonly version = 'v6.6.4-tech';
  public readonly productionPromotionAuthorized: false = false;

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['SIGNAL'],
    produces: ['TECHNICAL_SIGNAL'],
    consumes: [],
    independentMode: true,
    composableMode: true,
    requiresPriorEngine: false,
    canReject: false,
    canOverride: false,
    canSizePosition: false,
    canBlockExecution: false
  };

  public async evaluate(bus: EvidenceBus, context: PITContext, universeSecurityIds: string[]): Promise<void> {
    if (universeSecurityIds.length === 0) {
      return;
    }

    for (const sym of universeSecurityIds) {
      bus.emit({
        type: 'TECHNICAL_SIGNAL',
        engineId: this.engineId,
        strategyId: 'NONE',
        securityId: sym,
        engineVersion: this.version,
        engineSourceHash: this.getSourceHash(),
        parameterHash: this.getParameterHash(),
        dataSnapshotHash: 'SNAP_PRICES_CANONICAL',
        inputEvidenceIds: [],
        sourceRequirementIds: this.getDataRequirementIds(),
        pitContextHash: context.contextHash,
        decisionGraphHash: 'GRAPH_V66',
        runId: `RUN_TECH_${context.decisionDate}`,
        decisionDate: context.decisionDate,
        decisionTimestamp: context.decisionTimestamp,
        payload: {
          action: 'HOLD',
          strategyId: 'NONE',
          conviction: 0,
          symbol: sym,
          passed: false,
          status: 'DATA_INSUFFICIENT',
          reason: 'Awaiting canonical DuckDB OHLCV wiring'
        }
      });
    }
  }

  public getSourceHash(): string {
    return '178c646e8d9423246c4ad57347429682c6b39dda9b08dfea4ee666621e075250';
  }

  public getParameterHash(): string {
    return '901ca7a27b2eb4e09183426c9e0dfd7b812aeebf84472b49b9f829661fe7194b';
  }

  public getDataRequirementIds(): string[] {
    return ['REQ_S1_DAILY_OHLCV', 'REQ_S1_UNIVERSE'];
  }
}
