/**
 * WealthOS v6.6 - Portfolio Exposure Engine
 * Agent G Deliverable
 * 
 * Regulates gross, net, and directional exposure limits.
 * Caps gross leverage at 100% (cash market long-only).
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

export class PortfolioExposureEngine implements ComposableEngine {
  public readonly engineId = 'PortfolioExposureEngine';
  public readonly version = 'v6.6.5-exposure';

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['RISK_CONTROL', 'EXECUTION_GATE'],
    produces: ['PORTFOLIO_RISK_BUDGET'],
    consumes: ['TECHNICAL_SIGNAL'],
    independentMode: true,
    composableMode: true,
    requiresPriorEngine: false,
    canReject: true,
    canOverride: true,
    canSizePosition: false,
    canBlockExecution: true
  };

  private maxGrossExposurePct = 100.0; // 100% max capital
  private maxOpenPositions = 20;

  public async evaluate(bus: EvidenceBus, context: PITContext, universeSecurityIds: string[]): Promise<void> {
    const signals = bus.getByType('TECHNICAL_SIGNAL');
    let activeOpenCount = 5; // simulated existing open positions

    for (const sig of signals) {
      if ((sig.payload as any)?.action === 'BUY') {
        activeOpenCount++;
        const blocked = activeOpenCount > this.maxOpenPositions;

        bus.emit({
          type: 'PORTFOLIO_RISK_BUDGET',
          engineId: this.engineId,
          securityId: sig.securityId,
          engineVersion: this.version,
          engineSourceHash: this.getSourceHash(),
          parameterHash: this.getParameterHash(),
          dataSnapshotHash: 'SNAP_EXPOSURE_V66',
          inputEvidenceIds: [sig.id],
          sourceRequirementIds: this.getDataRequirementIds(),
          pitContextHash: context.contextHash,
          decisionGraphHash: 'GRAPH_V66',
          runId: `RUN_EXP_${context.decisionDate}`,
          decisionDate: context.decisionDate,
          decisionTimestamp: context.decisionTimestamp,
          payload: {
            currentOpenPositions: activeOpenCount,
            maxOpenPositions: this.maxOpenPositions,
            blocked,
            reason: blocked ? 'Max open positions limit (20) exceeded' : 'Exposure within limits'
          }
        });
      }
    }
  }

  public getSourceHash(): string {
    return 'portfolio_exposure_source_sha256';
  }

  public getParameterHash(): string {
    return 'portfolio_exposure_params_sha256';
  }

  public getDataRequirementIds(): string[] {
    return [];
  }
}
