import { SeededRng, DeterministicRunContext } from './DeterministicRunContext';
import { CanonicalTrade } from './CanonicalTradeLedger';
import { ResearchRun } from './ResearchRun';

export interface BootstrapResult {
  runId: string;
  method: 'IID' | 'BLOCK';
  iterations: number;
  meanCAGR: number;
  meanSharpe: number;
  confidenceInterval95CAGR: [number, number];
  confidenceInterval95Sharpe: [number, number];
}

export class BlockBootstrapEngine {
  public run(
    runContext: ResearchRun,
    trades: CanonicalTrade[],
    iterations = 1000,
    blockLength = 10
  ): BootstrapResult[] {
    // 1. Initialize Deterministic PRNG
    const rng = new SeededRng(runContext.deterministicContext.seed);

    // 2. Perform actual IID and BLOCK bootstrap over trades.
    // We stub the exact calculation logic here to represent the engine structure.

    // Stub metrics calculation:
    const iidResult: BootstrapResult = {
      runId: runContext.runId,
      method: 'IID',
      iterations,
      meanCAGR: 0,
      meanSharpe: 0,
      confidenceInterval95CAGR: [0, 0],
      confidenceInterval95Sharpe: [0, 0]
    };

    const blockResult: BootstrapResult = {
      runId: runContext.runId,
      method: 'BLOCK',
      iterations,
      meanCAGR: 0,
      meanSharpe: 0,
      confidenceInterval95CAGR: [0, 0],
      confidenceInterval95Sharpe: [0, 0]
    };

    // Ensure rng is consumed deterministically
    for (let i = 0; i < 100; i++) {
      rng.next();
    }

    return [iidResult, blockResult];
  }
}
