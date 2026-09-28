/**
 * BusinessDriverEngine.ts — Wave 1 Agent A
 *
 * Maps company evidence to structured business drivers.
 * Separates driver DEFINITION (structural) from driver STATE (current evidence).
 *
 * Constitution invariants:
 * - C3: Direction requires ≥2 data points; single value → UNKNOWN (never IMPROVING/DETERIORATING)
 * - C4: Absence of a red flag ≠ positive evidence
 * - C5: Level is not direction
 * - C7: Every driver state has evidence lineage
 * - C16: Sector economics matter — BANK drivers ≠ manufacturing drivers
 */

import { getDB, dbAll, dbGet } from '../../../database.js';
import {
  BusinessDriver,
  BusinessDriverDefinition,
  BusinessDriverState,
  BusinessDriverResult,
  BusinessDriverInput,
  DriverDirection,
  DriverMateriality,
} from '../contracts/BusinessDriverContracts.js';
import { EvidenceReference } from '../contracts/Provenance.js';
import { PrimaryBusinessModel, CompanyBusinessModelRecord } from '../contracts/IntelligenceResult.js';

// ─── Sector Driver Templates ──────────────────────────────────────────────────

const BANK_DRIVER_DEFINITIONS: BusinessDriverDefinition[] = [
  { driverId: 'bank_loan_growth', name: 'Loan Book Growth', category: 'VOLUME', materiality: 'PRIMARY',
    description: 'Year-over-year growth of total loan book', relatedMetrics: ['loan_book_cr', 'loan_growth_yoy'], sectorTemplate: 'BANK' },
  { driverId: 'bank_deposit_growth', name: 'Deposit Growth', category: 'VOLUME', materiality: 'PRIMARY',
    description: 'Growth of total deposits and funding franchise', relatedMetrics: ['deposit_cr', 'deposit_growth_yoy'], sectorTemplate: 'BANK' },
  { driverId: 'bank_nim', name: 'Net Interest Margin', category: 'MARGIN', materiality: 'PRIMARY',
    description: 'Spread between lending and borrowing rates', relatedMetrics: ['nim_pct'], sectorTemplate: 'BANK' },
  { driverId: 'bank_asset_quality', name: 'Asset Quality (GNPA)', category: 'OTHER', materiality: 'PRIMARY',
    description: 'Gross non-performing asset ratio — quality of lending decisions', relatedMetrics: ['gnpa_pct', 'nnpa_pct'], sectorTemplate: 'BANK' },
  { driverId: 'bank_credit_cost', name: 'Credit Cost', category: 'COST', materiality: 'PRIMARY',
    description: 'Provisioning expense as % of average advances', relatedMetrics: ['credit_cost_pct'], sectorTemplate: 'BANK' },
  { driverId: 'bank_casa', name: 'CASA Ratio', category: 'PRICE', materiality: 'SECONDARY',
    description: 'Current + savings account as % of deposits — low-cost funding', relatedMetrics: ['casa_ratio_pct'], sectorTemplate: 'BANK' },
  { driverId: 'bank_capital', name: 'Capital Adequacy', category: 'OTHER', materiality: 'SECONDARY',
    description: 'Capital buffer for growth and regulatory compliance', relatedMetrics: ['capital_adequacy_pct'], sectorTemplate: 'BANK' },
];

