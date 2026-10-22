/**
 * WealthOS v6.6 - Smart Money Engine Adapter
 * Agent F Deliverable
 * 
 * Adapts Institutional Flow, Delivery Absorption, and Bulk/Block Deals.
 * Emits SMART_MONEY_ACCUMULATION evidence.
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

export class SmartMoneyAdapter implements ComposableEngine {
  public readonly engineId = 'SmartMoney';
  public readonly version = 'v6.6.4-smc';

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['CONFIRMATION', 'SCORER'],
    produces: ['SMART_MONEY_ACCUMULATION'],
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
    // This adapter previously emitted fixed delivery and institutional-flow
    // values.  It must stay silent until it is wired to verified delivery,
    // deal, and ownership evidence; emitting a placeholder is a conclusion.
    void bus;
    void context;
    void universeSecurityIds;
  }

  public getSourceHash(): string {
    return 'smart_money_source_sha256_canonical';
  }

  public getParameterHash(): string {
    return 'smart_money_params_sha256_canonical';
  }

  public getDataRequirementIds(): string[] {
    return ['REQ_SMART_MONEY_DELIVERY', 'REQ_SMART_MONEY_INST_DEALS'];
  }
}
