/**
 * TrendlyneBatchPlanner.ts — Constrained Two-Dimensional Bin-Packing Planner
 * WealthOS V2 Mandatory Amendment — Trendlyne MCP Capacity Utilization
 *
 * Implements:
 * - 500-cell envelope: 10 scrips × 50 useful metrics = 500 cells per MCP call.
 * - Queue coalescing pass before every call.
 * - Dense 50-metric transport packs (analytical modules ignored for transport).
 * - Archetype-aware pack filling: (e.g. 27 sector + 23 universal = 50).
 * - Substitution for known local facts: replaces cached facts with new useful metrics to preserve 50.
 * - Restart idempotency: skip already completed batches.
 * - Call efficiency recording and reporting to reports/data/trendlyne/CALL_EFFICIENCY.json.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  TrendlyneMetricDefinition,
  TrendlyneCallEfficiency,
  TrendlyneCallEfficiencyReport,
  PartialCallReason,
} from './TrendlyneContracts.js';
import { TrendlyneMetricCatalog } from './TrendlyneMetricCatalog.js';
import { TrendlyneCoverageStore } from './TrendlyneCoverageStore.js';

export interface ScripCandidate {
  securityId: string;
  symbol: string;
  archetype?: string;
  priority?: 'P0' | 'P1' | 'P2';
}

export interface QueuedWorkItem {
  scrip: ScripCandidate;
  neededMetricIds?: string[];
}

export interface PlannedBatchCall {
  callId: string;
  batchHash: string;
  scripBatchHash: string;
  packHash: string;
  scrips: ScripCandidate[];
  metricIds: string[];
  requestedScrips: number;
  requestedMetrics: number;
  requestedCells: number;
  maxCells: number;
  requestUtilizationPct: number;
  partialCallReason?: PartialCallReason;
  isIdempotentSkip?: boolean;
}

export interface PlannerOptions {
  existingCanonicalFactKeys?: Set<string>; // 'symbol:metricId'
  archetypeFilter?: string;
  enforceFullPacking?: boolean;
  customMaxMetrics?: number;
  customMaxScrips?: number;
}

export class TrendlyneBatchPlanner {
  public static readonly DEFAULT_SCRIP_CAPACITY = 10;
  public static readonly DEFAULT_METRIC_CAPACITY = 50;

  private readonly catalog: TrendlyneMetricCatalog;
  private readonly coverageStore: TrendlyneCoverageStore;
  private readonly callHistory: TrendlyneCallEfficiency[] = [];
  public readonly scripCapacity: number;
  public readonly metricCapacity: number;
  public readonly maxCells: number;

  constructor(
    catalog = TrendlyneMetricCatalog.getInstance(),
    coverageStore = TrendlyneCoverageStore.getInstance(),
    scripCapacity = Number(process.env.TRENDLYNE_MAX_SCRIPS_PER_CALL) || TrendlyneBatchPlanner.DEFAULT_SCRIP_CAPACITY,
    metricCapacity = Number(process.env.TRENDLYNE_MAX_METRICS_PER_CALL) || TrendlyneBatchPlanner.DEFAULT_METRIC_CAPACITY
  ) {
    this.catalog = catalog;
    this.coverageStore = coverageStore;
    this.scripCapacity = scripCapacity;
    this.metricCapacity = metricCapacity;
    this.maxCells = this.scripCapacity * this.metricCapacity;
  }

  /**
   * Plans batches across two dimensions: SCRIP_CAPACITY (10) × METRIC_CAPACITY (50)
   */
  public planBatches(
    queue: QueuedWorkItem[],
    options: PlannerOptions = {}
  ): PlannedBatchCall[] {
    const plannedCalls: PlannedBatchCall[] = [];
    if (!queue || queue.length === 0) return plannedCalls;

    const existingFacts = options.existingCanonicalFactKeys || new Set<string>();
    const effectiveScripCap = options.customMaxScrips || this.scripCapacity;
    const effectiveMetricCap = options.customMaxMetrics || this.metricCapacity;
    const maxCells = effectiveScripCap * effectiveMetricCap;

    // 1. Queue Coalescing Pass: Deduplicate and aggregate scrips
    const scripMap = new Map<string, ScripCandidate>();
    for (const item of queue) {
      if (!scripMap.has(item.scrip.securityId)) {
        scripMap.set(item.scrip.securityId, item.scrip);
      }
    }
    const uniqueScrips = Array.from(scripMap.values());

    // 2. Chunk scrips into batches of up to SCRIP_CAPACITY (10)
    const scripBatches: ScripCandidate[][] = [];
    for (let i = 0; i < uniqueScrips.length; i += effectiveScripCap) {
      scripBatches.push(uniqueScrips.slice(i, i + effectiveScripCap));
    }

    // 3. For each scrip batch, build dense 50-metric packs
    for (const scrips of scripBatches) {
      const sortedSecurityIds = scrips.map((s) => s.securityId).sort();
      const scripBatchHash = crypto.createHash('sha256').update(sortedSecurityIds.join('|')).digest('hex');

      // Check if all scrips in this batch share a common archetype (e.g. all INDUSTRIAL or all BANK)
      const firstArchetype = scrips[0]?.archetype;
      const isHomogeneousArchetype =
        firstArchetype &&
        firstArchetype !== 'UNKNOWN' &&
        scrips.every((s) => s.archetype === firstArchetype);

      // Determine eligible metrics for this batch
      let eligibleMetrics = isHomogeneousArchetype
        ? this.catalog.getRankedUsefulMetrics(firstArchetype)
        : this.catalog.getRankedUsefulMetrics('ALL');

      // Filter out metrics deemed not applicable via learned coverage
      eligibleMetrics = eligibleMetrics.filter((m) => {
        if (!isHomogeneousArchetype) return true;
        return this.coverageStore.isApplicable(m.providerMetricId, firstArchetype!);
      });

      // Filter out metrics already in canonical facts for all scrips in this batch
      // If a metric is already known for all scrips, exclude it and substitute with other useful metrics
      const neededMetrics: TrendlyneMetricDefinition[] = [];
      const reservePool: TrendlyneMetricDefinition[] = [];

      for (const m of eligibleMetrics) {
        const isCoveredForBatch = scrips.every((s) => existingFacts.has(`${s.symbol}:${m.providerMetricId}`));
        if (!isCoveredForBatch) {
          neededMetrics.push(m);
        } else {
          reservePool.push(m);
        }
      }

      // If neededMetrics is empty, but we have reservePool, or vice versa, prepare list
      const candidateList = neededMetrics.length > 0 ? neededMetrics : reservePool;

      // Build packs of up to METRIC_CAPACITY (50)
      for (let mIdx = 0; mIdx < candidateList.length; mIdx += effectiveMetricCap) {
        let chunk = candidateList.slice(mIdx, mIdx + effectiveMetricCap);

        // If chunk < 50, attempt to fill spare capacity with reservePool or additional universal metrics
        if (chunk.length < effectiveMetricCap) {
          const selectedSet = new Set(chunk.map((c) => c.providerMetricId));
          const allUniversal = this.catalog.getRankedUsefulMetrics('ALL');

          for (const u of allUniversal) {
            if (chunk.length >= effectiveMetricCap) break;
            if (!selectedSet.has(u.providerMetricId)) {
              chunk.push(u);
              selectedSet.add(u.providerMetricId);
            }
          }
        }

        const metricIds = chunk.map((m) => m.providerMetricId);
        const sortedMetricIds = [...metricIds].sort();
        const packHash = crypto.createHash('sha256').update(sortedMetricIds.join('|')).digest('hex');

        // Master batch hash for restart idempotency: sha256(scripBatchHash + '|' + packHash)
        const batchHash = crypto.createHash('sha256').update(`${scripBatchHash}|${packHash}`).digest('hex');

        // Check restart idempotency
        const isCompleted = this.coverageStore.isBatchCompleted(batchHash);

        const requestedScrips = scrips.length;
        const requestedMetrics = metricIds.length;
        const requestedCells = requestedScrips * requestedMetrics;
        const requestUtilizationPct = Math.round((requestedCells / maxCells) * 1000) / 10;

        let partialCallReason: PartialCallReason | undefined = undefined;
        if (requestedCells < maxCells) {
          if (requestedScrips < effectiveScripCap) {
            partialCallReason = 'INSUFFICIENT_ELIGIBLE_SCRIPS';
          } else if (requestedMetrics < effectiveMetricCap) {
            partialCallReason = 'INSUFFICIENT_USEFUL_METRICS';
          }
        }

        const callId = `tl_call_${plannedCalls.length + 1}_${batchHash.substring(0, 8)}`;

        plannedCalls.push({
          callId,
          batchHash,
          scripBatchHash,
          packHash,
          scrips,
          metricIds,
          requestedScrips,
          requestedMetrics,
          requestedCells,
          maxCells,
          requestUtilizationPct,
          partialCallReason,
          isIdempotentSkip: isCompleted,
        });
      }
    }

    return plannedCalls;
  }

  /**
   * Records execution of a call and updates efficiency metrics.
   */
  public recordCallExecution(
    call: PlannedBatchCall,
    newUsefulCells: number,
    duplicateCells = 0,
    notApplicableCells = 0,
    missingReturnedCells = 0
  ): TrendlyneCallEfficiency {
    const usefulYieldPct =
      call.requestedCells > 0
        ? Math.round((newUsefulCells / call.requestedCells) * 1000) / 10
        : 0;

    const efficiency: TrendlyneCallEfficiency = {
      callId: call.callId,
      requestedScrips: call.requestedScrips,
      maxScrips: this.scripCapacity,
      requestedMetrics: call.requestedMetrics,
      maxMetrics: this.metricCapacity,
      requestedCells: call.requestedCells,
      maxCells: this.maxCells,
      newUsefulCells,
      duplicateCells,
      notApplicableCells,
      missingReturnedCells,
      requestUtilizationPct: call.requestUtilizationPct,
      usefulYieldPct,
      partialCallReason: call.partialCallReason,
      timestamp: new Date().toISOString(),
    };

    this.callHistory.push(efficiency);
    this.coverageStore.markBatchCompleted(
      call.callId,
      call.batchHash,
      call.requestedScrips,
      call.requestedMetrics
    );

    return efficiency;
  }

  /**
   * Generates and writes the master CALL_EFFICIENCY.json report
   */
  public generateCallEfficiencyReport(outputDir = path.resolve('reports', 'data', 'trendlyne')): TrendlyneCallEfficiencyReport {
    const totalCalls = this.callHistory.length;
    const totalRequestedCells = this.callHistory.reduce((acc, c) => acc + c.requestedCells, 0);
    const totalAvailableCells = totalCalls * this.maxCells;
    const totalUsefulNewCells = this.callHistory.reduce((acc, c) => acc + c.newUsefulCells, 0);

    const requestUtilizationPct =
      totalAvailableCells > 0
        ? Math.round((totalRequestedCells / totalAvailableCells) * 1000) / 10
        : 100;

    const usefulYieldPct =
      totalRequestedCells > 0
        ? Math.round((totalUsefulNewCells / totalRequestedCells) * 1000) / 10
        : 100;

    const totalDuplicateCells = this.callHistory.reduce((acc, c) => acc + c.duplicateCells, 0);
    const duplicateCellPct =
      totalRequestedCells > 0
        ? Math.round((totalDuplicateCells / totalRequestedCells) * 1000) / 10
        : 0;

    const totalNullCells = this.callHistory.reduce((acc, c) => acc + c.notApplicableCells + c.missingReturnedCells, 0);
    const nullReturnPct =
      totalRequestedCells > 0
        ? Math.round((totalNullCells / totalRequestedCells) * 1000) / 10
        : 0;

    const callsAt100PctCapacity = this.callHistory.filter((c) => c.requestUtilizationPct >= 100).length;
    const partialCalls = this.callHistory.filter((c) => c.requestUtilizationPct < 100).length;

    const reasonForEveryPartialCall: Record<string, PartialCallReason> = {};
    for (const c of this.callHistory) {
      if (c.partialCallReason) {
        reasonForEveryPartialCall[c.callId] = c.partialCallReason;
      }
    }

    const report: TrendlyneCallEfficiencyReport = {
      generatedAt: new Date().toISOString(),
      totalCalls,
      totalRequestedCells,
      totalAvailableCells,
      totalUsefulNewCells,
      requestUtilizationPct,
      usefulYieldPct,
      duplicateCellPct,
      nullReturnPct,
      callsAt100PctCapacity,
      partialCalls,
      reasonForEveryPartialCall,
      calls: this.callHistory,
    };

    fs.mkdirSync(outputDir, { recursive: true });
    const targetFile = path.join(outputDir, 'CALL_EFFICIENCY.json');
    fs.writeFileSync(targetFile, JSON.stringify(report, null, 2), 'utf-8');

    return report;
  }

  public getCallHistory(): TrendlyneCallEfficiency[] {
    return this.callHistory;
  }
}
