import { execSync } from 'child_process';
import path from 'path';

export class RepositoryScopeAuditor {
  public auditScope(): {
    sourceChanges: number;
    frozenControlChanges: number;
    unknownChanges: number;
    generatedArtifacts: number;
    cp0: 'PASS' | 'FAIL';
  } {
    const gitStatus = execSync('git status --porcelain').toString().trim();
    const lines = gitStatus.split('\n').filter(l => l.length > 0);

    let sourceChanges = 0;
    let frozenControlChanges = 0;
    let unknownChanges = 0;
    let generatedArtifacts = 0;

    const frozenFiles = [
      'src/server/services/PureTechnicalStrategiesEngine.ts',
      'src/server/services/StrategyParameterConfig.ts',
      'src/server/services/SignalQualityOverlay.ts',
      'src/server/services/CapitalProtectionEngine.ts',
      'src/server/services/NewTechnicalStrategiesEngine.ts',
      'src/server/services/UpstoxIntradayIngestor.ts',
      'data/v6.3_REAL_trade_identity_ledger.jsonl'
    ];

    for (const line of lines) {
      const file = line.substring(3);
      if (file.startsWith('reports/') || file.startsWith('.agents/') || file.startsWith('logs/')) {
        generatedArtifacts++;
      } else if (frozenFiles.includes(file)) {
        frozenControlChanges++;
      } else if (file.startsWith('src/') || file.startsWith('data/') || file.startsWith('scripts/') || file.startsWith('tests/')) {
        sourceChanges++;
      } else {
        unknownChanges++;
      }
    }

    const cp0 = (sourceChanges === 0 && frozenControlChanges === 0 && unknownChanges === 0) ? 'PASS' : 'FAIL';

    return {
      sourceChanges,
      frozenControlChanges,
      unknownChanges,
      generatedArtifacts,
      cp0
    };
  }
}
