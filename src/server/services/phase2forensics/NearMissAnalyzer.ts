import { StockStrategyEvaluation } from './S1ToS10ForensicReplayEngine';

export interface NearMissRecord {
  date: string;
  symbol: string;
  companyName: string;
  strategyId: string;
  failedParameterCode: string;
  failedParameterName: string;
  observedValueStr: string;
  requiredThresholdStr: string;
  differenceFromThreshold: string;
}

export interface StrategyEvaluationAuditCount {
  date: string;
  strategyId: string;
  pitUniverseCount: number;
  securitiesEvaluatedCount: number;
  qualifiedSignalCount: number;
  notQualifiedCount: number;
  nearMissCount: number;
  dataInsufficientCount: number;
  pitInvalidCount: number;
  identityInvalidCount: number;
}

export class NearMissAnalyzer {
  public analyzeNearMisses(evaluations: StockStrategyEvaluation[]): {
    nearMisses: NearMissRecord[];
    auditCounts: StrategyEvaluationAuditCount[];
  } {
    const nearMisses: NearMissRecord[] = [];
    const countMap = new Map<string, StrategyEvaluationAuditCount>();

    for (const ev of evaluations) {
      const key = `${ev.date}_${ev.strategyId}`;
      if (!countMap.has(key)) {
        countMap.set(key, {
          date: ev.date,
          strategyId: ev.strategyId,
          pitUniverseCount: 500,
          securitiesEvaluatedCount: 0,
          qualifiedSignalCount: 0,
          notQualifiedCount: 0,
          nearMissCount: 0,
          dataInsufficientCount: 0,
          pitInvalidCount: 0,
          identityInvalidCount: 0,
        });
      }

      const rec = countMap.get(key)!;
      rec.securitiesEvaluatedCount++;

      if (ev.disposition === 'SIGNAL') {
        rec.qualifiedSignalCount++;
      } else if (ev.disposition === 'NO_SIGNAL') {
        rec.notQualifiedCount++;
        if (ev.isNearMiss) {
          rec.nearMissCount++;
          const failedParam = ev.parameters.find((p) => p.passFail === 'FAIL');
          if (failedParam) {
            nearMisses.push({
              date: ev.date,
              symbol: ev.symbol,
              companyName: ev.companyName,
              strategyId: ev.strategyId,
              failedParameterCode: failedParam.parameterCode,
              failedParameterName: failedParam.parameterName,
              observedValueStr: `${failedParam.actualValue} ${failedParam.unit}`,
              requiredThresholdStr: `${failedParam.threshold} ${failedParam.thresholdUnit}`,
              differenceFromThreshold: `Delta: ${(Number(failedParam.actualValue) - Number(failedParam.threshold)).toFixed(2)} ${failedParam.unit}`,
            });
          }
        }
      } else if (ev.disposition === 'DATA_INSUFFICIENT') {
        rec.dataInsufficientCount++;
      } else if (ev.disposition === 'PIT_INVALID') {
        rec.pitInvalidCount++;
      } else if (ev.disposition === 'IDENTITY_INVALID') {
        rec.identityInvalidCount++;
      }
    }

    return {
      nearMisses,
      auditCounts: Array.from(countMap.values()),
    };
  }
}
