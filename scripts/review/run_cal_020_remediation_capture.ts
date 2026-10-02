import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { CompanyIntelligenceOrchestrator } from '../../src/server/services/intelligence/CompanyIntelligenceOrchestrator.js';
import { closeDB } from '../../src/server/database.js';

const COHORT = [
  'AAVAS', 'ASTRAL', 'BAJFINANCE', 'CLEAN', 'DEEPAKNTR', 'DYCL', 'HDFCBANK',
  'INFY', 'LTIM', 'LT', 'PIDILITIND', 'POLYCAB', 'RAMCOIND', 'RELIANCE',
  'STYL', 'SUNPHARMA', 'TATAMOTORS', 'TATASTEEL', 'TCS', 'TITAN',
];

function getFileSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(65536);
  let bytesRead: number;
  while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) !== 0) {
    hash.update(buf.subarray(0, bytesRead));
  }
  fs.closeSync(fd);
  return hash.digest('hex');
}

async function main() {
  const prodDbPath = path.resolve(process.cwd(), 'portfolio.db');
  const beforeSha = getFileSha256(prodDbPath);
  console.log(`[CAL_020 Capture] Before SHA256: ${beforeSha}`);

  // Copy to disposable database
  const disposableDbPath = path.resolve(process.cwd(), 'disposable_cal_020_eval.db');
  fs.copyFileSync(prodDbPath, disposableDbPath);
  console.log(`[CAL_020 Capture] Created disposable DB copy at: ${disposableDbPath}`);

  process.env.DATABASE_URL = disposableDbPath;

  const outputPath = path.resolve(process.cwd(), 'reports/review/control/CAL_020_REMEDIATION_EVALUATION.json');

  const captureRecord: Record<string, any> = {
    reviewId: 'FUNDAMENTAL_CAL_020',
    remediationId: 'CAL_020_REMEDIATION_001',
    captureMode: 'DISPOSABLE_DB_COPY_EVALUATION',
    evaluatedAt: new Date().toISOString(),
    beforeProductionDbSha256: beforeSha,
    cohort: COHORT,
    cohortSummary: {
      total: COHORT.length,
      valuationFullCoverageAnomalyCount: 0,
      qglpForensicNegativeFalseClearanceCount: 0,
      qglpLeverageDefaultUnsupportedCount: 0,
      unknownBusinessModelIndustrialMisroutingCount: 0,
    },
    companies: {},
  };

  const disposableDb = new Database(disposableDbPath, { readonly: true });

  try {
    const orchestrator = CompanyIntelligenceOrchestrator.getInstance();

    for (const symbol of COHORT) {
      console.log(`[CAL_020 Capture] Evaluating ${symbol}...`);
      const response = await orchestrator.getCompanyIntelligence(
        symbol,
        ['FUNDAMENTAL', 'VALUATION', 'FERE', 'QGLP', 'MANAGEMENT', 'MARKET_CONTEXT'],
        { persist: false }
      );

      const fundModule = (response.modules as any)?.fundamental || (response.modules as any)?.FUNDAMENTAL;
      const valModule = (response.modules as any)?.valuation || (response.modules as any)?.VALUATION;
      const fereModule = (response.modules as any)?.fere || (response.modules as any)?.FERE;
      const qglpModule = (response.modules as any)?.qglp || (response.modules as any)?.QGLP;

      const businessModel = fundModule?.result?.businessModel;

      // 1. Valuation inspection
      const valCompleteness = valModule?.result?.dataCompleteness;
      const historicalContext = valModule?.result?.historicalContext || [];
      const singleObsWithMedian = historicalContext.filter((c: any) =>
        c.coverage === 'INSUFFICIENT' && c.median1Y !== null
      );
      const isValuationAnomaly = (valCompleteness === 'FULL' && historicalContext.every((c: any) => c.coverage === 'INSUFFICIENT'));
      if (isValuationAnomaly || singleObsWithMedian.length > 0) {
        captureRecord.cohortSummary.valuationFullCoverageAnomalyCount++;
      }

      // 2. QGLP Risk inspection
      const riskPillar = qglpModule?.result?.risk;
      const redFlagItem = riskPillar?.items?.find((i: any) => i.name === 'Accounting & Auditor Red Flags');
      const fereStatus = fereModule?.status;
      const isFereInsufficient = fereStatus === 'DATA_INSUFFICIENT' || fereStatus === 'SOURCE_UNAVAILABLE' || (fereModule?.evidenceRefs?.length ?? 0) === 0;
      const isQglpRiskAnomaly = isFereInsufficient && redFlagItem?.status === 'NO_RED_FLAG_DETECTED';
      if (isQglpRiskAnomaly) {
        captureRecord.cohortSummary.qglpForensicNegativeFalseClearanceCount++;
      }

      // 3. QGLP Leverage inspection
      const longevityPillar = qglpModule?.result?.longevity;
      const solvencyItem = longevityPillar?.items?.find((i: any) => i.name === 'Balance Sheet Solvency & Deleveraging');
      const isLeverageAnomaly = (businessModel === 'BANK' || businessModel === 'NBFC')
        ? solvencyItem?.status !== 'NOT_APPLICABLE'
        : (solvencyItem?.status === 'PARTIAL' && solvencyItem?.observation?.includes('Historical balance sheet leverage supported'));
      if (isLeverageAnomaly) {
        captureRecord.cohortSummary.qglpLeverageDefaultUnsupportedCount++;
      }

      // 4. Business model misrouting inspection
      const isUnknownMisrouted = (businessModel === 'UNKNOWN' && (
        fundModule?.result?.trajectory?.marginTrajectory?.metricUsed === 'EBITDA_MARGIN' ||
        fundModule?.result?.trajectory?.marginTrajectory?.status === 'EXPANDING' ||
        fundModule?.result?.trajectory?.marginTrajectory?.status === 'CONTRACTING'
      ));
      if (isUnknownMisrouted) {
        captureRecord.cohortSummary.unknownBusinessModelIndustrialMisroutingCount++;
      }

      captureRecord.companies[symbol] = {
        businessModel,
        valuation: {
          dataCompleteness: valCompleteness,
          auditDensity: valModule?.result?.coverageAudit?.density,
          metricsEvaluated: historicalContext.map((c: any) => ({
            metric: c.metric,
            currentValue: c.currentValue,
            coverage: c.coverage,
            median1Y: c.median1Y,
            current1YPercentile: c.current1YPercentile,
          })),
        },
        fere: {
          status: fereStatus,
          evidenceCount: fereModule?.evidenceRefs?.length ?? 0,
        },
        qglp: {
          riskAccountingRedFlags: {
            status: redFlagItem?.status,
            observation: redFlagItem?.observation,
            evidenceCount: redFlagItem?.evidence?.length ?? 0,
          },
          longevitySolvency: {
            status: solvencyItem?.status,
            observation: solvencyItem?.observation,
            evidenceCount: solvencyItem?.evidence?.length ?? 0,
          },
          workingCapital: {
            status: qglpModule?.result?.qualityOfBusiness?.items?.find((i: any) => i.name === 'Operating Working Capital Discipline')?.status,
          },
        },
        auditChecks: {
          valuationCoveragePass: !isValuationAnomaly && singleObsWithMedian.length === 0,
          qglpRiskEvidencePass: !isQglpRiskAnomaly,
          qglpLeverageEvidencePass: !isLeverageAnomaly,
          businessModelRoutingPass: !isUnknownMisrouted,
        },
      };
    }

    fs.writeFileSync(outputPath, JSON.stringify(captureRecord, null, 2));
    console.log(`[CAL_020 Capture] Successfully wrote evaluation summary to: ${outputPath}`);
  } finally {
    disposableDb.close();
    await closeDB();

    if (fs.existsSync(disposableDbPath)) {
      fs.unlinkSync(disposableDbPath);
      console.log(`[CAL_020 Capture] Removed disposable DB copy.`);
    }

    const afterSha = getFileSha256(prodDbPath);
    console.log(`[CAL_020 Capture] After SHA256: ${afterSha}`);
    captureRecord.afterProductionDbSha256 = afterSha;
    captureRecord.zeroProductionWritesVerified = (beforeSha === afterSha);
    fs.writeFileSync(outputPath, JSON.stringify(captureRecord, null, 2));
    console.log(`[CAL_020 Capture] Zero production writes verified: ${beforeSha === afterSha}`);
  }
}

main().catch(err => {
  console.error('[CAL_020 Capture] Fatal error:', err);
  process.exit(1);
});
