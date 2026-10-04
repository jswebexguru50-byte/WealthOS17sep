/**
 * DossierRunService.ts
 *
 * LAYER 3 persistence service for the dossier lifecycle.
 *
 * Owns all reads/writes to:
 *   dossier_runs
 *   dossier_candidates
 *   dossier_signals
 *   dossier_analysis_snapshots
 *   dossier_artifacts
 *
 * Zero-fabrication: every write carries explicit sourced values.
 * Zero-write on read methods (GET invariant).
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';

// ─── Status Enums ────────────────────────────────────────────────────────────

export type DossierRunStatus =
  | 'CREATED'
  | 'SCANNING'
  | 'COHORT_FROZEN'
  | 'ASSESSING_DATA'
  | 'ENRICHING'
  | 'ANALYZING'
  | 'GENERATING_DOSSIER'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED';

export type CandidateLifecycleStatus =
  | 'DISCOVERED'
  | 'ANALYZED'
  | 'BACKTESTED'
  | 'PAPER_TRADE_CREATED'
  | 'ALERT_CREATED'
  | 'DOSSIER_EXPORTED'
  | 'REVIEWED'
  | 'REJECTED'
  | 'ARCHIVED';

export type AnalysisType =
  | 'TECHNICAL'
  | 'FUNDAMENTAL'
  | 'QGLP'
  | 'SECTOR'
  | 'RISK'
  | 'FUNDAMENTAL_EXECUTIVE_SUMMARY'
  | 'ONE_PAGE_COMPANY_SUMMARY'
  | 'MANAGEMENT_EXECUTION'
  | 'ACCUMULATION_ASSESSMENT'
  | 'OWNERSHIP';

// ─── ID Generation ───────────────────────────────────────────────────────────

export function generateDossierRunId(sessionDate: string, n: number): string {
  const datePart = sessionDate.replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `DR-${datePart}-${n}D-${rand}`;
}

function generateArtifactId(dossierRunId: string): string {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `ART-${dossierRunId.slice(3, 11)}-${rand}`;
}

function generateSnapshotId(candidateId: string, analysisType: string): string {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SNAP-${candidateId.slice(4, 12)}-${analysisType.slice(0, 4)}-${rand}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateDossierRunParams {
  dossierRunId: string;
  requestMode: 'LAST_N' | 'DATE_WINDOW';
  requestedTradingSessions?: number;
  requestedFrom?: string;
  requestedTo?: string;
  actualTradingDates: string[];   // ISO strings
  scanAsOf: string;
  ohlcvAsOf: string;
  strategiesConfig?: object;
}

export interface DossierCandidateRow {
  candidateId: string;
  dossierRunId: string;
  symbol: string;
  convergenceCount: number;
  lifecycleStatus: CandidateLifecycleStatus;
  createdAt: string;
}

export interface DossierSignalRow {
  signalId: string;
  candidateId: string;
  dossierRunId: string;
  symbol: string;
  strategyId: string;
  strategyName: string;
  signalDate: string;
  signalPrice: number | null;
  technicalEvidence: object | null;
  createdAt: string;
}

export interface DossierRunSummary {
  dossierRunId: string;
  requestMode: string;
  requestedTradingSessions: number | null;
  requestedFrom: string | null;
  requestedTo: string | null;
  actualTradingDates: string[];
  scanAsOf: string;
  createdAt: string;
  status: DossierRunStatus;
  completedAt: string | null;
  signalCount: number | null;
  candidateCount: number | null;
  convergenceCount: number | null;
}

export interface DossierRunFull extends DossierRunSummary {
  candidates: DossierCandidateRow[];
  signals: DossierSignalRow[];
  artifacts: DossierArtifactRow[];
}

export interface DossierArtifactRow {
  dossierArtifactId: string;
  dossierRunId: string;
  artifactType: string;
  fileName: string;
  storageLocation: string;
  contentHash: string;
  fileSize: number | null;
  generatedAt: string;
  generatorVersion: string;
  status: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DossierRunService {
  private static schemaReady = false;

  private static async ensureSchema(): Promise<void> {
    if (DossierRunService.schemaReady) return;
    const db = getDB();

    const ensureColumn = async (table: string, column: string, ddl: string) => {
      const rows = await dbAll<any>(db, `PRAGMA table_info(${table})`);
      const hasColumn = rows.some((r: any) => r.name === column);
      if (!hasColumn) {
        await dbRun(db, `ALTER TABLE ${table} ADD COLUMN ${ddl}`);
      }
    };

    await ensureColumn('dossier_runs', 'signalCount', 'signalCount INTEGER');
    await ensureColumn('dossier_runs', 'candidateCount', 'candidateCount INTEGER');
    await ensureColumn('dossier_runs', 'convergenceCount', 'convergenceCount INTEGER');
    await ensureColumn('dossier_candidates', 'lifecycleStatus', "lifecycleStatus TEXT DEFAULT 'DISCOVERED'");
    await ensureColumn('dossier_candidates', 'createdAt', 'createdAt TEXT');
    await ensureColumn('dossier_signals', 'createdAt', 'createdAt TEXT');

    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_dc_runid ON dossier_candidates(dossierRunId)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_dc_symbol ON dossier_candidates(symbol)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_ds_candidateid ON dossier_signals(candidateId)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_ds_runid ON dossier_signals(dossierRunId)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_das_candidateid ON dossier_analysis_snapshots(candidateId)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_das_type ON dossier_analysis_snapshots(candidateId, analysisType)`);

    DossierRunService.schemaReady = true;
  }

  // ── Run operations ──────────────────────────────────────────────────────

  static async createDossierRun(params: CreateDossierRunParams): Promise<string> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    const now = new Date().toISOString();
    await dbRun(db,
      `INSERT INTO dossier_runs (
        dossierRunId, requestMode, requestedTradingSessions,
        requestedFrom, requestedTo, actualTradingDates, scanAsOf,
        createdAt, status, strategiesConfig, ohlcvAsOf
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CREATED', ?, ?)`,
      [
        params.dossierRunId,
        params.requestMode,
        params.requestedTradingSessions ?? null,
        params.requestedFrom ?? null,
        params.requestedTo ?? null,
        JSON.stringify(params.actualTradingDates),
        params.scanAsOf,
        now,
        params.strategiesConfig ? JSON.stringify(params.strategiesConfig) : null,
        params.ohlcvAsOf,
      ]
    );
    return params.dossierRunId;
  }

  static async updateRunStatus(
    dossierRunId: string,
    status: DossierRunStatus,
    extras?: { signalCount?: number; candidateCount?: number; convergenceCount?: number; failureState?: string }
  ): Promise<void> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    const now = new Date().toISOString();
    const completedAt = ['COMPLETED', 'PARTIAL', 'FAILED'].includes(status) ? now : null;
    await dbRun(db,
      `UPDATE dossier_runs SET
        status = ?,
        completedAt = COALESCE(?, completedAt),
        signalCount = COALESCE(?, signalCount),
        candidateCount = COALESCE(?, candidateCount),
        convergenceCount = COALESCE(?, convergenceCount),
        failureState = COALESCE(?, failureState)
       WHERE dossierRunId = ?`,
      [
        status,
        completedAt,
        extras?.signalCount ?? null,
        extras?.candidateCount ?? null,
        extras?.convergenceCount ?? null,
        extras?.failureState ?? null,
        dossierRunId,
      ]
    );
  }

  static async listDossierRuns(limit = 50): Promise<DossierRunSummary[]> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    const rows = await dbAll<any>(db,
      `SELECT * FROM dossier_runs ORDER BY createdAt DESC LIMIT ?`,
      [limit]
    );
    return rows.map(DossierRunService.parseSummaryRow);
  }

  static async getDossierRun(dossierRunId: string): Promise<DossierRunFull | null> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    const row = await dbGet<any>(db,
      `SELECT * FROM dossier_runs WHERE dossierRunId = ?`, [dossierRunId]
    );
    if (!row) return null;

    const summary = DossierRunService.parseSummaryRow(row);
    const candidates = await DossierRunService.getCandidatesForRun(dossierRunId);
    const signals = await DossierRunService.getSignalsForRun(dossierRunId);
    const artifacts = await DossierRunService.getArtifactsForRun(dossierRunId);

    return { ...summary, candidates, signals, artifacts };
  }

  // ── Candidate operations ────────────────────────────────────────────────

  static async upsertCandidate(row: DossierCandidateRow): Promise<void> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    await dbRun(db,
      `INSERT OR REPLACE INTO dossier_candidates
        (candidateId, dossierRunId, symbol, convergenceCount, status, lifecycleStatus, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        row.candidateId,
        row.dossierRunId,
        row.symbol,
        row.convergenceCount,
        row.lifecycleStatus,
        row.lifecycleStatus,
        row.createdAt,
      ]
    );
  }

  static async getCandidateById(candidateId: string): Promise<DossierCandidateRow | null> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    const row = await dbGet<any>(db,
      `SELECT * FROM dossier_candidates WHERE candidateId = ?`, [candidateId]
    );
    return row ? row as DossierCandidateRow : null;
  }

  static async getCandidatesForRun(dossierRunId: string): Promise<DossierCandidateRow[]> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    return dbAll<DossierCandidateRow>(db,
      `SELECT * FROM dossier_candidates WHERE dossierRunId = ? ORDER BY symbol`, [dossierRunId]
    );
  }

  static async updateCandidateStatus(candidateId: string, status: CandidateLifecycleStatus): Promise<void> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    await dbRun(db,
      `UPDATE dossier_candidates SET status = ?, lifecycleStatus = ? WHERE candidateId = ?`,
      [status, status, candidateId]
    );
  }

  // ── Signal operations ───────────────────────────────────────────────────

  static async insertSignal(row: DossierSignalRow): Promise<void> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    await dbRun(db,
      `INSERT OR IGNORE INTO dossier_signals
        (signalId, candidateId, dossierRunId, symbol, strategyId, strategyName,
         signalDate, signalPrice, technicalEvidence, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.signalId, row.candidateId, row.dossierRunId, row.symbol,
        row.strategyId, row.strategyName, row.signalDate,
        row.signalPrice ?? null,
        row.technicalEvidence ? JSON.stringify(row.technicalEvidence) : null,
        row.createdAt,
      ]
    );
  }

  static async getSignalsForRun(dossierRunId: string): Promise<DossierSignalRow[]> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    return dbAll<any>(db,
      `SELECT * FROM dossier_signals WHERE dossierRunId = ? ORDER BY symbol, signalDate`, [dossierRunId]
    );
  }

  static async getSignalsForCandidate(candidateId: string): Promise<DossierSignalRow[]> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    return dbAll<any>(db,
      `SELECT * FROM dossier_signals WHERE candidateId = ? ORDER BY signalDate`, [candidateId]
    );
  }

  // ── Analysis snapshot operations ────────────────────────────────────────

  static async persistAnalysisSnapshot(params: {
    dossierRunId: string;
    candidateId: string;
    symbol: string;
    analysisType: AnalysisType;
    asOf: string;
    content: object;
    analysisVersion?: string;
  }): Promise<string> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    const now = new Date().toISOString();
    const snapshotId = generateSnapshotId(params.candidateId, params.analysisType);
    await dbRun(db,
      `INSERT OR REPLACE INTO dossier_analysis_snapshots
        (analysisSnapshotId, dossierRunId, candidateId, symbol, analysisType,
         asOf, content, analysisVersion, generatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshotId, params.dossierRunId, params.candidateId, params.symbol,
        params.analysisType, params.asOf,
        JSON.stringify(params.content),
        params.analysisVersion ?? '1.0',
        now,
      ]
    );
    return snapshotId;
  }

  static async getAnalysisSnapshot(candidateId: string, analysisType: AnalysisType): Promise<object | null> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    const row = await dbGet<any>(db,
      `SELECT content FROM dossier_analysis_snapshots
       WHERE candidateId = ? AND analysisType = ?
       ORDER BY generatedAt DESC LIMIT 1`,
      [candidateId, analysisType]
    );
    if (!row) return null;
    try {
      return JSON.parse(row.content);
    } catch {
      return null;
    }
  }

  static async getAllSnapshotsForCandidate(candidateId: string): Promise<Record<string, object>> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    const rows = await dbAll<any>(db,
      `SELECT analysisType, content, generatedAt FROM dossier_analysis_snapshots
       WHERE candidateId = ? ORDER BY analysisType, generatedAt DESC`,
      [candidateId]
    );
    const result: Record<string, object> = {};
    for (const row of rows) {
      if (!result[row.analysisType]) { // keep latest per type
        try {
          result[row.analysisType] = JSON.parse(row.content);
        } catch {
          result[row.analysisType] = {};
        }
      }
    }
    return result;
  }

  // ── Artifact operations ─────────────────────────────────────────────────

  static async registerDossierArtifact(params: {
    dossierRunId: string;
    artifactType: string;
    fileName: string;
    storageLocation: string;
    generatorVersion?: string;
  }): Promise<string> {
    await DossierRunService.ensureSchema();
    const artifactId = generateArtifactId(params.dossierRunId);
    const now = new Date().toISOString();

    // Compute hash and size if file exists
    let contentHash = 'PENDING';
    let fileSize: number | null = null;
    try {
      const fullPath = path.resolve(params.storageLocation);
      if (fs.existsSync(fullPath)) {
        const buffer = fs.readFileSync(fullPath);
        contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
        fileSize = buffer.length;
      }
    } catch {
      // file not yet generated — hash will be updated later
    }

    const db = getDB();
    await dbRun(db,
      `INSERT OR REPLACE INTO dossier_artifacts
        (dossierArtifactId, dossierRunId, artifactType, fileName,
         storageLocation, contentHash, fileSize, generatedAt, generatorVersion, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE')`,
      [
        artifactId, params.dossierRunId, params.artifactType, params.fileName,
        params.storageLocation, contentHash, fileSize, now,
        params.generatorVersion ?? '1.0',
      ]
    );
    return artifactId;
  }

  static async getArtifactsForRun(dossierRunId: string): Promise<DossierArtifactRow[]> {
    await DossierRunService.ensureSchema();
    const db = getDB();
    return dbAll<DossierArtifactRow>(db,
      `SELECT * FROM dossier_artifacts WHERE dossierRunId = ? ORDER BY generatedAt`, [dossierRunId]
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private static parseSummaryRow(row: any): DossierRunSummary {
    return {
      dossierRunId: row.dossierRunId,
      requestMode: row.requestMode,
      requestedTradingSessions: row.requestedTradingSessions ?? null,
      requestedFrom: row.requestedFrom ?? null,
      requestedTo: row.requestedTo ?? null,
      actualTradingDates: (() => {
        try { return JSON.parse(row.actualTradingDates); } catch { return []; }
      })(),
      scanAsOf: row.scanAsOf,
      createdAt: row.createdAt,
      status: row.status as DossierRunStatus,
      completedAt: row.completedAt ?? null,
      signalCount: row.signalCount ?? null,
      candidateCount: row.candidateCount ?? null,
      convergenceCount: row.convergenceCount ?? null,
    };
  }
}
