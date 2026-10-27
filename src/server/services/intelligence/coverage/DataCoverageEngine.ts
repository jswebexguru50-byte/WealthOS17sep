import type { CompanyDataCoverage, DomainCoverage, FieldCoverage, DataCoverageStatus } from '../contracts/CoverageContracts.js';

/**
 * Deterministic field-level coverage evaluator. Raw endpoint success is not
 * evidence of usable history: a field is only present when its payload has a
 * non-empty value or time series. This service is deliberately side-effect
 * free so every screen, dossier, and acceptance test can reuse it.
 */
export class DataCoverageEngine {
  private static instance: DataCoverageEngine;
  static getInstance(): DataCoverageEngine {
    return this.instance ??= new DataCoverageEngine();
  }

  evaluateCoverage(symbol: string, isin: string | null, raw: Record<string, any>, asOfDate: string): CompanyDataCoverage {
    const fundamentals = this.domain('FUNDAMENTALS', [
      ['income_history', this.hasHistory(raw, ['incomeStatement', 'data', 'income_statement'])],
      ['balance_sheet', this.hasHistory(raw, ['balanceSheet', 'data', 'history'])],
      ['cash_flow', this.hasHistory(raw, ['cashFlow', 'data', 'cash_flow'])],
      ['key_ratios', this.hasValues(raw, ['keyRatios'])],
    ]);
    const management = this.domain('MANAGEMENT', [
      ['management_changes', this.hasValues(raw, ['management']) || this.hasValues(raw, ['managementChanges'])],
      ['governance_disclosures', this.hasValues(raw, ['fere']) || this.hasValues(raw, ['governance'])],
    ]);
    // Keep the six analytical domains explicit.  A screen may only request a
    // subset of modules, but the coverage contract must still tell callers
    // which dimensions are observable and which are not.  Presence is based
    // on module payloads (not on a successful HTTP response or row count).
    const businessDrivers = this.domain('BUSINESS_DRIVERS', [
      ['business_drivers', this.hasAny(raw, ['businessDrivers', 'businessInflection', 'drivers'])],
      ['demand_and_capacity', this.hasAny(raw, ['businessDrivers.demand', 'businessInflection.demand', 'marketContext'])],
      ['competitive_position', this.hasAny(raw, ['businessDrivers.competitivePosition', 'businessInflection.competitivePosition', 'competitive'])],
    ]);
    const valuation = this.domain('VALUATION', [
      ['valuation_metrics', this.hasAny(raw, ['valuation', 'valuation.result', 'qglp.valuation'])],
      ['relative_valuation', this.hasAny(raw, ['valuation.relative', 'valuation.result.pe', 'valuation.result.pettm', 'qglp.valuation'])],
      ['intrinsic_value', this.hasAny(raw, ['valuation.intrinsicValue', 'valuation.result.intrinsicValue', 'valuation.result.dcf'])],
    ]);
    const technical = this.domain('TECHNICAL', [
      ['ohlcv', this.hasAny(raw, ['technical', 'technical.result', 'ohlcv', 'marketData.ohlcv'])],
      ['trend_indicators', this.hasAny(raw, ['technical.result.indicators', 'technical.indicators', 'indicators'])],
      ['momentum_and_volatility', this.hasAny(raw, ['technical.result.momentum', 'technical.result.volatility', 'momentum', 'volatility'])],
    ]);
    const fereFilings = this.domain('FERE_FILINGS', [
      ['statutory_facts', this.hasAny(raw, ['fere', 'fere.result', 'filings', 'companyFacts'])],
      ['filing_history', this.hasAny(raw, ['fere.filings', 'fere.result.filings', 'filings.history'])],
      ['evidence_lineage', this.hasAny(raw, ['fere.evidence', 'fere.result.evidence', 'evidence', 'provenance'])],
    ]);
    const unavailable = Object.values(raw ?? {}).length === 0;
    if (unavailable) {
      fundamentals.overallStatus = 'SOURCE_UNAVAILABLE';
      management.overallStatus = 'SOURCE_UNAVAILABLE';
      businessDrivers.overallStatus = 'SOURCE_UNAVAILABLE';
      valuation.overallStatus = 'SOURCE_UNAVAILABLE';
      technical.overallStatus = 'SOURCE_UNAVAILABLE';
      fereFilings.overallStatus = 'SOURCE_UNAVAILABLE';
    }
    const anyCore = fundamentals.requiredFieldsPresent > 0;
    const overallSuitability = anyCore && fundamentals.overallStatus !== 'INSUFFICIENT'
      ? 'CONDITIONAL_ANALYSIS' : 'DATA_INSUFFICIENT';
    return {
      securityId: symbol,
      isin: isin ?? '',
      asOfDate,
      overallSuitability,
      domains: {
        FUNDAMENTALS: fundamentals,
        BUSINESS_DRIVERS: businessDrivers,
        MANAGEMENT: management,
        VALUATION: valuation,
        TECHNICAL: technical,
        FERE_FILINGS: fereFilings,
      },
      lastAuditedAt: new Date().toISOString(),
    };
  }

  private domain(domain: DomainCoverage['domain'], fields: Array<[string, boolean]>): DomainCoverage {
    const mapped: Record<string, FieldCoverage> = {};
    let present = 0;
    for (const [field, ok] of fields) {
      if (ok) present++;
      mapped[field] = { field, status: ok ? 'VERIFIED' : 'MISSING', periodsAvailable: ok ? 1 : 0 };
    }
    const status: DataCoverageStatus = present === fields.length ? 'SUFFICIENT' : present > 0 ? 'PARTIAL' : 'INSUFFICIENT';
    return { domain, overallStatus: status, requiredFieldsPresent: present, totalRequiredFields: fields.length, fields: mapped, unobservableDimensions: fields.filter(([, ok]) => !ok).map(([f]) => f) };
  }

  private hasValues(raw: Record<string, any>, path: string[]): boolean {
    let value: any = raw;
    for (const key of path) value = value?.[key];
    return Array.isArray(value) ? value.length > 0 : value != null && (typeof value !== 'object' || Object.keys(value).length > 0);
  }

  /** Dot-path aware presence check used for module payloads. */
  private hasAny(raw: Record<string, any>, paths: string[]): boolean {
    return paths.some((path) => this.hasValues(raw, path.split('.')));
  }

  private hasHistory(raw: Record<string, any>, path: string[]): boolean {
    let value: any = raw;
    for (const key of path) value = value?.[key];
    if (!Array.isArray(value)) return false;
    return value.some((row: any) => Array.isArray(row?.history) ? row.history.length > 0 : Object.keys(row ?? {}).length > 0);
  }
}

export default DataCoverageEngine;
