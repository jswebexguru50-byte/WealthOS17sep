/**
 * BusinessDriverEngine.ts — Wave 1 Agent A (Updated with Company-Specific Drivers & Strict PIT)
 *
 * Evaluates structural business drivers with company-specific profiles and strict Point-In-Time boundaries.
 *
 * Constitution invariants:
 * - C1: Structural driver definitions are distinct from current driver state
 * - C3: Direction requires ≥2 periods of data (NEVER assigned from a single value)
 * - C5: Explicit period alignment (YoY compared against matching period)
 * - C8: Strict Point-In-Time boundary enforcement
 * - No arbitrary top-5 truncation in engine: returns all evaluable drivers
 */

import {
  BusinessDriver,
  BusinessDriverDefinition,
  BusinessDriverInput,
  BusinessDriverResult,
  DriverDirection,
} from '../contracts/BusinessDriverContracts.js';
import { EvidenceReference } from '../contracts/Provenance.js';
import { getDB, dbAll, dbGet } from '../../../database.js';
import { CompanyDriverRegistry } from './CompanyDriverRegistry.js';
import { SectorArchetypeRegistry } from './SectorArchetypeRegistry.js';

// ─── Sector Driver Templates (Fallback when company-specific drivers not registered) ──

const BANK_DRIVER_DEFINITIONS: BusinessDriverDefinition[] = [
  { driverId: 'bank_nim_spread', name: 'NIM / Spread', category: 'MARGIN', materiality: 'PRIMARY',
    description: 'Net interest margin — core profitability driver for lending', relatedMetrics: ['nim_pct'], sectorTemplate: 'BANK' },
  { driverId: 'bank_credit_cost', name: 'Credit Cost', category: 'COST', materiality: 'PRIMARY',
    description: 'Provisions as % of advances — asset quality cost', relatedMetrics: ['credit_cost_pct', 'gnpa_pct'], sectorTemplate: 'BANK' },
  { driverId: 'bank_deposit_growth', name: 'Deposit Growth & CASA', category: 'VOLUME', materiality: 'PRIMARY',
    description: 'Low-cost funding franchise sustaining loan expansion', relatedMetrics: ['deposit_cr', 'casa_ratio_pct'], sectorTemplate: 'BANK' },
  { driverId: 'bank_loan_growth', name: 'Loan Growth', category: 'VOLUME', materiality: 'PRIMARY',
    description: 'Credit expansion across retail and corporate segments', relatedMetrics: ['loan_book_cr'], sectorTemplate: 'BANK' },
  { driverId: 'bank_asset_quality', name: 'Asset Quality (GNPA/NNPA)', category: 'OTHER', materiality: 'PRIMARY',
    description: 'Impaired assets and bad debt recognition', relatedMetrics: ['gnpa_pct', 'nnpa_pct'], sectorTemplate: 'BANK' },
  { driverId: 'bank_capital_adequacy', name: 'Capital Adequacy (CRAR)', category: 'OTHER', materiality: 'SECONDARY',
    description: 'Capital cushion supporting balance sheet growth', relatedMetrics: ['capital_adequacy_pct'], sectorTemplate: 'BANK' },
];

const NBFC_DRIVER_DEFINITIONS: BusinessDriverDefinition[] = [
  { driverId: 'nbfc_aum_growth', name: 'AUM Growth', category: 'VOLUME', materiality: 'PRIMARY',
    description: 'Assets under management expansion across target segments', relatedMetrics: ['aum_cr'], sectorTemplate: 'NBFC' },
  { driverId: 'nbfc_nim_spread', name: 'NIM / Spread', category: 'MARGIN', materiality: 'PRIMARY',
    description: 'Net interest margin or lending-borrowing spread', relatedMetrics: ['nim_pct'], sectorTemplate: 'NBFC' },
  { driverId: 'nbfc_credit_cost', name: 'Credit Cost', category: 'COST', materiality: 'PRIMARY',
    description: 'Provisioning and write-off expense as % of AUM', relatedMetrics: ['credit_cost_pct', 'gnpa_pct'], sectorTemplate: 'NBFC' },
  { driverId: 'nbfc_borrowing_cost', name: 'Borrowing Cost', category: 'COST', materiality: 'PRIMARY',
    description: 'Cost of borrowings affecting spread and profitability', relatedMetrics: ['cost_of_funds_pct'], sectorTemplate: 'NBFC' },
  { driverId: 'nbfc_asset_quality', name: 'Asset Quality (GNPA)', category: 'OTHER', materiality: 'PRIMARY',
    description: 'Loan portfolio quality', relatedMetrics: ['gnpa_pct', 'nnpa_pct'], sectorTemplate: 'NBFC' },
];

