/**
 * FreshnessEngine.ts — Deterministic Domain-Aware Freshness Engine
 *
 * Implements Constitution P4:
 * - Return per-domain: status, latestAvailableAt, expectedThrough, sourceDocumentIds, reason
 * - Allowed statuses: FRESH, CURRENT, STALE, MISSING, UNKNOWN, CONFLICTED
 * - Domain-aware: price, financial results, shareholding, management evidence, technical, corporate events
 * - Never default missing freshness to CURRENT or FRESH
 */

export type DomainFreshnessStatus =
  | 'FRESH'
  | 'CURRENT'
  | 'STALE'
  | 'MISSING'
  | 'UNKNOWN'
  | 'CONFLICTED';

export interface DomainFreshnessResult {
  status: DomainFreshnessStatus;
  latestAvailableAt: string | null;
  expectedThrough: string | null;
  sourceDocumentIds: string[];
  reason: string;
}

export interface FreshnessEvaluationInput {
  asOfDate?: string | null;
  marketPriceAsOf?: string | null;
  marketPriceFreshness?: string | null;
  latestFilingPeriodEnd?: string | null;
  latestFilingAvailableAt?: string | null;
  financialFilingDocIds?: string[];
  shareholdingAsOf?: string | null;
  shareholdingDocIds?: string[];
  managementCommitmentCount?: number;
  latestCommitmentAvailableAt?: string | null;
  corporateEventCount?: number;
  latestCorporateEventDate?: string | null;
  valuationStatus?: string | null;
}

export interface CompanyFreshnessMatrix {
  marketPrice: DomainFreshnessStatus;
  financialResults: DomainFreshnessStatus;
  managementEvidence: DomainFreshnessStatus;
  shareholding: DomainFreshnessStatus;
  valuation: DomainFreshnessStatus;
  technical: DomainFreshnessStatus;
  corporateEvents: DomainFreshnessStatus;
  overallStatus: DomainFreshnessStatus;
  domains: {
    marketPrice: DomainFreshnessResult;
    financialResults: DomainFreshnessResult;
    managementEvidence: DomainFreshnessResult;
    shareholding: DomainFreshnessResult;
    valuation: DomainFreshnessResult;
    technical: DomainFreshnessResult;
    corporateEvents: DomainFreshnessResult;
  };
}

export class FreshnessEngine {
  private static instance: FreshnessEngine;

  private constructor() {}

  public static getInstance(): FreshnessEngine {
    if (!FreshnessEngine.instance) {
      FreshnessEngine.instance = new FreshnessEngine();
    }
    return FreshnessEngine.instance;
  }

