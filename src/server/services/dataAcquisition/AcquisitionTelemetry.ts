import * as fs from 'fs';
import * as path from 'path';

export interface DaemonTelemetryMetrics {
  timestamp: string;
  daemonState: 'RUNNING' | 'PAUSED' | 'DRAINING' | 'STOPPED';
  uptimeSeconds: number;
  activeWorkersCount: number;
  queueDepth: number;
  completedTasksCount: number;
  failedTasksCount: number;
  retriedTasksCount: number;
  rateLimitHitsCount: number;
  recordsAcquiredTotal: number;
  coverageByDomain: Record<string, number>;
  sourceHealth: Record<string, { requestsCount: number; errorsCount: number; status: 'HEALTHY' | 'DEGRADED' | 'RATE_LIMITED' }>;
  productionPromotionAuthorization: boolean;
  liveTrading: boolean;
}

export class AcquisitionTelemetry {
  private telemetryPath: string;
  private startTime: number;

  constructor(customPath?: string) {
    this.telemetryPath = customPath || path.resolve('reports/data-acquisition/DAEMON_STATUS.json');
    fs.mkdirSync(path.dirname(this.telemetryPath), { recursive: true });
    this.startTime = Date.now();
  }

  public recordStatus(metrics: Omit<DaemonTelemetryMetrics, 'timestamp' | 'uptimeSeconds'>): void {
    const fullMetrics: DaemonTelemetryMetrics = {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      ...metrics
    };
    fs.writeFileSync(this.telemetryPath, JSON.stringify(fullMetrics, null, 2));
  }

  public getLatestStatus(): DaemonTelemetryMetrics | null {
    if (!fs.existsSync(this.telemetryPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.telemetryPath, 'utf-8'));
    } catch {
      return null;
    }
  }
}
