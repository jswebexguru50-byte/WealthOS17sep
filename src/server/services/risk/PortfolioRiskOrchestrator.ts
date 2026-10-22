/**
 * WealthOS v6.6 - Portfolio Risk Orchestrator
 * Agent G Deliverable
 * 
 * SPEC MANDATE:
 * Orchestrates all risk sub-engines as a unified composable pipeline:
 *   RiskBudget -> Exposure -> CorrelationCluster -> Concentration -> Liquidity -> DrawdownControl
 * Ensures no trade can bypass the multi-dimensional risk budget.
 */

import { ComposableEngine } from '../composable/EngineContract.js';
import { EngineCapability } from '../composable/EngineCapability.js';
import { PITContext } from '../composable/PITContext.js';
import { EvidenceBus } from '../composable/EvidenceBus.js';

import { RiskBudgetEngine } from './RiskBudgetEngine.js';
import { PortfolioExposureEngine } from './PortfolioExposureEngine.js';
import { CorrelationClusterEngine } from './CorrelationClusterEngine.js';
import { ConcentrationRiskEngine } from './ConcentrationRiskEngine.js';
import { LiquidityRiskEngine } from './LiquidityRiskEngine.js';
import { DrawdownControlEngine } from './DrawdownControlEngine.js';

export class PortfolioRiskOrchestrator implements ComposableEngine {
  public readonly engineId = 'PortfolioRiskOrchestrator';
  public readonly version = 'v6.6.5-risk-orch';

  public readonly capability: EngineCapability = {
    engineId: this.engineId,
    roles: ['RISK_CONTROL', 'EXECUTION_GATE'],
    produces: ['PORTFOLIO_RISK_BUDGET', 'CONCENTRATION_LIMIT', 'LIQUIDITY_LIMIT', 'DRAWDOWN_PROTECTION_GATE'],
    consumes: ['TECHNICAL_SIGNAL'],
    independentMode: true,
    composableMode: true,
    requiresPriorEngine: false,
    canReject: true,
    canOverride: true,
    canSizePosition: false,
    canBlockExecution: true
  };

  private subEngines: ComposableEngine[] = [
    new RiskBudgetEngine(),
    new PortfolioExposureEngine(),
    new CorrelationClusterEngine(),
    new ConcentrationRiskEngine(),
    new LiquidityRiskEngine(),
    new DrawdownControlEngine()
  ];

  public async evaluate(bus: EvidenceBus, context: PITContext, universeSecurityIds: string[]): Promise<void> {
    for (const sub of this.subEngines) {
      await sub.evaluate(bus, context, universeSecurityIds);
    }
  }

  public getSourceHash(): string {
    return 'portfolio_risk_orchestrator_source_sha256';
  }

  public getParameterHash(): string {
    return 'portfolio_risk_orchestrator_params_sha256';
  }

  public getDataRequirementIds(): string[] {
    return [];
  }
}
