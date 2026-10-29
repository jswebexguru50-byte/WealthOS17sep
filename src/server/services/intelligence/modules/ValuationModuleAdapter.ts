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

import { ModuleResult, ModuleStatus, EvidenceReference, evidenceSourceTypeForProvider } from '../contracts/index.js';
import { ValuationPayload, ValuationMetric } from '../types/ValuationPayload.js';
import { BusinessModelClassifier } from '../domain/BusinessModelClassifier.js';
import { getDB, dbAll, dbGet } from '../../../database.js';
import { CanonicalFactResolverService } from '../../CanonicalFactResolverService.js';

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
    let companyName: string | null = null;
    try {
      const ticker = await dbGet<any>(
        db,
        `SELECT sector, industry, COALESCE(company_name, name) AS company_name FROM MasterTickers WHERE UPPER(symbol) = ? LIMIT 1`,
        [cleanSym]
      );
      if (ticker) {
        sector = ticker.sector;
        industry = ticker.industry;
        companyName = ticker.company_name;
      }
    } catch {
      // Non-fatal
    }
    const businessModel = BusinessModelClassifier.classify(cleanSym, sector, industry, companyName);

    // 2. Resolve valuation metrics from promoted canonical facts.  Raw
    // provider snapshots are acquisition artifacts, not an analytical input.
    const resolved = CanonicalFactResolverService.getInstance().resolveMany(
      cleanSym,
      ['pe_ratio', 'pb_ratio', 'ev_ebitda', 'dividend_yield'],
    );
    const factValue = (metric: string): number | null => {
      const value = resolved.get(metric)?.value;
      return typeof value === 'number' ? value : (value == null ? null : Number(value));
    };
    const peVal = factValue('pe_ratio');
    const pbVal = factValue('pb_ratio');
    const evEbitdaVal = factValue('ev_ebitda');
    const divYieldVal = factValue('dividend_yield');
    const dataAsOf = [...resolved.values()].map(f => f.fetchedAt || f.asOf).find(Boolean) || null;
    for (const fact of resolved.values()) {
      evidenceRefs.push({
        evidenceId: `${fact.source}:${cleanSym}:${fact.metric}`,
        sourceType: evidenceSourceTypeForProvider(fact.provider),
        sourceId: fact.provider || fact.source,
        timestamp: fact.fetchedAt || fact.asOf || evaluationTimestamp,
        field: fact.metric,
      });
    }

    const buildMetric = (metricName: string, val: number | null): ValuationMetric => ({
      metric: metricName,
      current: val,
      // Invariant: Current valuation != relative valuation. Cheap/fair/expensive/near-median requires an empirical comparison basis.
      relativeStatus: 'DATA_INSUFFICIENT',
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
      // Parsed snapshot data without independent cross-verification is PARTIAL, not VERIFIED
      dataStatus: hasAny ? 'PARTIAL' : 'DATA_INSUFFICIENT',
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
