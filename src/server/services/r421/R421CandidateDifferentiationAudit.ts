export interface PairwiseJaccardSimilarity {
  experimentA: string;
  experimentB: string;
  retainedA: number;
  retainedB: number;
  intersectionCount: number;
  unionCount: number;
  jaccardSimilarity: number;
  isIdentical: boolean;
}

export interface CandidateDifferentiationAuditSummary {
  timestamp: string;
  status: 'DIFFERENTIATED' | 'COLLAPSE_DETECTED';
  totalExperiments: number;
  totalPairwiseComparisons: number;
  identicalPairsCount: number;
  candidateCollapseFlag: boolean;
  pairwiseResults: PairwiseJaccardSimilarity[];
}

export class R421CandidateDifferentiationAudit {
  public static auditDifferentiation(
    experimentReplays: Record<string, any[]>
  ): CandidateDifferentiationAuditSummary {
    const expIds = Object.keys(experimentReplays);
    const pairwiseResults: PairwiseJaccardSimilarity[] = [];
    let identicalCount = 0;

    for (let i = 0; i < expIds.length; i++) {
      for (let j = i + 1; j < expIds.length; j++) {
        const idA = expIds[i];
        const idB = expIds[j];

        const setA = new Set(experimentReplays[idA].filter(t => t.isRetained).map(t => t.tradeId));
        const setB = new Set(experimentReplays[idB].filter(t => t.isRetained).map(t => t.tradeId));

        let intersection = 0;
        for (const tid of setA) {
          if (setB.has(tid)) intersection++;
        }
        const union = setA.size + setB.size - intersection;
        const jaccard = union === 0 ? 1.0 : Math.round((intersection / union) * 10000) / 10000;
        const isIdentical = jaccard === 1.0 && setA.size > 0 && idA.substring(0, 10) !== idB.substring(0, 10);

        if (isIdentical) {
          identicalCount++;
        }

        pairwiseResults.push({
          experimentA: idA,
          experimentB: idB,
          retainedA: setA.size,
          retainedB: setB.size,
          intersectionCount: intersection,
          unionCount: union,
          jaccardSimilarity: jaccard,
          isIdentical
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      status: identicalCount === 0 ? 'DIFFERENTIATED' : 'COLLAPSE_DETECTED',
      totalExperiments: expIds.length,
      totalPairwiseComparisons: pairwiseResults.length,
      identicalPairsCount: identicalCount,
      candidateCollapseFlag: identicalCount > 0,
      pairwiseResults
    };
  }
}
