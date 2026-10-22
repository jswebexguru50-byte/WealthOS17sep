import { ReconstructedTrade } from './R421LedgerReconstructor';

export interface DailyExposureRecord {
  date: string;
  activePositionsCount: number;
  totalCapitalExposedINR: number;
}

export interface ConcurrencyAuditSummary {
  timestamp: string;
  maxConcurrentPositions: number;
  medianConcurrentPositions: number;
  avgConcurrentPositions: number;
  maxCapitalExposedINR: number;
  capitalConstraintMode: 'UNCONSTRAINED_RESEARCH_REPLAY';
  exposureRecords: DailyExposureRecord[];
}

export class R421ConcurrencyAudit {
  public static auditConcurrency(trades: ReconstructedTrade[]): ConcurrencyAuditSummary {
    const dailyMap: Record<string, { count: number; exposure: number }> = {};

    for (const t of trades) {
      const entryD = t.entryDate;
      const notional = t.entryPrice * t.quantity;
      if (!dailyMap[entryD]) dailyMap[entryD] = { count: 0, exposure: 0 };
      dailyMap[entryD].count++;
      dailyMap[entryD].exposure += notional;
    }

    const records: DailyExposureRecord[] = [];
    let maxConc = 0;
    let maxExp = 0;
    let sumConc = 0;

    for (const d of Object.keys(dailyMap).sort()) {
      const item = dailyMap[d];
      if (item.count > maxConc) maxConc = item.count;
      if (item.exposure > maxExp) maxExp = item.exposure;
      sumConc += item.count;
      records.push({ date: d, activePositionsCount: item.count, totalCapitalExposedINR: Math.round(item.exposure * 100) / 100 });
    }

    const nDates = records.length;
    const avgConc = nDates > 0 ? sumConc / nDates : 0;
    const countsSorted = records.map(r => r.activePositionsCount).sort((a, b) => a - b);
    const medianConc = nDates > 0 ? countsSorted[Math.floor(nDates / 2)] : 0;

    return {
      timestamp: new Date().toISOString(),
      maxConcurrentPositions: maxConc,
      medianConcurrentPositions: medianConc,
      avgConcurrentPositions: Math.round(avgConc * 100) / 100,
      maxCapitalExposedINR: Math.round(maxExp * 100) / 100,
      capitalConstraintMode: 'UNCONSTRAINED_RESEARCH_REPLAY',
      exposureRecords: records.slice(0, 50)
    };
  }
}
