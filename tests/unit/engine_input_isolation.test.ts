/**
 * engine_input_isolation.test.ts — Constitution Article C4
 *
 * Architectural invariant test:
 * Verifies that intelligence engines in src/server/services/intelligence/
 * DO NOT directly query raw endpoint snapshot tables (fundamental_endpoint_snapshots).
 * All analytical engines must consume data via CanonicalFactRepository / CompanyAnalyticalState.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Engine Input Isolation & Raw Snapshot Bypass Test', () => {
  const INTELLIGENCE_ENGINES_DIR = path.resolve('src', 'server', 'services', 'intelligence');

  const FORBIDDEN_PATTERNS = [
    'fundamental_endpoint_snapshots',
    'FROM fundamental_endpoint_snapshots',
    'JOIN fundamental_endpoint_snapshots',
  ];

  // Whitelisted ingestion/adapter infrastructure files ONLY
  const ALLOWED_RAW_ACCESS_FILES = new Set([
    'FundamentalModuleAdapter.ts', // Quarantined adapter converting snapshots to ModuleResult
    'ValuationModuleAdapter.ts',   // Quarantined legacy adapter
    'AnalysisEvidenceRepository.ts', // Primary evidence ingestion/resolution engine
  ]);

  function scanDirectory(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...scanDirectory(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it('ensures no analytical engine directly queries fundamental_endpoint_snapshots', () => {
    const allFiles = scanDirectory(INTELLIGENCE_ENGINES_DIR);
    const violations: Array<{ file: string; pattern: string }> = [];

    for (const filePath of allFiles) {
      const fileName = path.basename(filePath);
      if (ALLOWED_RAW_ACCESS_FILES.has(fileName)) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (content.includes(pattern)) {
          violations.push({ file: fileName, pattern });
        }
      }
    }

    if (violations.length > 0) {
      console.error('Violations found:', violations);
    }

    expect(violations).toEqual([]);
  });

  it('validates that EngineManifest disallows legacy fallback across all engines', async () => {
    const { ENGINE_MANIFESTS } = await import('../../src/server/services/intelligence/contracts/EngineManifest.js');
    for (const [engineName, manifest] of Object.entries(ENGINE_MANIFESTS)) {
      expect(manifest.allowLegacyFallback).toBe(false);
    }
  });
});
