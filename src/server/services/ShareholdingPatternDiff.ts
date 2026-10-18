/**
 * ShareholdingPatternDiff.ts (Tier 0: Zero LLM / Deterministic)
 * Compares current vs previous quarter shareholding distributions to compute pledge & institutional flows
 */
export interface ShareholdingSnapshot {
  period: string; // e.g. "Dec 2024"
  promoterHoldingPct: number;
  promoterPledgePct: number | null;
  fiiHoldingPct: number;
  diiHoldingPct: number;
  publicHoldingPct: number;
}

export interface ShareholdingDiffResult {
  promoterPledgePct: number | null;
  promoterPledgeYoYDelta: number | null;
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
    // Missing pledge data stays null (unknown); it is never treated as 0% / "AAA Governance".
    const pledgeCurrent: number | null = current.promoterPledgePct ?? null;
    const pledgePrev: number | null = previous ? (previous.promoterPledgePct ?? null) : pledgeCurrent;
    const pledgeDelta: number | null =
      pledgeCurrent !== null && pledgePrev !== null ? Number((pledgeCurrent - pledgePrev).toFixed(2)) : null;

    const promChange = previous ? Number((current.promoterHoldingPct - previous.promoterHoldingPct).toFixed(2)) : 0;
    const fiiChange = previous ? Number((current.fiiHoldingPct - previous.fiiHoldingPct).toFixed(2)) : 0;
    const diiChange = previous ? Number((current.diiHoldingPct - previous.diiHoldingPct).toFixed(2)) : 0;

    // Red flag if promoter pledge > 15% or pledge increased by >= 2% QoQ
    const isPledgeRiskElevated =
      (pledgeCurrent !== null && pledgeCurrent > 15) || (pledgeDelta !== null && pledgeDelta >= 2.0);

    const summaryParts: string[] = [];
    if (pledgeCurrent === null) {
      summaryParts.push('Promoter pledge data unavailable.');
    } else if (pledgeCurrent === 0) {
      summaryParts.push('Zero promoter encumbrance/pledge (AAA Governance).');
    } else if (pledgeDelta === null) {
      summaryParts.push(`Promoter Pledge: ${pledgeCurrent}% (QoQ change unavailable).`);
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
