/**
 * CompanyAnalyticalStateAssembler.ts — Gate B.1 Integrity Fix
 *
 * Assembles the typed CompanyAnalyticalState from canonical facts and module payloads.
 * This is the single integration point that replaces all `as any` casting
 * in the orchestrator's V2 engine wiring.
 *
 * Architecture:
 *   CANONICAL FACT STORE (portfolio.db company_facts) ← Primary Truth Source
 *         + Module Payloads (Secondary Ingestion / Compatibility)
 *         ↓
 *   CompanyAnalyticalState  ← this file
 *         ↓
 *   BusinessDrivers, Delta, Contradictions, Valuation, Thesis
 *         ↓
 *   Attention + Questions
 *         ↓
 *   Overview
 */

import { FundamentalPayload } from '../types/FundamentalPayload.js';
import { ManagementPayload, ManagementCommitment } from '../types/ManagementPayload.js';
import { ValuationPayload } from '../types/ValuationPayload.js';
import { MarketContextPayload } from '../types/MarketContextPayload.js';
import { CanonicalFactService, AnalyticalFacts } from './CanonicalFactService.js';
import { CanonicalFact } from '../contracts/CanonicalFact.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { EvidenceReference } from '../contracts/Provenance.js';
import { CanonicalFactRepository } from '../core/CanonicalFactRepository.js';
import { SecurityIdentityRegistry } from '../../dataAcquisition/SecurityIdentityRegistry.js';

// ─── State Type ───────────────────────────────────────────────────────────────

export interface CompanyAnalyticalState {
  securityId: string;
  symbol: string;
  businessModel: string;
  asOfDate: string;

  /** Typed canonical facts in time-series positions */
  facts: AnalyticalFacts;

  /** Raw module payloads for engines that need them directly */
  fundamentals: FundamentalPayload | null;
  management: ManagementPayload | null;
  valuation: ValuationPayload | null;
  market: MarketContextPayload | null;
  fere: any | null;
  technical: any | null;

  /** Individual management commitments (not aggregate counts) */
  managementCommitments: ManagementCommitment[];

  /** Missed commitments with actual statement + metric + evidence */
  missedCommitments: ManagementCommitment[];

  /** Evidence coverage summary — honest assessment of what we have */
  evidenceCoverage: {
    fundamentalMetrics: number;
    fundamentalWithHistory: number;
    managementCommitments: number;
    evaluableCommitments: number;
    operatingKpis: number;
    completeness: 'FULL' | 'PARTIAL' | 'MINIMAL';
    limitations: string[];
  };
}

// ─── Assembler ────────────────────────────────────────────────────────────────

export class CompanyAnalyticalStateAssembler {
  private static instance: CompanyAnalyticalStateAssembler;
  private readonly factService: CanonicalFactService;
  private readonly factRepo: CanonicalFactRepository;

  private constructor() {
    this.factService = CanonicalFactService.getInstance();
    this.factRepo = CanonicalFactRepository.getInstance();
  }

  public static getInstance(): CompanyAnalyticalStateAssembler {
    if (!CompanyAnalyticalStateAssembler.instance) {
      CompanyAnalyticalStateAssembler.instance = new CompanyAnalyticalStateAssembler();
    }
    return CompanyAnalyticalStateAssembler.instance;
  }

