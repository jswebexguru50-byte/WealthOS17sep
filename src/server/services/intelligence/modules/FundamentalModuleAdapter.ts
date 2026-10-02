/**
 * FundamentalModuleAdapter.ts
 *
 * WealthOS — Canonical Fundamental Module Adapter (Remediation 002).
 * Exclusively queries verified canonical facts from company_facts.
 * Zero production parsing of raw fundamental_endpoint_snapshots for analytical outputs.
 * Full disposable database override propagation for hermetic testing.
 *
 * Invariants:
 * - True canonical path: company_facts is the single analytical fact source.
 * - Rejects ambiguous or rejected fact mappings.
 * - Adheres to verified business model classification.
 * - Transparent trajectory derivations (YoY acceleration, margin delta in bps).
 * - Preserves stored fact timestamps; no synthetic current timestamps as dataAsOf.
 * - Missing data returns DATA_INSUFFICIENT; no fabricated fallback values.
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
import { eligibilityWhereClause, assessFactEligibility } from './CanonicalFactSelector.js';

async function queryAll<T = any>(db: any, sql: string, params: any[] = []): Promise<T[]> {
  if (!db) return [];
  if (typeof db.all === 'function') {
    return dbAll<T>(db, sql, params);
  }
  if (typeof db.prepare === 'function') {
    return db.prepare(sql).all(...params) as T[];
  }
  return [];
}

async function queryGet<T = any>(db: any, sql: string, params: any[] = []): Promise<T | null> {
  if (!db) return null;
  if (typeof db.get === 'function') {
    return dbGet<T>(db, sql, params);
  }
  if (typeof db.prepare === 'function') {
    return (db.prepare(sql).get(...params) as T) || null;
  }
  return null;
}

export class FundamentalModuleAdapter {
  private static instance: FundamentalModuleAdapter;

  private constructor() {}

  public static getInstance(): FundamentalModuleAdapter {
    if (!FundamentalModuleAdapter.instance) {
      FundamentalModuleAdapter.instance = new FundamentalModuleAdapter();
    }
    return FundamentalModuleAdapter.instance;
  }

  public async run(identifier: string, overrideDb?: any, pointInTime?: string | null): Promise<ModuleResult<FundamentalPayload>> {
    const evaluationTimestamp = new Date().toISOString();
    const cleanSym = identifier.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const evidenceRefs: EvidenceReference[] = [];

    const db = overrideDb || getDB();
    if (!db) {
      return {
        moduleId: 'FUNDAMENTAL',
        status: 'SOURCE_UNAVAILABLE',
        dataStatus: 'SOURCE_UNAVAILABLE',
        result: null,
        evidenceRefs: [],
        missingRequirements: ['Database connection unavailable', 'Could not open portfolio.db'],
        warnings: ['Database connection unavailable', 'Could not open portfolio.db'],
        evaluationTimestamp,
        dataAsOf: null,
        configVersion: '2.0.0',
        engineVersion: 'FundamentalModuleAdapter-v2.0',
      };
    }

    // 1. Resolve ticker identity and classification
    let sector: string | null = null;
    let industry: string | null = null;
    let companyName: string | null = null;
    try {
      const ticker = await queryGet<any>(
        db,
        `SELECT name, sector, industry FROM MasterTickers WHERE UPPER(symbol) = ? LIMIT 1`,
        [cleanSym]
      ) || await queryGet<any>(
        db,
        `SELECT name, sector, industry FROM master_tickers WHERE UPPER(symbol) = ? LIMIT 1`,
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

    const businessModel: BusinessModel = BusinessModelClassifier.classify(cleanSym, sector, industry, companyName);

    // 2. Query verified canonical facts from company_facts exclusively
    // Raw fundamental_endpoint_snapshots are NOT parsed for analytical outputs
    let canonicalRows: any[] = [];
    try {
      canonicalRows = await queryAll<any>(
        db,
        `SELECT factId, metric, value, unit, periodType, periodEnd, scope, provider,
                sourceType, verificationStatus, sourceDocumentId, fetchedAt, availableAt, reportedAt, asOfDate
         FROM company_facts
         WHERE UPPER(symbol) = ?
           AND ${eligibilityWhereClause()}
         ORDER BY periodEnd DESC, availableAt DESC`,
        [cleanSym]
      );
    } catch {
      canonicalRows = [];
    }

    if (!canonicalRows || canonicalRows.length === 0) {
      const emptyTrajectory: FundamentalTrajectory = {
        revenueGrowthYoY: { status: 'DATA_INSUFFICIENT', latestGrowthPct: null, priorGrowthPct: null, periodsCompared: null },
        marginTrajectory: { status: 'DATA_INSUFFICIENT', bpsChange: null, metricUsed: businessModel === 'UNKNOWN' ? 'UNKNOWN' : businessModel === 'BANK' || businessModel === 'NBFC' ? 'NIM' : 'EBITDA_MARGIN' },
        debtTrajectory: { status: businessModel === 'BANK' || businessModel === 'NBFC' ? 'NOT_APPLICABLE' : 'DATA_INSUFFICIENT', changePct: null },
        returnProfile: { metric: businessModel === 'UNKNOWN' ? 'UNKNOWN' : businessModel === 'BANK' || businessModel === 'NBFC' ? 'ROE' : 'ROCE', latestValue: null, status: 'DATA_INSUFFICIENT' },
      };
      return {
        moduleId: 'FUNDAMENTAL',
        status: 'DATA_INSUFFICIENT',
        dataStatus: 'DATA_INSUFFICIENT',
        result: {
          businessModel,
          historicalSeries: {},
          trajectory: emptyTrajectory,
          dataAsOf: null,
        },
        evidenceRefs: [],
        missingRequirements: [`No canonical company_facts records registered for ${cleanSym}`],
        warnings: businessModel === 'UNKNOWN'
          ? [`Fundamental facts absent for ${cleanSym}`, 'UNKNOWN_BUSINESS_MODEL: Model-dependent financial interpretation withheld until verified classification exists']
          : [`Fundamental facts absent for ${cleanSym}`],
        evaluationTimestamp,
        dataAsOf: null,
        configVersion: '2.0.0',
        engineVersion: 'FundamentalModuleAdapter-v2.0',
      };
    }


    const series: FundamentalSeries = {};
    let latestDataTimestamp: string | null = null;

    const METRIC_MAP: Record<string, string> = {
      'revenue_cr': 'Revenue',
      'revenue': 'Revenue',
      'ebitda_cr': 'EBITDA',
      'ebitda': 'EBITDA',
      'operating_profit_cr': 'OperatingProfit',
      'operating_profit': 'OperatingProfit',
      'pat_cr': 'PAT',
      'pat': 'PAT',
      'net_profit_cr': 'PAT',
      'net_profit': 'PAT',
      'cfo_cr': 'CFO',
      'cfo': 'CFO',
      'roce_pct': 'ROCE',
      'roce': 'ROCE',
      'roce_reported': 'ROCE',
      'roe_pct': 'ROE',
      'roe': 'ROE',
      'roa_pct': 'ROA',
      'roa': 'ROA',
      'nim_pct': 'NIM',
      'nim': 'NIM',
      'net_npa_pct': 'NetNPA',
      'nnpa_pct': 'NetNPA',
      'gnpa_pct': 'NetNPA',
      'casa_ratio_pct': 'CASA',
      'casa_ratio': 'CASA',
      'debt_to_equity': 'DebtToEquity',
      'debt_to_equity_reported': 'DebtToEquity',
      'de_ratio': 'DebtToEquity',
      'interest_coverage': 'InterestCoverage',
      'icr': 'InterestCoverage',
      'pe': 'PE',
      'pe_ratio': 'PE',
      'pb': 'PB',
      'pb_ratio': 'PB',
    };

    const effectivePointInTime = pointInTime ?? evaluationTimestamp;

    for (const r of canonicalRows) {
      const assessed = assessFactEligibility(r, { pointInTime: effectivePointInTime });
      if (assessed.eligibilityStatus !== 'ELIGIBLE') {
        continue;
      }
      const metricLower = String(r.metric || '').toLowerCase();
      let targetSeriesKey = METRIC_MAP[metricLower];
      if (!targetSeriesKey) continue;

      if (businessModel === 'BANK' && targetSeriesKey === 'EBITDA') {
        targetSeriesKey = 'OperatingProfit';
      }

      if (!series[targetSeriesKey]) {
        series[targetSeriesKey] = [];
      }

      const numVal = typeof r.value === 'number' ? r.value : parseFloat(r.value);
      if (isNaN(numVal)) continue;

      const factTimestamp = r.availableAt || r.reportedAt || r.asOfDate || r.fetchedAt || null;
      if (factTimestamp && (!latestDataTimestamp || factTimestamp > latestDataTimestamp)) {
        latestDataTimestamp = factTimestamp;
      }

      // If no persisted timestamp exists, fact must never be marked VERIFIED
      const effectiveVerificationStatus = (!factTimestamp || r.verificationStatus !== 'VERIFIED') ? 'VERIFIED_PARTIAL' : 'VERIFIED';

      const prov: EvidenceReference = {
        evidenceId: r.factId || `FACT_${cleanSym}_${r.metric}_${r.periodEnd}`,
        sourceType: 'CANONICAL_FACT',
        sourceId: r.sourceDocumentId || r.provider || 'company_facts',
        timestamp: factTimestamp,
        notes: `${r.metric} from ${r.provider || 'company_facts'} (${effectiveVerificationStatus})`,
      };

      evidenceRefs.push(prov);

      const seriesStatus = (!factTimestamp || r.verificationStatus !== 'VERIFIED') ? 'PARTIAL' : 'VERIFIED';

      series[targetSeriesKey].push({
        period: r.periodEnd || r.asOfDate || 'LATEST',
        value: numVal,
        unit: r.unit || (metricLower.endsWith('_pct') ? 'PERCENT' : metricLower.endsWith('_cr') ? 'INR_CR' : 'RATIO'),
        scope: r.scope === 'STANDALONE' ? 'STANDALONE' : 'CONSOLIDATED',
        status: seriesStatus,
        provenance: [prov],
      });
    }

    // 3. Derive Transparent Trajectory
    // Revenue Growth YoY Trajectory
    const revSeries = series['Revenue'] || [];
    let revGrowthStatus: 'ACCELERATING' | 'DECELERATING' | 'STABLE' | 'GROWING' | 'DECLINING' | 'DATA_INSUFFICIENT' = 'DATA_INSUFFICIENT';
    let latestGrowth: number | null = null;
    let priorGrowth: number | null = null;
    let periodsCompared: string | null = null;

    if (revSeries.length >= 3) {
      const v0 = revSeries[0]?.value;
      const v1 = revSeries[1]?.value;
      const v2 = revSeries[2]?.value;

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
        revGrowthStatus = latestGrowth >= 0 ? 'GROWING' : 'DECLINING';
      }
    }

    // Margin Trajectory
    let marginStatus: 'EXPANDING' | 'CONTRACTING' | 'STABLE' | 'DATA_INSUFFICIENT' = 'DATA_INSUFFICIENT';
    let bpsDelta: number | null = null;
    const isFinancial = businessModel === 'BANK' || businessModel === 'NBFC';
    const isUnknown = businessModel === 'UNKNOWN';
    let marginMetricUsed = isFinancial ? 'NIM' : isUnknown ? 'UNKNOWN' : 'EBITDA_MARGIN';

    if (isUnknown) {
      marginStatus = 'DATA_INSUFFICIENT';
    } else if (isFinancial) {
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
        marginStatus = 'DATA_INSUFFICIENT';
      }
    } else {
      const ebitdaSeries = series['EBITDA'] || series['OperatingProfit'] || [];
      if (revSeries.length >= 2 && ebitdaSeries.length >= 2) {
        const r0 = revSeries[0]?.value;
        const r1 = revSeries[1]?.value;
        const e0 = ebitdaSeries[0]?.value;
        const e1 = ebitdaSeries[1]?.value;

        if (r0 && r1 && e0 && e1 && r0 > 0 && r1 > 0) {
          const m0 = (e0 / r0) * 100;
          const m1 = (e1 / r1) * 100;
          bpsDelta = Math.round((m0 - m1) * 100);

          const thresholdBps = Math.max(40, Math.min(200, Math.round(Math.abs(m1) * 5)));

          if (bpsDelta >= thresholdBps) {
            marginStatus = 'EXPANDING';
          } else if (bpsDelta <= -thresholdBps) {
            marginStatus = 'CONTRACTING';
          } else {
            marginStatus = 'STABLE';
          }
        }
      }
    }

    // Debt Trajectory
    let debtStatus: 'DELEVERAGING' | 'LEVERAGING' | 'STABLE' | 'DATA_INSUFFICIENT' | 'NOT_APPLICABLE' =
      isFinancial ? 'NOT_APPLICABLE' : 'DATA_INSUFFICIENT';
    let debtChangePct: number | null = null;

    // Return Profile
    const latestRoce = series['ROCE']?.[0]?.value ?? null;
    const latestRoe = series['ROE']?.[0]?.value ?? null;
    const latestRoa = series['ROA']?.[0]?.value ?? null;

    let returnMetric = isUnknown ? 'UNKNOWN' : isFinancial ? 'ROE' : 'ROCE';
    let returnVal = isUnknown ? null : isFinancial ? (latestRoe ?? latestRoa) : (latestRoce ?? latestRoe);
    let returnStatus: 'HIGH_QUALITY' | 'MODERATE' | 'LOW' | 'DATA_INSUFFICIENT' = 'DATA_INSUFFICIENT';

    if (!isUnknown && returnVal !== null) {
      if (isFinancial) {
        returnStatus = returnVal >= 15 ? 'HIGH_QUALITY' : returnVal >= 10 ? 'MODERATE' : 'LOW';
      } else {
        const cSec = (sector || '').toLowerCase();
        const cInd = (industry || '').toLowerCase();
        const isCapitalIntensive = 
          cSec.includes('power') || cInd.includes('power') ||
          cSec.includes('util') || cInd.includes('util') ||
          cSec.includes('infra') || cInd.includes('infra') ||
          cSec.includes('energy') || cInd.includes('energy') ||
          cSec.includes('oil') || cInd.includes('oil') ||
          cSec.includes('gas') || cInd.includes('gas') ||
          cSec.includes('telecom') || cInd.includes('telecom') ||
          cSec.includes('metal') || cInd.includes('metal') ||
          cSec.includes('steel') || cInd.includes('steel') ||
          cSec.includes('cement') || cInd.includes('cement');

        if (isCapitalIntensive) {
          returnStatus = returnVal >= 14 ? 'HIGH_QUALITY' : returnVal >= 10 ? 'MODERATE' : 'LOW';
        } else {
          returnStatus = returnVal >= 18 ? 'HIGH_QUALITY' : returnVal >= 12 ? 'MODERATE' : 'LOW';
        }
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
      dataStatus: hasData ? 'PARTIAL' : 'DATA_INSUFFICIENT',
      result: hasData ? {
        businessModel,
        historicalSeries: series,
        trajectory,
        dataAsOf: latestDataTimestamp,
      } : null,
      evidenceRefs,
      missingRequirements: hasData ? [] : ['No fundamental series metrics could be extracted from canonical facts'],
      warnings: isUnknown ? ['UNKNOWN_BUSINESS_MODEL: Model-dependent financial interpretation withheld until verified classification exists'] : [],
      evaluationTimestamp,
      dataAsOf: latestDataTimestamp,
      configVersion: '2.0.0',
      engineVersion: 'FundamentalModuleAdapter-v2.0',
    };
  }
}
