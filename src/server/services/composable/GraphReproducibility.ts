/**
 * WealthOS v6.6 - Graph Reproducibility
 * Agent E Deliverable
 * 
 * SPEC MANDATE:
 * Records complete deterministic manifest for every decision graph run:
 *   graphDefinitionHash, engineVersions, parameterHashes, dataSnapshotHashes, randomSeed
 * Persists append-only logs in data/v66/graph_runs.jsonl.
 */

import fs from 'fs';
import path from 'path';

export interface GraphRunManifest {
  runId: string;
  graphId: string;
  graphVersion: string;
  graphDefinitionHash: string;
  engineVersions: Record<string, string>;
  engineSourceHashes: Record<string, string>;
  parameterHashes: Record<string, string>;
  dataSnapshotHashes: Record<string, string>;
  pitSnapshot: string;
  universeSnapshot: string;
  executionModel: string;
  costModel: string;
  randomSeed: number;
  outputDecisionHash: string;
  executedAt: string;
}

export class GraphReproducibilityService {
  private static instance: GraphReproducibilityService;
  private readonly manifestPath: string;

  private constructor() {
    const root = process.cwd();
    this.manifestPath = path.join(root, 'data', 'v66', 'graph_runs.jsonl');
    this.ensureDir();
  }

  public static getInstance(): GraphReproducibilityService {
    if (!GraphReproducibilityService.instance) {
      GraphReproducibilityService.instance = new GraphReproducibilityService();
    }
    return GraphReproducibilityService.instance;
  }

  private ensureDir(): void {
    const dir = path.dirname(this.manifestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public recordRun(manifest: Omit<GraphRunManifest, 'executedAt'>): GraphRunManifest {
    const full: GraphRunManifest = {
      ...manifest,
      executedAt: new Date().toISOString()
    };
    fs.appendFileSync(this.manifestPath, JSON.stringify(full) + '\n', 'utf8');
    return full;
  }
}
