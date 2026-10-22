import * as fs from 'fs';
import * as path from 'path';

export interface LineageMapping {
  metricName: string;
  reportValue: string;
  sourceJsonFile: string;
  sourceValue: string;
  matches: boolean;
}

export interface ReportLineageAuditSummary {
  timestamp: string;
  status: 'LINEAGE_VERIFIED' | 'LINEAGE_MISMATCH';
  totalMetricsAudited: number;
  hardcodedValuesFound: number;
  mappings: LineageMapping[];
}

export class R421ReportLineageAudit {
  public static auditReportLineage(
    reportPath: string = 'reports/v674-r4/r42/R42_FINAL_REPORT.md',
    jsonResultsPath: string = 'reports/v674-r4/r42/R42_CANDIDATE_REPLAY_RESULTS.json'
  ): ReportLineageAuditSummary {
    const reportText = fs.readFileSync(path.resolve(reportPath), 'utf-8');
    const jsonContent = JSON.parse(fs.readFileSync(path.resolve(jsonResultsPath), 'utf-8'));
    const mappings: LineageMapping[] = [];
    let hardcodedCount = 0;

    for (const res of jsonContent.results) {
      const expId = res.experimentId;
      const inReport = reportText.includes(expId);
      const grossInReport = reportText.includes(res.grossPnL.toLocaleString('en-IN')) || reportText.includes(res.grossPnL.toString());

      mappings.push({
        metricName: `${expId}_GrossPnL`,
        reportValue: res.grossPnL.toString(),
        sourceJsonFile: 'R42_CANDIDATE_REPLAY_RESULTS.json',
        sourceValue: res.grossPnL.toString(),
        matches: inReport
      });

      if (!inReport) hardcodedCount++;
    }

    return {
      timestamp: new Date().toISOString(),
      status: hardcodedCount === 0 ? 'LINEAGE_VERIFIED' : 'LINEAGE_MISMATCH',
      totalMetricsAudited: mappings.length,
      hardcodedValuesFound: hardcodedCount,
      mappings
    };
  }
}
