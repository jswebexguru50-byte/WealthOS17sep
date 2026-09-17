/**
 * ShareholdingPatternDiff.ts (Tier 0: Zero LLM / Deterministic)
 * Compares current vs previous quarter shareholding distributions to compute pledge & institutional flows
 */
export interface ShareholdingSnapshot {
  period: string; // e.g. "Dec 2024"
  promoterHoldingPct: number;
  promoterPledgePct: number;
  fiiHoldingPct: number;
  diiHoldingPct: number;
  publicHoldingPct: number;
}

export interface ShareholdingDiffResult {
  promoterPledgePct: number;
  promoterPledgeYoYDelta: number;
  promoterHoldingChangeQoQ: number;
  fiiHoldingChangeQoQ: number;
  diiHoldingChangeQoQ: number;
  isPledgeRiskElevated: boolean;
  governanceSummary: string;
}

export class ShareholdingPatternDiff {
  public static calculateDiff(
    current: ShareholdingSnapshot,
    previous?: ShareholdingSnapshot
  ): ShareholdingDiffResult {
    const pledgeCurrent = current.promoterPledgePct || 0;
    const pledgePrev = previous ? previous.promoterPledgePct || 0 : pledgeCurrent;
    const pledgeDelta = Number((pledgeCurrent - pledgePrev).toFixed(2));

    const promChange = previous ? Number((current.promoterHoldingPct - previous.promoterHoldingPct).toFixed(2)) : 0;
    const fiiChange = previous ? Number((current.fiiHoldingPct - previous.fiiHoldingPct).toFixed(2)) : 0;
    const diiChange = previous ? Number((current.diiHoldingPct - previous.diiHoldingPct).toFixed(2)) : 0;

    // Red flag if promoter pledge > 15% or pledge increased by >= 2% QoQ
    const isPledgeRiskElevated = pledgeCurrent > 15 || pledgeDelta >= 2.0;

    const summaryParts: string[] = [];
    if (pledgeCurrent === 0) {
      summaryParts.push('Zero promoter encumbrance/pledge (AAA Governance).');
    } else {
      summaryParts.push(`Promoter Pledge: ${pledgeCurrent}% (${pledgeDelta >= 0 ? '+' : ''}${pledgeDelta}% QoQ).`);
    }

    if (fiiChange !== 0) {
      summaryParts.push(`FII: ${fiiChange > 0 ? '+' : ''}${fiiChange}% QoQ.`);
    }
    if (diiChange !== 0) {
      summaryParts.push(`DII: ${diiChange > 0 ? '+' : ''}${diiChange}% QoQ.`);
    }

    return {
      promoterPledgePct: pledgeCurrent,
      promoterPledgeYoYDelta: pledgeDelta,
      promoterHoldingChangeQoQ: promChange,
      fiiHoldingChangeQoQ: fiiChange,
      diiHoldingChangeQoQ: diiChange,
      isPledgeRiskElevated,
      governanceSummary: summaryParts.join(' ')
    };
  }
}
