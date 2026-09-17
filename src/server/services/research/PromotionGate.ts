import type { ResearchMetrics } from "./types";

export type GateResult = "PROMOTE" | "RETAIN AS RISK CONTROL" | "REJECT/REVISE";

export interface GateInput {
  metrics:ResearchMetrics;
  bootstrap:{pPositive:number;pAbove020:number;lower:number};
  sampleMin?:number;
  maxDrawdownPct?:number;
  calmarMin?:number;
  regimeRobust?:boolean;
  twoXSlippageStable?:boolean;
}

export function evaluateGate(x: GateInput): GateResult {
  const n = x.sampleMin ?? 150;
  const dd = x.maxDrawdownPct ?? 20;
  const calmar = x.calmarMin ?? 1;

  if (x.metrics.trades < n) return "REJECT/REVISE";

  // Tier 1: Full Promotion
  if (
    x.metrics.expectancyR >= 0.20 &&
    x.metrics.profitFactor >= 1.40 &&
    x.metrics.maxDrawdownPct <= dd &&
    x.metrics.calmar >= calmar &&
    x.bootstrap.pPositive >= 0.85
  ) {
    if (!x.regimeRobust || !x.twoXSlippageStable) {
      return "RETAIN AS RISK CONTROL";
    }
    return "PROMOTE";
  }

  // Tier 2: Capital Protection / Tail Risk Reduction
  if (
    x.metrics.maxDrawdownPct <= dd &&
    (x.regimeRobust || x.twoXSlippageStable) &&
    x.metrics.expectancyR >= 0
  ) {
    return "RETAIN AS RISK CONTROL";
  }

  return "REJECT/REVISE";
}
