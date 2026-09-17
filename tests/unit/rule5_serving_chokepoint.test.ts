import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Constitution Rule 5: Serving DB Write Chokepoint Invariant', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const targetTables = ['SecurityDossierSnapshots', 'ForensicAssertions'];
  const writePatterns = [
    /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+SecurityDossierSnapshots/i,
    /UPDATE\s+SecurityDossierSnapshots/i,
    /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+ForensicAssertions/i,
    /UPDATE\s+ForensicAssertions/i,
  ];

  // Whitelisted serving gatekeeper
  const authorizedGatekeepers = [
    path.normalize('pipeline/quality-gate.cjs'),
  ];

  // Ignored directories (node_modules, git, backups, tests, scratch)
  const ignoredDirs = new Set([
    'node_modules',
    '.git',
    '.gemini',
    'dist',
    'build',
    'backups',
    'tests',
    'scratch',
    'scripts' // legacy scripts are inactive historical scripts
  ]);

  function scanDirectory(dir: string, fileList: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          scanDirectory(path.join(dir, entry.name), fileList);
        }
      } else if (entry.isFile()) {
        if (/\.(ts|js|cjs|mjs)$/.test(entry.name)) {
          fileList.push(path.join(dir, entry.name));
        }
      }
    }
    return fileList;
  }

  it('prohibits any active application code from writing to serving tables outside quality-gate.cjs', () => {
    const sourceFiles = scanDirectory(rootDir);
    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const file of sourceFiles) {
      const relPath = path.normalize(path.relative(rootDir, file));
      if (authorizedGatekeepers.includes(relPath)) {
        continue;
      }

      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of writePatterns) {
          if (pattern.test(line)) {
            violations.push({
              file: relPath,
              line: i + 1,
              text: line.trim()
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      console.error('RULE 5 VIOLATIONS DETECTED:', violations);
    }

    // Zero direct-write bypasses permitted in active source tree
    expect(violations).toHaveLength(0);
  });
});
