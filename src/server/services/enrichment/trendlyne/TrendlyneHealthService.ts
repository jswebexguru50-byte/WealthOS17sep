/**
 * TrendlyneHealthService.ts — Enrichment Status & Health Endpoint Provider
 * WealthOS V2 Mandatory Amendment
 *
 * Implements GET /api/v2/enrichment/status
 */

import { TrendlyneEnrichmentDaemon } from './TrendlyneEnrichmentDaemon.js';
import { TrendlyneQuotaManager } from './TrendlyneQuotaManager.js';
import { TrendlyneMcpClient } from './TrendlyneMcpClient.js';
import { getDB, dbGet } from '../../../database.js';

export interface EnrichmentStatusResponse {
  status: 'ONLINE' | 'STANDBY' | 'DISABLED';
  daemon: {
    isRunning: boolean;
    isLeaseHeld: boolean;
    enabled: boolean;
  };
  quota: {
    dailyUsed: number;
    dailyLimit: number;
    monthlyUsed: number;
    monthlyLimit: number;
    dailyReserve: number;
    remainingDailySafeCalls: number;
  };
  mcpClient: {
    maxScripsPerCall: number;
    maxMetricsPerCall: number;
    maxCellsPerCall: number;
  };
  queue: {
    pendingJobs: number;
    runningJobs: number;
    completedJobs: number;
  };
  timestamp: string;
}

export class TrendlyneHealthService {
  private static instance: TrendlyneHealthService;

  private constructor() {}

  public static getInstance(): TrendlyneHealthService {
    if (!TrendlyneHealthService.instance) {
      TrendlyneHealthService.instance = new TrendlyneHealthService();
    }
    return TrendlyneHealthService.instance;
  }

  public async getEnrichmentStatus(): Promise<EnrichmentStatusResponse> {
    const daemon = TrendlyneEnrichmentDaemon.getInstance();
    const quotaMgr = TrendlyneQuotaManager.getInstance();
    const client = TrendlyneMcpClient.getInstance();
    const quota = quotaMgr.getQuotaState();

    const db = getDB();
    let pendingJobs = 0;
    let runningJobs = 0;
    let completedJobs = 0;

    if (db) {
      try {
        const pRow = await dbGet<any>(db, `SELECT COUNT(*) as c FROM trendlyne_enrichment_jobs WHERE state = 'PENDING'`);
        const rRow = await dbGet<any>(db, `SELECT COUNT(*) as c FROM trendlyne_enrichment_jobs WHERE state = 'RUNNING'`);
        const cRow = await dbGet<any>(db, `SELECT COUNT(*) as c FROM trendlyne_enrichment_jobs WHERE state = 'COMPLETE'`);
        pendingJobs = pRow?.c || 0;
        runningJobs = rRow?.c || 0;
        completedJobs = cRow?.c || 0;
      } catch {
        // Fallback
      }
    }

    const safeDaily = Math.max(0, quota.dailyLimit - quota.dailyReserve - quota.dailyUsed);

    return {
      status: daemon.isEnabled() ? 'ONLINE' : 'STANDBY',
      daemon: {
        isRunning: daemon.getStatus().isRunning,
        isLeaseHeld: daemon.getStatus().isLeaseHeld,
        enabled: daemon.isEnabled(),
      },
      quota: {
        dailyUsed: quota.dailyUsed,
        dailyLimit: quota.dailyLimit,
        monthlyUsed: quota.monthlyUsed,
        monthlyLimit: quota.monthlyLimit,
        dailyReserve: quota.dailyReserve,
        remainingDailySafeCalls: safeDaily,
      },
      mcpClient: {
        maxScripsPerCall: client.getMaxScrips(),
        maxMetricsPerCall: client.getMaxMetrics(),
        maxCellsPerCall: client.getMaxScrips() * client.getMaxMetrics(),
      },
      queue: {
        pendingJobs,
        runningJobs,
        completedJobs,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
