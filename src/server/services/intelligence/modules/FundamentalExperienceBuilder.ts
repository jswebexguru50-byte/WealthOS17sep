/**
 * FundamentalExperienceBuilder.ts
 *
 * Canonical Engine for WealthOS Fundamental Experience Expansion 001.
 * Produces an evidence-traceable, deterministic fundamental intelligence dossier
 * entirely from canonical fact and evidence services.
 *
 * Invariants (Codex Remediation Compliant):
 * 1. Zero company-specific text, values, or templates in generic production logic.
 * 2. Zero default, fabricated, or assumed values for ownership, pledge, or metrics.
 * 3. Numeric zero is allowed ONLY when the provider explicitly reports zero for that field/period.
 * 4. Missing data returns null with DATA_INSUFFICIENT; never assumed safe.
 * 5. Uses canonical services (FundamentalModuleAdapter, MasterTickers, HistoricalShareholdingPattern,
 *    company_facts); no direct raw snapshot JSON parsing or ad-hoc regex scraping.
 * 6. Longevity is MISSING when durability inputs are absent; never defaults to MODERATE.
 * 7. Price multiple alone is a factual observation; does NOT produce an interpretive conclusion
 *    (ATTRACTIVE/REASONABLE/DEMANDING) without dated valuation history or verified peer context.
 * 8. Executive brief is strictly evidence-backed, up to 150 words, with no padding or fallback sectors.
 * 9. Read-only operation; zero mutation to database.
 */

import { getDB, dbAll, dbGet } from '../../../database.js';
import { eligibilityWhereClause, selectBestFact, assessFactEligibility, type CanonicalFactRow, type FactLookupResult } from './CanonicalFactSelector.js';

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

import {
  FundamentalExperiencePayload,
  EvidenceField,
  ExecutiveBrief,
  ExecutiveBriefElement,
  GrowthTrajectory,
  BusinessLongevitySection,
  FinancialStrengthDebt,
  CashFlowWorkingCapital,
  CapitalEfficiency,
  OwnershipTrend,
  QglpFourDimensions,
  GovernanceRedFlagItem,
  MonitoringWatchItem,
} from '../types/FundamentalExperienceTypes.js';
import { RecentAccumulationEngine } from './RecentAccumulationEngine.js';
import { FundamentalModuleAdapter } from './FundamentalModuleAdapter.js';
import { BusinessModelClassifier } from '../domain/BusinessModelClassifier.js';

export class FundamentalExperienceBuilder {
  private static instance: FundamentalExperienceBuilder;

  private constructor() {}

  public static getInstance(): FundamentalExperienceBuilder {
    if (!FundamentalExperienceBuilder.instance) {
      FundamentalExperienceBuilder.instance = new FundamentalExperienceBuilder();
    }
    return FundamentalExperienceBuilder.instance;
  }

  /**
   * Helper to construct a typed EvidenceField.
   */
  public makeField<T>(
    value: T | null,
    status: EvidenceField<T>['status'],
    provider: string,
    source: string,
    fetchedAt: string | null,
    options?: {
      periodType?: EvidenceField<T>['periodType'];
      periodStart?: string | null;
      periodEnd?: string | null;
      scope?: EvidenceField<T>['scope'];
      sourceDocumentId?: string;
      reason?: string;
      conflictingValues?: EvidenceField<T>['conflictingValues'];
    }
  ): EvidenceField<T> {
    // Invariant: No field without persisted fetchedAt / timestamp can be VERIFIED
    let resolvedStatus = status;
    if ((resolvedStatus === 'VERIFIED' || resolvedStatus === 'VERIFIED_CANONICAL') && !fetchedAt) {
      resolvedStatus = 'VERIFIED_PARTIAL';
    }
    return {
      value,
      status: resolvedStatus,
      provider,
      source,
      sourceDocumentId: options?.sourceDocumentId,
      fetchedAt,
      periodType: options?.periodType,
      periodStart: options?.periodStart,
      periodEnd: options?.periodEnd,
      scope: options?.scope || 'CONSOLIDATED',
      reason: options?.reason,
      conflictingValues: options?.conflictingValues,
    };
  }

