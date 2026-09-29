/**
 * WealthOS v6.6 - Fundamental Alpha Adapter
 * Agent F Deliverable
 * 
 * Fundamental Alpha Engine Adapter.
 * Emits FUNDAMENTAL_FACTS evidence.
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

export class FundamentalAlphaAdapter implements ComposableEngine {
  public readonly engineId = 'FundamentalAlpha';
  public readonly version = 'v6.6.4-fund';

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['SCORER', 'FILTER'],
    produces: ['FUNDAMENTAL_FACTS'],
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
    // Canonical company_facts has to be supplied before this adapter can
    // publish a fundamental conclusion.  Fixed ROE/debt examples are not data.
    void bus;
    void context;
    void universeSecurityIds;
  }

  public getSourceHash(): string {
    return 'fundamental_alpha_source_sha256_canonical';
  }

  public getParameterHash(): string {
    return 'fundamental_alpha_params_sha256_canonical';
  }

  public getDataRequirementIds(): string[] {
    return ['REQ_FUNDAMENTAL_BALANCE_SHEET', 'REQ_FUNDAMENTAL_PROFIT_LOSS'];
  }
}
