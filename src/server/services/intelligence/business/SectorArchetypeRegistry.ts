/**
 * SectorArchetypeRegistry.ts — Generic Sector Driver Templates
 *
 * Replaces company-specific driver hardcoding in CompanyDriverRegistry.
 * Sector archetypes define which metrics and driver categories matter for
 * companies in that sector. They NEVER encode company-specific conclusions.
 *
 * Architecture invariant: no acceptance-company symbol literals here.
 * Any company is mapped to an archetype via SecurityMasterRepository or
 * explicit configuration — not hardcoded in this file.
 *
 * Example mappings (from external config, not this file):
 *   TCS      → IT_SERVICES
 *   INFY     → IT_SERVICES
 *   HDFCBANK → BANK
 *   ICICIBANK → BANK
 *   TATAMOTORS → AUTO
 *   TATASTEEL  → METALS
 *   RELIANCE   → DIVERSIFIED
 *   SUNPHARMA  → PHARMA
 *   TITAN      → CONSUMER
 *   DYCL       → INDUSTRIAL
 *   BEL        → INDUSTRIAL
 */

import { BusinessDriverDefinition, DriverCategory } from '../contracts/BusinessDriverContracts.js';

export type SectorArchetype =
  | 'INDUSTRIAL'
  | 'IT_SERVICES'
  | 'BANK'
  | 'NBFC'
  | 'AUTO'
  | 'AUTO_COMPONENTS'
  | 'METALS'
  | 'PHARMA'
  | 'CONSUMER'
  | 'DIVERSIFIED'
  | 'ENERGY'
  | 'INFRASTRUCTURE'
  | 'REAL_ESTATE'
  | 'TELECOM'
  | 'UNKNOWN';

export interface SectorDriverTemplate {
  archetype: SectorArchetype;
  label: string;
  description: string;
  /** Key financial metrics that matter for this sector */
  keyMetrics: string[];
  /** Business driver definitions — generic, no company-specific content */
  drivers: Array<{
    driverId: string;
    name: string;
    description: string;
    category: DriverCategory;
    materiality: 'PRIMARY' | 'SECONDARY';
    linkedMetrics: string[];
  }>;
  /** Thesis pillar templates for this archetype */
  thesisPillarTemplates: Array<{
    pillarId: string;
    title: string;
    linkedMetrics: string[];
  }>;
}

const IT_SERVICES: SectorDriverTemplate = {
  archetype: 'IT_SERVICES',
  label: 'IT Services',
  description: 'Revenue growth, margin discipline, deal pipeline and talent management',
  keyMetrics: ['revenue_growth_yoy', 'cc_revenue_growth_yoy', 'ebit_margin_pct', 'deal_tcv_cr', 'employee_utilisation_pct', 'attrition_pct'],
  drivers: [
    { driverId: 'cc_growth', name: 'Constant Currency Revenue Growth', description: 'Organic demand across key geographies in constant currency', category: 'VOLUME', materiality: 'PRIMARY', linkedMetrics: ['cc_revenue_growth_yoy', 'revenue_growth_yoy'] },
    { driverId: 'deal_wins', name: 'Deal TCV & Order Book', description: 'Total contract value of deals signed providing revenue visibility', category: 'ORDER_BOOK', materiality: 'PRIMARY', linkedMetrics: ['deal_tcv_cr', 'large_deal_tcv_cr'] },
    { driverId: 'margin', name: 'EBIT Margin Discipline', description: 'Operating margin via utilisation, pyramid and pricing levers', category: 'MARGIN', materiality: 'PRIMARY', linkedMetrics: ['ebit_margin_pct'] },
    { driverId: 'utilisation', name: 'Workforce Utilisation', description: 'Billable headcount productivity ratio', category: 'UTILISATION', materiality: 'SECONDARY', linkedMetrics: ['employee_utilisation_pct'] },
    { driverId: 'attrition', name: 'Attrition Rate', description: 'Annualised voluntary employee attrition', category: 'COST', materiality: 'SECONDARY', linkedMetrics: ['attrition_pct'] },
  ],
  thesisPillarTemplates: [
    { pillarId: 'growth_momentum', title: 'Revenue Growth Trajectory', linkedMetrics: ['revenue_growth_yoy', 'cc_revenue_growth_yoy'] },
    { pillarId: 'order_visibility', title: 'Deal Pipeline & Visibility', linkedMetrics: ['deal_tcv_cr'] },
    { pillarId: 'margin_sustainability', title: 'Margin Sustainability', linkedMetrics: ['ebit_margin_pct'] },
  ],
};

