/**
 * CompanyAnalyticalStateAssembler.ts — P0 Fix
 *
 * Assembles the typed CompanyAnalyticalState from module payloads.
 * This is the single integration point that replaces all `as any` casting
 * in the orchestrator's V2 engine wiring.
 *
 * Architecture:
 *   Module Payloads (V1)
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
import { CanonicalFactService, AnalyticalFacts, CanonicalFact } from './CanonicalFactService.js';
import { EvidenceReference } from '../contracts/Provenance.js';

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

  private constructor() {
    this.factService = CanonicalFactService.getInstance();
  }

  public static getInstance(): CompanyAnalyticalStateAssembler {
    if (!CompanyAnalyticalStateAssembler.instance) {
      CompanyAnalyticalStateAssembler.instance = new CompanyAnalyticalStateAssembler();
    }
    return CompanyAnalyticalStateAssembler.instance;
  }

  /**
   * Assemble typed analytical state from module payloads.
   * This is the primary integration point — no `as any` allowed here.
   */
  public async assemble(params: {
    securityId: string;
    symbol: string;
    businessModel: string;
    fundamentals: FundamentalPayload | null;
    management: ManagementPayload | null;
    valuation: ValuationPayload | null;
    market: MarketContextPayload | null;
    fere: any | null;
    technical: any | null;
  }): Promise<CompanyAnalyticalState> {

    // 1. Build analytical facts from FundamentalPayload
    let facts = this.factService.fromFundamentalPayload(params.symbol, params.fundamentals);

    // 2. Augment with operating KPIs from DB
    facts = await this.factService.augmentWithOperatingKpis(facts, params.symbol);

    // 3. Augment with quarterly facts for QoQ delta
    facts = await this.factService.augmentWithQuarterlyFacts(facts, params.symbol);

    // 4. Extract individual commitments (not aggregate counts)
    const allCommitments: ManagementCommitment[] = params.management?.commitments ?? [];
    const missedCommitments = allCommitments.filter(c =>
      c.status === 'MISSED' || c.status === 'PARTIALLY_ACHIEVED' || c.status === 'PARTIAL'
    );

    // 5. Compute honest evidence coverage
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
      securityId: params.securityId,
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
    return state.facts.latest[metricKey]?.value ?? null;
  }

  /**
   * Get prior annual value for a metric (for YoY comparison).
   */
  public getPriorAnnual(state: CompanyAnalyticalState, metricKey: string): number | null {
    return state.facts.priorAnnual[metricKey]?.value ?? null;
  }

  /**
   * Get prior quarter value for a metric (for QoQ comparison).
   */
  public getPriorQuarter(state: CompanyAnalyticalState, metricKey: string): number | null {
    return state.facts.priorQuarter[metricKey]?.value ?? null;
  }

  /**
   * Build the flat metric dict expected by ContradictionEngine.
   * Maps from AnalyticalFacts to flat numbers — null when unavailable.
   */
  public toContradictionInput(state: CompanyAnalyticalState): Record<string, number | null | string> {
    const g = (key: string) => this.getMetric(state, key);
    const p = (key: string) => this.getPriorAnnual(state, key);

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
    };
  }

  /**
   * Build flat metric dict for DeltaEngine comparison.
   */
  public toFlatMetrics(facts: Record<string, import('./CanonicalFactService.js').CanonicalFact>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, fact] of Object.entries(facts)) {
      if (fact.value !== null && !isNaN(fact.value)) {
        result[key] = fact.value;
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
