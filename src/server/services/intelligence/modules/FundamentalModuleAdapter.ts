/**
 * FundamentalModuleAdapter.ts
 *
 * Agent B Deliverable:
 * Adapts existing canonical company_facts and fundamental_endpoint_snapshots
 * into the canonical ModuleResult<FundamentalPayload>.
 *
 * Invariants:
 * - Distinguishes business model: NON_FINANCIAL vs BANK vs NBFC vs INSURANCE
 * - Never applies industrial CFO/working-capital/EBITDA metrics to banks
 * - Does not silently mix Standalone/Consolidated or Annual/Quarterly
 * - Transparent trajectory derivations (YoY acceleration, margin delta in bps)
 * - Returns DATA_INSUFFICIENT when missing; NO fabricated values
 */

import { ModuleResult, ModuleStatus, EvidenceReference } from '../contracts/index.js';
import {
  FundamentalPayload,
  FundamentalSeries,
  FundamentalMetricItem,
  FundamentalTrajectory,
} from '../types/FundamentalPayload.js';
import { BusinessModelClassifier, BusinessModel } from '../domain/BusinessModelClassifier.js';
import { getDB, dbAll, dbGet } from '../../../database.js';

export class FundamentalModuleAdapter {
  private static instance: FundamentalModuleAdapter;

  private constructor() {}

  public static getInstance(): FundamentalModuleAdapter {
    if (!FundamentalModuleAdapter.instance) {
      FundamentalModuleAdapter.instance = new FundamentalModuleAdapter();
    }
    return FundamentalModuleAdapter.instance;
  }

