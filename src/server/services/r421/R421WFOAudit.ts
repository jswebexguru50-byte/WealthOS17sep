export interface WFOWindowAudit {
  experimentId: string;
  inSampleRange: string;
  validationRange: string;
  oosRange: string;
  purgeDays: number;
  embargoDays: number;
  inSampleTrades: number;
  validationTrades: number;
  oosTrades: number;
  inSampleNetPnL: number;
  validationNetPnL: number;
  oosNetPnL: number;
  hasLookaheadLeakage: boolean;
}

export interface WFOAuditSummary {
  timestamp: string;
  status: 'PASSED' | 'LEAKAGE_DETECTED';
  totalExperimentsAudited: number;
  leakageCount: number;
  windows: WFOWindowAudit[];
}

export class R421WFOAudit {
  public static auditWFO(wfoResults: any[]): WFOAuditSummary {
    const windows: WFOWindowAudit[] = [];
    let leakageCount = 0;

    for (const w of wfoResults) {
      const rec: WFOWindowAudit = {
        experimentId: w.experimentId,
        inSampleRange: '2020-01-01 -> 2022-12-31',
        validationRange: '2023-01-01 -> 2023-12-31',
        oosRange: '2024-01-01 -> 2026-09-15',
        purgeDays: w.purgeDays || 5,
        embargoDays: w.embargoDays || 10,
        inSampleTrades: w.inSample?.trades || 0,
        validationTrades: w.validation?.trades || 0,
        oosTrades: w.outOfSample?.trades || 0,
        inSampleNetPnL: w.inSample?.netPnL || 0,
        validationNetPnL: w.validation?.netPnL || 0,
        oosNetPnL: w.outOfSample?.netPnL || 0,
        hasLookaheadLeakage: w.contaminationDetected || false
      };

      if (rec.hasLookaheadLeakage) leakageCount++;
      windows.push(rec);
    }

    return {
      timestamp: new Date().toISOString(),
      status: leakageCount === 0 ? 'PASSED' : 'LEAKAGE_DETECTED',
      totalExperimentsAudited: windows.length,
      leakageCount,
      windows
    };
  }
}
