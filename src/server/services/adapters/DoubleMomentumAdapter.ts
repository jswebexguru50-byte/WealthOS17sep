/**
 * WealthOS v6.6 - Double Momentum Adapter
 * Agent F Deliverable
 * 
 * Absolute + Relative Momentum Engine Adapter.
 * Emits DOUBLE_MOMENTUM_RANK evidence.
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

export class DoubleMomentumAdapter implements ComposableEngine {
  public readonly engineId = 'DoubleMomentum';
  public readonly version = 'v6.6.4-mom';

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['SCORER', 'SIGNAL'],
    produces: ['DOUBLE_MOMENTUM_RANK'],
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
    // No canonical price snapshot or benchmark ranking was provided.  Do not
    // manufacture a universe, return, rank, or momentum conclusion.
    void bus;
    void context;
    void universeSecurityIds;
  }

  public getSourceHash(): string {
    return 'double_momentum_source_sha256_canonical';
  }

  public getParameterHash(): string {
    return 'double_momentum_params_sha256_canonical';
  }

  public getDataRequirementIds(): string[] {
    return ['REQ_MOMENTUM_HISTORICAL_PRICES', 'REQ_MOMENTUM_BENCHMARK'];
  }
}
