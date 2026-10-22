/**
 * WealthOS v6.6 - Telemetry Collector
 * Agent E Deliverable
 * 
 * Collects, aggregates, and records engine execution telemetry to data/v66/telemetry.jsonl.
 */

import fs from 'fs';
import path from 'path';
import { EngineTelemetryRecord } from './TelemetryContract.js';

export class TelemetryCollector {
  private static instance: TelemetryCollector;
  private readonly logPath: string;
  private memoryLogs: EngineTelemetryRecord[] = [];

  private constructor() {
    this.logPath = path.join(process.cwd(), 'data', 'v66', 'telemetry.jsonl');
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public static getInstance(): TelemetryCollector {
    if (!TelemetryCollector.instance) {
      TelemetryCollector.instance = new TelemetryCollector();
    }
    return TelemetryCollector.instance;
  }

  public record(telemetry: EngineTelemetryRecord): void {
    this.memoryLogs.push(telemetry);
    fs.appendFileSync(this.logPath, JSON.stringify(telemetry) + '\n', 'utf8');
  }

  public getTelemetryForRun(runId: string): EngineTelemetryRecord[] {
    return this.memoryLogs.filter(t => t.runId === runId);
  }

  public clear(): void {
    this.memoryLogs = [];
  }
}
