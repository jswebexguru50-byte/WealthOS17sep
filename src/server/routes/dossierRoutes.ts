/**
 * dossierRoutes.ts
 *
 * API routes for the WealthOS Dossier Lifecycle.
 *
 * Routes:
 *   GET  /api/dossier-runs              — list historical runs
 *   GET  /api/dossier-runs/:runId       — full run detail
 *   GET  /api/dossier-candidates/:id    — candidate detail with all analyses
 *   GET  /api/dossier-artifacts/:runId  — artifact metadata for run
 *   POST /api/dossier-runs              — trigger a new scan-to-dossier run
 *   GET  /api/dossier-company/:symbol   — latest reusable analysis for a stock
 *
 * All GET endpoints are zero-write (read-only).
 * No provider calls are triggered by GET endpoints.
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { DossierRunService } from '../services/DossierRunService.js';

export const dossierRouter = Router();

// ── List dossier runs ────────────────────────────────────────────────────────
dossierRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const runs = await DossierRunService.listDossierRuns(100);
    return res.json({
      success: true,
      count: runs.length,
      runs,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// ── Get candidate by candidateId ─────────────────────────────────────────────
dossierRouter.get('/candidates/:candidateId', async (req: Request, res: Response) => {
  try {
    const { candidateId } = req.params;
    const candidate = await DossierRunService.getCandidateById(candidateId);
    if (!candidate) {
      return res.status(404).json({ success: false, error: `Candidate ${candidateId} not found.` });
    }
    const signals = await DossierRunService.getSignalsForCandidate(candidateId);
    const analyses = await DossierRunService.getAllSnapshotsForCandidate(candidateId);
    return res.json({
      success: true,
      candidate,
      signals,
      analyses,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// ── Get latest analysis for a symbol (stock page reuse) ──────────────────────
dossierRouter.get('/company/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    // Find most recent candidateId for this symbol
    const { getDB, dbGet } = await import('../database.js');
    const db = getDB();
    const candidate = await dbGet<any>(db,
      `SELECT dc.candidateId
       FROM dossier_candidates dc
       JOIN dossier_runs dr ON dc.dossierRunId = dr.dossierRunId
       WHERE dc.symbol = ? AND dr.status = 'COMPLETED'
       ORDER BY dr.createdAt DESC LIMIT 1`,
      [symbol]
    );
    if (!candidate) {
      return res.json({ success: true, symbol, analyses: {}, candidateId: null, message: 'No completed dossier run found for this symbol.' });
    }
    const analyses = await DossierRunService.getAllSnapshotsForCandidate(candidate.candidateId);
    const signals = await DossierRunService.getSignalsForCandidate(candidate.candidateId);
    return res.json({
      success: true,
      symbol,
      candidateId: candidate.candidateId,
      analyses,
      signals,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// ── Get artifacts for a run ──────────────────────────────────────────────────
dossierRouter.get('/:runId/artifacts', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const artifacts = await DossierRunService.getArtifactsForRun(runId);
    return res.json({ success: true, artifacts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// ── Download artifact file ───────────────────────────────────────────────────
dossierRouter.get('/:runId/download/:artifactId', async (req: Request, res: Response) => {
  try {
    const { runId, artifactId } = req.params;
    const artifacts = await DossierRunService.getArtifactsForRun(runId);
    const artifact = artifacts.find((a) => a.dossierArtifactId === artifactId);
    if (!artifact) {
      return res.status(404).json({ success: false, error: `Artifact ${artifactId} not found for run ${runId}.` });
    }
    const filePath = path.resolve(artifact.storageLocation);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: `Artifact file not found at ${artifact.storageLocation}.` });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    return;
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// ── Get full dossier run ─────────────────────────────────────────────────────
// Keep this catch-all route after all static/specific routes.
dossierRouter.get('/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const run = await DossierRunService.getDossierRun(runId);
    if (!run) {
      return res.status(404).json({ success: false, error: `Dossier run ${runId} not found.` });
    }
    return res.json({ success: true, run });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// ── Trigger new dossier run (POST) ───────────────────────────────────────────
dossierRouter.post('/', async (req: Request, res: Response) => {
  try {
    // Lazy import to avoid circular deps at startup
    const { ScanToDossierOrchestrator } = await import('../services/ScanToDossierOrchestrator.js');

    const mode = (req.body?.mode as string)?.toUpperCase() || 'LAST_N';
    const n = parseInt(req.body?.n ?? '7', 10);
    const fromDate = req.body?.fromDate as string | undefined;
    const toDate = req.body?.toDate as string | undefined;

    if (mode === 'DATE_WINDOW' && (!fromDate || !toDate)) {
      return res.status(400).json({ success: false, error: 'DATE_WINDOW mode requires fromDate and toDate.' });
    }

    // Fire off the orchestrator asynchronously — returns runId immediately
    const dossierRunId = await ScanToDossierOrchestrator.launchRun({
      mode: mode === 'DATE_WINDOW' ? 'DATE_WINDOW' : 'LAST_N',
      n: mode === 'LAST_N' ? n : undefined,
      fromDate,
      toDate,
    });

    return res.json({
      success: true,
      dossierRunId,
      message: `Dossier run ${dossierRunId} started. Poll GET /api/dossier-runs/${dossierRunId} for status.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});