  /**
   * Assemble typed analytical state from canonical facts and module payloads.
   * Prioritizes CanonicalFactRepository (company_facts) as the primary truth source.
   */
  public async assemble(params: {
    securityId: string;
    symbol: string;
    businessModel: string;
    asOfDate?: string | null;
    fundamentals: FundamentalPayload | null;
    management: ManagementPayload | null;
    valuation: ValuationPayload | null;
    market: MarketContextPayload | null;
    fere: any | null;
    technical: any | null;
  }): Promise<CompanyAnalyticalState> {

    // Resolve canonical SecurityIdentity
    const registry = SecurityIdentityRegistry.getInstance();
    const idRecord = registry.resolveBySymbol(params.symbol) || registry.getIdentity(params.securityId);
    const identity: SecurityIdentity = {
      securityId: idRecord?.securityId || params.securityId,
      isin: idRecord?.isin || params.securityId,
      nseSymbol: idRecord?.nseSymbol || params.symbol,
      bseCode: idRecord?.bseCode || undefined,
      companyName: idRecord?.currentSymbol || params.symbol,
    };

    // 1. Build analytical facts from FundamentalPayload as base
    let facts = this.factService.fromFundamentalPayload(params.symbol, params.fundamentals, params.asOfDate, identity);

    // 2. Primary Truth Ingestion: Overlay verified canonical facts from CanonicalFactRepository
    try {
      const canonicalDbFacts = await this.factRepo.getFactsForSecurity(identity, { asOfDate: params.asOfDate });
      if (canonicalDbFacts && canonicalDbFacts.length > 0) {
        for (const f of canonicalDbFacts) {
          const mKey = f.metric.toLowerCase();
          // Populate latest if not present or replace unverified with verified/source-linked
          if (!facts.latest[mKey] || facts.latest[mKey].verificationStatus === 'NORMALIZED') {
            facts.latest[mKey] = f;
            if (f.evidence) {
              facts.evidenceRefs.push(...f.evidence);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[CompanyAnalyticalStateAssembler] Error querying CanonicalFactRepository:', err);
    }

    // 3. Augment with operating KPIs from DB with strict PIT and canonical ISIN
    facts = await this.factService.augmentWithOperatingKpis(facts, identity, params.asOfDate);

    // 4. Augment with quarterly facts for QoQ delta with strict PIT and canonical ISIN
    facts = await this.factService.augmentWithQuarterlyFacts(facts, identity, params.asOfDate);

    // 5. Extract individual commitments (not aggregate counts)
    const allCommitments: ManagementCommitment[] = params.management?.commitments ?? [];
    const missedCommitments = allCommitments.filter(c =>
      c.status === 'MISSED' || c.status === 'PARTIALLY_ACHIEVED' || c.status === 'PARTIAL'
    );

    // 6. Compute honest evidence coverage
    const limitations: string[] = [];
    const fundamentalMetrics = Object.keys(facts.latest).length;
    const fundamentalWithHistory = Object.keys(facts.priorAnnual).length;
    const managementCommitments = allCommitments.length;
    const evaluableCommitments = allCommitments.filter(c =>
      c.status !== 'NOT_YET_DUE' && c.status !== 'NOT_VERIFIABLE' && c.status !== 'PENDING'
    ).length;
    const operatingKpis = Object.keys(facts.operatingKpis).length;

    if (fundamentalMetrics < 3) limitations.push('Insufficient fundamental metrics');
    if (fundamentalWithHistory < 2) limitations.push('No prior period for delta or trajectory');
    if (managementCommitments === 0) limitations.push('No management commitments found');
    if (operatingKpis === 0) limitations.push('No operating KPI data — analysis is accounting-based only');

    const completeness: CompanyAnalyticalState['evidenceCoverage']['completeness'] =
      fundamentalMetrics >= 5 && managementCommitments > 0 && operatingKpis > 0 ? 'FULL'
      : fundamentalMetrics >= 3 ? 'PARTIAL'
      : 'MINIMAL';

    return {
      securityId: identity.securityId,
      symbol: params.symbol,
      businessModel: params.businessModel,
      asOfDate: facts.asOfDate ?? new Date().toISOString(),
      facts,
      fundamentals: params.fundamentals,
      management: params.management,
      valuation: params.valuation,
      market: params.market,
      fere: params.fere,
      technical: params.technical,
      managementCommitments: allCommitments,
      missedCommitments,
      evidenceCoverage: {
        fundamentalMetrics,
        fundamentalWithHistory,
        managementCommitments,
        evaluableCommitments,
        operatingKpis,
        completeness,
        limitations,
      },
    };
  }

  /**
   * Get a specific metric value from analytical state.
   * Returns null with no exception when data unavailable.
   */
  public getMetric(state: CompanyAnalyticalState, metricKey: string): number | null {
    const val = state.facts.latest[metricKey]?.value;
    if (val === null || val === undefined) return null;
    return typeof val === 'number' ? val : parseFloat(String(val));
  }

  /**
   * Get prior annual value for a metric (for YoY comparison).
   */
  public getPriorAnnual(state: CompanyAnalyticalState, metricKey: string): number | null {
    const val = state.facts.priorAnnual[metricKey]?.value;
    if (val === null || val === undefined) return null;
    return typeof val === 'number' ? val : parseFloat(String(val));
  }

  /**
   * Get prior quarter value for a metric (for QoQ comparison).
   */
  public getPriorQuarter(state: CompanyAnalyticalState, metricKey: string): number | null {
    const val = state.facts.priorQuarter[metricKey]?.value;
    if (val === null || val === undefined) return null;
    return typeof val === 'number' ? val : parseFloat(String(val));
  }

  /**
   * Build the flat metric dict expected by ContradictionEngine.
   * Maps from AnalyticalFacts to flat numbers — null when unavailable.
   */
  public toContradictionInput(state: CompanyAnalyticalState): Record<string, any> {
    const g = (key: string) => this.getMetric(state, key);
    const p = (key: string) => this.getPriorAnnual(state, key);
    const e = (key: string, prior = false): EvidenceReference[] =>
      (prior ? state.facts.priorAnnual[key] : state.facts.latest[key])?.evidence ?? [];

    return {
      symbol: state.symbol,
      securityId: state.securityId,

      // Revenue
      revenue: g('revenue_cr'),
      revenuePrior: p('revenue_cr'),

      // Profit + Cash
      pat: g('pat_cr'),
      patPrior: p('pat_cr'),
      cfo: g('cfo_cr'),
      cfoPrior: p('cfo_cr'),

      // Margins
      ebitdaMargin: g('ebitda_margin_pct'),
      ebitdaMarginPrior: p('ebitda_margin_pct'),

      // Balance sheet
      netDebt: g('net_debt_cr'),
      netDebtPrior: p('net_debt_cr'),

      // Working capital
      receivableDays: g('receivable_days'),
      receivableDaysPrior: p('receivable_days'),

      // Capex
      capex: g('capex_cr'),

      // Capacity / volumes
      capacityUtilisation: g('capacity_utilisation_pct'),
      capacityUtilisationPrior: p('capacity_utilisation_pct'),

      // Order book
      orderBook: g('order_book_cr'),
      orderBookPrior: p('order_book_cr'),

      // Management guidance (from management payload)
      debtGuidance: this.extractDebtGuidance(state),
      evidenceByMetric: {
        actual_revenue: e('revenue_cr'),
        revenue_prior: e('revenue_cr', true),
        pat_current: e('pat_cr'),
        pat_prior: e('pat_cr', true),
        cfo_current: e('cfo_cr'),
        cfo_prior: e('cfo_cr', true),
        receivable_days: e('receivable_days'),
        net_debt_current: e('net_debt_cr'),
        net_debt_prior: e('net_debt_cr', true),
        capex: e('capex_cr'),
        capacity_utilisation: e('capacity_utilisation_pct'),
        order_book_current: e('order_book_cr'),
        order_book_prior: e('order_book_cr', true),
      },
    };
  }

  /**
   * Build flat metric dict for DeltaEngine comparison.
   */
  public toFlatMetrics(facts: Record<string, CanonicalFact>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, fact] of Object.entries(facts)) {
      if (fact.value !== null && fact.value !== undefined) {
        const num = typeof fact.value === 'number' ? fact.value : parseFloat(String(fact.value));
        if (!isNaN(num)) {
          result[key] = num;
        }
      }
    }
    return result;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private extractDebtGuidance(state: CompanyAnalyticalState): string | null {
    const debtKeywords = ['delevarag', 'debt free', 'reduce debt', 'net debt zero', 'debt reduction'];
    for (const commitment of state.managementCommitments) {
      const text = (commitment.statement || '').toLowerCase();
      if (debtKeywords.some(k => text.includes(k))) {
        return commitment.statement;
      }
    }
    return null;
  }
}
