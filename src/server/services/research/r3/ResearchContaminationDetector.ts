export interface ChronologyAuditRecord {
  configurationId: string;
  configurationCreatedAt: string;
  configurationModifiedAt: string;
  runStartedAt: string;
  oosStartedAt: string;
  oosCompletedAt?: string;
  resultImportedAt?: string;
}

export interface ContaminationAuditResult {
  passed: boolean;
  violations: string[];
  recordsAudited: number;
}

export class ResearchContaminationDetector {
  public static auditChronology(records: ChronologyAuditRecord[]): ContaminationAuditResult {
    const violations: string[] = [];

    for (const r of records) {
      const cfgCreated = new Date(r.configurationCreatedAt).getTime();
      const cfgModified = new Date(r.configurationModifiedAt).getTime();
      const oosStarted = new Date(r.oosStartedAt).getTime();

      if (cfgModified > oosStarted) {
        violations.push(`STOP_THE_LINE: Configuration ${r.configurationId} modified at ${r.configurationModifiedAt} AFTER OOS started at ${r.oosStartedAt}`);
      }

      if (cfgCreated > oosStarted) {
        violations.push(`STOP_THE_LINE: Configuration ${r.configurationId} created at ${r.configurationCreatedAt} AFTER OOS started at ${r.oosStartedAt}`);
      }

      if (r.resultImportedAt && r.oosCompletedAt) {
        const resImported = new Date(r.resultImportedAt).getTime();
        const oosCompleted = new Date(r.oosCompletedAt).getTime();
        if (resImported < oosCompleted) {
          violations.push(`STOP_THE_LINE: Results for ${r.configurationId} imported before OOS completed`);
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      recordsAudited: records.length
    };
  }
}