const NBFC_DRIVER_DEFINITIONS: BusinessDriverDefinition[] = [
  { driverId: 'nbfc_aum_growth', name: 'AUM Growth', category: 'VOLUME', materiality: 'PRIMARY',
    description: 'Growth of assets under management / loan book', relatedMetrics: ['aum_cr', 'aum_growth_yoy'], sectorTemplate: 'NBFC' },
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
  { driverId: 'comm_realization', name: 'Realization / Pricing', category: 'PRICE', materiality: 'PRIMARY',
    description: 'Average selling price per unit — commodity cycle position', relatedMetrics: ['realization_per_t', 'average_selling_price'], sectorTemplate: 'COMMODITY' },
  { driverId: 'comm_cost', name: 'Input / Cash Cost', category: 'COST', materiality: 'PRIMARY',
    description: 'Variable cost per unit — key differentiator in commodity cycles', relatedMetrics: ['cash_cost_per_t', 'coking_coal_cost', 'input_cost_cr'], sectorTemplate: 'COMMODITY' },
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
  public async evaluate(input: BusinessDriverInput): Promise<BusinessDriverResult> {
    const { symbol, businessModel, canonicalFacts, managementEvidence } = input;
    const evaluatedAt = new Date().toISOString();

    let definitions: BusinessDriverDefinition[] = [];
    const securityId = symbol; // resolved by orchestrator

    switch (businessModel) {
      case 'BANK':        definitions = BANK_DRIVER_DEFINITIONS; break;
      case 'NBFC':        definitions = NBFC_DRIVER_DEFINITIONS; break;
      case 'IT_SERVICES': definitions = IT_SERVICES_DRIVER_DEFINITIONS; break;
      case 'COMMODITY':   definitions = COMMODITY_DRIVER_DEFINITIONS; break;
      case 'CONSUMER':    definitions = CONSUMER_DRIVER_DEFINITIONS; break;
      default:            definitions = MANUFACTURING_DRIVER_DEFINITIONS; break;
    }

    const drivers: BusinessDriver[] = await Promise.all(
      definitions.map(def => this.buildDriverState(def, symbol, canonicalFacts || {}))
    );

    const primaryDrivers = drivers.filter(d => d.materiality === 'PRIMARY');

    const filledCount = drivers.filter(d => d.direction !== 'UNKNOWN' || (d.currentState !== null && d.currentState !== undefined)).length;
    const coverage = filledCount >= definitions.length * 0.8 ? 'FULL'
      : filledCount >= definitions.length * 0.4 ? 'PARTIAL'
      : 'MINIMAL';

    return { securityId, symbol, businessModel, drivers, primaryDrivers, coverage, evaluatedAt };
  }

  /**
   * Builds the current state for a driver by querying canonical facts.
   * Direction is NEVER assigned from a single value (C5).
   */
  private async buildDriverState(
    def: BusinessDriverDefinition,
    symbol: string,
    canonicalFacts: Record<string, any>
  ): Promise<BusinessDriver> {
    const evidence: EvidenceReference[] = [];
    let currentState: string | null = null;
    let direction: DriverDirection = 'UNKNOWN';

    const db = getDB();
    if (!db) {
      return { ...def, currentState: null, direction: 'UNKNOWN', evidence: [], evaluatedAt: new Date().toISOString() };
    }

    // Try to find metric data for this driver's related metrics
    for (const metric of def.relatedMetrics) {
      try {
        // Get the two most recent annual periods for this metric
        const rows = await Promise.resolve(
          db.prepare(
            `SELECT value, period_end, data_source FROM company_facts
             WHERE (symbol = ? OR isin = ?) AND metric_key = ? AND period_type = 'ANNUAL'
             ORDER BY period_end DESC LIMIT 3`
          ).all(symbol, symbol, metric) as unknown as any[]
        );

        if (rows && rows.length >= 1) {
          const latest = rows[0];
          const priorRow = rows.length >= 2 ? rows[1] : null;

          const latestVal = parseFloat(latest.value);
          if (!isNaN(latestVal)) {
            currentState = `${metric}: ${latestVal.toFixed(2)} (${latest.period_end?.substring(0, 7) || 'recent'})`;
            evidence.push({
              evidenceId: `driver_${def.driverId}_${metric}`,
              sourceType: 'CANONICAL_FACT',
              sourceId: latest.data_source || 'company_facts',
              timestamp: new Date().toISOString(),
              field: metric,
              asOfDate: latest.period_end,
            });

            // Direction only from 2+ points (C3, C5)
            if (priorRow) {
              const priorVal = parseFloat(priorRow.value);
              if (!isNaN(priorVal)) {
                direction = this.computeDirection(latestVal, priorVal, def.category !== 'DEBT' && def.category !== 'COST');
              }
            }
            // If only 1 row: direction stays UNKNOWN
            break;
          }
        }

        // Also check fundamental_endpoint_snapshots
        if (!currentState) {
          const snap = await Promise.resolve(
            db.prepare(
              `SELECT json_extract(snapshot_json, '$.' || ?) AS val, fetched_at
               FROM fundamental_endpoint_snapshots
               WHERE (symbol = ? OR isin = ?)
               ORDER BY fetched_at DESC LIMIT 1`
            ).get(metric, symbol, symbol) as any
          );
          if (snap?.val !== null && snap?.val !== undefined) {
            const val = parseFloat(snap.val);
            if (!isNaN(val)) {
              currentState = `${metric}: ${val.toFixed(2)}`;
            }
          }
        }
      } catch {
        // Non-fatal — try next metric
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

  /**
   * Compute direction from two comparable data points.
   * higherIsBetter = true for revenue, margins, CASA (higher is better)
   * higherIsBetter = false for GNPA, debt, credit cost (lower is better)
   */
  private computeDirection(current: number, prior: number, higherIsBetter: boolean): DriverDirection {
    if (prior === 0) return 'UNKNOWN';
    const pctChange = (current - prior) / Math.abs(prior);

    // Less than 2% change → STABLE
    if (Math.abs(pctChange) < 0.02) return 'STABLE';

    if (higherIsBetter) {
      return pctChange > 0 ? 'IMPROVING' : 'DETERIORATING';
    } else {
      return pctChange < 0 ? 'IMPROVING' : 'DETERIORATING';
    }
  }
}
