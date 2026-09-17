import type { WalkForwardWindow, ResearchSignal, ResearchBar, ExperimentArm } from "./types";
import { ExecutionSimulator } from "./ExecutionSimulator";
import { calculateMetrics, bootstrapExpectancy } from "./StatisticsEngine";

export interface WalkForwardConfig {
  trainMonths:number;
  oosMonths:number;
  windows:number;
  initialCapital:number;
  execution:any;
}

export interface WalkForwardResult {
  arm:ExperimentArm;
  windows: Array<{
    window:WalkForwardWindow;
    metrics:ReturnType<typeof calculateMetrics>;
    bootstrap:ReturnType<typeof bootstrapExpectancy>;
  }>;
}

function addMonths(s:string,n:number) {
  const d=new Date(`${s}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth()+n);
  return d.toISOString().slice(0,10);
}

export class WalkForwardResearchEngine {
  constructor(private readonly cfg:WalkForwardConfig, private readonly runId:string) {}

  buildWindows(start:string):WalkForwardWindow[] {
    const out:WalkForwardWindow[]=[];
    for(let i=0;i<this.cfg.windows;i++){
      const trainStart=addMonths(start,i*this.cfg.oosMonths);
      const trainEnd=addMonths(trainStart,this.cfg.trainMonths);
      const oosStart=trainEnd;
      const oosEnd=addMonths(oosStart,this.cfg.oosMonths);
      out.push({trainStart,trainEnd,oosStart,oosEnd});
    }
    return out;
  }

  run(
    arm:ExperimentArm,
    signals:ResearchSignal[],
    bars:ResearchBar[],
    start:string
  ):WalkForwardResult {
    const windows=this.buildWindows(start);
    return {
      arm,
      windows:windows.map((w,i)=>{
        const oosSignals=signals.filter(s=>s.timestamp>=w.oosStart && s.timestamp<w.oosEnd);
        const oosBars=bars.filter(b=>b.timestamp>=w.oosStart && b.timestamp<w.oosEnd);
        const sim=new ExecutionSimulator(this.cfg.execution,this.runId+`-W${i}`,"frozen");
        const result=sim.run(oosSignals,oosBars,arm);
        const metrics=calculateMetrics(result.trades);
        return {window:w,metrics,bootstrap:bootstrapExpectancy(result.trades.map(t=>t.netRMultiple??0))};
      })
    };
  }
}