  public evaluate(input: FreshnessEvaluationInput): CompanyFreshnessMatrix {
    const referenceDateStr = input.asOfDate || new Date().toISOString().substring(0, 10);
    const refMs = new Date(referenceDateStr).getTime();

    // 1. Market Price & Technical
    let priceStatus: DomainFreshnessStatus = 'UNKNOWN';
    let priceReason = 'No price data available';
    if (input.marketPriceAsOf) {
      const priceAgeDays = Math.max(0, Math.floor((refMs - new Date(input.marketPriceAsOf).getTime()) / (1000 * 86400)));
      if (priceAgeDays <= 2) {
        priceStatus = 'FRESH';
        priceReason = `Price data is current within ${priceAgeDays} day(s)`;
      } else if (priceAgeDays <= 7) {
        priceStatus = 'CURRENT';
        priceReason = `Price data is within standard weekly lookback (${priceAgeDays} days)`;
      } else {
        priceStatus = 'STALE';
        priceReason = `Price data is ${priceAgeDays} days old (>7 days)`;
      }
    } else if (input.marketPriceFreshness) {
      priceStatus = (input.marketPriceFreshness as DomainFreshnessStatus) || 'UNKNOWN';
      priceReason = 'Inherited from price repository state';
    }

    const marketPriceDomain: DomainFreshnessResult = {
      status: priceStatus,
      latestAvailableAt: input.marketPriceAsOf || null,
      expectedThrough: referenceDateStr,
      sourceDocumentIds: [],
      reason: priceReason,
    };

    const technicalDomain: DomainFreshnessResult = {
      status: priceStatus,
      latestAvailableAt: input.marketPriceAsOf || null,
      expectedThrough: referenceDateStr,
      sourceDocumentIds: [],
      reason: `Technical indicators inherit market price status (${priceStatus})`,
    };

    // 2. Financial Results
    let finStatus: DomainFreshnessStatus = 'MISSING';
    let finReason = 'No financial statement filings ingested';
    if (input.latestFilingPeriodEnd) {
      const finAgeDays = Math.max(0, Math.floor((refMs - new Date(input.latestFilingPeriodEnd).getTime()) / (1000 * 86400)));
      if (finAgeDays <= 135) {
        finStatus = 'CURRENT';
        finReason = `Latest filing covers period ending ${input.latestFilingPeriodEnd} (${finAgeDays} days ago, within quarterly cycle)`;
      } else {
        finStatus = 'STALE';
        finReason = `Latest filing period ended ${input.latestFilingPeriodEnd} (${finAgeDays} days old, overdue for quarterly cycle)`;
      }
    }

    const financialDomain: DomainFreshnessResult = {
      status: finStatus,
      latestAvailableAt: input.latestFilingAvailableAt || input.latestFilingPeriodEnd || null,
      expectedThrough: input.latestFilingPeriodEnd ? this.addDays(input.latestFilingPeriodEnd, 120) : null,
      sourceDocumentIds: input.financialFilingDocIds || [],
      reason: finReason,
    };

    // 3. Shareholding
    let shStatus: DomainFreshnessStatus = 'MISSING';
    let shReason = 'No shareholding pattern filing recorded';
    if (input.shareholdingAsOf) {
      const shAgeDays = Math.max(0, Math.floor((refMs - new Date(input.shareholdingAsOf).getTime()) / (1000 * 86400)));
      if (shAgeDays <= 120) {
        shStatus = 'CURRENT';
        shReason = `Shareholding pattern current within quarterly cycle (${shAgeDays} days old)`;
      } else {
        shStatus = 'STALE';
        shReason = `Shareholding pattern is ${shAgeDays} days old (>120 days)`;
      }
    }

    const shareholdingDomain: DomainFreshnessResult = {
      status: shStatus,
      latestAvailableAt: input.shareholdingAsOf || null,
      expectedThrough: input.shareholdingAsOf ? this.addDays(input.shareholdingAsOf, 105) : null,
      sourceDocumentIds: input.shareholdingDocIds || [],
      reason: shReason,
    };

    // 4. Management Evidence (Walk-the-Talk)
    let mgmtStatus: DomainFreshnessStatus = 'MISSING';
    let mgmtReason = 'No management disclosures or commitments extracted';
    if ((input.managementCommitmentCount ?? 0) > 0) {
      mgmtStatus = 'CURRENT';
      mgmtReason = `${input.managementCommitmentCount} management commitment(s) tracked in Walk-the-Talk ledger`;
    }

    const managementDomain: DomainFreshnessResult = {
      status: mgmtStatus,
      latestAvailableAt: input.latestCommitmentAvailableAt || null,
      expectedThrough: null,
      sourceDocumentIds: [],
      reason: mgmtReason,
    };

    // 5. Valuation
    let valStatus: DomainFreshnessStatus = 'UNKNOWN';
    let valReason = 'Valuation requires current fundamentals and price';
    if (priceStatus === 'FRESH' && finStatus === 'CURRENT') {
      valStatus = 'FRESH';
      valReason = 'Valuation models computed from fresh market price and current financial results';
    } else if (finStatus === 'CURRENT') {
      valStatus = 'CURRENT';
      valReason = 'Valuation models aligned with current financial disclosures';
    } else if (finStatus === 'STALE' || priceStatus === 'STALE') {
      valStatus = 'STALE';
      valReason = 'Valuation relies on stale input metrics';
    } else {
      valStatus = 'UNKNOWN';
      valReason = 'Insufficient inputs to assess valuation freshness';
    }

    const valuationDomain: DomainFreshnessResult = {
      status: valStatus,
      latestAvailableAt: input.marketPriceAsOf || null,
      expectedThrough: referenceDateStr,
      sourceDocumentIds: [],
      reason: valReason,
    };

    // 6. Corporate Events
    let evtStatus: DomainFreshnessStatus = 'MISSING';
    let evtReason = 'No verified corporate events recorded';
    if ((input.corporateEventCount ?? 0) > 0) {
      evtStatus = 'CURRENT';
      evtReason = `${input.corporateEventCount} corporate event(s) recorded`;
    }

    const corporateEventsDomain: DomainFreshnessResult = {
      status: evtStatus,
      latestAvailableAt: input.latestCorporateEventDate || null,
      expectedThrough: null,
      sourceDocumentIds: [],
      reason: evtReason,
    };

    // Overall Status
    const criticalStatuses = [priceStatus, finStatus];
    const overallStatus: DomainFreshnessStatus =
      criticalStatuses.every(s => s === 'FRESH') ? 'FRESH' :
      criticalStatuses.every(s => s === 'FRESH' || s === 'CURRENT') ? 'CURRENT' :
      criticalStatuses.some(s => s === 'STALE') ? 'STALE' :
      criticalStatuses.some(s => s === 'MISSING') ? 'MISSING' :
      'UNKNOWN';

    return {
      marketPrice: priceStatus,
      financialResults: finStatus,
      managementEvidence: mgmtStatus,
      shareholding: shStatus,
      valuation: valStatus,
      technical: priceStatus,
      corporateEvents: evtStatus,
      overallStatus,
      domains: {
        marketPrice: marketPriceDomain,
        financialResults: financialDomain,
        managementEvidence: managementDomain,
        shareholding: shareholdingDomain,
        valuation: valuationDomain,
        technical: technicalDomain,
        corporateEvents: corporateEventsDomain,
      },
    };
  }

  private addDays(dateStr: string, days: number): string {
    try {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + days);
      return d.toISOString().substring(0, 10);
    } catch {
      return dateStr;
    }
  }
}
