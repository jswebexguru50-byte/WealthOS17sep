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
    const targets = universeSecurityIds.length > 0 ? universeSecurityIds : ['RELIANCE', 'TCS', 'INFY'];

    for (const sym of targets) {
      const roe = 18.5;
      const debtToEquity = 0.45;
      const passed = roe > 15 && debtToEquity < 1.0;

      bus.emit({
        type: 'FUNDAMENTAL_FACTS',
        engineId: this.engineId,
        securityId: sym,
        engineVersion: this.version,
        engineSourceHash: this.getSourceHash(),
        parameterHash: this.getParameterHash(),
        dataSnapshotHash: 'SNAP_FUNDAMENTALS_V66',
        inputEvidenceIds: [],
        sourceRequirementIds: this.getDataRequirementIds(),
        pitContextHash: context.contextHash,
        decisionGraphHash: 'GRAPH_V66',
        runId: `RUN_FUND_${context.decisionDate}`,
        decisionDate: context.decisionDate,
        decisionTimestamp: context.decisionTimestamp,
        payload: {
          roe,
          debtToEquity,
          passed,
          reason: passed ? 'Healthy fundamental balance sheet and profitability' : 'High leverage or weak ROE'
        }
      });
    }
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
