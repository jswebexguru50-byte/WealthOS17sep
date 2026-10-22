/**
 * RESEARCH MANIFEST ENGINE (PIT Research Engine)
 * Milestone: v6.3.0-R1
 *
 * Enforces the v6.2.0-FROZEN code freeze, verifies file integrity against the canonical
 * baseline manifest, and produces reproducible ResearchRunManifest instances.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface ResearchRunManifest {
  runId: string;
  parentVersion: 'v6.2.0-FROZEN';
  codeCommit?: string;
  codeHash: string;
  configHash: string;
  universeHash: string;
  corporateActionHash: string;
  costModelHash: string;
  timezone: 'Asia/Kolkata';
  calendarVersion: string;
  createdAt: string;
}

export interface BaselineIntegrityVerification {
  isBaselineUnmodified: boolean;
  tamperedFiles: string[];
  manifestPath: string;
  timestamp: string;
}

export class ResearchManifestEngine {
  private static instance: ResearchManifestEngine;
  private rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir || path.resolve(process.cwd());
  }

  public static getInstance(): ResearchManifestEngine {
    if (!ResearchManifestEngine.instance) {
      ResearchManifestEngine.instance = new ResearchManifestEngine();
    }
    return ResearchManifestEngine.instance;
  }

  /**
   * Computes SHA-256 hash for a file relative to workspace root.
   */
  public computeFileHash(relPath: string): string {
    const fullPath = path.resolve(this.rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Target file not found for hashing: ${relPath}`);
    }
    const buf = fs.readFileSync(fullPath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  /**
   * Verifies that the frozen v6.2 core strategy and risk files have NOT been modified.
   */
  public verifyBaselineFreeze(): BaselineIntegrityVerification {
    const manifestPath = path.resolve(this.rootDir, 'data', 'v6.2.0_frozen_manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Canonical frozen manifest not found at: ${manifestPath}`);
    }

    const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const tampered: string[] = [];

    const FROZEN_PRODUCTION_FILES = [
      'src/server/services/PureTechnicalStrategiesEngine.ts',
      'src/server/services/StrategyParameterConfig.ts',
      'src/server/services/SignalQualityOverlay.ts',
      'src/server/services/CapitalProtectionEngine.ts',
      'src/server/services/NewTechnicalStrategiesEngine.ts'
    ];

    for (const file of FROZEN_PRODUCTION_FILES) {
      const recorded = manifestData.files[file];
      if (!recorded || !recorded.sha256) {
        tampered.push(`${file} (missing in manifest)`);
        continue;
      }
      const currentHash = this.computeFileHash(file);
      if (currentHash !== recorded.sha256) {
        tampered.push(`${file} (hash mismatch: expected ${recorded.sha256}, got ${currentHash})`);
      }
    }

    return {
      isBaselineUnmodified: tampered.length === 0,
      tamperedFiles: tampered,
      manifestPath,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Creates a formal ResearchRunManifest fingerprinting code, config, universe, and cost model.
   */
  public createRunManifest(params: {
    runId: string;
    universeDefinition: string[];
    corporateActionCount: number;
    costModelVersion?: string;
  }): ResearchRunManifest {
    const integrity = this.verifyBaselineFreeze();
    if (!integrity.isBaselineUnmodified) {
      throw new Error(
        `Cannot initialize research run: v6.2.0-FROZEN baseline violated: ${integrity.tamperedFiles.join(', ')}`
      );
    }

    const codeHasher = crypto.createHash('sha256');
    const filesToHash = [
      'src/server/services/PureTechnicalStrategiesEngine.ts',
      'src/server/services/StrategyParameterConfig.ts',
      'src/server/services/SignalQualityOverlay.ts',
      'src/server/services/CapitalProtectionEngine.ts',
      'src/server/services/NewTechnicalStrategiesEngine.ts'
    ];
    for (const f of filesToHash) {
      codeHasher.update(this.computeFileHash(f));
    }
    const codeHash = codeHasher.digest('hex');

    const universeHash = crypto
      .createHash('sha256')
      .update(params.universeDefinition.sort().join(','))
      .digest('hex');

    const corporateActionHash = crypto
      .createHash('sha256')
      .update(`CA_COUNT:${params.corporateActionCount}`)
      .digest('hex');

    const costModelHash = crypto
      .createHash('sha256')
      .update(params.costModelVersion || 'NSE_STATUTORY_V1_2026')
      .digest('hex');

    const configHash = crypto
      .createHash('sha256')
      .update(`CALENDAR:NSE_2020_2026_CANONICAL|TZ:Asia/Kolkata`)
      .digest('hex');

    return {
      runId: params.runId,
      parentVersion: 'v6.2.0-FROZEN',
      codeHash,
      configHash,
      universeHash,
      corporateActionHash,
      costModelHash,
      timezone: 'Asia/Kolkata',
      calendarVersion: 'NSE_2020_2026_CANONICAL',
      createdAt: new Date().toISOString()
    };
  }
}