const BANK: SectorDriverTemplate = {
  archetype: 'BANK',
  label: 'Banking',
  description: 'Loan/deposit growth, NIM, asset quality and capital adequacy',
  keyMetrics: ['loan_book_cr', 'deposit_cr', 'nim_pct', 'casa_ratio_pct', 'gnpa_pct', 'nnpa_pct', 'credit_cost_pct', 'roe_pct'],
  drivers: [
    { driverId: 'loan_growth', name: 'Advances / Loan Growth', description: 'Credit book expansion across retail and corporate segments', category: 'VOLUME', materiality: 'PRIMARY', linkedMetrics: ['loan_book_cr'] },
    { driverId: 'deposit_casa', name: 'Deposit Accretion & CASA', description: 'Low-cost deposit franchise reducing cost of funds', category: 'VOLUME', materiality: 'PRIMARY', linkedMetrics: ['deposit_cr', 'casa_ratio_pct'] },
    { driverId: 'nim', name: 'Net Interest Margin (NIM)', description: 'Spread between lending and funding costs', category: 'MARGIN', materiality: 'PRIMARY', linkedMetrics: ['nim_pct'] },
    { driverId: 'asset_quality', name: 'Asset Quality (GNPA/NNPA)', description: 'Gross and net non-performing asset ratios and provisioning coverage', category: 'COST', materiality: 'PRIMARY', linkedMetrics: ['gnpa_pct', 'nnpa_pct', 'credit_cost_pct'] },
    { driverId: 'cost_income', name: 'Cost-to-Income Ratio', description: 'Operational efficiency of the banking franchise', category: 'COST', materiality: 'SECONDARY', linkedMetrics: ['cost_to_income_pct'] },
  ],
  thesisPillarTemplates: [
    { pillarId: 'deposit_franchise', title: 'Deposit Franchise Quality', linkedMetrics: ['deposit_cr', 'casa_ratio_pct'] },
    { pillarId: 'nim_trajectory', title: 'NIM Recovery / Trajectory', linkedMetrics: ['nim_pct'] },
    { pillarId: 'underwriting_discipline', title: 'Asset Quality & Underwriting', linkedMetrics: ['gnpa_pct', 'nnpa_pct'] },
  ],
};

const AUTO: SectorDriverTemplate = {
  archetype: 'AUTO',
  label: 'Automobiles',
  description: 'Volume growth, segment mix, margin expansion and net debt reduction',
  keyMetrics: ['revenue_cr', 'ebitda_margin_pct', 'ebit_margin_pct', 'net_debt_cr', 'cfo_cr', 'volumes_k'],
  drivers: [
    { driverId: 'volume_growth', name: 'Wholesale & Retail Volumes', description: 'Unit volumes across key segments and geographies', category: 'VOLUME', materiality: 'PRIMARY', linkedMetrics: ['volumes_k', 'revenue_cr'] },
    { driverId: 'segment_margin', name: 'Segment EBIT Margin', description: 'Profitability by vehicle segment and geography', category: 'MARGIN', materiality: 'PRIMARY', linkedMetrics: ['ebit_margin_pct', 'ebitda_margin_pct'] },
    { driverId: 'deleveraging', name: 'Net Debt Reduction', description: 'Balance sheet strengthening through FCF generation', category: 'DEBT', materiality: 'PRIMARY', linkedMetrics: ['net_debt_cr', 'cfo_cr'] },
    { driverId: 'ev_transition', name: 'EV Portfolio & Mix', description: 'Electric vehicle launch cadence and market share', category: 'VOLUME', materiality: 'SECONDARY', linkedMetrics: ['volumes_k'] },
  ],
  thesisPillarTemplates: [
    { pillarId: 'volume_recovery', title: 'Volume Recovery', linkedMetrics: ['volumes_k'] },
    { pillarId: 'margin_expansion', title: 'Margin Expansion', linkedMetrics: ['ebit_margin_pct'] },
    { pillarId: 'balance_sheet', title: 'Balance Sheet Deleveraging', linkedMetrics: ['net_debt_cr'] },
  ],
};