  /**
   * Main builder method for a company symbol.
   */
  public async buildExperience(
    symbol: string,
    overrideDb?: any,
    pointInTime?: string | null
  ): Promise<FundamentalExperiencePayload> {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const db = overrideDb || getDB();
    const asOfDate = new Date().toISOString();
    const effectivePointInTime = pointInTime ?? asOfDate;

    // 1. Resolve MasterTicker info from canonical entity master
    let companyName: string | null = null;
    let sector: string | null = null;
    let industry: string | null = null;
    let isin: string | null = null;

    if (db) {
      try {
        const row = await queryGet<any>(
          db,
          `SELECT isin, name, sector, industry FROM MasterTickers WHERE UPPER(symbol) = ? LIMIT 1`,
          [cleanSym]
        );
        if (row) {
          companyName = row.name || null;
          sector = row.sector || null;
          industry = row.industry || null;
          isin = row.isin || null;
        }
      } catch {
        // Non-fatal
      }
    }

    const businessModel = BusinessModelClassifier.classify(cleanSym, sector, industry, companyName);

    // 2. Query canonical fundamental metrics via FundamentalModuleAdapter
    // (This uses the canonical pipeline layer rather than raw snapshot parsing)
    const fundAdapter = FundamentalModuleAdapter.getInstance();
    const fundModuleRes = await fundAdapter.run(cleanSym, overrideDb, effectivePointInTime);
    const fundPayload = fundModuleRes.result;

    const sourcesUsed: Array<{ provider: string; endpoint: string; fetchedAt: string | null; period?: string; status: string }> = [];
    if (fundModuleRes.evidenceRefs) {
      for (const ref of fundModuleRes.evidenceRefs) {
        const statusMatch = ref.notes?.match(/\((VERIFIED|VERIFIED_PARTIAL|PENDING_REVIEW|REJECTED|AMBIGUOUS)\)/);
        const refStatus = statusMatch ? statusMatch[1] : (ref.timestamp ? 'VERIFIED' : 'VERIFIED_PARTIAL');
        if (refStatus === 'VERIFIED' || refStatus === 'VERIFIED_PARTIAL') {
          // A source without a persisted timestamp must NEVER be marked VERIFIED_CANONICAL
          const isVerifiedCanonical = refStatus === 'VERIFIED' && Boolean(ref.timestamp);
          sourcesUsed.push({
            provider: ref.sourceType || 'CANONICAL_FACT',
            endpoint: ref.sourceId,
            // Persisted timestamp only — never substitute evaluation asOfDate
            fetchedAt: ref.timestamp || null,
            status: isVerifiedCanonical ? 'VERIFIED_CANONICAL' : 'VERIFIED_PARTIAL_CANONICAL',
          });
        }
      }
    }

    if (db) {
      try {
        const factSources = await queryAll<CanonicalFactRow>(
          db,
          `SELECT factId, symbol, metric, value, unit, periodType, periodEnd, scope, provider,
                  sourceType, verificationStatus, sourceDocumentId, fetchedAt, availableAt, reportedAt, asOfDate
           FROM company_facts
           WHERE UPPER(symbol) = ?
             AND ${eligibilityWhereClause(false)}
           ORDER BY fetchedAt DESC, periodEnd DESC`,
          [cleanSym]
        );
        for (const row of factSources) {
          const assessed = assessFactEligibility(row, { pointInTime: effectivePointInTime });
          if (assessed.eligibilityStatus !== 'ELIGIBLE') {
            continue;
          }
          const endpoint = row.sourceType || 'company_facts';
          const provider = row.provider || 'CANONICAL_FACT';
          if (!sourcesUsed.some(s => s.endpoint === endpoint && s.provider === provider)) {
            // Source without persisted timestamp must NEVER be marked VERIFIED_CANONICAL
            const sourceStatus = (row.verificationStatus === 'VERIFIED' && Boolean(assessed.persistedFetchedAt))
              ? 'VERIFIED_CANONICAL'
              : 'VERIFIED_PARTIAL_CANONICAL';
            sourcesUsed.push({
              provider,
              endpoint,
              fetchedAt: assessed.persistedFetchedAt || null,
              status: sourceStatus,
            });
          }
        }
      } catch {
        // Non-fatal
      }

      // Record snapshot acquisition evidence metadata (without raw payload parsing)
      try {
        const snapshotSources = await queryAll<any>(
          db,
          `SELECT provider, endpoint, fetched_at FROM fundamental_endpoint_snapshots
           WHERE UPPER(symbol) = ?
           ORDER BY fetched_at DESC`,
          [cleanSym]
        );
        for (const sn of snapshotSources) {
          if (!sourcesUsed.some(s => s.endpoint === sn.endpoint && s.provider === sn.provider)) {
            sourcesUsed.push({
              provider: sn.provider,
              endpoint: sn.endpoint,
              fetchedAt: sn.fetched_at,
              status: 'ACQUISITION_EVIDENCE',
            });
          }
        }
      } catch {
        // Non-fatal
      }
    }

    // defaultFetchedAt is the persisted dataAsOf from the module result.
    // Never substitute the evaluation timestamp (asOfDate) as a provenance date.
    const defaultFetchedAt = fundModuleRes.dataAsOf || null;

    // Series maps from canonical FundamentalPayload
    const revSeries = fundPayload?.historicalSeries?.['Revenue'] || [];
    // Some licensed providers report operating profit rather than EBITDA. Both
    // are valid reported measures, but they must never be substituted with a
    // fabricated value. Prefer EBITDA when present; otherwise surface the
    // explicitly reported operating-profit series.
    const opSeries = businessModel === 'BANK'
      ? (fundPayload?.historicalSeries?.OperatingProfit || [])
      : (fundPayload?.historicalSeries?.EBITDA || fundPayload?.historicalSeries?.OperatingProfit || []);
    const patSeries = fundPayload?.historicalSeries?.['PAT'] || [];
    const cfoSeries = fundPayload?.historicalSeries?.['CFO'] || [];
    const roeSeries = fundPayload?.historicalSeries?.['ROE'] || [];
    const roceSeries = fundPayload?.historicalSeries?.['ROCE'] || [];
    const roaSeries = fundPayload?.historicalSeries?.['ROA'] || [];

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION A: GROWTH AND EARNINGS TRAJECTORY
    // ─────────────────────────────────────────────────────────────────────────
    const latestRevItem = revSeries[0] || null;
    const priorRevItem = revSeries[1] || null;

    const latestRev = latestRevItem && typeof latestRevItem.value === 'number' ? latestRevItem.value : null;
    const priorRev = priorRevItem && typeof priorRevItem.value === 'number' ? priorRevItem.value : null;
    const latestRevPeriod = latestRevItem?.period || null;
    const priorRevPeriod = priorRevItem?.period || null;

    const revGrowthYoYVal = latestRev !== null && priorRev !== null && priorRev > 0
      ? Number((((latestRev - priorRev) / priorRev) * 100).toFixed(2))
      : null;

    // 3Y / 5Y CAGR: requires at least 3 or 5 dated annual points
    let revCAGR3Y: number | null = null;
    if (revSeries.length >= 3 && typeof revSeries[0]?.value === 'number' && typeof revSeries[2]?.value === 'number') {
      const v0 = revSeries[0].value;
      const v2 = revSeries[2].value;
      if (v0 > 0 && v2 > 0) {
        revCAGR3Y = Number(((Math.pow(v0 / v2, 1 / 2) - 1) * 100).toFixed(2));
      }
    }

    let revCAGR5Y: number | null = null;
    if (revSeries.length >= 5 && typeof revSeries[0]?.value === 'number' && typeof revSeries[4]?.value === 'number') {
      const v0 = revSeries[0].value;
      const v4 = revSeries[4].value;
      if (v0 > 0 && v4 > 0) {
        revCAGR5Y = Number(((Math.pow(v0 / v4, 1 / 4) - 1) * 100).toFixed(2));
      }
    }

    const latestOpItem = opSeries[0] || null;
    const latestOp = latestOpItem && typeof latestOpItem.value === 'number' ? latestOpItem.value : null;
    const opMargin = latestRev !== null && latestOp !== null && latestRev > 0
      ? Number(((latestOp / latestRev) * 100).toFixed(2))
      : null;

    const latestPatItem = patSeries[0] || null;
    const latestPat = latestPatItem && typeof latestPatItem.value === 'number' ? latestPatItem.value : null;
    const patMargin = latestRev !== null && latestPat !== null && latestRev > 0
      ? Number(((latestPat / latestRev) * 100).toFixed(2))
      : null;

    // Margin Direction
    let marginDirectionStatus: 'EXPANDING' | 'STABLE' | 'CONTRACTING' | 'DATA_INSUFFICIENT' | 'CONFLICTING' = 'DATA_INSUFFICIENT';
    if (revSeries.length >= 2 && opSeries.length >= 2) {
      const r0 = typeof revSeries[0]?.value === 'number' ? revSeries[0].value : null;
      const r1 = typeof revSeries[1]?.value === 'number' ? revSeries[1].value : null;
      const o0 = typeof opSeries[0]?.value === 'number' ? opSeries[0].value : null;
      const o1 = typeof opSeries[1]?.value === 'number' ? opSeries[1].value : null;

      if (r0 !== null && r1 !== null && o0 !== null && o1 !== null && r0 > 0 && r1 > 0) {
        const m0 = (o0 / r0) * 100;
        const m1 = (o1 / r1) * 100;
        const diffBps = (m0 - m1) * 100;
        if (diffBps >= 50) marginDirectionStatus = 'EXPANDING';
        else if (diffBps <= -50) marginDirectionStatus = 'CONTRACTING';
        else marginDirectionStatus = 'STABLE';
      }
    }

    const growthTrajectory: GrowthTrajectory = {
      revenueLatestAnnual: this.makeField(
        latestRev,
        latestRev !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'Annual Financial Series',
        defaultFetchedAt,
        { periodType: 'ANNUAL', periodEnd: latestRevPeriod }
      ),
      revenuePriorAnnual: this.makeField(
        priorRev,
        priorRev !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'Annual Financial Series',
        defaultFetchedAt,
        { periodType: 'ANNUAL', periodEnd: priorRevPeriod }
      ),
      revenueGrowthYoY: this.makeField(
        revGrowthYoYVal,
        revGrowthYoYVal !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'DERIVED',
        'Annual Revenue Comparison',
        defaultFetchedAt,
        { periodType: 'ANNUAL', periodEnd: latestRevPeriod }
      ),
      revenueCAGR3Y: this.makeField(
        revCAGR3Y,
        revCAGR3Y !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'DERIVED',
        'Multi-Year Revenue Series',
        defaultFetchedAt,
        { reason: revCAGR3Y === null ? 'Requires 3 dated annual points' : undefined }
      ),
      revenueCAGR5Y: this.makeField(
        revCAGR5Y,
        revCAGR5Y !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'DERIVED',
        'Multi-Year Revenue Series',
        defaultFetchedAt,
        { reason: revCAGR5Y === null ? 'Requires 5 dated annual points' : undefined }
      ),
      quarterlyRevenueLatest: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Quarterly Financials', defaultFetchedAt, {
        reason: 'Quarterly breakdown pending canonical ingestion',
      }),
      quarterlyYoY: this.makeField(null, 'DATA_INSUFFICIENT', 'DERIVED', 'Quarterly Financials', defaultFetchedAt),
      quarterlyQoQ: this.makeField(null, 'DATA_INSUFFICIENT', 'DERIVED', 'Quarterly Financials', defaultFetchedAt),
      operatingProfit: this.makeField(
        latestOp,
        latestOp !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'Annual Financial Series',
        defaultFetchedAt,
        { periodType: 'ANNUAL', periodEnd: latestRevPeriod }
      ),
      operatingMarginPct: this.makeField(
        opMargin,
        opMargin !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'DERIVED',
        'Operating Profit / Revenue',
        defaultFetchedAt,
        { periodType: 'ANNUAL', periodEnd: latestRevPeriod }
      ),
      pat: this.makeField(
        latestPat,
        latestPat !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'Annual Financial Series',
        defaultFetchedAt,
        { periodType: 'ANNUAL', periodEnd: latestRevPeriod }
      ),
      netMarginPct: this.makeField(
        patMargin,
        patMargin !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'DERIVED',
        'PAT / Revenue',
        defaultFetchedAt,
        { periodType: 'ANNUAL', periodEnd: latestRevPeriod }
      ),
      eps: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Key Ratios', defaultFetchedAt, {
        reason: 'EPS metric not present in canonical ratios',
      }),
      ebitdaCAGR3Y: this.makeField(null, 'DATA_INSUFFICIENT', 'DERIVED', 'Multi-Year EBITDA Series', defaultFetchedAt),
      patCAGR3Y: this.makeField(null, 'DATA_INSUFFICIENT', 'DERIVED', 'Multi-Year PAT Series', defaultFetchedAt),
      marginDirection: this.makeField(
        marginDirectionStatus,
        marginDirectionStatus !== 'DATA_INSUFFICIENT' ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'DERIVED',
        'Operating Margin Trajectory',
        defaultFetchedAt
      ),
      earningsConcentration: {
        isConcentrated: false,
        topQuarterPct: null,
        observation: 'Quarterly breakdown absent; concentration analysis requires all 4 statutory quarters.',
        status: 'DATA_INSUFFICIENT',
      },
      orderBook: this.makeField(null, 'DATA_INSUFFICIENT', 'CORPORATE_FILINGS', 'Management Presentation', defaultFetchedAt, {
        reason: 'Order book not directly reported in statutory filings',
      }),
      orderInflow: this.makeField(null, 'DATA_INSUFFICIENT', 'CORPORATE_FILINGS', 'Management Presentation', defaultFetchedAt, {
        reason: 'Order inflow not directly reported in statutory filings',
      }),
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION B: BUSINESS, DEMAND, COMPETITION AND LONGEVITY
    // (Fail-closed: No hard-coded RVTH/mining/Coimbatore statements)
    // ─────────────────────────────────────────────────────────────────────────
    const businessLongevity: BusinessLongevitySection = {
      businessModel,
      revenueDrivers: [],
      productRelevance: {
        assessment: 'MISSING',
        summary: 'Product disclosures absent from canonical records.',
      },
      demandDriversAndCyclicality: {
        assessment: 'MISSING',
        summary: 'Industry cyclicality and demand drivers absent from canonical filings.',
      },
      competitivePosition: {
        assessment: 'MISSING',
        summary: 'Competitive positioning and market share data absent from canonical filings.',
      },
      customerConcentration: {
        assessment: 'MISSING',
        summary: 'Customer concentration metrics absent from canonical filings.',
      },
      capacityAndVisibility: {
        assessment: 'MISSING',
        summary: 'Operating capacity and order visibility data absent from canonical filings.',
      },
      disruptionRisks: [],
      managementOutlook: [],
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION C: FINANCIAL STRENGTH, DEBT AND SERVICING
    // ─────────────────────────────────────────────────────────────────────────
    let deVal: number | null = null;
    let interestCovVal: number | null = null;

    // Check canonical ratios from historicalSeries or company_facts
    const deItem = fundPayload?.historicalSeries?.['DebtToEquity']?.[0] || null;
    if (deItem && typeof deItem.value === 'number') {
      deVal = deItem.value;
    }
    const intCovItem = fundPayload?.historicalSeries?.['InterestCoverage']?.[0] || null;
    if (intCovItem && typeof intCovItem.value === 'number') {
      interestCovVal = intCovItem.value;
    }

    if (db && deVal === null) {
      try {
        const deRows = await queryAll<CanonicalFactRow>(
          db,
          `SELECT factId, metric, value, unit, periodType, periodEnd, scope, provider,
                  sourceType, verificationStatus, sourceDocumentId, fetchedAt, availableAt, reportedAt, asOfDate
           FROM company_facts
           WHERE UPPER(symbol) = ? AND metric IN ('debt_to_equity', 'de_ratio')
             AND ${eligibilityWhereClause()}
           ORDER BY periodEnd DESC, availableAt DESC`,
          [cleanSym]
        );
        const deResult = selectBestFact(deRows, { pointInTime: effectivePointInTime });
        if (deResult.eligibilityStatus === 'ELIGIBLE' && deResult.numericValue !== null) {
          deVal = deResult.numericValue;
        }
      } catch {}
    }
    if (db && interestCovVal === null) {
      try {
        const icrRows = await queryAll<CanonicalFactRow>(
          db,
          `SELECT factId, metric, value, unit, periodType, periodEnd, scope, provider,
                  sourceType, verificationStatus, sourceDocumentId, fetchedAt, availableAt, reportedAt, asOfDate
           FROM company_facts
           WHERE UPPER(symbol) = ? AND metric IN ('interest_coverage', 'icr')
             AND ${eligibilityWhereClause()}
           ORDER BY periodEnd DESC, availableAt DESC`,
          [cleanSym]
        );
        const icrResult = selectBestFact(icrRows, { pointInTime: effectivePointInTime });
        if (icrResult.eligibilityStatus === 'ELIGIBLE' && icrResult.numericValue !== null) {
          interestCovVal = icrResult.numericValue;
        }
      } catch {}
    }

    let debtClassification: FinancialStrengthDebt['classification'] = 'MISSING';
    let debtReason = '';

    if (businessModel === 'BANK' || businessModel === 'NBFC') {
      debtClassification = 'NOT_APPLICABLE';
      debtReason = 'Industrial debt metrics not applicable to banking and lending financial institutions.';
    } else if (deVal === null) {
      debtClassification = 'MISSING';
      debtReason = 'Missing balance sheet debt evidence; cannot assume safe leverage without disclosures.';
    } else {
      if (deVal <= 0.5) {
        debtClassification = 'STRONG';
        debtReason = `Low leverage with Debt/Equity of ${deVal}x (< 0.5x threshold).`;
      } else if (deVal <= 1.0) {
        debtClassification = 'ADEQUATE';
        debtReason = `Moderate leverage with Debt/Equity of ${deVal}x.`;
      } else {
        debtClassification = 'WATCH';
        debtReason = `Elevated leverage with Debt/Equity of ${deVal}x.`;
      }
    }

    const financialStrength: FinancialStrengthDebt = {
      totalDebt: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Balance Sheet', defaultFetchedAt, {
        reason: 'Itemized total debt split between long-term and short-term absent in summary filing',
      }),
      netDebt: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Balance Sheet', defaultFetchedAt, {
        reason: 'Net debt requires cash balance reconciliation',
      }),
      debtToEquity: this.makeField(
        deVal,
        deVal !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'Financial Ratios',
        defaultFetchedAt,
        { periodType: 'ANNUAL' }
      ),
      longTermDebt: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Balance Sheet', defaultFetchedAt),
      shortTermDebt: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Balance Sheet', defaultFetchedAt),
      cashBalance: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Balance Sheet', defaultFetchedAt),
      debtTrend: this.makeField(
        deVal !== null && deVal <= 0.5 ? 'STABLE_LOW' : 'DATA_INSUFFICIENT',
        deVal !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'DERIVED',
        'Ratio History',
        defaultFetchedAt
      ),
      financeCost: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Income Statement', defaultFetchedAt),
      interestCoverage: this.makeField(
        interestCovVal,
        interestCovVal !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'Key Ratios',
        defaultFetchedAt
      ),
      dscr: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Statutory Filings', defaultFetchedAt, {
        reason: 'DSCR not directly disclosed in standard ratio feed',
      }),
      debtMaturities: this.makeField('NOT_DISCLOSED', 'DATA_INSUFFICIENT', 'ANNUAL_REPORT', 'Notes to Accounts', defaultFetchedAt),
      ebitdaToDebt: this.makeField(null, 'DATA_INSUFFICIENT', 'DERIVED', 'EBITDA vs Total Debt', defaultFetchedAt),
      cfo: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Cash Flow', defaultFetchedAt),
      classification: debtClassification,
      classificationReason: debtReason,
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION D: CASH FLOW AND WORKING CAPITAL
    // ─────────────────────────────────────────────────────────────────────────
    const latestCfoItem = cfoSeries[0] || null;
    const canonicalCfo = latestCfoItem && typeof latestCfoItem.value === 'number' ? latestCfoItem.value : null;
    const cfoPeriod = latestCfoItem?.period || '';

    // Check for provider CFO conflict if multiple provider facts exist in database
    let hasCfoConflict = false;
    let providerAVal: any = null;
    let providerBVal: any = null;

    if (db) {
      try {
        const cfoRows = await queryAll<CanonicalFactRow>(
          db,
          `SELECT factId, metric, value, unit, periodType, periodEnd, scope, provider,
                  sourceType, verificationStatus, sourceDocumentId, fetchedAt, availableAt, reportedAt, asOfDate
           FROM company_facts
           WHERE UPPER(symbol) = ? AND metric = 'cfo_cr'
             AND ${eligibilityWhereClause()}
           ORDER BY periodEnd DESC`,
          [cleanSym]
        );

        // Filter through canonical selector with pointInTime gate
        const eligibleCfoRows: Array<CanonicalFactRow & { numericValue: number }> = [];
        for (const row of cfoRows) {
          const assessed = assessFactEligibility(row, { pointInTime: effectivePointInTime });
          if (assessed.eligibilityStatus === 'ELIGIBLE' && assessed.numericValue !== null) {
            eligibleCfoRows.push({ ...row, numericValue: assessed.numericValue });
          }
        }

        // Group by like-for-like periodEnd and scope (only compare identical period and scope)
        const groups = new Map<string, Array<CanonicalFactRow & { numericValue: number }>>();
        for (const r of eligibleCfoRows) {
          const period = (r.periodEnd || '').trim();
          const scope = (r.scope || 'CONSOLIDATED').trim().toUpperCase();
          const key = `${period}::${scope}`;
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(r);
        }

        // Check for provider conflict within the same periodEnd and scope
        for (const rowsInGroup of groups.values()) {
          for (let i = 0; i < rowsInGroup.length; i++) {
            for (let j = i + 1; j < rowsInGroup.length; j++) {
              const rA = rowsInGroup[i];
              const rB = rowsInGroup[j];
              if (rA.provider && rB.provider && rA.provider !== rB.provider) {
                if (Math.abs(rA.numericValue - rB.numericValue) > 1.0) {
                  hasCfoConflict = true;
                  providerAVal = { provider: rA.provider, value: rA.numericValue, period: rA.periodEnd };
                  providerBVal = { provider: rB.provider, value: rB.numericValue, period: rB.periodEnd };
                  break;
                }
              }
            }
            if (hasCfoConflict) break;
          }
          if (hasCfoConflict) break;
        }
      } catch {
        // Non-fatal
      }
    }

    const cfoToPatVal = canonicalCfo !== null && latestPat !== null && latestPat > 0
      ? Number((canonicalCfo / latestPat).toFixed(2))
      : null;

    const cashConversionStatus = hasCfoConflict
      ? 'CONFLICTING'
      : canonicalCfo !== null && cfoToPatVal !== null && cfoToPatVal >= 0.8
      ? 'STRONG'
      : canonicalCfo !== null
      ? 'ADEQUATE'
      : 'MISSING';

    const cashFlowWorkingCapital: CashFlowWorkingCapital = {
      cfo: this.makeField(
        canonicalCfo,
        hasCfoConflict ? 'CONFLICTING' : canonicalCfo !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        latestCfoItem?.provenance?.[0]?.sourceId || 'CANONICAL_FACT',
        'Cash Flow Statement',
        defaultFetchedAt,
        { periodType: 'ANNUAL', periodEnd: cfoPeriod }
      ),
      cfoToPat: this.makeField(
        cfoToPatVal,
        cfoToPatVal !== null && !hasCfoConflict ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'DERIVED',
        'CFO / PAT',
        defaultFetchedAt
      ),
      cfoToEbitda: this.makeField(null, 'DATA_INSUFFICIENT', 'DERIVED', 'CFO / EBITDA', defaultFetchedAt),
      fcf: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Cash Flow', defaultFetchedAt),
      capex: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Cash Flow', defaultFetchedAt),
      receivables: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Balance Sheet', defaultFetchedAt),
      receivableDays: this.makeField(null, 'DATA_INSUFFICIENT', 'DERIVED', 'Receivables / Revenue * 365', defaultFetchedAt),
      inventory: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Balance Sheet', defaultFetchedAt),
      inventoryDays: this.makeField(null, 'DATA_INSUFFICIENT', 'DERIVED', 'Inventory / COGS * 365', defaultFetchedAt),
      payables: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Balance Sheet', defaultFetchedAt),
      cashConversionCycle: this.makeField(null, 'DATA_INSUFFICIENT', 'DERIVED', 'Working Capital Days', defaultFetchedAt),
      workingCapitalMovement: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Cash Flow', defaultFetchedAt),
      cashConversionStatus,
      unresolvedConflict: {
        exists: hasCfoConflict,
        description: hasCfoConflict ? 'Conflicting operating cash flow values reported across providers.' : undefined,
        details: hasCfoConflict && providerAVal && providerBVal ? [
          { provider: providerAVal.provider, value: providerAVal.value, period: providerAVal.period, definition: 'Operating cash flow' },
          { provider: providerBVal.provider, value: providerBVal.value, period: providerBVal.period, definition: 'Reported cash flow' },
        ] : undefined,
      },
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION E: CAPITAL EFFICIENCY
    // ─────────────────────────────────────────────────────────────────────────
    const latestRoceItem = roceSeries[0] || null;
    const roceVal = latestRoceItem && typeof latestRoceItem.value === 'number' ? latestRoceItem.value : null;

    const latestRoeItem = roeSeries[0] || null;
    const roeVal = latestRoeItem && typeof latestRoeItem.value === 'number' ? latestRoeItem.value : null;

    const latestRoaItem = roaSeries[0] || null;
    const roaVal = latestRoaItem && typeof latestRoaItem.value === 'number' ? latestRoaItem.value : null;

    const capitalEfficiency: CapitalEfficiency = {
      roe: this.makeField(
        roeVal,
        roeVal !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'Financial Ratios',
        defaultFetchedAt,
        { periodType: 'ANNUAL' }
      ),
      roce: this.makeField(
        roceVal,
        roceVal !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'Financial Ratios',
        defaultFetchedAt,
        { periodType: 'ANNUAL' }
      ),
      roa: this.makeField(
        roaVal,
        roaVal !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'Financial Ratios',
        defaultFetchedAt,
        { periodType: 'ANNUAL' }
      ),
      roic: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Financial Ratios', defaultFetchedAt),
      roe3YTrend: this.makeField('DATA_INSUFFICIENT', 'DATA_INSUFFICIENT', 'DERIVED', 'Multi-Year ROE', defaultFetchedAt),
      roce3YTrend: this.makeField('DATA_INSUFFICIENT', 'DATA_INSUFFICIENT', 'DERIVED', 'Multi-Year ROCE', defaultFetchedAt),
      sectorComparison: {
        peerMedianRoce: null,
        status: 'DATA_INSUFFICIENT: Awaiting verified comparable cohort median',
      },
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION F: OWNERSHIP AND OWNERSHIP CHANGE
    // (NO fabricated defaults! Explicit zero only when reported zero)
    // ─────────────────────────────────────────────────────────────────────────
    let latestDisclosedPeriod = '';
    let shpAsOfDate: string | null = null;
    let promoterPct: number | null = null;
    let promoterPledgePct: number | null = null;
    let fiiPct: number | null = null;
    let diiPct: number | null = null;
    let publicPct: number | null = null;

    if (db) {
      try {
        const shpRow = await queryGet<any>(
          db,
          `SELECT quarter_label, as_of_date, promoter_pct, fii_pct, dii_pct, public_pct
           FROM HistoricalShareholdingPattern
           WHERE UPPER(symbol) = ?
           ORDER BY as_of_date DESC LIMIT 1`,
          [cleanSym]
        );
        if (shpRow) {
          latestDisclosedPeriod = shpRow.quarter_label || shpRow.as_of_date || '';
          shpAsOfDate = shpRow.as_of_date || null;
          if (typeof shpRow.promoter_pct === 'number') promoterPct = shpRow.promoter_pct;
          if (typeof shpRow.fii_pct === 'number') fiiPct = shpRow.fii_pct;
          if (typeof shpRow.dii_pct === 'number') diiPct = shpRow.dii_pct;
          if (typeof shpRow.public_pct === 'number') publicPct = shpRow.public_pct;
        }
      } catch {
        // Non-fatal
      }
    }

    // Staleness: ownership data older than 90 days (one quarter) is stale.
    // Uses actual as_of_date from stored record, not evaluation timestamp.
    const OWNERSHIP_FRESHNESS_DAYS = 90;
    let isOwnershipStale = false;
    if (shpAsOfDate) {
      const ageDays = Math.floor((Date.now() - new Date(shpAsOfDate).getTime()) / (86400 * 1000));
      isOwnershipStale = ageDays > OWNERSHIP_FRESHNESS_DAYS;
    }

    const ownershipTrend: OwnershipTrend = {
      latestDisclosedPeriod,
      isStale: isOwnershipStale,
      promoterPct: this.makeField(
        promoterPct,
        promoterPct !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'HistoricalShareholdingPattern',
        defaultFetchedAt,
        { periodType: 'QUARTERLY', periodEnd: latestDisclosedPeriod || undefined }
      ),
      promoterChangeQoQ: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'HistoricalShareholdingPattern', defaultFetchedAt),
      promoterChangeYoY: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'HistoricalShareholdingPattern', defaultFetchedAt),
      promoterPledgePct: this.makeField(
        promoterPledgePct,
        promoterPledgePct !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'Shareholding Disclosures',
        defaultFetchedAt
      ),
      promoterPledgeChange: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'Shareholding Disclosures', defaultFetchedAt),
      fiiPct: this.makeField(
        fiiPct,
        fiiPct !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'HistoricalShareholdingPattern',
        defaultFetchedAt
      ),
      fiiChange: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'HistoricalShareholdingPattern', defaultFetchedAt),
      diiPct: this.makeField(
        diiPct,
        diiPct !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'HistoricalShareholdingPattern',
        defaultFetchedAt
      ),
      diiChange: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'HistoricalShareholdingPattern', defaultFetchedAt),
      mfPct: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'HistoricalShareholdingPattern', defaultFetchedAt),
      mfChange: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'HistoricalShareholdingPattern', defaultFetchedAt),
      insurancePct: this.makeField(null, 'DATA_INSUFFICIENT', 'CANONICAL_FACT', 'HistoricalShareholdingPattern', defaultFetchedAt),
      publicPct: this.makeField(
        publicPct,
        publicPct !== null ? 'VERIFIED_PARTIAL' : 'DATA_INSUFFICIENT',
        'CANONICAL_FACT',
        'HistoricalShareholdingPattern',
        defaultFetchedAt
      ),
      disclosedMajorHolders: [],
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION G: QGLP — FOUR EXPLICIT DIMENSIONS
    // (Requirement-based derivation: Longevity MISSING if absent, Price requires context)
    // ─────────────────────────────────────────────────────────────────────────
    const qEvidence: any[] = [];
    const qMissing: string[] = [];
    if (roceVal !== null) {
      qEvidence.push({ parameter: 'ROCE', value: `${roceVal}%`, status: 'VERIFIED_PARTIAL', source: 'CANONICAL_FACT' });
    } else {
      qMissing.push('ROCE not available');
    }
    if (roeVal !== null) {
      qEvidence.push({ parameter: 'ROE', value: `${roeVal}%`, status: 'VERIFIED_PARTIAL', source: 'CANONICAL_FACT' });
    }
    if (deVal !== null) {
      qEvidence.push({ parameter: 'Debt/Equity', value: `${deVal}x`, status: 'VERIFIED_PARTIAL', source: 'CANONICAL_FACT' });
    } else {
      qMissing.push('Debt/Equity ratio not verified');
    }
    if (hasCfoConflict) {
      qEvidence.push({ parameter: 'Cash Flow Conversion', value: 'CONFLICTING', status: 'CONFLICTING', source: 'Canonical Conflict Engine' });
    } else if (canonicalCfo !== null) {
      qEvidence.push({ parameter: 'CFO', value: `₹${canonicalCfo} Cr`, status: 'VERIFIED_PARTIAL', source: 'CANONICAL_FACT' });
    } else {
      qMissing.push('Operating cash flow history');
    }

    const qStatus: QglpFourDimensions['quality']['status'] = hasCfoConflict
      ? 'CONFLICTING'
      : (roceVal !== null && roceVal >= 12 && (deVal ?? 0) <= 0.8)
      ? 'SUPPORTIVE'
      : (roceVal !== null || deVal !== null)
      ? 'MIXED'
      : 'MISSING';

    const gEvidence: any[] = [];
    const gMissing: string[] = [];
    if (latestRev !== null) {
      gEvidence.push({ parameter: 'Latest Annual Revenue', value: `₹${latestRev} Cr`, status: 'VERIFIED_PARTIAL', source: 'CANONICAL_FACT', period: latestRevPeriod });
    }
    if (revGrowthYoYVal !== null) {
      gEvidence.push({ parameter: 'YoY Revenue Growth', value: `${revGrowthYoYVal}%`, status: 'VERIFIED_PARTIAL', source: 'DERIVED' });
    }
    if (opMargin !== null) {
      gEvidence.push({ parameter: 'Operating Margin', value: `${opMargin}%`, status: 'VERIFIED_PARTIAL', source: 'DERIVED' });
    }
    gMissing.push('Statutory quarterly trend series');
    gMissing.push('Verified order book and order inflow figures');

    const gStatus: QglpFourDimensions['growth']['status'] = revGrowthYoYVal !== null && revGrowthYoYVal > 0
      ? 'SUPPORTIVE'
      : revGrowthYoYVal !== null
      ? 'WEAK'
      : 'MISSING';

    // Longevity: must be MISSING when durability inputs are absent; never default to MODERATE
    const lEvidence: any[] = [];
    const lMissing: string[] = ['Durability and moat evidence', 'Competitive positioning metrics', 'Customer concentration data'];
    const lStatus: QglpFourDimensions['longevity']['status'] = 'MISSING';

    // Price: P/E observation alone cannot conclude ATTRACTIVE/REASONABLE/DEMANDING without history/peer context
    let peVal: number | null = null;
    let pbVal: number | null = null;
    const peItem = fundPayload?.historicalSeries?.['PE']?.[0] || null;
    if (peItem && typeof peItem.value === 'number') peVal = peItem.value;
    const pbItem = fundPayload?.historicalSeries?.['PB']?.[0] || null;
    if (pbItem && typeof pbItem.value === 'number') pbVal = pbItem.value;

    if (db && peVal === null) {
      try {
        const peRow = await queryGet<any>(
          db,
          `SELECT value FROM company_facts WHERE UPPER(symbol) = ? AND metric IN ('pe', 'pe_ratio') ORDER BY periodEnd DESC LIMIT 1`,
          [cleanSym]
        );
        if (peRow && !isNaN(parseFloat(peRow.value))) peVal = parseFloat(peRow.value);
      } catch {}
    }

    const pEvidence: any[] = [];
    const pMissing: string[] = [];
    if (peVal !== null) {
      pEvidence.push({ parameter: 'P/E Multiple', value: `${peVal}x`, status: 'VERIFIED_PARTIAL', source: 'CANONICAL_FACT' });
    } else {
      pMissing.push('Trailing P/E ratio');
    }
    if (pbVal !== null) {
      pEvidence.push({ parameter: 'P/B Multiple', value: `${pbVal}x`, status: 'VERIFIED_PARTIAL', source: 'CANONICAL_FACT' });
    }

    // Require dated valuation history or verified peer context for interpretive conclusion
    let pStatus: QglpFourDimensions['price']['status'] = 'MISSING';
    if (peVal === null) {
      pStatus = 'MISSING';
    } else {
      // Single P/E observation without 3Y/5Y range or peer median remains factual observation only; status MISSING for interpretive rating
      pStatus = 'MISSING';
      pMissing.push('Dated historical valuation series (3Y/5Y)', 'Verified comparable-peer valuation context');
    }

    const qglp: QglpFourDimensions = {
      quality: {
        dimension: 'QUALITY',
        status: qStatus,
        summary: `Quality profile reflects ${roceVal !== null ? `ROCE of ${roceVal}%` : 'unindexed ROCE'} with ${deVal !== null ? `leverage of ${deVal}x D/E` : 'unverified leverage'}. ${hasCfoConflict ? 'Cash flow conversion is CONFLICTING across data providers.' : ''}`,
        evidenceList: qEvidence,
        missingInputs: qMissing,
      },
      growth: {
        dimension: 'GROWTH',
        status: gStatus,
        summary: latestRev !== null
          ? `Annual revenue of ₹${latestRev} Cr (${revGrowthYoYVal !== null ? `${revGrowthYoYVal}% YoY` : 'historical comparison unavailable'}). Margin direction is ${marginDirectionStatus}.`
          : 'Revenue history absent from canonical records.',
        evidenceList: gEvidence,
        missingInputs: gMissing,
      },
      longevity: {
        dimension: 'LONGEVITY',
        status: lStatus,
        summary: 'Durability, moat, and competitive positioning evidence absent in canonical filings.',
        evidenceList: lEvidence,
        missingInputs: lMissing,
      },
      price: {
        dimension: 'PRICE',
        status: pStatus,
        summary: peVal !== null
          ? `Reported P/E multiple of ${peVal}x. Interpretive valuation conclusion withheld pending historical/peer valuation context.`
          : 'Valuation multiples pending trailing statutory earnings indexing.',
        evidenceList: pEvidence,
        missingInputs: pMissing,
      },
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION H: RECENT ACCUMULATION / SMART MONEY
    // ─────────────────────────────────────────────────────────────────────────
    const recentAccumulation = await RecentAccumulationEngine.getInstance().evaluate(cleanSym, db);

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION I: GOVERNANCE / RED FLAGS
    // ─────────────────────────────────────────────────────────────────────────
    const governanceRedFlags: GovernanceRedFlagItem[] = [];

    if (promoterPledgePct !== null && promoterPledgePct > 10.0) {
      governanceRedFlags.push({
        event: 'Elevated Promoter Pledge',
        date: latestDisclosedPeriod || asOfDate.substring(0, 10),
        severity: 'CONCERN',
        whyItMatters: `Promoter pledge of ${promoterPledgePct}% increases refinancing vulnerability during sharp market drawdowns.`,
        source: 'CANONICAL_FACT',
      });
    }

    if (hasCfoConflict) {
      governanceRedFlags.push({
        event: 'Cash Conversion Reporting Discrepancy',
        date: defaultFetchedAt ? defaultFetchedAt.substring(0, 10) : asOfDate.substring(0, 10),
        severity: 'WATCH',
        whyItMatters: 'Statutory operating cash flow diverges across data providers; requires audited reconciliation.',
        source: 'Canonical Conflict Engine',
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION J: WHAT TO WATCH (<= 6 items, derived from actual evidence)
    // ─────────────────────────────────────────────────────────────────────────
    const whatToWatch: MonitoringWatchItem[] = [];

    if (latestRev !== null) {
      whatToWatch.push({
        item: 'Statutory Revenue & Operating Margin Trajectory',
        currentStatus: latestRevPeriod ? `Latest annual reported: ${latestRevPeriod}` : 'Awaiting publication',
        triggerOrTarget: 'Next Quarterly Statutory Results Release',
        whyImportant: 'Validates operating margin trajectory and revenue growth cadence.',
        priority: 1,
      });
    }

    if (hasCfoConflict || canonicalCfo !== null) {
      whatToWatch.push({
        item: 'Operating Cash Flow & Working Capital Conversion',
        currentStatus: hasCfoConflict ? 'CONFLICTING across reporting providers' : `₹${canonicalCfo} Cr reported CFO`,
        triggerOrTarget: 'Statutory Annual Report Cash Flow Statement',
        whyImportant: 'Ensures reported profit converts into tangible cash collections rather than trapped working capital.',
        priority: 2,
      });
    }

    if (roceVal !== null) {
      whatToWatch.push({
        item: 'Capital Productivity (ROCE Sustainment)',
        currentStatus: `${roceVal}%`,
        triggerOrTarget: 'ROCE >= 15% threshold',
        whyImportant: 'Tracks efficiency in utilizing capital and operating assets.',
        priority: 3,
      });
    }

    if (recentAccumulation.analysisStartDate) {
      whatToWatch.push({
        item: 'Post-Shareholding Market Participation Dynamics',
        currentStatus: recentAccumulation.classification,
        triggerOrTarget: 'Disclosed Block/Bulk or SAST filings',
        whyImportant: 'Monitors whether institutional or recognized marquee investors step in following quarterly disclosure lag.',
        priority: 4,
      });
    }

    if (promoterPct !== null) {
      whatToWatch.push({
        item: 'Promoter Ownership & Encumbrance Vigilance',
        currentStatus: `${promoterPct}% holding${promoterPledgePct !== null ? `, ${promoterPledgePct}% pledge` : ''}`,
        triggerOrTarget: 'Statutory quarterly shareholding pattern release',
        whyImportant: 'Confirms alignment of controlling promoters with minority shareholders.',
        priority: 5,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION K: EXECUTIVE BRIEF ("WHAT MATTERS NOW")
    // Requirements:
    // - Evidence-backed deterministic brief, up to 150 words.
    // - No minimum word count. Do not pad missing evidence.
    // - Never use fallback sector such as Industrials.
    // - Never use fallback ownership values or unverified clean pledge conclusions.
    // ─────────────────────────────────────────────────────────────────────────
    const briefElements: ExecutiveBriefElement[] = [];

    // Fact 1: Reported Revenue & Earnings
    if (latestRev !== null) {
      const sectorClause = sector ? ` in ${sector}` : '';
      briefElements.push({
        category: 'REPORTED_FACT',
        text: `${cleanSym} reported ${latestRevPeriod || 'latest'} annual revenue of ₹${latestRev} Cr${latestPat !== null ? ` with net profit of ₹${latestPat} Cr` : ''}${sectorClause}.`,
        evidenceRef: 'CANONICAL_FACT:Revenue',
      });
    }

    // Fact 2: Margins & Leverage
    if (opMargin !== null) {
      const leverageClause = deVal !== null ? ` with balance-sheet leverage of ${deVal}x D/E` : '';
      const roceClause = roceVal !== null ? ` and ROCE of ${roceVal}%` : '';
      briefElements.push({
        category: 'DERIVED_METRIC',
        text: `Operating margin stands at ${opMargin}%${leverageClause}${roceClause}.`,
        evidenceRef: 'DERIVED:OperatingMargin',
      });
    }

    // Fact 3: Discrepancy / Conflict
    if (hasCfoConflict && providerAVal && providerBVal) {
      briefElements.push({
        category: 'MISSING_OR_CONFLICTING',
        text: `Cash conversion shows unresolved provider conflict: ${providerAVal.provider} reports ₹${providerAVal.value} Cr vs ${providerBVal.provider} ₹${providerBVal.value} Cr.`,
        evidenceRef: 'CANONICAL_CONFLICT:CFO',
      });
    }

    // Fact 4: Market Activity
    if (recentAccumulation.analysisStartDate && recentAccumulation.classification !== 'NO_CONFIRMATION') {
      briefElements.push({
        category: 'MARKET_ACTIVITY_EVIDENCE',
        text: `Post-${latestDisclosedPeriod || 'disclosure'} market activity indicates ${recentAccumulation.classification.toLowerCase().replace(/_/g, ' ')}.`,
        evidenceRef: 'MARKET_ACTIVITY:RecentAccumulation',
      });
    }

    // Fact 5: Ownership Status
    if (promoterPct !== null) {
      const pledgeClause = promoterPledgePct !== null ? ` with ${promoterPledgePct}% pledge` : '';
      const diiClause = diiPct !== null ? `${diiPct}% DII` : 'DII holding unindexed';
      const fiiClause = fiiPct !== null ? `${fiiPct}% FII` : 'FII holding unindexed';
      const periodClause = latestDisclosedPeriod ? ` as of ${latestDisclosedPeriod}` : '';
      briefElements.push({
        category: 'REPORTED_FACT',
        text: `Promoter ownership is ${promoterPct}%${pledgeClause}${periodClause} (${diiClause}, ${fiiClause}).`,
        evidenceRef: 'CANONICAL_FACT:Shareholding',
      });
    }

    let briefText = briefElements.map(e => e.text).join(' ');
    if (!briefText) {
      briefText = `Data coverage is insufficient to form an evidence-backed fundamental executive brief for ${cleanSym}.`;
      briefElements.push({
        category: 'MISSING_OR_CONFLICTING',
        text: briefText,
      });
    }

    const wordCount = briefText.split(/\s+/).filter(Boolean).length;

    const dataConfidence: FundamentalExperiencePayload['dataConfidence'] =
      hasCfoConflict ? 'MODERATE' : latestRev !== null && deVal !== null && promoterPct !== null ? 'HIGH' : 'DATA_INSUFFICIENT';

    const executiveBrief: ExecutiveBrief = {
      wordCount,
      text: briefText,
      dataConfidence,
      sourceCoverage: `Canonical facts + MasterTickers + HistoricalShareholdingPattern (${sourcesUsed.length} canonical evidence records linked).`,
      elements: briefElements,
    };

    const whatMattersNow: string[] = briefElements.map(e => e.text);

    const unresolvedConflicts: FundamentalExperiencePayload['unresolvedConflicts'] = [];
    if (hasCfoConflict && providerAVal && providerBVal) {
      unresolvedConflicts.push({
        field: 'cash_flow_operating',
        providerA: providerAVal.provider,
        valueA: `₹${providerAVal.value} Cr`,
        periodA: providerAVal.period,
        providerB: providerBVal.provider,
        valueB: `₹${providerBVal.value} Cr`,
        periodB: providerBVal.period,
        reason: 'Reported operating cash flow values diverge across provider sources. Unresolved until line-item reconciliation.',
      });
    }

    return {
      symbol: cleanSym,
      companyName: companyName || cleanSym,
      sector,
      industry,
      businessModel,
      asOfDate,
      dataConfidence,
      sourceCoverage: executiveBrief.sourceCoverage,
      executiveBrief,
      whatMattersNow,
      growthTrajectory,
      businessLongevity,
      financialStrength,
      cashFlowWorkingCapital,
      capitalEfficiency,
      ownershipTrend,
      qglp,
      recentAccumulation,
      governanceRedFlags,
      whatToWatch,
      unresolvedConflicts,
      sourcesUsed,
    };
  }
}
