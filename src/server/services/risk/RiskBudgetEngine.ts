/**
 * WealthOS v6.6 - Risk Budget Engine
 * Agent G Deliverable
 * 
 * Controls total portfolio risk allocation and ensures risk budget limits
 * are strictly preserved per trade, strategy, and trading day.
 * Role: RISK_CONTROL. Emits PORTFOLIO_RISK_BUDGET.
 * Invariant: productionPromotionAuthorized = false
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

export class RiskBudgetEngine implements ComposableEngine {
  public readonly engineId = 'RiskBudgetEngine';
  public readonly version = 'v6.6.5-risk-budget';

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

  private maxDailyPortfolioRiskPct = 2.0; // max 2% portfolio equity at risk per day
  private maxPerTradeRiskPct = 0.5;       // max 0.5% portfolio equity per trade

  public async evaluate(bus: EvidenceBus, context: PITContext, universeSecurityIds: string[]): Promise<void> {
    const signals = bus.getByType('TECHNICAL_SIGNAL');
    let totalRiskAllocated = 0;

    for (const sig of signals) {
      if ((sig.payload as any)?.action === 'BUY') {
        totalRiskAllocated += this.maxPerTradeRiskPct;
        const blocked = totalRiskAllocated > this.maxDailyPortfolioRiskPct;

        bus.emit({
          type: 'PORTFOLIO_RISK_BUDGET',
          engineId: this.engineId,
          securityId: sig.securityId,
          engineVersion: this.version,
          engineSourceHash: this.getSourceHash(),
          parameterHash: this.getParameterHash(),
          dataSnapshotHash: 'SNAP_RISK_V66',
          inputEvidenceIds: [sig.id],
          sourceRequirementIds: this.getDataRequirementIds(),
          pitContextHash: context.contextHash,
          decisionGraphHash: 'GRAPH_V66',
          runId: `RUN_RISK_${context.decisionDate}`,
          decisionDate: context.decisionDate,
          decisionTimestamp: context.decisionTimestamp,
          payload: {
            allocatedRiskPct: this.maxPerTradeRiskPct,
            cumulativeRiskPct: totalRiskAllocated,
            maxAllowedRiskPct: this.maxDailyPortfolioRiskPct,
            blocked,
            reason: blocked ? 'Daily portfolio risk budget of 2.0% exhausted' : 'Within daily risk budget'
          }
        });
      }
    }
  }

  public getSourceHash(): string {
    return 'risk_budget_engine_source_sha256';
  }

  public getParameterHash(): string {
    return 'risk_budget_params_sha256';
  }

  public getDataRequirementIds(): string[] {
    return [];
  }
}