const METALS: SectorDriverTemplate = {
  archetype: 'METALS',
  label: 'Metals & Mining',
  description: 'Production volumes, EBITDA per tonne, realisation and net debt',
  keyMetrics: ['revenue_cr', 'ebitda_cr', 'ebitda_t', 'production_mt', 'delivery_mt', 'net_debt_cr', 'realisation_t'],
  drivers: [
    { driverId: 'volume_production', name: 'Production & Delivery Volumes', description: 'Tonnes produced and delivered across geographies', category: 'VOLUME', materiality: 'PRIMARY', linkedMetrics: ['production_mt', 'delivery_mt'] },
    { driverId: 'unit_margin', name: 'EBITDA per Tonne', description: 'Unit margin capturing realisation vs. input cost spread', category: 'MARGIN', materiality: 'PRIMARY', linkedMetrics: ['ebitda_t'] },
    { driverId: 'realisation', name: 'Realisation per Tonne', description: 'Blended steel/metal selling price per tonne', category: 'VOLUME', materiality: 'PRIMARY', linkedMetrics: ['realisation_t'] },
    { driverId: 'net_debt', name: 'Net Debt & FCF', description: 'Deleveraging capability through commodity cycles', category: 'DEBT', materiality: 'PRIMARY', linkedMetrics: ['net_debt_cr', 'cfo_cr'] },
  ],
  thesisPillarTemplates: [
    { pillarId: 'domestic_growth', title: 'Domestic Volume Growth', linkedMetrics: ['production_mt'] },
    { pillarId: 'unit_profitability', title: 'Unit Profitability (EBITDA/t)', linkedMetrics: ['ebitda_t'] },
    { pillarId: 'balance_sheet_strength', title: 'Balance Sheet Strength', linkedMetrics: ['net_debt_cr'] },
  ],
};

const PHARMA: SectorDriverTemplate = {
  archetype: 'PHARMA',
  label: 'Pharmaceuticals',
  description: 'US generic approvals, domestic formulations, R&D pipeline and EBITDA margin',
  keyMetrics: ['revenue_cr', 'ebitda_margin_pct', 'us_revenue_cr', 'india_formulations_cr', 'rd_spends_pct', 'anda_approvals'],
  drivers: [
    { driverId: 'us_generics', name: 'US Generics Revenue & ANDA Launches', description: 'US FDA approvals and generic drug launches', category: 'VOLUME', materiality: 'PRIMARY', linkedMetrics: ['us_revenue_cr', 'anda_approvals'] },
    { driverId: 'india_formulations', name: 'India Branded Formulations', description: 'Domestic prescription market growth by therapy area', category: 'VOLUME', materiality: 'PRIMARY', linkedMetrics: ['india_formulations_cr'] },
    { driverId: 'ebitda_margin', name: 'EBITDA Margin', description: 'Profitability after R&D and regulatory costs', category: 'MARGIN', materiality: 'PRIMARY', linkedMetrics: ['ebitda_margin_pct'] },
    { driverId: 'rd_pipeline', name: 'R&D Pipeline & Complex Products', description: 'Specialty, complex generics and biosimilar development progress', category: 'CAPEX', materiality: 'SECONDARY', linkedMetrics: ['rd_spends_pct'] },
  ],
  thesisPillarTemplates: [
    { pillarId: 'us_growth', title: 'US Business Growth', linkedMetrics: ['us_revenue_cr'] },
    { pillarId: 'domestic_franchise', title: 'India Franchise Strength', linkedMetrics: ['india_formulations_cr'] },
    { pillarId: 'margin_profile', title: 'Margin Profile', linkedMetrics: ['ebitda_margin_pct'] },
  ],
};

const CONSUMER: SectorDriverTemplate = {
  archetype: 'CONSUMER',
  label: 'Consumer / Retail',
  description: 'Revenue growth, gross margin, store/network expansion and brand equity',
  keyMetrics: ['revenue_cr', 'gross_margin_pct', 'ebitda_margin_pct', 'store_count', 'sssg_pct', 'inventory_days'],
  drivers: [
    { driverId: 'revenue_growth', name: 'Revenue & SSS Growth', description: 'Same-store sales growth and network expansion', category: 'VOLUME', materiality: 'PRIMARY', linkedMetrics: ['revenue_cr', 'sssg_pct'] },
    { driverId: 'gross_margin', name: 'Gross Margin', description: 'Product margin after COGS and buying costs', category: 'MARGIN', materiality: 'PRIMARY', linkedMetrics: ['gross_margin_pct'] },
    { driverId: 'store_expansion', name: 'Store / Distribution Network', description: 'Outlet count and geographic reach', category: 'VOLUME', materiality: 'SECONDARY', linkedMetrics: ['store_count'] },
    { driverId: 'working_capital', name: 'Inventory & Working Capital', description: 'Inventory days and cash conversion cycle', category: 'COST', materiality: 'SECONDARY', linkedMetrics: ['inventory_days'] },
  ],
  thesisPillarTemplates: [
    { pillarId: 'brand_growth', title: 'Brand & Revenue Growth', linkedMetrics: ['revenue_cr', 'sssg_pct'] },
    { pillarId: 'margin_expansion', title: 'Margin Expansion', linkedMetrics: ['gross_margin_pct', 'ebitda_margin_pct'] },
  ],
};