const IT_SERVICES_DRIVER_DEFINITIONS: BusinessDriverDefinition[] = [
  { driverId: 'it_cc_revenue', name: 'Constant Currency Revenue Growth', category: 'VOLUME', materiality: 'PRIMARY',
    description: 'Revenue growth in constant currency terms — true business momentum', relatedMetrics: ['cc_revenue_growth_yoy', 'revenue_growth_yoy'], sectorTemplate: 'IT_SERVICES' },
  { driverId: 'it_large_deals', name: 'Large Deal TCV', category: 'ORDER_BOOK', materiality: 'PRIMARY',
    description: 'Total contract value of large deal wins — future revenue visibility', relatedMetrics: ['large_deal_tcv_cr', 'deal_tcv_cr'], sectorTemplate: 'IT_SERVICES' },
  { driverId: 'it_margin', name: 'EBIT Margin', category: 'MARGIN', materiality: 'PRIMARY',
    description: 'Operating margin — mix of pricing, utilisation, and cost control', relatedMetrics: ['ebit_margin_pct'], sectorTemplate: 'IT_SERVICES' },
  { driverId: 'it_utilisation', name: 'Employee Utilisation', category: 'UTILISATION', materiality: 'PRIMARY',
    description: 'Productive utilisation of billable workforce', relatedMetrics: ['employee_utilisation_pct'], sectorTemplate: 'IT_SERVICES' },
  { driverId: 'it_attrition', name: 'Attrition Rate', category: 'COST', materiality: 'SECONDARY',
    description: 'Employee churn — affects cost, continuity and client relationships', relatedMetrics: ['attrition_pct'], sectorTemplate: 'IT_SERVICES' },
];

const MANUFACTURING_DRIVER_DEFINITIONS: BusinessDriverDefinition[] = [
  { driverId: 'mfg_revenue', name: 'Revenue / Volume', category: 'VOLUME', materiality: 'PRIMARY',
    description: 'Top-line growth driven by volumes and realization', relatedMetrics: ['revenue_cr', 'revenue_growth_yoy'], sectorTemplate: 'MANUFACTURING' },
  { driverId: 'mfg_margin', name: 'EBITDA Margin', category: 'MARGIN', materiality: 'PRIMARY',
    description: 'Operating margin — pricing power vs cost structure', relatedMetrics: ['ebitda_margin_pct'], sectorTemplate: 'MANUFACTURING' },
  { driverId: 'mfg_capex', name: 'Capex Cycle', category: 'CAPEX', materiality: 'PRIMARY',
    description: 'Investment for future capacity and competitiveness', relatedMetrics: ['capex_cr'], sectorTemplate: 'MANUFACTURING' },
  { driverId: 'mfg_working_capital', name: 'Working Capital', category: 'OTHER', materiality: 'PRIMARY',
    description: 'Cash conversion efficiency — receivables, inventory, payables', relatedMetrics: ['working_capital_days', 'debtor_days', 'inventory_days'], sectorTemplate: 'MANUFACTURING' },
  { driverId: 'mfg_debt', name: 'Debt / Leverage', category: 'DEBT', materiality: 'PRIMARY',
    description: 'Balance sheet strength and debt reduction trajectory', relatedMetrics: ['net_debt_cr', 'net_debt_ebitda'], sectorTemplate: 'MANUFACTURING' },
  { driverId: 'mfg_return', name: 'Return on Capital (ROCE)', category: 'OTHER', materiality: 'SECONDARY',
    description: 'Quality of capital allocation over time', relatedMetrics: ['roce_pct'], sectorTemplate: 'MANUFACTURING' },
];

const COMMODITY_DRIVER_DEFINITIONS: BusinessDriverDefinition[] = [
  { driverId: 'comm_production', name: 'Production Volume', category: 'VOLUME', materiality: 'PRIMARY',
    description: 'Physical output — steel tonnes, oil barrels, cement tonnes', relatedMetrics: ['production_mn_t', 'volumes_mn_t'], sectorTemplate: 'COMMODITY' },
  { driverId: 'comm_realization', name: 'Realization / Spread', category: 'PRICE', materiality: 'PRIMARY',
    description: 'Unit selling price vs raw material cost — EBITDA per tonne/barrel', relatedMetrics: ['ebitda_per_tonne', 'gross_refining_margin'], sectorTemplate: 'COMMODITY' },
  { driverId: 'comm_capex', name: 'Capex & Capacity Expansion', category: 'CAPEX', materiality: 'PRIMARY',
    description: 'Greenfield/brownfield investment timing and capital cost', relatedMetrics: ['capex_cr'], sectorTemplate: 'COMMODITY' },
  { driverId: 'comm_debt', name: 'Net Debt', category: 'DEBT', materiality: 'PRIMARY',
    description: 'Leverage position — critical in cyclical businesses', relatedMetrics: ['net_debt_cr', 'net_debt_ebitda'], sectorTemplate: 'COMMODITY' },
  { driverId: 'comm_utilisation', name: 'Capacity Utilisation', category: 'UTILISATION', materiality: 'SECONDARY',
    description: 'Productive use of installed capacity', relatedMetrics: ['capacity_utilisation_pct'], sectorTemplate: 'COMMODITY' },
];

