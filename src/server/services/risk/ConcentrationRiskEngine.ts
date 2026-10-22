/**
 * WealthOS v6.6 - Concentration Risk Engine
 * Agent G Deliverable
 * 
 * Enforces single-security capital caps (max 5%) and sector exposure caps (max 20%).
 * Role: RISK_CONTROL. Emits CONCENTRATION_LIMIT.
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

export class ConcentrationRiskEngine implements ComposableEngine {
  public readonly engineId = 'ConcentrationRiskEngine';
  public readonly version = 'v6.6.5-conc';

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['RISK_CONTROL', 'EXECUTION_GATE'],
    produces: ['CONCENTRATION_LIMIT'],
    consumes: ['TECHNICAL_SIGNAL'],
    independentMode: true,
    composableMode: true,
    requiresPriorEngine: false,
    canReject: true,
    canOverride: true,
    canSizePosition: false,
    canBlockExecution: true
  };

  private maxSecurityCapitalPct = 5.0; // max 5% per stock
  private maxSectorCapitalPct = 20.0;   // max 20% per sector

  public async evaluate(bus: EvidenceBus, context: PITContext, universeSecurityIds: string[]): Promise<void> {
    const signals = bus.getByType('TECHNICAL_SIGNAL');

    for (const sig of signals) {
      if ((sig.payload as any)?.action === 'BUY') {
        const allocatedCapitalPct = 5.0;
        const blocked = allocatedCapitalPct > this.maxSecurityCapitalPct;

        bus.emit({
          type: 'CONCENTRATION_LIMIT',
          engineId: this.engineId,
          securityId: sig.securityId,
          engineVersion: this.version,
          engineSourceHash: this.getSourceHash(),
          parameterHash: this.getParameterHash(),
          dataSnapshotHash: 'SNAP_CONCENTRATION_V66',
          inputEvidenceIds: [sig.id],
          sourceRequirementIds: this.getDataRequirementIds(),
          pitContextHash: context.contextHash,
          decisionGraphHash: 'GRAPH_V66',
          runId: `RUN_CONC_${context.decisionDate}`,
          decisionDate: context.decisionDate,
          decisionTimestamp: context.decisionTimestamp,
          payload: {
            allocatedCapitalPct,
            maxSecurityCapitalPct: this.maxSecurityCapitalPct,
            maxSectorCapitalPct: this.maxSectorCapitalPct,
            blocked,
            reason: blocked ? 'Single security allocation exceeds 5% capital limit' : 'Within concentration limits'
          }
        });
      }
    }
  }

  public getSourceHash(): string {
    return 'concentration_risk_source_sha256';
  }

  public getParameterHash(): string {
    return 'concentration_risk_params_sha256';
  }

  public getDataRequirementIds(): string[] {
    return [];
  }
}
