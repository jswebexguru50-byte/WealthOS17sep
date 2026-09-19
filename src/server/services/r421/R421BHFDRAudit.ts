export interface BHFDRTestRecord {
  experimentId: string;
  candidateFamily: string;
  retainedN: number;
  deltaNetPnL: number;
  deltaR: number;
  tStatistic: number;
  rawPValue: number;
  bhRank: number;
  bhThreshold: number;
  isBhSignificant: boolean;
}

export interface BHFDRAuditSummary {
  timestamp: string;
  status: 'AUDITED';
  totalHypotheses: number;
  qFdr: number;
  significantCount: number;
  tests: BHFDRTestRecord[];
}

export class R421BHFDRAudit {
  public static auditBHFDR(statResults: any[]): BHFDRAuditSummary {
    const sorted = [...statResults].sort((a, b) => a.rawPValue - b.rawPValue);
    const m = sorted.length;
    const qFdr = 0.05;
    let sigCount = 0;
    const tests: BHFDRTestRecord[] = [];

    for (let i = 0; i < m; i++) {
      const rank = i + 1;
      const threshold = Math.round(((rank / m) * qFdr) * 10000) / 10000;
      const isSig = sorted[i].rawPValue <= threshold && sorted[i].deltaNetPnL > 0;
      if (isSig) sigCount++;

      tests.push({
        experimentId: sorted[i].experimentId,
        candidateFamily: sorted[i].candidateFamily,
        retainedN: sorted[i].retainedN,
        deltaNetPnL: sorted[i].deltaNetPnL,
        deltaR: sorted[i].deltaR,
        tStatistic: sorted[i].tStatistic,
        rawPValue: sorted[i].rawPValue,
        bhRank: rank,
        bhThreshold: threshold,
        isBhSignificant: isSig
      });
    }

    return {
      timestamp: new Date().toISOString(),
      status: 'AUDITED',
      totalHypotheses: m,
      qFdr,
      significantCount: sigCount,
      tests
    };
  }
}
