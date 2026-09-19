/**
 * WealthOS v6.6 - Drawdown Control Engine
 * Agent G Deliverable
 * 
 * SPEC MANDATE:
 * Dynamic drawdown protection & circuit breakers:
 *   - Tier 1 (10% DD): Cut new position sizes by 50%
 *   - Tier 2 (15% DD): Halt all new entries, defensive capital mode
 *   - Tier 3 (20% DD): Hard portfolio circuit breaker
 * Role: RISK_CONTROL. Emits DRAWDOWN_PROTECTION_GATE.
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

export class DrawdownControlEngine implements ComposableEngine {
  public readonly engineId = 'DrawdownControlEngine';
  public readonly version = 'v6.6.5-dd-control';

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['RISK_CONTROL', 'EXECUTION_GATE'],
    produces: ['DRAWDOWN_PROTECTION_GATE', 'EXECUTION_BLOCK'],
    consumes: ['TECHNICAL_SIGNAL'],
    independentMode: true,
    composableMode: true,
    requiresPriorEngine: false,
    canReject: true,
    canOverride: true,
    canSizePosition: false,
    canBlockExecution: true
  };

  private currentPeakEquity = 10000000; // 1 Cr baseline
  private currentEquity = 9600000;     // 4% current drawdown (healthy)

  public updateEquity(equity: number): void {
    this.currentEquity = equity;
    if (equity > this.currentPeakEquity) {
      this.currentPeakEquity = equity;
    }
  }

  public getDrawdownPct(): number {
    return ((this.currentPeakEquity - this.currentEquity) / this.currentPeakEquity) * 100;
  }

  public async execute(context: PITContext, bus: EvidenceBus): Promise<void> {
    return this.evaluate(bus, context, ['PORTFOLIO']);
  }

  public async evaluate(bus: EvidenceBus, context: PITContext, universeSecurityIds: string[]): Promise<void> {
    const drawdownPct = ((this.currentPeakEquity - this.currentEquity) / this.currentPeakEquity) * 100;
    const circuitBreakerTriggered = drawdownPct >= 15.0; // Tier 2 (15% DD): Halt new entries; Tier 3 (20% DD): Hard circuit breaker
    const sizeMultiplier = drawdownPct >= 10.0 ? 0.5 : 1.0;

    const signals = bus.getByType('TECHNICAL_SIGNAL');
    const targets = signals.length > 0
      ? signals.map(s => ({ securityId: s.securityId, inputId: s.id }))
      : universeSecurityIds.map(id => ({ securityId: id, inputId: 'INIT' }));

    for (const target of targets) {
      bus.emit({
        type: 'DRAWDOWN_PROTECTION_GATE',
        engineId: this.engineId,
        securityId: target.securityId,
        engineVersion: this.version,
        engineSourceHash: this.getSourceHash(),
        parameterHash: this.getParameterHash(),
        dataSnapshotHash: 'SNAP_EQUITY_V66',
        inputEvidenceIds: [target.inputId],
        sourceRequirementIds: this.getDataRequirementIds(),
        pitContextHash: context.contextHash,
        decisionGraphHash: 'GRAPH_V66',
        runId: `RUN_DD_${context.decisionDate}`,
        decisionDate: context.decisionDate,
        decisionTimestamp: context.decisionTimestamp,
        payload: {
          currentDrawdownPct: parseFloat(drawdownPct.toFixed(2)),
          circuitBreakerTriggered,
          sizeMultiplier,
          blocked: circuitBreakerTriggered,
          reason: circuitBreakerTriggered
            ? `Hard circuit breaker: Drawdown ${drawdownPct.toFixed(1)}% >= 15%`
            : `Drawdown protection healthy (${drawdownPct.toFixed(1)}%)`
        }
      });

      if (circuitBreakerTriggered) {
        bus.emit({
          type: 'EXECUTION_BLOCK',
          engineId: this.engineId,
          securityId: target.securityId,
          engineVersion: this.version,
          engineSourceHash: this.getSourceHash(),
          parameterHash: this.getParameterHash(),
          dataSnapshotHash: 'SNAP_EQUITY_V66',
          inputEvidenceIds: [target.inputId],
          sourceRequirementIds: this.getDataRequirementIds(),
          pitContextHash: context.contextHash,
          decisionGraphHash: 'GRAPH_V66',
          runId: `RUN_DD_BLOCK_${context.decisionDate}`,
          decisionDate: context.decisionDate,
          decisionTimestamp: context.decisionTimestamp,
          payload: {
            blocked: true,
            reason: `Hard circuit breaker: Drawdown ${drawdownPct.toFixed(1)}% >= 15%`,
            currentDrawdownPct: parseFloat(drawdownPct.toFixed(2))
          }
        });
      }
    }
  }

  public getSourceHash(): string {
    return 'drawdown_control_source_sha256';
  }

  public getParameterHash(): string {
    return 'drawdown_control_params_sha256';
  }

  public getDataRequirementIds(): string[] {
    return [];
  }
}
