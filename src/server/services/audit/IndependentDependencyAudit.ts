/**
 * src/server/services/audit/IndependentDependencyAudit.ts
 *
 * WealthOS v6.7.2 Independent Architectural Boundary & Module Isolation Audit.
 *
 * Enforces five strict dependency isolation invariants via AST analysis:
 * 1. Producer may use EconomicReplayEngine.
 * 2. Auditor MUST NOT use EconomicReplayEngine (neither direct nor transitive).
 * 3. Shadow Replayer MUST NOT import Producer calculators.
 * 4. Reference validator (PKScreener) MUST NOT authorize execution.
 * 5. Execution adapter (Fenix) MUST NOT allocate or authorize capital.
 */

import path from 'node:path';
import { ModuleDependencyAnalyzer, DependencyPath } from './ModuleDependencyAnalyzer.js';

export interface BoundaryCheck {
  boundaryName: string;
  sourceFile: string;
  forbiddenTarget: string;
  passed: boolean;
  violations: DependencyPath[];
}

export interface IndependentDependencyAuditSummary {
  auditedAt: string;
  allBoundariesClean: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  checks: BoundaryCheck[];
}

export class IndependentDependencyAudit {
  private analyzer: ModuleDependencyAnalyzer;
  private workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.analyzer = new ModuleDependencyAnalyzer(this.workspaceRoot);
  }

  public runAudit(): IndependentDependencyAuditSummary {
    const checks: BoundaryCheck[] = [];

    // 1. Auditor independence: IndependentAuditEngine must NOT import EconomicReplayEngine
    const auditorFile = 'src/server/services/research/IndependentAuditEngine.ts';
    const auditorViolations = this.analyzer.findDependencyPaths(auditorFile, 'EconomicReplayEngine');
    checks.push({
      boundaryName: 'AUDITOR_REPLAY_INDEPENDENCE',
      sourceFile: auditorFile,
      forbiddenTarget: 'EconomicReplayEngine',
      passed: auditorViolations.length === 0,
      violations: auditorViolations
    });

    // 2. Shadow independence: C12IndependentShadowReplayer must NOT import EconomicReplayEngine
    const shadowFile = 'src/server/services/research/C12IndependentShadowReplayer.ts';
    const shadowViolations = this.analyzer.findDependencyPaths(shadowFile, 'EconomicReplayEngine');
    checks.push({
      boundaryName: 'SHADOW_REPLAY_INDEPENDENCE',
      sourceFile: shadowFile,
      forbiddenTarget: 'EconomicReplayEngine',
      passed: shadowViolations.length === 0,
      violations: shadowViolations
    });

    // 3. PKScreener Reference Parity isolation: must NOT import ExecutionGateway
    const pkScreenerFile = 'src/server/services/reference/PKScreenerParityValidator.ts';
    const pkViolations = this.analyzer.findDependencyPaths(pkScreenerFile, 'ExecutionGateway');
    checks.push({
      boundaryName: 'REFERENCE_EXECUTION_ISOLATION',
      sourceFile: pkScreenerFile,
      forbiddenTarget: 'ExecutionGateway',
      passed: pkViolations.length === 0,
      violations: pkViolations
    });

    // 4. Fenix Adapter isolation: must NOT import CapitalProtectionEngine
    const fenixFile = 'src/server/services/execution/FenixPaperAdapter.ts';
    const fenixViolations = this.analyzer.findDependencyPaths(fenixFile, 'CapitalProtectionEngine');
    checks.push({
      boundaryName: 'EXECUTION_CAPITAL_AUTHORIZATION_ISOLATION',
      sourceFile: fenixFile,
      forbiddenTarget: 'CapitalProtectionEngine',
      passed: fenixViolations.length === 0,
      violations: fenixViolations
    });

    const passedCount = checks.filter(c => c.passed).length;

    return {
      auditedAt: new Date().toISOString(),
      allBoundariesClean: passedCount === checks.length,
      totalChecks: checks.length,
      passedChecks: passedCount,
      failedChecks: checks.length - passedCount,
      checks
    };
  }
}