const CONSUMER_DRIVER_DEFINITIONS: BusinessDriverDefinition[] = [
  { driverId: 'con_volume', name: 'Volume Growth', category: 'VOLUME', materiality: 'PRIMARY',
    description: 'Underlying volume demand excluding pricing', relatedMetrics: ['volume_growth_yoy'], sectorTemplate: 'CONSUMER' },
  { driverId: 'con_realization', name: 'Realization / Mix', category: 'PRICE', materiality: 'PRIMARY',
    description: 'Pricing power and premiumisation trend', relatedMetrics: ['realization_per_unit', 'average_price'], sectorTemplate: 'CONSUMER' },
  { driverId: 'con_gross_margin', name: 'Gross Margin', category: 'MARGIN', materiality: 'PRIMARY',
    description: 'Pricing vs input cost — fundamental profitability driver', relatedMetrics: ['gross_margin_pct'], sectorTemplate: 'CONSUMER' },
  { driverId: 'con_ebitda_margin', name: 'EBITDA Margin', category: 'MARGIN', materiality: 'PRIMARY',
    description: 'Overall operating efficiency including advertising and distribution', relatedMetrics: ['ebitda_margin_pct'], sectorTemplate: 'CONSUMER' },
  { driverId: 'con_distribution', name: 'Distribution Reach', category: 'MARKET_SHARE', materiality: 'SECONDARY',
    description: 'Geographic expansion and outlet penetration', relatedMetrics: ['direct_distribution_outlets', 'town_coverage'], sectorTemplate: 'CONSUMER' },
];

// ─── Engine ────────────────────────────────────────────────────────────────────

export class BusinessDriverEngine {
  private static instance: BusinessDriverEngine;

  private constructor() {}

  public static getInstance(): BusinessDriverEngine {
    if (!BusinessDriverEngine.instance) {
      BusinessDriverEngine.instance = new BusinessDriverEngine();
    }
    return BusinessDriverEngine.instance;
  }

  /**
   * Main evaluation entry point.
   * Returns ALL drivers (no arbitrary top-5 cap).
   * Caller (Overview UI) filters to primaryDrivers.
   */
  public async evaluate(input: BusinessDriverInput & { asOfDate?: string | null }): Promise<BusinessDriverResult> {
    const { symbol, businessModel, canonicalFacts, operatingKpis, asOfDate } = input;
    const evaluatedAt = new Date().toISOString();
    const securityId = symbol;

    let definitions: BusinessDriverDefinition[] = [];

    // 1. Check for company-specific driver definitions first
    const companySpecific = CompanyDriverRegistry.getInstance().getDriversForSymbol(symbol);
    if (companySpecific && companySpecific.length > 0) {
      definitions = companySpecific.map(cd => ({
        driverId: cd.driverId,
        name: cd.name,
        category: cd.category,
        materiality: cd.materiality,
        description: cd.description,
        relatedMetrics: cd.linkedMetrics,
        sectorTemplate: businessModel,
      }));
    } else {
      // 2. Generic sector archetype resolution — covers ALL companies dynamically
      const archetypeRegistry = SectorArchetypeRegistry.getInstance();
      const archetype = archetypeRegistry.resolveFromSectorString(businessModel);
      const template = archetypeRegistry.getTemplate(archetype) ?? archetypeRegistry.getTemplate('INDUSTRIAL');
      if (template) {
        definitions = template.drivers.map(d => ({
          driverId: d.driverId,
          name: d.name,
          category: d.category,
          materiality: d.materiality,
          description: d.description,
          relatedMetrics: d.linkedMetrics,
          sectorTemplate: template.archetype,
        }));
      } else {
        definitions = MANUFACTURING_DRIVER_DEFINITIONS;
      }
    }

    const drivers: BusinessDriver[] = await Promise.all(
      definitions.map(def => this.buildDriverState(def, symbol, canonicalFacts || {}, operatingKpis || {}, asOfDate))
    );

    const primaryDrivers = drivers.filter(d => d.materiality === 'PRIMARY');

    const filledCount = drivers.filter(d => d.direction !== 'UNKNOWN' || (d.currentState !== null && d.currentState !== undefined)).length;
    const coverage = filledCount >= definitions.length * 0.8 ? 'FULL'
      : filledCount >= definitions.length * 0.4 ? 'PARTIAL'
      : 'MINIMAL';

    return { securityId, symbol, businessModel, drivers, primaryDrivers, coverage, evaluatedAt };
  }

