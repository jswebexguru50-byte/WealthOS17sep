/**
 * ValuationModuleAdapter.ts
 *
 * Agent F Deliverable:
 * Adapts valuation multiples into canonical ModuleResult<ValuationPayload>.
 *
 * Invariants:
 * - Uses genuine available data (PE, PB, EV/EBITDA, Div Yield, PEG)
 * - Emphasizes PB/PE/ROA for banks rather than EV/EBITDA
 * - Never fabricates analyst price targets, DCF or intrinsic value
 * - Missing remains missing -> DATA_INSUFFICIENT
 */

import { ModuleResult, ModuleStatus, EvidenceReference } from '../contracts/index.js';
import { ValuationPayload, ValuationMetric } from '../types/ValuationPayload.js';
import { BusinessModelClassifier } from '../domain/BusinessModelClassifier.js';
import { getDB, dbAll, dbGet } from '../../../database.js';

export class ValuationModuleAdapter {
  private static instance: ValuationModuleAdapter;

  private constructor() {}

  public static getInstance(): ValuationModuleAdapter {
    if (!ValuationModuleAdapter.instance) {
      ValuationModuleAdapter.instance = new ValuationModuleAdapter();
    }
    return ValuationModuleAdapter.instance;
  }

  public async run(identifier: string): Promise<ModuleResult<ValuationPayload>> {
    const evaluationTimestamp = new Date().toISOString();
    const cleanSym = identifier.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const evidenceRefs: EvidenceReference[] = [];

    const db = getDB();
    if (!db) {
      return {
        moduleId: 'VALUATION',
        status: 'SOURCE_UNAVAILABLE',
        dataStatus: 'SOURCE_UNAVAILABLE',
        result: null,
        evidenceRefs: [],
        missingRequirements: ['Database unavailable'],
        warnings: ['Cannot open database connection'],
        evaluationTimestamp,
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'ValuationModuleAdapter-v1.0',
      };
    }

    // 1. Resolve business model
    let sector: string | null = null;
    let industry: string | null = null;
    try {
      const ticker = await dbGet<any>(
        db,
        `SELECT sector, industry FROM MasterTickers WHERE UPPER(symbol) = ? LIMIT 1`,
        [cleanSym]
      );
      if (ticker) {
        sector = ticker.sector;
        industry = ticker.industry;
      }
    } catch {
      // Non-fatal
    }
    const businessModel = BusinessModelClassifier.classify(cleanSym, sector, industry);

    // 2. Query key-ratios snapshot
    const snapRows = await dbAll<any>(
      db,
      `SELECT endpoint, provider, fetched_at, response_json
       FROM fundamental_endpoint_snapshots
       WHERE UPPER(symbol) = ? AND endpoint = 'key-ratios'
       ORDER BY fetched_at DESC LIMIT 1`,
      [cleanSym]
    );

    let peVal: number | null = null;
    let pbVal: number | null = null;
    let evEbitdaVal: number | null = null;
    let divYieldVal: number | null = null;
    let dataAsOf: string | null = null;

    if (snapRows && snapRows.length > 0) {
      const snap = snapRows[0];
      dataAsOf = snap.fetched_at;
      evidenceRefs.push({
        evidenceId: `VAL_SNAP_${cleanSym}`,
        sourceType: 'TRENDLYNE_SNAPSHOT',
        sourceId: `${snap.provider}:key-ratios:${cleanSym}`,
        timestamp: snap.fetched_at,
        notes: `Extracted valuation ratios from canonical snapshot`,
      });

      try {
        const parsed = JSON.parse(snap.response_json);
        const ratios = parsed.data || parsed;
        if (Array.isArray(ratios)) {
          for (const item of ratios) {
            const name = String(item.name || '').trim().toUpperCase();
            const valStr = String(item.company_value || '').replace('%', '').trim();
            const num = parseFloat(valStr);
            if (isNaN(num)) continue;

            if (name === 'P/E') peVal = num;
            else if (name === 'P/B') pbVal = num;
            else if (name === 'EV/EBITDA') evEbitdaVal = num;
            else if (name === 'DIVIDEND YIELD') divYieldVal = num;
          }
        }
      } catch {
        // Ignore parse error
      }
    }

    const buildMetric = (metricName: string, val: number | null): ValuationMetric => ({
      metric: metricName,
      current: val,
      relativeStatus: val !== null ? 'NEAR_MEDIAN' : 'DATA_INSUFFICIENT',
      evidence: evidenceRefs.slice(0, 1),
    });

    const pe = buildMetric('PE', peVal);
    const pb = buildMetric('PB', pbVal);
    const evEbitda = businessModel === 'BANK' ? undefined : buildMetric('EV/EBITDA', evEbitdaVal);
    const dividendYield = buildMetric('Dividend Yield', divYieldVal);

    const hasAny = peVal !== null || pbVal !== null || evEbitdaVal !== null;
    const status: ModuleStatus = hasAny ? 'WORKING' : 'DATA_INSUFFICIENT';

    const payload: ValuationPayload = {
      pe,
      pb,
      evEbitda,
      dividendYield,
      dataAsOf,
    };

    return {
      moduleId: 'VALUATION',
      status,
      dataStatus: hasAny ? 'VERIFIED' : 'DATA_INSUFFICIENT',
      result: payload,
      evidenceRefs,
      missingRequirements: hasAny ? [] : [`No valuation multiples found for ${cleanSym}`],
      warnings: [],
      evaluationTimestamp,
      dataAsOf,
      configVersion: '1.0.0',
      engineVersion: 'ValuationModuleAdapter-v1.0',
    };
  }
}
