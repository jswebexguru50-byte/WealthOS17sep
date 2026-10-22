/**
 * WealthOS v6.6 - Decision Trace
 * Agent E Deliverable
 * 
 * SPEC MANDATE:
 * Provides transparent, audit-grade explanation of every trading decision:
 * "Why was this stock rejected?"
 * Persists append-only logs in data/v66/decision_trace.jsonl.
 */

import fs from 'fs';
import path from 'path';
import { EngineRole } from './EngineCapability.js';
import { FinalDecisionAction } from './DecisionConflictResolver.js';

export interface DecisionTraceLayer {
  engineId: string;
  role: EngineRole;
  result: 'PASS' | 'REJECT' | 'DATA_GAP' | 'NOT_REACHED';
  evidenceId?: string;
  reason?: string;
}

export interface SecurityDecisionTrace {
  securityId: string;
  symbol: string;
  decisionDate: string;
  runId: string;
  layers: DecisionTraceLayer[];
  finalDecision: FinalDecisionAction;
  summaryReason: string;
  recordedAt: string;
}

export class DecisionTraceService {
  private static instance: DecisionTraceService;
  private readonly tracePath: string;

  private constructor() {
    const root = process.cwd();
    this.tracePath = path.join(root, 'data', 'v66', 'decision_trace.jsonl');
    this.ensureTraceDir();
  }

  public static getInstance(): DecisionTraceService {
    if (!DecisionTraceService.instance) {
      DecisionTraceService.instance = new DecisionTraceService();
    }
    return DecisionTraceService.instance;
  }

  private ensureTraceDir(): void {
    const dir = path.dirname(this.tracePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public recordTrace(trace: Omit<SecurityDecisionTrace, 'recordedAt'>): SecurityDecisionTrace {
    const fullTrace: SecurityDecisionTrace = {
      ...trace,
      recordedAt: new Date().toISOString()
    };
    fs.appendFileSync(this.tracePath, JSON.stringify(fullTrace) + '\n', 'utf8');
    return fullTrace;
  }
}
