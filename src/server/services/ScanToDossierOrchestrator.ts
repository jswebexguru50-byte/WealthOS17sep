/**
 * ScanToDossierOrchestrator.ts
 *
 * Production coordinator for the persistent WealthOS scan-to-dossier lifecycle.
 *
 * Guardrails:
 * - Reuses existing scan, ID, Analyze360, and dossier persistence services.
 * - Does not call live providers.
 * - Does not fabricate missing facts, dates, QGLP, sector momentum, or decisions.
 * - Freezes the technical cohort before analysis.
 * - GET/read routes remain zero-write; this orchestrator is invoked only by POST.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { NseTradingCalendarService, TradingSessionResolution } from './NseTradingCalendarService.js';
import { SevenStrategiesCandidatesService, CandidateResult } from './SevenStrategiesCandidatesService.js';
import { CandidateLifecycleIdService } from './CandidateLifecycleIdService.js';
import {
  AnalysisType,
  DossierRunService,
  generateDossierRunId,
} from './DossierRunService.js';
import { Analyze360Service } from './Analyze360Service.js';

export interface ScanToDossierLaunchParams {
  mode: 'LAST_N' | 'DATE_WINDOW';
  n?: number;
  fromDate?: string;
  toDate?: string;
}

interface FrozenSignal {
  symbol: string;
  strategyId: string;
  strategyName: string;
  signalDate: string;
  signalPrice: number | null;
  candidate: CandidateResult;
}

interface FrozenCandidate {
  symbol: string;
  candidateId: string;
  signalIds: string[];
  recommendedDate: string | null;
  strategyIds: string[];
  signals: FrozenSignal[];
}

export class ScanToDossierOrchestrator {
  /**
   * Creates the dossier run and starts execution in the background.
   * The caller should poll GET /api/dossier-runs/:dossierRunId.
   */
  static async launchRun(params: ScanToDossierLaunchParams): Promise<string> {
    const resolution = await ScanToDossierOrchestrator.resolveWindow(params);
    const n = params.mode === 'LAST_N' ? (params.n ?? 7) : resolution.resolvedDates.length;
    const runAnchorDate = resolution.resolvedDates.at(-1) || new Date().toISOString().slice(0, 10);
    const dossierRunId = generateDossierRunId(runAnchorDate, n);

    await DossierRunService.createDossierRun({
      dossierRunId,
      requestMode: params.mode,
      requestedTradingSessions: params.mode === 'LAST_N' ? n : undefined,
      requestedFrom: params.fromDate,
      requestedTo: params.toDate,
      actualTradingDates: resolution.resolvedDates,
      scanAsOf: new Date().toISOString(),
      ohlcvAsOf: resolution.ohlcvAsOf,
      strategiesConfig: {
        strategySet: 'SEVEN_ALPHANUMERIC',
        source: 'SevenStrategiesCandidatesService',
        windowCoverageStatus: resolution.coverageStatus,
        windowCoverageNote: resolution.coverageNote,
      },
    });

    if (resolution.resolvedDates.length === 0) {
      await DossierRunService.updateRunStatus(dossierRunId, 'FAILED', {
        signalCount: 0,
        candidateCount: 0,
        convergenceCount: 0,
        failureState: `TRADING_WINDOW_UNAVAILABLE: ${resolution.coverageNote}`,
      });
      return dossierRunId;
    }

    // Execute after response returns. Keep failures visible in dossier_runs.
    setTimeout(() => {
      ScanToDossierOrchestrator.executeRun(dossierRunId, resolution).catch(async (err) => {
        await DossierRunService.updateRunStatus(dossierRunId, 'FAILED', {
          failureState: err?.message || String(err),
        }).catch(() => undefined);
      });
    }, 0);

    return dossierRunId;
  }

  static async executeRun(dossierRunId: string, resolution: TradingSessionResolution): Promise<void> {
    await DossierRunService.updateRunStatus(dossierRunId, 'SCANNING');

    const payload = await SevenStrategiesCandidatesService.getInstance().getCandidatesPayload({
      forceRefresh: false,
      includeTechnicals: false,
      includeSectorMomentum: false,
      includeActionReadiness: false,
      includeConvergence: true,
    });

    const frozenCandidates = ScanToDossierOrchestrator.freezeCohort(payload, resolution.resolvedDates);
    const signalCount = frozenCandidates.reduce((sum, c) => sum + c.signals.length, 0);
    const convergenceCount = frozenCandidates.filter((c) => c.strategyIds.length > 1).length;

    await DossierRunService.updateRunStatus(dossierRunId, 'COHORT_FROZEN', {
      signalCount,
      candidateCount: frozenCandidates.length,
      convergenceCount,
    });

    const createdAt = new Date().toISOString();
    for (const candidate of frozenCandidates) {
      await DossierRunService.upsertCandidate({
        candidateId: candidate.candidateId,
        dossierRunId,
        symbol: candidate.symbol,
        convergenceCount: candidate.strategyIds.length,
        lifecycleStatus: 'DISCOVERED',
        createdAt,
      });

      for (const signal of candidate.signals) {
        const signalId = CandidateLifecycleIdService.generateSignalId({
          symbol: signal.symbol,
          strategyId: signal.strategyId,
          signalDate: signal.signalDate || null,
          cmp: signal.signalPrice,
          sourceReportFilename: signal.candidate.recommendationSource || null,
          strategyRuleSummary: signal.strategyName,
        }).signalId;

        await DossierRunService.insertSignal({
          signalId,
          candidateId: candidate.candidateId,
          dossierRunId,
          symbol: signal.symbol,
          strategyId: signal.strategyId,
          strategyName: signal.strategyName,
          signalDate: signal.signalDate,
          signalPrice: signal.signalPrice,
          technicalEvidence: {
            entry: signal.candidate.entry ?? null,
            stopLoss: signal.candidate.stopLoss ?? null,
            target1: signal.candidate.target1 ?? null,
            target2: signal.candidate.target2 ?? null,
            riskReward: signal.candidate.riskReward ?? null,
            ruleChecks: signal.candidate.ruleChecks ?? [],
            keyParameters: signal.candidate.keyParameters ?? {},
            evidenceStatus: 'REPORTED_BY_SCAN',
          },
          createdAt,
        });
      }
    }

    await DossierRunService.updateRunStatus(dossierRunId, 'ANALYZING');

    let analyzedCount = 0;
    for (const candidate of frozenCandidates) {
      const analysis = await Analyze360Service.getInstance().getAnalyze360View(
        candidate.symbol,
        candidate.candidateId,
        candidate.signalIds,
        candidate.recommendedDate || undefined,
        candidate.strategyIds,
        { includeTechnicals: true, includeSectorMomentum: true }
      );

      await ScanToDossierOrchestrator.persistAnalysisSet(dossierRunId, candidate, analysis);
      await DossierRunService.updateCandidateStatus(candidate.candidateId, 'ANALYZED');
      analyzedCount++;
    }

    await DossierRunService.updateRunStatus(dossierRunId, 'GENERATING_DOSSIER');
    await ScanToDossierOrchestrator.writeManifestArtifact(dossierRunId, resolution, frozenCandidates, analyzedCount);

    await DossierRunService.updateRunStatus(dossierRunId, 'COMPLETED', {
      signalCount,
      candidateCount: frozenCandidates.length,
      convergenceCount,
    });
  }

  private static async resolveWindow(params: ScanToDossierLaunchParams): Promise<TradingSessionResolution> {
    if (params.mode === 'DATE_WINDOW') {
      if (!params.fromDate || !params.toDate) {
        throw new Error('DATE_WINDOW requires fromDate and toDate.');
      }
      return NseTradingCalendarService.resolveSessionsFromWindow(params.fromDate, params.toDate);
    }
    return NseTradingCalendarService.resolveLastNTradingSessions(params.n ?? 7);
  }

  private static freezeCohort(payload: any, resolvedDates: string[]): FrozenCandidate[] {
    if (resolvedDates.length === 0) return [];
    const allowedDates = new Set(resolvedDates);
    const bySymbol = new Map<string, FrozenSignal[]>();

    for (const strategy of Object.values(payload.strategies || {}) as any[]) {
      for (const candidate of (strategy.candidates || []) as CandidateResult[]) {
        if (!candidate.symbol || !candidate.signalDate) continue;
        if (allowedDates.size > 0 && !allowedDates.has(candidate.signalDate)) continue;

        const symbol = candidate.symbol.toUpperCase();
        const signal: FrozenSignal = {
          symbol,
          strategyId: candidate.strategyId,
          strategyName: candidate.strategyName,
          signalDate: candidate.signalDate,
          signalPrice: Number.isFinite(candidate.cmp) ? candidate.cmp : null,
          candidate,
        };
        const list = bySymbol.get(symbol) || [];
        list.push(signal);
        bySymbol.set(symbol, list);
      }
    }

    const frozen: FrozenCandidate[] = [];
    for (const [symbol, signals] of bySymbol.entries()) {
      signals.sort((a, b) => {
        const byDate = b.signalDate.localeCompare(a.signalDate);
        return byDate !== 0 ? byDate : a.strategyId.localeCompare(b.strategyId);
      });

      const strategyIds = Array.from(new Set(signals.map((s) => s.strategyId))).sort();
      const primarySignalDate = signals[0]?.signalDate || null;
      const candidateId = CandidateLifecycleIdService.generateCandidateId({
        symbol,
        primarySignalDate,
        strategyIds,
        sourceScanDate: primarySignalDate,
      }).candidateId;
      const signalIds = signals.map((s) => CandidateLifecycleIdService.generateSignalId({
        symbol: s.symbol,
        strategyId: s.strategyId,
        signalDate: s.signalDate,
        cmp: s.signalPrice,
        sourceReportFilename: s.candidate.recommendationSource || null,
        strategyRuleSummary: s.strategyName,
      }).signalId);

      frozen.push({
        symbol,
        candidateId,
        signalIds,
        recommendedDate: primarySignalDate,
        strategyIds,
        signals,
      });
    }

    frozen.sort((a, b) => {
      const byConvergence = b.strategyIds.length - a.strategyIds.length;
      return byConvergence !== 0 ? byConvergence : a.symbol.localeCompare(b.symbol);
    });
    return frozen;
  }

  private static async persistAnalysisSet(
    dossierRunId: string,
    candidate: FrozenCandidate,
    analysis: any
  ): Promise<void> {
    const asOf = new Date().toISOString();
    const records: Array<{ type: AnalysisType; content: object }> = [
      { type: 'FUNDAMENTAL', content: analysis.fundamental || {} },
      { type: 'QGLP', content: analysis.qglp || {} },
      { type: 'SECTOR', content: analysis.sectorMomentum || {} },
      { type: 'TECHNICAL', content: analysis.technical || {} },
      {
        type: 'RISK',
        content: {
          actionReadiness: analysis.actionReadiness || {},
          missingDataChecklist: analysis.missingDataChecklist || [],
          riskEvidenceStatus: 'DERIVED_FROM_ANALYZE360',
        },
      },
      {
        type: 'FUNDAMENTAL_EXECUTIVE_SUMMARY',
        content: {
          summaryText: analysis.summarySnapshot?.summaryText || null,
          evidenceState: analysis.summarySnapshot?.evidenceState || null,
          status: analysis.summarySnapshot?.summaryText ? 'AVAILABLE' : 'DATA_INSUFFICIENT',
        },
      },
      {
        type: 'ONE_PAGE_COMPANY_SUMMARY',
        content: {
          symbol: candidate.symbol,
          candidateId: candidate.candidateId,
          dossierRunId,
          signalIds: candidate.signalIds,
          recommendedDate: candidate.recommendedDate,
          strategyIds: candidate.strategyIds,
          companyName: analysis.companyName || null,
          sector: analysis.sector || null,
          industry: analysis.industry || null,
          summarySnapshot: analysis.summarySnapshot || {},
          qglpStatus: analysis.qglp?.status || analysis.qglp?.overallStatus || 'DATA_INSUFFICIENT',
          missingDataChecklist: analysis.missingDataChecklist || [],
        },
      },
    ];

    for (const record of records) {
      await DossierRunService.persistAnalysisSnapshot({
        dossierRunId,
        candidateId: candidate.candidateId,
        symbol: candidate.symbol,
        analysisType: record.type,
        asOf,
        content: record.content,
        analysisVersion: 'scan-to-dossier-v1',
      });
    }
  }

  private static async writeManifestArtifact(
    dossierRunId: string,
    resolution: TradingSessionResolution,
    candidates: FrozenCandidate[],
    analyzedCount: number
  ): Promise<void> {
    const outDir = path.resolve('outputs', 'dossier_runs');
    fs.mkdirSync(outDir, { recursive: true });
    const fileName = `${dossierRunId}_manifest.json`;
    const storageLocation = path.join(outDir, fileName);
    const content = {
      dossierRunId,
      generatedAt: new Date().toISOString(),
      artifactType: 'JSON_MANIFEST',
      tradingWindow: resolution,
      candidateCount: candidates.length,
      signalCount: candidates.reduce((sum, c) => sum + c.signals.length, 0),
      analyzedCount,
      candidates: candidates.map((c) => ({
        symbol: c.symbol,
        candidateId: c.candidateId,
        signalIds: c.signalIds,
        recommendedDate: c.recommendedDate,
        strategyIds: c.strategyIds,
      })),
      contentHashNote: 'Hash is registered in dossier_artifacts.',
    };
    fs.writeFileSync(storageLocation, JSON.stringify(content, null, 2), 'utf8');

    // Make hash deterministic before registration by ensuring file is on disk.
    const hash = crypto.createHash('sha256').update(fs.readFileSync(storageLocation)).digest('hex');
    if (!hash) throw new Error('Failed to hash dossier manifest.');

    await DossierRunService.registerDossierArtifact({
      dossierRunId,
      artifactType: 'JSON_MANIFEST',
      fileName,
      storageLocation,
      generatorVersion: 'scan-to-dossier-v1',
    });
  }
}
