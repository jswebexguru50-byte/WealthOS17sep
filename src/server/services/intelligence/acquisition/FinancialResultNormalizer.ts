/**
 * FinancialResultNormalizer.ts — Generic Financial Disclosure Normalizer
 * WealthOS V2 Wave B (Live Data and Evidence Ingestion)
 *
 * Normalizes raw financial results payloads (XBRL, tabular filings, PR disclosures)
 * into canonical accounting facts with strict provenance and PIT metadata.
 *
 * Zero company-specific logic. Works generically across any Indian equity.
 */

import { SourceDocument } from '../contracts/SourceDocument.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';

export interface RawFinancialDisclosure {
  periodEnd: string; // 'YYYY-MM-DD'
  periodType: 'QUARTERLY' | 'ANNUAL' | 'TTM';
  scope?: 'CONSOLIDATED' | 'STANDALONE';
  currency?: string;
  metrics: Record<string, number | string>;
  rawNotes?: string;
}

export interface NormalizedCanonicalFactInput {
  factId: string;
  companyId: string;
  isin: string;
  symbol: string;
  metric: string;
  value: number;
  unit: string;
  periodType: string;
  periodEnd: string;
  asOfDate: string;
  reportedAt: string;
  availableAt: string;
  factType: string;
  sourceType: string;
  scope: string;
  provider: string;
  verificationStatus: string;
  sourceDocumentId: string;
  sourceUrl: string | null;
  evidenceText: string;
  calculationMethod: string;
}

export class FinancialResultNormalizer {
  private static instance: FinancialResultNormalizer;
  private constructor() {}

  public static getInstance(): FinancialResultNormalizer {
    if (!FinancialResultNormalizer.instance) {
      FinancialResultNormalizer.instance = new FinancialResultNormalizer();
    }
    return FinancialResultNormalizer.instance;
  }

