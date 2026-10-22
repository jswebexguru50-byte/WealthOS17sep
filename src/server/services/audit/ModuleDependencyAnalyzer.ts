/**
 * src/server/services/audit/ModuleDependencyAnalyzer.ts
 *
 * WealthOS v6.7.2 True TypeScript AST Module Dependency Graph Analyzer.
 *
 * Replaces crude substring detection with deep AST traversal:
 * - Static imports (`import ... from '...'`)
 * - Dynamic imports (`import('...')`)
 * - Re-exports & barrel exports (`export ... from '...'`)
 * - CommonJS requires (`require('...')`)
 * - Transitive dependency contamination paths (A -> B -> C)
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export interface ImportReference {
  rawSpecifier: string;
  resolvedPath?: string;
  importType: 'STATIC_IMPORT' | 'DYNAMIC_IMPORT' | 'RE_EXPORT' | 'REQUIRE';
  line: number;
}

export interface ModuleNode {
  filePath: string;
  imports: ImportReference[];
}

export interface DependencyPath {
  source: string;
  target: string;
  chain: string[];
  isDirect: boolean;
}

export interface DependencyAuditReport {
  analyzedAt: string;
  totalModulesScanned: number;
  forbiddenDependencyFound: boolean;
  violations: DependencyPath[];
}

export class ModuleDependencyAnalyzer {
  private workspaceRoot: string;
  private moduleGraph: Map<string, ModuleNode>;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.moduleGraph = new Map();
  }

  /**
   * Parses a single TypeScript/JavaScript source file and extracts all imports via AST.
   */
  public parseFileAST(filePath: string): ImportReference[] {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.workspaceRoot, filePath);
    if (!fs.existsSync(fullPath)) {
      return [];
    }

    const sourceCode = fs.readFileSync(fullPath, 'utf8');
    const sourceFile = ts.createSourceFile(
      fullPath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    const imports: ImportReference[] = [];

    const visit = (node: ts.Node) => {
      // 1. Static imports: `import ... from 'specifier'`
      if (ts.isImportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const spec = node.moduleSpecifier.text;
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          imports.push({
            rawSpecifier: spec,
            resolvedPath: this.resolveSpecifier(fullPath, spec),
            importType: 'STATIC_IMPORT',
            line: line + 1
          });
        }
      }

      // 2. Re-exports: `export ... from 'specifier'`
      if (ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const spec = node.moduleSpecifier.text;
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          imports.push({
            rawSpecifier: spec,
            resolvedPath: this.resolveSpecifier(fullPath, spec),
            importType: 'RE_EXPORT',
            line: line + 1
          });
        }
      }

      // 3. Dynamic imports: `import('specifier')` and `require('specifier')`
      if (ts.isCallExpression(node)) {
        const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';

        if ((isDynamicImport || isRequire) && node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          if (ts.isStringLiteral(firstArg)) {
            const spec = firstArg.text;
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            imports.push({
              rawSpecifier: spec,
              resolvedPath: this.resolveSpecifier(fullPath, spec),
              importType: isDynamicImport ? 'DYNAMIC_IMPORT' : 'REQUIRE',
              line: line + 1
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return imports;
  }

  /**
   * Resolves relative and alias import specifiers to absolute file paths.
   */
  public resolveSpecifier(fromFilePath: string, specifier: string): string | undefined {
    if (!specifier.startsWith('.')) {
      return undefined; // External package import
    }

    const dir = path.dirname(fromFilePath);
    let resolved = path.resolve(dir, specifier);

    // Normalize extensions (.js -> .ts, etc.)
    const candidates = [
      resolved,
      resolved.replace(/\.js$/, '.ts'),
      resolved + '.ts',
      resolved + '.tsx',
      resolved + '.js',
      path.join(resolved, 'index.ts'),
      path.join(resolved, 'index.js')
    ];

    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        return c;
      }
    }

    return resolved;
  }

  /**
   * Builds the module dependency graph recursively starting from a root file or directory.
   */
  public buildGraph(entryFiles: string[]): void {
    const queue: string[] = entryFiles.map(f => path.isAbsolute(f) ? f : path.resolve(this.workspaceRoot, f));

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (this.moduleGraph.has(current)) continue;

      const imports = this.parseFileAST(current);
      this.moduleGraph.set(current, { filePath: current, imports });

      for (const imp of imports) {
        if (imp.resolvedPath && fs.existsSync(imp.resolvedPath) && !this.moduleGraph.has(imp.resolvedPath)) {
          queue.push(imp.resolvedPath);
        }
      }
    }
  }

  /**
   * Finds all direct and transitive dependency chains between sourceFile and targetName.
   */
  public findDependencyPaths(sourceFile: string, forbiddenTargetSubstring: string): DependencyPath[] {
    const fullSource = path.isAbsolute(sourceFile) ? sourceFile : path.resolve(this.workspaceRoot, sourceFile);
    this.buildGraph([fullSource]);

    const violations: DependencyPath[] = [];
    const visited = new Set<string>();

    const dfs = (currentPath: string, currentChain: string[]) => {
      const node = this.moduleGraph.get(currentPath);
      if (!node) return;

      for (const imp of node.imports) {
        const matchesForbidden = imp.rawSpecifier.includes(forbiddenTargetSubstring) ||
          (imp.resolvedPath && imp.resolvedPath.includes(forbiddenTargetSubstring));

        if (matchesForbidden) {
          const fullChain = [...currentChain, imp.resolvedPath || imp.rawSpecifier];
          violations.push({
            source: fullSource,
            target: imp.resolvedPath || imp.rawSpecifier,
            chain: fullChain,
            isDirect: currentChain.length === 1
          });
        }

        if (imp.resolvedPath && !currentChain.includes(imp.resolvedPath)) {
          dfs(imp.resolvedPath, [...currentChain, imp.resolvedPath]);
        }
      }
    };

    dfs(fullSource, [fullSource]);
    return violations;
  }

  /**
   * Validates that an auditor module is completely clean of any direct or transitive imports
   * from the producer replay engine.
   */
  public assertAuditorIndependence(auditorFilePath: string): { clean: boolean; violations: DependencyPath[] } {
    const violations = this.findDependencyPaths(auditorFilePath, 'EconomicReplayEngine');
    return {
      clean: violations.length === 0,
      violations
    };
  }
}