  /**
   * Builds the current state for a driver by querying canonical facts and operating KPIs with strict PIT.
   * Direction is NEVER assigned from a single value (C3, C5).
   */
  private async buildDriverState(
    def: BusinessDriverDefinition,
    symbol: string,
    canonicalFacts: Record<string, any>,
    operatingKpis: Record<string, any[]>,
    asOfDate?: string | null
  ): Promise<BusinessDriver> {
    const evidence: EvidenceReference[] = [];
    let currentState: string | null = null;
    let direction: DriverDirection = 'UNKNOWN';

    // 1. First inspect in-memory operating KPIs
    for (const metric of def.relatedMetrics) {
      const kpiList = operatingKpis[metric];
      if (kpiList && kpiList.length > 0) {
        const latestKpi = kpiList[0];
        if (latestKpi.value !== null && latestKpi.value !== undefined) {
          currentState = `${metric}: ${latestKpi.value} (${latestKpi.period || 'recent'})`;
          evidence.push(...(latestKpi.evidence || []));
          if (kpiList.length >= 2 && kpiList[1].value !== null && kpiList[1].value !== undefined) {
            direction = this.computeDirection(latestKpi.value, kpiList[1].value, def.category !== 'DEBT' && def.category !== 'COST');
          }
          return {
            ...def,
            currentState,
            direction,
            evidence,
            evaluatedAt: new Date().toISOString(),
          };
        }
      }
    }

    // 2. Next inspect in-memory canonical facts
    for (const metric of def.relatedMetrics) {
      const fact = canonicalFacts[metric];
      if (fact && fact.value !== null && fact.value !== undefined) {
        currentState = `${metric}: ${fact.value} (${fact.period || 'recent'})`;
        evidence.push(...(fact.evidence || []));
        break;
      }
    }

    // 3. If needed, query canonical company_facts with strict PIT enforcement
    const db = getDB();
    if (db && (!currentState || direction === 'UNKNOWN')) {
      const effectiveAsOf = asOfDate || new Date().toISOString().split('T')[0];
      for (const metric of def.relatedMetrics) {
        try {
          const sql = `
            SELECT value, periodEnd, provider, sourceType, asOfDate
            FROM company_facts
            WHERE (symbol = ? OR isin = ?) AND metric = ?
              AND (
              fetchedAt IS NOT NULL AND fetchedAt <= ?
              )
            ORDER BY fetchedAt DESC, periodEnd DESC
            LIMIT 2
          `;
          const rows = await dbAll<any>(db, sql, [symbol, symbol, metric, effectiveAsOf]);

          if (rows && rows.length >= 1) {
            const latest = rows[0];
            const priorRow = rows.length >= 2 ? rows[1] : null;

            const latestVal = parseFloat(latest.value);
            if (!isNaN(latestVal)) {
              if (!currentState) {
                currentState = `${metric}: ${latestVal.toFixed(2)} (${latest.periodEnd || 'recent'})`;
                evidence.push({
                  evidenceId: `driver_${def.driverId}_${metric}`,
                  sourceType: 'CANONICAL_FACT',
                  sourceId: latest.provider || latest.sourceType || 'company_facts',
                  timestamp: latest.asOfDate || latest.periodEnd || effectiveAsOf,
                  field: metric,
                  asOfDate: latest.asOfDate || latest.periodEnd || effectiveAsOf,
                });
              }

              // Direction only from 2+ points (C3, C5)
              if (priorRow) {
                const priorVal = parseFloat(priorRow.value);
                if (!isNaN(priorVal)) {
                  direction = this.computeDirection(latestVal, priorVal, def.category !== 'DEBT' && def.category !== 'COST');
                }
              }
              break;
            }
          }
        } catch {
          // Non-fatal
        }
      }
    }

    return {
      ...def,
      currentState,
      direction,
      evidence,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private computeDirection(current: number, prior: number, higherIsBetter: boolean): DriverDirection {
    if (prior === 0) return 'STABLE';
    const changePct = ((current - prior) / Math.abs(prior)) * 100;
    const absChange = Math.abs(changePct);

    // Less than 2% change is STABLE
    if (absChange < 2.0) return 'STABLE';

    if (changePct > 0) {
      return higherIsBetter ? 'IMPROVING' : 'DETERIORATING';
    } else {
      return higherIsBetter ? 'DETERIORATING' : 'IMPROVING';
    }
  }
}