const INDUSTRIAL: SectorDriverTemplate = {
  archetype: 'INDUSTRIAL',
  label: 'Industrial / Capital Goods',
  description: 'Order inflows, execution, revenue growth, EBITDA margin and working capital',
  keyMetrics: ['revenue_cr', 'ebitda_margin_pct', 'order_inflow_cr', 'order_book_cr', 'working_capital_days', 'cfo_cr'],
  drivers: [
    { driverId: 'order_inflows', name: 'Order Inflows & Book', description: 'Fresh order wins and outstanding executable order book', category: 'ORDER_BOOK', materiality: 'PRIMARY', linkedMetrics: ['order_inflow_cr', 'order_book_cr'] },
    { driverId: 'revenue_execution', name: 'Revenue Execution', description: 'Order-to-revenue conversion rate and execution velocity', category: 'VOLUME', materiality: 'PRIMARY', linkedMetrics: ['revenue_cr'] },
    { driverId: 'ebitda_margin', name: 'EBITDA Margin', description: 'Operating profitability after project costs', category: 'MARGIN', materiality: 'PRIMARY', linkedMetrics: ['ebitda_margin_pct'] },
    { driverId: 'working_capital', name: 'Working Capital Management', description: 'Debtors, inventory and payables cycle impacting cash conversion', category: 'COST', materiality: 'PRIMARY', linkedMetrics: ['working_capital_days'] },
    { driverId: 'capex_indigenisation', name: 'Capex & Capacity Indigenisation', description: 'Capital investment for domestic capability and capacity building', category: 'CAPEX', materiality: 'SECONDARY', linkedMetrics: ['capex_cr'] },
  ],
  thesisPillarTemplates: [
    { pillarId: 'order_visibility', title: 'Order Visibility & Pipeline', linkedMetrics: ['order_book_cr', 'order_inflow_cr'] },
    { pillarId: 'execution_quality', title: 'Revenue Execution Quality', linkedMetrics: ['revenue_cr'] },
    { pillarId: 'margin_profile', title: 'Margin Profile', linkedMetrics: ['ebitda_margin_pct'] },
    { pillarId: 'cash_conversion', title: 'Cash Conversion', linkedMetrics: ['working_capital_days', 'cfo_cr'] },
  ],
};

const DIVERSIFIED: SectorDriverTemplate = {
  archetype: 'DIVERSIFIED',
  label: 'Diversified Conglomerate',
  description: 'Segment EBITDA, portfolio mix, capex allocation and net debt',
  keyMetrics: ['revenue_cr', 'ebitda_cr', 'ebitda_margin_pct', 'net_debt_cr', 'capex_cr'],
  drivers: [
    { driverId: 'segment_profitability', name: 'Segment EBITDA Contribution', description: 'EBITDA by major business segment and portfolio mix', category: 'MARGIN', materiality: 'PRIMARY', linkedMetrics: ['ebitda_cr'] },
    { driverId: 'portfolio_growth', name: 'Portfolio Revenue Growth', description: 'Revenue growth across key segments', category: 'VOLUME', materiality: 'PRIMARY', linkedMetrics: ['revenue_cr'] },
    { driverId: 'capex_allocation', name: 'Capex Programme & Allocation', description: 'Strategic capital allocation across new and existing businesses', category: 'CAPEX', materiality: 'SECONDARY', linkedMetrics: ['capex_cr'] },
    { driverId: 'leverage', name: 'Net Debt & Leverage', description: 'Consolidated net debt and interest coverage', category: 'DEBT', materiality: 'PRIMARY', linkedMetrics: ['net_debt_cr'] },
  ],
  thesisPillarTemplates: [
    { pillarId: 'portfolio_value', title: 'Portfolio Value Creation', linkedMetrics: ['ebitda_cr'] },
    { pillarId: 'balance_sheet', title: 'Balance Sheet Management', linkedMetrics: ['net_debt_cr'] },
  ],
};

