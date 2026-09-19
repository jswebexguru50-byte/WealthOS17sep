/**
 * WealthOS v6.6 - Portfolio Construction Engine
 * Agent G Deliverable
 * 
 * Composable engine that bridges raw signals to capital-weighted portfolio positions.
 * Coordinates AllocationEngine and PositionSizingEngine.
 * Role: PORTFOLIO_CONSTRUCTION. Emits EXECUTION_ALLOCATION.
 * Invariant: productionPromotionAuthorized = false
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';
import { AllocationEngine, AllocationModel } from './AllocationEngine.js';
import { PositionSizingEngine } from './PositionSizingEngine.js';

export class PortfolioConstructionEngine implements ComposableEngine {
  public readonly engineId = 'PortfolioConstructionEngine';
  public readonly version = 'v6.6.5-portfolio-construct';

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['PORTFOLIO_CONSTRUCTION'],
    produces: ['EXECUTION_ALLOCATION'],
    consumes: ['TECHNICAL_SIGNAL'],
    independentMode: true,
    composableMode: true,
    requiresPriorEngine: true,
    canReject: false,
    canOverride: false,
    canSizePosition: true,
    canBlockExecution: false
  };

  private allocationEngine = new AllocationEngine();
  private sizingEngine = new PositionSizingEngine();

  public async evaluate(bus: EvidenceBus, context: PITContext, universeSecurityIds: string[]): Promise<void> {
    const signals = bus.getByType('TECHNICAL_SIGNAL');
    const buySignals = signals.filter(s => (s.payload as any)?.action === 'BUY');

    if (buySignals.length === 0) return;

    const candidates = buySignals.map(s => ({
      securityId: s.securityId || 'UNKNOWN',
      conviction: (s.payload as any)?.conviction || 0.5,
      historicalVolAnnualized: 0.28
    }));

    const allocatedWeights = this.allocationEngine.allocate(candidates, 'EQUAL_WEIGHT', 100.0);

    for (const alloc of allocatedWeights) {
      const sizing = this.sizingEngine.calculateSize({
        securityId: alloc.securityId,
        equity: 10000000,
        entryPrice: 2450.0,
        stopLossPrice: 2320.0,
        riskBudgetPct: 0.5,
        maxCapitalPct: alloc.weightPct
      });

      bus.emit({
        type: 'EXECUTION_ALLOCATION',
        engineId: this.engineId,
        securityId: alloc.securityId,
        engineVersion: this.version,
        engineSourceHash: this.getSourceHash(),
        parameterHash: this.getParameterHash(),
        dataSnapshotHash: 'SNAP_PORTFOLIO_V66',
        inputEvidenceIds: [],
        sourceRequirementIds: this.getDataRequirementIds(),
        pitContextHash: context.contextHash,
        decisionGraphHash: 'GRAPH_V66',
        runId: `RUN_PORTFOLIO_${context.decisionDate}`,
        decisionDate: context.decisionDate,
        decisionTimestamp: context.decisionTimestamp,
        payload: {
          allocatedWeightPct: alloc.weightPct,
          allocatedShares: sizing.targetShares,
          allocatedCapitalINR: sizing.targetCapital,
          riskAmountINR: sizing.riskAmount,
          sizingModel: sizing.sizingModel,
          passed: true
        }
      });
    }
  }

  public getSourceHash(): string {
    return 'portfolio_construction_source_sha256';
  }

  public getParameterHash(): string {
    return 'portfolio_construction_params_sha256';
  }

  public getDataRequirementIds(): string[] {
    return [];
  }
}
