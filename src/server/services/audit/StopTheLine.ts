/**
 * src/server/services/audit/StopTheLine.ts
 *
 * WealthOS v6.7.2 Stop-The-Line Enforcement Protocol.
 *
 * Any fundamental invariant breach immediately halts execution, preserves evidence,
 * and blocks research promotion. Zero automated patching or silent pass-through permitted.
 */

export interface StopTrigger {
  code:
    | 'PIT_FAILURE'
    | 'CURRENT_UNIVERSE_CONTAMINATION'
    | 'LEDGER_MISMATCH'
    | 'INDEPENDENT_REPLAY_MISMATCH'
    | 'IDENTITY_MISMATCH'
    | 'LOOKAHEAD_VIOLATION'
    | 'MISSING_PROVENANCE'
    | 'RISK_ACCOUNTING_MISMATCH'
    | 'PRODUCER_AUDITOR_DEPENDENCY'
    | 'GRAPH_NONDETERMINISM'
    | 'CONFIGURATION_MUTATION'
    | 'DATA_SOURCE_SUBSTITUTION'
    | 'FROZEN_CONTROL_MISMATCH'
    | 'LIVE_GATE_BYPASS'
    | 'HARDCODED_EVIDENCE_DETECTED'
    | 'UNEXPLAINED_METRIC_DISCREPANCY'
    | 'PRODUCTION_PROMOTION_UNAUTHORIZED';
  severity: 'FATAL_HALT';
  detectedAt: string;
  sourceModule: string;
  details: string;
}

export class StopTheLineError extends Error {
  public triggers: StopTrigger[];

  constructor(triggers: StopTrigger[]) {
    super(`STOP_THE_LINE:${triggers.map(t => t.code).join(',')}`);
    this.name = 'StopTheLineError';
    this.triggers = triggers;
  }
}

export function assertNoStopTheLine(failures: StopTrigger[]): void {
  if (failures.length > 0) {
    throw new StopTheLineError(failures);
  }
}

export class StopTheLineLedger {
  private static instance: StopTheLineLedger;
  private triggers: StopTrigger[] = [];

  private constructor() {}

  public static getInstance(): StopTheLineLedger {
    if (!StopTheLineLedger.instance) {
      StopTheLineLedger.instance = new StopTheLineLedger();
    }
    return StopTheLineLedger.instance;
  }

  public recordTrigger(trigger: StopTrigger): void {
    this.triggers.push(trigger);
  }

  public getTriggers(): StopTrigger[] {
    return [...this.triggers];
  }

  public hasTriggers(): boolean {
    return this.triggers.length > 0;
  }

  public clear(): void {
    this.triggers = [];
  }
}
