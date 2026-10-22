import type { ResearchSignal, ResearchBar } from "./types";

export interface OracleResult {
  theoreticalTrades:number;
  oracleNetRMultiple:number;
  selectionEfficiency:number;
  note:string;
}

/**
 * Diagnostic upper bound only. It may inspect the complete realized path for each
 * candidate to quantify opportunity loss. It MUST NOT be used as a tradable strategy
 * or compared as if it were an implementable portfolio.
 */
export function evaluateRiskOracle(signals:ResearchSignal[], bars:ResearchBar[]):OracleResult {
  const bySymbol=new Map<string,ResearchBar[]>();
  for(const b of bars) (bySymbol.get(b.symbol)??(bySymbol.set(b.symbol,[]),bySymbol.get(b.symbol)!)).push(b);
  let total=0, trades=0;
  for(const s of signals){
    const path=(bySymbol.get(s.symbol)||[]).filter(b=>b.timestamp>=s.timestamp).sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
    if(!path.length) continue;
    let best=0;
    for(const b of path.slice(0,20)){
      const r=Math.max(0,(b.high-s.entry)/Math.max(Math.abs(s.entry-s.stop),1e-9));
      best=Math.max(best,r);
    }
    total+=best; trades++;
  }
  return {
    theoreticalTrades:trades,
    oracleNetRMultiple:total,
    selectionEfficiency:trades?total/trades:0,
    note:"Upper-bound diagnostic only; uses realized future path and is never an executable arm."
  };
}