  public normalize(
    doc: SourceDocument,
    identity: SecurityIdentity,
    payload: RawFinancialDisclosure
  ): NormalizedCanonicalFactInput[] {
    const facts: NormalizedCanonicalFactInput[] = [];
    const scope = payload.scope || 'CONSOLIDATED';
    const periodType = payload.periodType || 'QUARTERLY';
    const periodEnd = payload.periodEnd;
    const isin = identity.isin;
    const symbol = identity.nseSymbol || identity.bseCode || doc.symbol;
    const companyId = identity.securityId || isin;

    // Standard metric mapping synonyms
    const metricMap: Record<string, { standardKey: string; unit: string }> = {
      revenue: { standardKey: 'revenue_cr', unit: 'Cr' },
      revenue_cr: { standardKey: 'revenue_cr', unit: 'Cr' },
      total_revenue: { standardKey: 'revenue_cr', unit: 'Cr' },
      sales: { standardKey: 'revenue_cr', unit: 'Cr' },
      turnover: { standardKey: 'revenue_cr', unit: 'Cr' },

      ebitda: { standardKey: 'ebitda_cr', unit: 'Cr' },
      ebitda_cr: { standardKey: 'ebitda_cr', unit: 'Cr' },
      operating_profit: { standardKey: 'ebitda_cr', unit: 'Cr' },

      pat: { standardKey: 'pat_cr', unit: 'Cr' },
      pat_cr: { standardKey: 'pat_cr', unit: 'Cr' },
      net_profit: { standardKey: 'pat_cr', unit: 'Cr' },
      profit_after_tax: { standardKey: 'pat_cr', unit: 'Cr' },

      eps: { standardKey: 'eps_inr', unit: 'INR' },
      eps_inr: { standardKey: 'eps_inr', unit: 'INR' },
      diluted_eps: { standardKey: 'eps_inr', unit: 'INR' },

      ebitda_margin: { standardKey: 'ebitda_margin_pct', unit: '%' },
      ebitda_margin_pct: { standardKey: 'ebitda_margin_pct', unit: '%' },

      pat_margin: { standardKey: 'pat_margin_pct', unit: '%' },
      pat_margin_pct: { standardKey: 'pat_margin_pct', unit: '%' },

      order_book: { standardKey: 'order_book_cr', unit: 'Cr' },
      order_book_cr: { standardKey: 'order_book_cr', unit: 'Cr' },

      capacity_utilization: { standardKey: 'capacity_utilization_pct', unit: '%' },
      capacity_utilization_pct: { standardKey: 'capacity_utilization_pct', unit: '%' },
    };

    for (const [rawKey, rawVal] of Object.entries(payload.metrics)) {
      const cleanKey = rawKey.trim().toLowerCase().replace(/[\s-]+/g, '_');
      const mapping = metricMap[cleanKey];
      if (!mapping) continue;

      const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
      if (isNaN(numVal)) continue;

      const cleanPeriod = periodEnd.replace(/[^a-zA-Z0-9]/g, '_');
      const factId = `fact_${isin}_${mapping.standardKey}_${cleanPeriod}_${scope.toLowerCase()}`;

      facts.push({
        factId,
        companyId,
        isin,
        symbol,
        metric: mapping.standardKey,
        value: numVal,
        unit: mapping.unit,
        periodType,
        periodEnd,
        asOfDate: doc.publishedAt,
        reportedAt: doc.publishedAt,
        availableAt: doc.availableAt,
        factType: 'PRIMARY',
        sourceType: doc.sourceType === 'FINANCIAL_RESULTS' ? 'AUDITED_FINANCIAL_STATEMENT' : 'EXCHANGE_FILING',
        scope,
        provider: doc.sourceAuthority,
        verificationStatus: 'VERIFIED',
        sourceDocumentId: doc.documentId,
        sourceUrl: doc.sourceUrl,
        evidenceText: `${doc.title}: ${mapping.standardKey} reported as ${numVal} ${mapping.unit} for period ended ${periodEnd}`,
        calculationMethod: 'STRUCTURED_XBRL',
      });
    }

    // Auto-derive margins if revenue and ebitda/pat are available and not already reported
    const revFact = facts.find(f => f.metric === 'revenue_cr');
    const ebitdaFact = facts.find(f => f.metric === 'ebitda_cr');
    const patFact = facts.find(f => f.metric === 'pat_cr');

    if (revFact && revFact.value > 0 && ebitdaFact && !facts.some(f => f.metric === 'ebitda_margin_pct')) {
      const margin = parseFloat(((ebitdaFact.value / revFact.value) * 100).toFixed(2));
      const cleanPeriod = periodEnd.replace(/[^a-zA-Z0-9]/g, '_');
      facts.push({
        factId: `fact_${isin}_ebitda_margin_pct_${cleanPeriod}_${scope.toLowerCase()}`,
        companyId,
        isin,
        symbol,
        metric: 'ebitda_margin_pct',
        value: margin,
        unit: '%',
        periodType,
        periodEnd,
        asOfDate: doc.publishedAt,
        reportedAt: doc.publishedAt,
        availableAt: doc.availableAt,
        factType: 'DERIVED',
        sourceType: 'AUDITED_FINANCIAL_STATEMENT',
        scope,
        provider: doc.sourceAuthority,
        verificationStatus: 'VERIFIED',
        sourceDocumentId: doc.documentId,
        sourceUrl: doc.sourceUrl,
        evidenceText: `Derived EBITDA Margin: (${ebitdaFact.value} / ${revFact.value}) * 100 = ${margin}%`,
        calculationMethod: 'DERIVED_FORMULA',
      });
    }

    if (revFact && revFact.value > 0 && patFact && !facts.some(f => f.metric === 'pat_margin_pct')) {
      const margin = parseFloat(((patFact.value / revFact.value) * 100).toFixed(2));
      const cleanPeriod = periodEnd.replace(/[^a-zA-Z0-9]/g, '_');
      facts.push({
        factId: `fact_${isin}_pat_margin_pct_${cleanPeriod}_${scope.toLowerCase()}`,
        companyId,
        isin,
        symbol,
        metric: 'pat_margin_pct',
        value: margin,
        unit: '%',
        periodType,
        periodEnd,
        asOfDate: doc.publishedAt,
        reportedAt: doc.publishedAt,
        availableAt: doc.availableAt,
        factType: 'DERIVED',
        sourceType: 'AUDITED_FINANCIAL_STATEMENT',
        scope,
        provider: doc.sourceAuthority,
        verificationStatus: 'VERIFIED',
        sourceDocumentId: doc.documentId,
        sourceUrl: doc.sourceUrl,
        evidenceText: `Derived PAT Margin: (${patFact.value} / ${revFact.value}) * 100 = ${margin}%`,
        calculationMethod: 'DERIVED_FORMULA',
      });
    }

    return facts;
  }
}
