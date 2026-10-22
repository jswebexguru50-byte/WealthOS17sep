import { getDB, initializeDatabase, dbAll } from '../src/server/database.js';
import { Analyze360Service } from '../src/server/services/Analyze360Service.js';
import { DossierRunService, AnalysisType } from '../src/server/services/DossierRunService.js';

const runId = process.argv[2] || process.argv[process.argv.indexOf('--run-id') + 1];
if (!runId || runId === '--run-id') {
  console.error('Usage: npx tsx scripts/recompute_dossier_run_analysis.ts <DOSSIER_RUN_ID>');
  process.exit(1);
}

interface CandidateRow {
  candidateId: string;
  dossierRunId: string;
  symbol: string;
  convergenceCount: number;
  status?: string;
  lifecycleStatus?: string;
  createdAt?: string;
}

interface SignalRow {
  signalId: string;
  candidateId: string;
  symbol: string;
  strategyId: string;
  signalDate: string;
}

async function persistAnalysisSet(
  dossierRunId: string,
  candidate: CandidateRow,
  signalRows: SignalRow[],
  analysis: any
) {
  const asOf = new Date().toISOString();
  const signalIds = signalRows.map((s) => s.signalId);
  const strategyIds = [...new Set(signalRows.map((s) => s.strategyId).filter(Boolean))];
  const recommendedDate = signalRows
    .map((s) => s.signalDate)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

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
        riskEvidenceStatus: 'DERIVED_FROM_ANALYZE360_RECOMPUTE',
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
        signalIds,
        recommendedDate,
        strategyIds,
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
      analysisVersion: 'scan-to-dossier-recompute-v1',
    });
  }

  await DossierRunService.updateCandidateStatus(candidate.candidateId, 'ANALYZED');
}

async function main() {
  await initializeDatabase(getDB(), true);
  const db = getDB();
  const candidates = await dbAll<CandidateRow>(
    db,
    'SELECT * FROM dossier_candidates WHERE dossierRunId = ? ORDER BY symbol',
    [runId]
  );
  if (candidates.length === 0) throw new Error(`No candidates found for dossier run ${runId}`);

  const allSignals = await dbAll<SignalRow>(
    db,
    'SELECT signalId, candidateId, symbol, strategyId, signalDate FROM dossier_signals WHERE dossierRunId = ? ORDER BY signalDate, strategyId',
    [runId]
  );
  const signalsByCandidate = new Map<string, SignalRow[]>();
  for (const signal of allSignals) {
    if (!signalsByCandidate.has(signal.candidateId)) signalsByCandidate.set(signal.candidateId, []);
    signalsByCandidate.get(signal.candidateId)!.push(signal);
  }

  let completed = 0;
  const failures: Array<{ symbol: string; error: string }> = [];
  for (const candidate of candidates) {
    const signalRows = signalsByCandidate.get(candidate.candidateId) || [];
    const signalIds = signalRows.map((s) => s.signalId);
    const strategyIds = [...new Set(signalRows.map((s) => s.strategyId).filter(Boolean))];
    const recommendedDate = signalRows.map((s) => s.signalDate).filter(Boolean).sort().at(-1);
    try {
      const analysis = await Analyze360Service.getInstance().getAnalyze360View(
        candidate.symbol,
        candidate.candidateId,
        signalIds,
        recommendedDate,
        strategyIds,
        { includeTechnicals: true, includeSectorMomentum: true }
      );
      await persistAnalysisSet(runId, candidate, signalRows, analysis);
      completed++;
      console.log(`[OK] ${candidate.symbol}`);
    } catch (err: any) {
      failures.push({ symbol: candidate.symbol, error: err?.message || String(err) });
      console.error(`[FAIL] ${candidate.symbol}: ${err?.message || String(err)}`);
    }
  }

  console.log(JSON.stringify({ dossierRunId: runId, completed, total: candidates.length, failures }, null, 2));
  if (failures.length > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
