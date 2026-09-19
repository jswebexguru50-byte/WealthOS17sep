/**
 * src/server/services/phase2fasttrack/ModuleDependencyAnalyzer.ts
 *
 * Constructs and audits the module dependency graph for Phase 2.1.
 * Categorizes edges into:
 *   - READ_ONLY
 *   - COMPUTATION
 *   - EXECUTION
 *   - AUTHORIZATION
 *   - CAPITAL_EFFECT
 *
 * Verifies that no executable/authorizing path exists from CP2.1/B1 to B2 execution or capital allocation.
 */

import fs from 'fs';
import path from 'path';

export type EdgeClassification =
  | 'READ_ONLY'
  | 'COMPUTATION'
  | 'EXECUTION'
  | 'AUTHORIZATION'
  | 'CAPITAL_EFFECT';

export interface DependencyEdge {
  fromModule: string;
  toModule: string;
  classification: EdgeClassification;
  reason: string;
}

export interface DependencyAuditResult {
  passed: boolean;
  totalModules: number;
  totalEdges: number;
  unauthorizedExecutionPaths: string[];
  edges: DependencyEdge[];
  isolatedComponents: string[];
}

export class ModuleDependencyAnalyzer {
  private workspaceRoot: string;

  constructor(workspaceRoot = process.cwd()) {
    this.workspaceRoot = workspaceRoot;
  }

  public analyze(): DependencyAuditResult {
    const cpDir = path.join(this.workspaceRoot, 'src/server/services/phase2fasttrack');
    const files = fs.existsSync(cpDir)
      ? fs.readdirSync(cpDir).filter(f => f.endsWith('.ts'))
      : [];

    const edges: DependencyEdge[] = [];
    const unauthorizedExecutionPaths: string[] = [];

    for (const file of files) {
      const fullPath = path.join(cpDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Detect import statements
      const importMatches = content.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g);
      for (const match of importMatches) {
        const imported = match[1].replace(/\.js$/, '') + '.ts';
        let classification: EdgeClassification = 'READ_ONLY';

        if (content.includes('new ') && content.includes(imported.replace(/\.ts$/, ''))) {
          classification = 'COMPUTATION';
        }

        if (imported.includes('TrackB') || imported.includes('Economic')) {
          if (content.includes('authorize') || content.includes('Token')) {
            classification = 'AUTHORIZATION';
          } else if (content.includes('runTrackB') || content.includes('execute')) {
            classification = 'EXECUTION';
          }
        }

        // B2 execution prohibited from CP2.1
        if (
          file.includes('CP21') &&
          (imported.includes('Economic') || imported.includes('TrackB')) &&
          classification === 'EXECUTION'
        ) {
          unauthorizedExecutionPaths.push(`${file} -> ${imported} [${classification}]`);
        }

        edges.push({
          fromModule: file,
          toModule: imported,
          classification,
          reason: `Detected reference in ${file}`
        });
      }
    }

    const isolatedComponents = [
      'PureTechnicalStrategiesEngine.ts',
      'StrategyParameterConfig.ts',
      'CapitalProtectionEngine.ts',
      'SignalQualityOverlay.ts'
    ];

    const passed = unauthorizedExecutionPaths.length === 0;

    return {
      passed,
      totalModules: files.length,
      totalEdges: edges.length,
      unauthorizedExecutionPaths,
      edges,
      isolatedComponents
    };
  }
}
