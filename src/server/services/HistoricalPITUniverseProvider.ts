import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface PITMemberRecord {
  securityId: string;
  symbolAtTime: string;
  membershipStart: string;
  membershipEnd: string;
  sourceType: string;
}

export interface PITUniverseSnapshot {
  decisionDate: string;
  effectiveMembershipDate: string;
  constituentIds: string[];
  constituentSetHash: string;
  sourceVersion: string;
  historicalPITMembershipStatus: "OBSERVED" | "DATA_INSUFFICIENT";
  economicReplayAuthorization: boolean;
}

export class HistoricalPITUniverseProvider {
  private static instance: HistoricalPITUniverseProvider;
  private pitRecords: PITMemberRecord[] = [];

  private constructor() {
    this.loadRecords();
  }

  public static getInstance(): HistoricalPITUniverseProvider {
    if (!HistoricalPITUniverseProvider.instance) {
      HistoricalPITUniverseProvider.instance = new HistoricalPITUniverseProvider();
    }
    return HistoricalPITUniverseProvider.instance;
  }

  private loadRecords(): void {
    const v642Path = path.join(process.cwd(), 'data', 'v6.4', 'v642_historical_membership.jsonl');
    const v643Path1 = path.join(process.cwd(), 'data', 'v6.4', 'v643_historical_membership.jsonl');
    const v643Path2 = path.join(process.cwd(), 'data', 'v6.4.3', 'v643_historical_membership.jsonl');

    let lines: string[] = [];
    if (fs.existsSync(v642Path)) {
      lines = lines.concat(fs.readFileSync(v642Path, 'utf-8').trim().split('\n'));
    }
    if (fs.existsSync(v643Path1)) {
      lines = lines.concat(fs.readFileSync(v643Path1, 'utf-8').trim().split('\n'));
    }
    if (fs.existsSync(v643Path2)) {
      lines = lines.concat(fs.readFileSync(v643Path2, 'utf-8').trim().split('\n'));
    }

    this.pitRecords = lines
      .filter(l => l.trim().length > 0)
      .map(l => JSON.parse(l));
  }

  public getSnapshot(decisionDate: string): PITUniverseSnapshot {
    const activeSet = new Set<string>();
    for (const r of this.pitRecords) {
      if (r.membershipStart <= decisionDate && r.membershipEnd >= decisionDate) {
        activeSet.add(r.symbolAtTime);
      }
    }

    if (activeSet.size === 0) {
      // Permanent Kill Switch: Never fall back to current NIFTY 500
      return {
        decisionDate,
        effectiveMembershipDate: decisionDate,
        constituentIds: [],
        constituentSetHash: '0000000000000000000000000000000000000000000000000000000000000000',
        sourceVersion: 'v6.4.2_PIT_EXPANDED',
        historicalPITMembershipStatus: 'DATA_INSUFFICIENT',
        economicReplayAuthorization: false
      };
    }

    const constituentIds = Array.from(activeSet).sort();
    const hash = crypto.createHash('sha256').update(JSON.stringify(constituentIds)).digest('hex');

    return {
      decisionDate,
      effectiveMembershipDate: decisionDate,
      constituentIds,
      constituentSetHash: hash,
      sourceVersion: 'v6.4.2_PIT_EXPANDED',
      historicalPITMembershipStatus: 'OBSERVED',
      economicReplayAuthorization: true
    };
  }

  public verifySymbolInPIT(symbol: string, decisionDate: string): boolean {
    const snapshot = this.getSnapshot(decisionDate);
    return snapshot.constituentIds.includes(symbol);
  }
}
