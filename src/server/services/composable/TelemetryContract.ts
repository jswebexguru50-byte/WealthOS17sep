/**
 * WealthOS v6.6 - Telemetry Contract & Collector
 * Agent E Deliverable
 * 
 * SPEC MANDATE:
 * Collects per-engine operational metrics:
 *   - Signals generated, signals rejected, data gaps, PIT failures
 *   - Pass/reject percentages, execution latencies
 *   - Risk/capital allocations, turnover, slippage
 * Persists append-only logs in data/v66/telemetry.jsonl.
 */

import fs from 'fs';
import path from 'path';

export interface EngineTelemetryRecord {
  engineId: string;
  runId: string;
  decisionDate: string;
  signalsGenerated: number;
  signalsRejected: number;
  dataGapsEncountered: number;
  pitViolations: number;
  passPct: number;
  rejectPct: number;
  latencyMs: number;
  recordedAt: string;
}

export interface PortfolioTelemetryRecord {
  runId: string;
  decisionDate: string;
  capitalAllocated: number;
  riskAllocated: number;
  capitalBlocked: number;
  riskBlocked: number;
  turnoverINR: number;
  estimatedSlippageINR: number;
  recordedAt: string;
}

export class TelemetryCollector {
  private static instance: TelemetryCollector;
  private readonly telemetryPath: string;

  private constructor() {
    const root = process.cwd();
    this.telemetryPath = path.join(root, 'data', 'v66', 'telemetry.jsonl');
    this.ensureDir();
  }

  public static getInstance(): TelemetryCollector {
    if (!TelemetryCollector.instance) {
      TelemetryCollector.instance = new TelemetryCollector();
    }
    return TelemetryCollector.instance;
  }

  private ensureDir(): void {
    const dir = path.dirname(this.telemetryPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public recordEngineTelemetry(data: Omit<EngineTelemetryRecord, 'recordedAt'>): EngineTelemetryRecord {
    const record: EngineTelemetryRecord = {
      ...data,
      recordedAt: new Date().toISOString()
    };
    fs.appendFileSync(this.telemetryPath, JSON.stringify({ type: 'ENGINE', ...record }) + '\n', 'utf8');
    return record;
  }

  public recordPortfolioTelemetry(data: Omit<PortfolioTelemetryRecord, 'recordedAt'>): PortfolioTelemetryRecord {
    const record: PortfolioTelemetryRecord = {
      ...data,
      recordedAt: new Date().toISOString()
    };
    fs.appendFileSync(this.telemetryPath, JSON.stringify({ type: 'PORTFOLIO', ...record }) + '\n', 'utf8');
    return record;
  }
}