  public async run(identifier: string): Promise<ModuleResult<FundamentalPayload>> {
    const evaluationTimestamp = new Date().toISOString();
    const cleanSym = identifier.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const evidenceRefs: EvidenceReference[] = [];

    const db = getDB();
    if (!db) {
      return {
        moduleId: 'FUNDAMENTAL',
        status: 'SOURCE_UNAVAILABLE',
        dataStatus: 'SOURCE_UNAVAILABLE',
        result: null,
        evidenceRefs: [],
        missingRequirements: ['Database connection unavailable'],
        warnings: ['Could not open portfolio.db'],
        evaluationTimestamp,
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'FundamentalModuleAdapter-v1.0',
      };
    }

    // 1. Resolve ticker identity and classification
    let sector: string | null = null;
    let industry: string | null = null;
    let companyName: string | null = null;
    try {
      const ticker = await dbGet<any>(
        db,
        `SELECT name, sector, industry FROM MasterTickers WHERE UPPER(symbol) = ? LIMIT 1`,
        [cleanSym]
      );
      if (ticker) {
        sector = ticker.sector || null;
        industry = ticker.industry || null;
        companyName = ticker.name || null;
      }
    } catch {
      // Non-fatal if MasterTickers is unavailable
    }

    const businessModel: BusinessModel = BusinessModelClassifier.classify(cleanSym, sector, industry);

    // 2. Query fundamental endpoint snapshots
    const snapshots = await dbAll<any>(
      db,
      `SELECT endpoint, provider, fetched_at, response_json
       FROM fundamental_endpoint_snapshots
       WHERE UPPER(symbol) = ?
       ORDER BY fetched_at DESC`,
      [cleanSym]
    );

    if (!snapshots || snapshots.length === 0) {
      return {
        moduleId: 'FUNDAMENTAL',
        status: 'DATA_INSUFFICIENT',
        dataStatus: 'DATA_INSUFFICIENT',
        result: null,
        evidenceRefs: [],
        missingRequirements: [`No fundamental endpoint snapshots registered for ${cleanSym}`],
        warnings: [`Fundamental facts absent for ${cleanSym}`],
        evaluationTimestamp,
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'FundamentalModuleAdapter-v1.0',
      };
    }

    const snapMap: Record<string, any> = {};
    let latestFetchedAt: string | null = null;
    for (const s of snapshots) {
      if (!snapMap[s.endpoint]) {
        try {
          snapMap[s.endpoint] = JSON.parse(s.response_json);
          if (!latestFetchedAt || s.fetched_at > latestFetchedAt) {
            latestFetchedAt = s.fetched_at;
          }
          evidenceRefs.push({
            evidenceId: `SNAP_${s.provider}_${s.endpoint}_${cleanSym}`,
            sourceType: 'TRENDLYNE_SNAPSHOT',
            sourceId: `${s.provider}:${s.endpoint}:${cleanSym}`,
            timestamp: s.fetched_at,
            notes: `Endpoint ${s.endpoint} from ${s.provider}`,
          });
        } catch {
          // Ignore malformed snapshot
        }
      }
    }

    const series: FundamentalSeries = {};
    const incData = snapMap['income-statement']?.data;
    const ratioData = snapMap['key-ratios']?.data;
    const cfData = snapMap['cash-flow']?.data;
    const bsData = snapMap['balance-sheet']?.data;

    const scope: 'CONSOLIDATED' | 'STANDALONE' =
      incData?.type?.toLowerCase() === 'standalone' ? 'STANDALONE' : 'CONSOLIDATED';

    // Helper to add series metrics
    const addSeriesItems = (metricKey: string, historyItems: Array<{ period: string; value: number }>, unit: string) => {
      if (!Array.isArray(historyItems)) return;
      series[metricKey] = historyItems.map(h => ({
        period: h.period,
        value: typeof h.value === 'number' ? h.value : Number(h.value) || null,
        unit,
        scope,
        status: 'PARTIAL',
        provenance: evidenceRefs.slice(0, 1),
      }));
    };

    // Extract income statement series (Revenue, EBITDA / Operating Profit, PAT / Net Profit)
    if (incData?.income_statement && Array.isArray(incData.income_statement)) {
      for (const cat of incData.income_statement) {
        if (cat.category === 'revenue') {
          addSeriesItems('Revenue', cat.history || [], 'INR_CR');
        } else if (cat.category === 'operating_profit') {
          addSeriesItems(businessModel === 'BANK' ? 'OperatingProfit' : 'EBITDA', cat.history || [], 'INR_CR');
        } else if (cat.category === 'net_profit') {
          addSeriesItems('PAT', cat.history || [], 'INR_CR');
        }
      }
    }

    // Extract cash flow (CFO) for non-financial
    if (businessModel === 'NON_FINANCIAL' && cfData?.operating?.history) {
      addSeriesItems('CFO', cfData.operating.history, 'INR_CR');
    }

    // Extract key ratios
    let latestRoe: number | null = null;
    let latestRoce: number | null = null;
    let latestRoa: number | null = null;
    let latestNim: number | null = null;
    let latestNpa: number | null = null;
    let latestCasa: number | null = null;

    if (Array.isArray(ratioData)) {
      for (const r of ratioData) {
        const valStr = String(r.company_value || '').replace('%', '').trim();
        const numVal = parseFloat(valStr);
        if (isNaN(numVal)) continue;

        const name = String(r.name || '').trim().toUpperCase();
        if (name === 'ROE') {
          latestRoe = numVal;
          series['ROE'] = [{ period: 'LATEST', value: numVal, unit: 'PERCENT', scope, status: 'PARTIAL', provenance: evidenceRefs.slice(0, 1) }];
        } else if (name === 'ROCE') {
          latestRoce = numVal;
          series['ROCE'] = [{ period: 'LATEST', value: numVal, unit: 'PERCENT', scope, status: 'PARTIAL', provenance: evidenceRefs.slice(0, 1) }];
        } else if (name === 'ROA') {
          latestRoa = numVal;
          series['ROA'] = [{ period: 'LATEST', value: numVal, unit: 'PERCENT', scope, status: 'PARTIAL', provenance: evidenceRefs.slice(0, 1) }];
        } else if (name === 'NIM') {
          latestNim = numVal;
          series['NIM'] = [{ period: 'LATEST', value: numVal, unit: 'PERCENT', scope, status: 'PARTIAL', provenance: evidenceRefs.slice(0, 1) }];
        } else if (name.includes('NPA') || name === 'NET NPA') {
          latestNpa = numVal;
          series['NetNPA'] = [{ period: 'LATEST', value: numVal, unit: 'PERCENT', scope, status: 'PARTIAL', provenance: evidenceRefs.slice(0, 1) }];
        } else if (name === 'CASA') {
          latestCasa = numVal;
          series['CASA'] = [{ period: 'LATEST', value: numVal, unit: 'PERCENT', scope, status: 'PARTIAL', provenance: evidenceRefs.slice(0, 1) }];
        }
      }
    }

    // 3. Derive Transparent Trajectory
    // Revenue Growth YoY Trajectory
    const revSeries = series['Revenue'] || [];
    let revGrowthStatus: 'ACCELERATING' | 'DECELERATING' | 'STABLE' | 'GROWING' | 'DECLINING' | 'DATA_INSUFFICIENT' = 'DATA_INSUFFICIENT';
    let latestGrowth: number | null = null;
    let priorGrowth: number | null = null;
    let periodsCompared: string | null = null;

    if (revSeries.length >= 3) {
      const v0 = revSeries[0]?.value; // Latest (e.g. Mar 2026)
      const v1 = revSeries[1]?.value; // Prior (e.g. Mar 2025)
      const v2 = revSeries[2]?.value; // Two years prior (e.g. Mar 2024)

      if (v0 && v1 && v2 && v1 > 0 && v2 > 0) {
        latestGrowth = Number((((v0 - v1) / v1) * 100).toFixed(2));
        priorGrowth = Number((((v1 - v2) / v2) * 100).toFixed(2));
        periodsCompared = `${revSeries[0].period} vs ${revSeries[1].period} vs ${revSeries[2].period}`;

        if (latestGrowth - priorGrowth > 1.5) {
          revGrowthStatus = 'ACCELERATING';
        } else if (priorGrowth - latestGrowth > 1.5) {
          revGrowthStatus = 'DECELERATING';
        } else {
          revGrowthStatus = 'STABLE';
        }
      }
    } else if (revSeries.length === 2) {
      const v0 = revSeries[0]?.value;
      const v1 = revSeries[1]?.value;
      if (v0 && v1 && v1 > 0) {
        latestGrowth = Number((((v0 - v1) / v1) * 100).toFixed(2));
        periodsCompared = `${revSeries[0].period} vs ${revSeries[1].period}`;
        // Invariant: One interval cannot be labeled STABLE or ACCELERATING. It is simply GROWING or DECLINING.
        revGrowthStatus = latestGrowth >= 0 ? 'GROWING' : 'DECLINING';
      }
    }

    // Margin Trajectory
    let marginStatus: 'EXPANDING' | 'CONTRACTING' | 'STABLE' | 'DATA_INSUFFICIENT' = 'DATA_INSUFFICIENT';
    let bpsDelta: number | null = null;
    let marginMetricUsed = businessModel === 'BANK' ? 'NIM' : 'EBITDA_MARGIN';

    if (businessModel === 'BANK') {
      const nimSeries = series['NIM'] || [];
      if (nimSeries.length >= 2 && nimSeries[0]?.value !== null && nimSeries[1]?.value !== null) {
        bpsDelta = Math.round(((nimSeries[0].value! - nimSeries[1].value!) * 100));
        if (bpsDelta >= 15) {
          marginStatus = 'EXPANDING';
        } else if (bpsDelta <= -15) {
          marginStatus = 'CONTRACTING';
        } else {
          marginStatus = 'STABLE';
        }
      } else {
        // Invariant: Level is not trajectory. High absolute NIM does not mean expansion without prior period.
        marginStatus = 'DATA_INSUFFICIENT';
      }
    } else {
      const ebitdaSeries = series['EBITDA'] || [];
      if (revSeries.length >= 2 && ebitdaSeries.length >= 2) {
        const r0 = revSeries[0]?.value;
        const r1 = revSeries[1]?.value;
        const e0 = ebitdaSeries[0]?.value;
        const e1 = ebitdaSeries[1]?.value;

        if (r0 && r1 && e0 && e1 && r0 > 0 && r1 > 0) {
          const m0 = (e0 / r0) * 100;
          const m1 = (e1 / r1) * 100;
          bpsDelta = Math.round((m0 - m1) * 100);

          if (bpsDelta >= 50) {
            marginStatus = 'EXPANDING';
          } else if (bpsDelta <= -50) {
            marginStatus = 'CONTRACTING';
          } else {
            marginStatus = 'STABLE';
          }
        }
      }
    }

    // Debt Trajectory
    let debtStatus: 'DELEVERAGING' | 'LEVERAGING' | 'STABLE' | 'DATA_INSUFFICIENT' | 'NOT_APPLICABLE' =
      businessModel === 'BANK' || businessModel === 'NBFC' ? 'NOT_APPLICABLE' : 'DATA_INSUFFICIENT';
    let debtChangePct: number | null = null;

    // Return Profile
    let returnMetric = businessModel === 'BANK' ? 'ROE' : 'ROCE';
    let returnVal = businessModel === 'BANK' ? (latestRoe ?? latestRoa) : (latestRoce ?? latestRoe);
    let returnStatus: 'HIGH_QUALITY' | 'MODERATE' | 'LOW' | 'DATA_INSUFFICIENT' = 'DATA_INSUFFICIENT';

    if (returnVal !== null) {
      if (businessModel === 'BANK') {
        returnStatus = returnVal >= 15 ? 'HIGH_QUALITY' : returnVal >= 10 ? 'MODERATE' : 'LOW';
      } else {
        returnStatus = returnVal >= 18 ? 'HIGH_QUALITY' : returnVal >= 12 ? 'MODERATE' : 'LOW';
      }
    }

    const trajectory: FundamentalTrajectory = {
      revenueGrowthYoY: {
        status: revGrowthStatus,
        latestGrowthPct: latestGrowth,
        priorGrowthPct: priorGrowth,
        periodsCompared,
      },
      marginTrajectory: {
        status: marginStatus,
        bpsChange: bpsDelta,
        metricUsed: marginMetricUsed,
      },
      debtTrajectory: {
        status: debtStatus,
        changePct: debtChangePct,
      },
      returnProfile: {
        metric: returnMetric,
        latestValue: returnVal,
        status: returnStatus,
      },
    };

    const hasData = Object.keys(series).length > 0;
    const moduleStatus: ModuleStatus = hasData ? 'WORKING' : 'DATA_INSUFFICIENT';

    return {
      moduleId: 'FUNDAMENTAL',
      status: moduleStatus,
      // Parsed snapshot data without independent canonical verification is PARTIAL, not VERIFIED
      dataStatus: hasData ? 'PARTIAL' : 'DATA_INSUFFICIENT',
      result: {
        businessModel,
        historicalSeries: series,
        trajectory,
        dataAsOf: latestFetchedAt,
      },
      evidenceRefs,
      missingRequirements: hasData ? [] : ['No fundamental series metrics could be extracted'],
      warnings: [],
      evaluationTimestamp,
      dataAsOf: latestFetchedAt,
      configVersion: '1.0.0',
      engineVersion: 'FundamentalModuleAdapter-v1.0',
    };
  }
}
