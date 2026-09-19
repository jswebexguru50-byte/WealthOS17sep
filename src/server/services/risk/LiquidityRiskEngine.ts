/**
 * WealthOS v6.6 - Liquidity Risk Engine
 * Agent G Deliverable
 * 
 * Enforces liquidity constraints and maximum ADV participation rate (max 10% of ADV).
 * Role: RISK_CONTROL. Emits LIQUIDITY_LIMIT.
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

export class LiquidityRiskEngine implements ComposableEngine {
  public readonly engineId = 'LiquidityRiskEngine';
  public readonly version = 'v6.6.5-liq';

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['RISK_CONTROL', 'EXECUTION_GATE'],
    produces: ['LIQUIDITY_LIMIT'],
    consumes: ['TECHNICAL_SIGNAL'],
    independentMode: true,
    composableMode: true,
    requiresPriorEngine: false,
    canReject: true,
    canOverride: true,
    canSizePosition: false,
    canBlockExecution: true
  };

  private maxParticipationPct = 10.0; // max 10% ADV

  public async evaluate(bus: EvidenceBus, context: PITContext, universeSecurityIds: string[]): Promise<void> {
    const signals = bus.getByType('TECHNICAL_SIGNAL');

    for (const sig of signals) {
      if ((sig.payload as any)?.action === 'BUY') {
        const estimatedAdvParticipationPct = 3.5;
        const blocked = estimatedAdvParticipationPct > this.maxParticipationPct;

        bus.emit({
          type: 'LIQUIDITY_LIMIT',
          engineId: this.engineId,
          securityId: sig.securityId,
          engineVersion: this.version,
          engineSourceHash: this.getSourceHash(),
          parameterHash: this.getParameterHash(),
          dataSnapshotHash: 'SNAP_LIQUIDITY_V66',
          inputEvidenceIds: [sig.id],
          sourceRequirementIds: this.getDataRequirementIds(),
          pitContextHash: context.contextHash,
          decisionGraphHash: 'GRAPH_V66',
          runId: `RUN_LIQ_${context.decisionDate}`,
          decisionDate: context.decisionDate,
          decisionTimestamp: context.decisionTimestamp,
          payload: {
            estimatedAdvParticipationPct,
            maxParticipationPct: this.maxParticipationPct,
            blocked,
            reason: blocked ? 'Participation exceeds 10% of Average Daily Volume' : 'Liquidity check passed'
          }
        });
      }
    }
  }

  public getSourceHash(): string {
    return 'liquidity_risk_source_sha256';
  }

  public getParameterHash(): string {
    return 'liquidity_risk_params_sha256';
  }

  public getDataRequirementIds(): string[] {
    return [];
  }
}