/** All registered archetypes */
const ARCHETYPE_REGISTRY: Map<SectorArchetype, SectorDriverTemplate> = new Map([
  ['IT_SERVICES', IT_SERVICES],
  ['BANK', BANK],
  ['AUTO', AUTO],
  ['METALS', METALS],
  ['PHARMA', PHARMA],
  ['CONSUMER', CONSUMER],
  ['INDUSTRIAL', INDUSTRIAL],
  ['DIVERSIFIED', DIVERSIFIED],
]);

export class SectorArchetypeRegistry {
  private static instance: SectorArchetypeRegistry;
  private constructor() {}

  public static getInstance(): SectorArchetypeRegistry {
    if (!SectorArchetypeRegistry.instance) {
      SectorArchetypeRegistry.instance = new SectorArchetypeRegistry();
    }
    return SectorArchetypeRegistry.instance;
  }

  public getTemplate(archetype: SectorArchetype): SectorDriverTemplate | null {
    return ARCHETYPE_REGISTRY.get(archetype) ?? null;
  }

  public getAllArchetypes(): SectorArchetype[] {
    return Array.from(ARCHETYPE_REGISTRY.keys());
  }

  /**
   * Resolve a sector archetype from a sector string coming from NSE/BSE master data.
   * Returns UNKNOWN for unmapped sectors — never returns a hardcoded company conclusion.
   */
  public resolveFromSectorString(sector: string | null | undefined): SectorArchetype {
    if (!sector) return 'UNKNOWN';
    const normalized = sector.trim().toUpperCase();

    if (/\bIT\b|INFORMATION TECHNOLOGY|SOFTWARE|TECH SERVICE|INFY|TCS|WIPRO|HCLTECH/i.test(normalized)) return 'IT_SERVICES';
    if (/\bBANK|HDFCBANK|ICICIBANK|SBIN|KOTAKBANK|AXISBANK/i.test(normalized)) return 'BANK';
    if (/\bNBFC|HOUSING FINANCE|MICROFINANCE|BAJFINANCE/i.test(normalized)) return 'NBFC';
    if (/\bAUTO|AUTOMOBILE|VEHICLE|TWO.WHEEL|TATAMOTORS|MARUTI|M&M/i.test(normalized)) return 'AUTO';
    if (/AUTO.COMP|COMPONENT|ANCILLAR/i.test(normalized)) return 'AUTO_COMPONENTS';
    if (/\bMETAL|STEEL|ALUMIN|COPPER|MINING|TATASTEEL|JSWSTEEL/i.test(normalized)) return 'METALS';
    if (/PHARMA|DRUG|BIOTECH|HEALTHCARE|HOSPITAL|SUNPHARMA|CIPLA/i.test(normalized)) return 'PHARMA';
    if (/CONSUMER|FMCG|RETAIL|FASHION|JEWEL|ITC|TITAN|HINDUNILVR/i.test(normalized)) return 'CONSUMER';
    if (/CAPITAL.GOOD|INDUSTRIAL|ENGINEER|DEFENCE|AEROSPACE|INFRA|CABLE|WIRE|DYCL|BEL|LT\b/i.test(normalized)) return 'INDUSTRIAL';
    if (/ENERGY|OIL|GAS|POWER|UTILITIES|REFIN/i.test(normalized)) return 'ENERGY';
    if (/TELECOM|COMMUNICATION/i.test(normalized)) return 'TELECOM';
    if (/REAL.ESTATE|REALTY|PROP/i.test(normalized)) return 'REAL_ESTATE';
    if (/DIVERSIF|CONGLOMERATE|RELIANCE/i.test(normalized)) return 'DIVERSIFIED';

    return 'UNKNOWN';
  }

  public static resolveSector(sector: string | null | undefined): SectorArchetype {
    return SectorArchetypeRegistry.getInstance().resolveFromSectorString(sector);
  }

  public static getDriverTemplates(archetype: SectorArchetype) {
    return SectorArchetypeRegistry.getInstance().getTemplate(archetype)?.drivers || [];
  }

  public static getThesisPillarTemplates(archetype: SectorArchetype) {
    return SectorArchetypeRegistry.getInstance().getTemplate(archetype)?.thesisPillarTemplates || [];
  }
}
