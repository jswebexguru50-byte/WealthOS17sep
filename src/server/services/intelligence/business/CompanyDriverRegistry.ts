/**
 * CompanyDriverRegistry.ts — Section 5 Company-Specific Driver Model
 *
 * Persistent, company-specific driver definitions.
 * Sector templates are only a bootstrap; real companies have differentiated structural drivers.
 *
 * Golden Companies:
 * - TATAMOTORS: JLR volumes & margin, India CV volumes, India PV share, Auto FCF, Net Auto Debt
 * - TCS: CC revenue growth, Large deal TCV, EBIT margin, Utilisation, Attrition, BFSI growth
 * - HDFCBANK: Loan & deposit growth, CASA, NIM, GNPA/NNPA, Credit cost, Cost-to-Income, PCR
 * - TATASTEEL: India production/deliveries, India EBITDA/t, Europe EBITDA/t, Realisation, Net debt
 * - RELIANCE: O2C EBITDA, Jio ARPU/Subscribers, Retail store/revenue growth, New energy capex
 */

import { BusinessDriverDefinition, DriverCategory } from '../contracts/BusinessDriverContracts.js';

export interface CompanyDriverDefinition {
  securityId: string;
  symbol: string;
  driverId: string;
  name: string;
  description: string;
  category: DriverCategory;
  materiality: 'PRIMARY' | 'SECONDARY';
  linkedMetrics: string[];
  linkedSegments?: string[];
  thesisPillarIds?: string[];
  source: 'SYSTEM_TEMPLATE' | 'COMPANY_SPECIFIC' | 'ANALYST_CONFIRMED';
}

export class CompanyDriverRegistry {
  private static instance: CompanyDriverRegistry;
  private readonly customDrivers: Map<string, CompanyDriverDefinition[]> = new Map();

  private constructor() {
    this.registerGoldenCompanyDrivers();
  }

  public static getInstance(): CompanyDriverRegistry {
    if (!CompanyDriverRegistry.instance) {
      CompanyDriverRegistry.instance = new CompanyDriverRegistry();
    }
    return CompanyDriverRegistry.instance;
  }

  public getDriversForSymbol(symbol: string): CompanyDriverDefinition[] | null {
    const clean = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    return this.customDrivers.get(clean) || null;
  }

  private registerGoldenCompanyDrivers(): void {
    // 1. TATA MOTORS (TATAMOTORS)
    this.customDrivers.set('TATAMOTORS', [
      {
        securityId: 'TATAMOTORS',
        symbol: 'TATAMOTORS',
        driverId: 'tatamotors_jlr_volumes',
        name: 'JLR Wholesales & Retail Volumes',
        description: 'Jaguar Land Rover wholesales and order bank execution driving global cash flow',
        category: 'VOLUME',
        materiality: 'PRIMARY',
        linkedMetrics: ['jlr_volumes_k', 'revenue_cr'],
        linkedSegments: ['JLR'],
        thesisPillarIds: ['jlr_recovery', 'margin_expansion'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'TATAMOTORS',
        symbol: 'TATAMOTORS',
        driverId: 'tatamotors_jlr_ebit',
        name: 'JLR EBIT Margin & Pricing Power',
        description: 'Range Rover/Defender mix defending profitability and EBIT margin',
        category: 'MARGIN',
        materiality: 'PRIMARY',
        linkedMetrics: ['jlr_ebit_margin_pct', 'ebit_margin_pct'],
        linkedSegments: ['JLR'],
        thesisPillarIds: ['margin_expansion'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'TATAMOTORS',
        symbol: 'TATAMOTORS',
        driverId: 'tatamotors_india_cv',
        name: 'India Commercial Vehicle (CV) Demand',
        description: 'India CV volumes and infrastructure freight cycle',
        category: 'VOLUME',
        materiality: 'PRIMARY',
        linkedMetrics: ['india_cv_volumes_k'],
        linkedSegments: ['Domestic CV'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'TATAMOTORS',
        symbol: 'TATAMOTORS',
        driverId: 'tatamotors_india_pv_ev',
        name: 'India Passenger Vehicles & EV Leadership',
        description: 'India PV market share, SUV lineup, and EV market dominance',
        category: 'VOLUME',
        materiality: 'PRIMARY',
        linkedMetrics: ['india_pv_volumes_k'],
        linkedSegments: ['Domestic PV'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'TATAMOTORS',
        symbol: 'TATAMOTORS',
        driverId: 'tatamotors_net_debt',
        name: 'Net Automotive Debt Reduction',
        description: 'Deleveraging trajectory toward net-zero auto debt through JLR FCF',
        category: 'DEBT',
        materiality: 'PRIMARY',
        linkedMetrics: ['net_auto_debt_cr', 'net_debt_cr', 'cfo_cr'],
        thesisPillarIds: ['deleveraging'],
        source: 'COMPANY_SPECIFIC',
      },
    ]);

    // 2. TCS (TCS)
    this.customDrivers.set('TCS', [
      {
        securityId: 'TCS',
        symbol: 'TCS',
        driverId: 'tcs_cc_revenue',
        name: 'Constant Currency Revenue Growth',
        description: 'CC organic growth across North America, UK, and Continental Europe',
        category: 'VOLUME',
        materiality: 'PRIMARY',
        linkedMetrics: ['cc_revenue_growth_yoy', 'revenue_growth_yoy'],
        thesisPillarIds: ['growth_momentum'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'TCS',
        symbol: 'TCS',
        driverId: 'tcs_deal_tcv',
        name: 'Total & Large Deal TCV Wins',
        description: 'Deal signings and book-to-bill pipeline providing revenue visibility',
        category: 'ORDER_BOOK',
        materiality: 'PRIMARY',
        linkedMetrics: ['large_deal_tcv_cr', 'deal_tcv_cr'],
        thesisPillarIds: ['order_visibility'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'TCS',
        symbol: 'TCS',
        driverId: 'tcs_ebit_margin',
        name: 'Operating EBIT Margin',
        description: 'EBIT margin discipline via utilisation, pyramid optimisation, and pricing',
        category: 'MARGIN',
        materiality: 'PRIMARY',
        linkedMetrics: ['ebit_margin_pct'],
        thesisPillarIds: ['margin_sustainability'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'TCS',
        symbol: 'TCS',
        driverId: 'tcs_utilisation_attrition',
        name: 'Workforce Utilisation & Attrition',
        description: 'Billable workforce productivity and talent retention costs',
        category: 'UTILISATION',
        materiality: 'SECONDARY',
        linkedMetrics: ['employee_utilisation_pct', 'attrition_pct'],
        source: 'COMPANY_SPECIFIC',
      },
    ]);

    // 3. HDFC BANK (HDFCBANK)
    this.customDrivers.set('HDFCBANK', [
      {
        securityId: 'HDFCBANK',
        symbol: 'HDFCBANK',
        driverId: 'hdfc_deposit_casa',
        name: 'Deposit Accretion & CASA Share',
        description: 'Branch-led retail deposit mobilisation post-merger to replace wholesale borrowings',
        category: 'VOLUME',
        materiality: 'PRIMARY',
        linkedMetrics: ['deposit_cr', 'casa_ratio_pct'],
        thesisPillarIds: ['deposit_franchise'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'HDFCBANK',
        symbol: 'HDFCBANK',
        driverId: 'hdfc_nim_spread',
        name: 'Net Interest Margin (NIM)',
        description: 'NIM trajectory as high-cost liabilities mature and retail loan mix rises',
        category: 'MARGIN',
        materiality: 'PRIMARY',
        linkedMetrics: ['nim_pct'],
        thesisPillarIds: ['nim_recovery'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'HDFCBANK',
        symbol: 'HDFCBANK',
        driverId: 'hdfc_credit_cost_asset_quality',
        name: 'Asset Quality & Credit Cost',
        description: 'GNPA, NNPA and provisioning cost across retail and corporate book',
        category: 'COST',
        materiality: 'PRIMARY',
        linkedMetrics: ['gnpa_pct', 'nnpa_pct', 'credit_cost_pct'],
        thesisPillarIds: ['underwriting_discipline'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'HDFCBANK',
        symbol: 'HDFCBANK',
        driverId: 'hdfc_loan_growth',
        name: 'Advances / Loan Growth',
        description: 'Credit growth aligned to deposit pacing to optimize Credit-Deposit (LDR) ratio',
        category: 'VOLUME',
        materiality: 'PRIMARY',
        linkedMetrics: ['loan_book_cr'],
        source: 'COMPANY_SPECIFIC',
      },
    ]);

    // 4. TATA STEEL (TATASTEEL)
    this.customDrivers.set('TATASTEEL', [
      {
        securityId: 'TATASTEEL',
        symbol: 'TATASTEEL',
        driverId: 'tatasteel_india_ebitda',
        name: 'India Volume & EBITDA / Tonne',
        description: 'Kalinganagar expansion and captive iron ore driving high domestic unit margins',
        category: 'MARGIN',
        materiality: 'PRIMARY',
        linkedMetrics: ['india_ebitda_t', 'india_production_mt', 'india_delivery_mt'],
        linkedSegments: ['India Steel'],
        thesisPillarIds: ['india_growth'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'TATASTEEL',
        symbol: 'TATASTEEL',
        driverId: 'tatasteel_europe_turnaround',
        name: 'UK / Netherlands Restructuring',
        description: 'Port Talbot EAF transition and Dutch blast furnace stability stemming cash bleed',
        category: 'COST',
        materiality: 'PRIMARY',
        linkedMetrics: ['europe_ebitda_t'],
        linkedSegments: ['Tata Steel Europe'],
        thesisPillarIds: ['europe_turnaround'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'TATASTEEL',
        symbol: 'TATASTEEL',
        driverId: 'tatasteel_net_debt',
        name: 'Net Debt & Free Cash Generation',
        description: 'Debt service capability through commodity price cycles and UK capex grants',
        category: 'DEBT',
        materiality: 'PRIMARY',
        linkedMetrics: ['net_debt_cr', 'cfo_cr'],
        thesisPillarIds: ['balance_sheet_strength'],
        source: 'COMPANY_SPECIFIC',
      },
    ]);

    // 5. RELIANCE INDUSTRIES (RELIANCE)
    this.customDrivers.set('RELIANCE', [
      {
        securityId: 'RELIANCE',
        symbol: 'RELIANCE',
        driverId: 'reliance_o2c',
        name: 'Oil-to-Chemicals (O2C) Refining & Petrochem',
        description: 'Gross refining margins (GRM), feedstock crude sourcing, and downstream polymer spreads',
        category: 'MARGIN',
        materiality: 'PRIMARY',
        linkedMetrics: ['ebitda_cr', 'revenue_cr'],
        linkedSegments: ['O2C'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'RELIANCE',
        symbol: 'RELIANCE',
        driverId: 'reliance_jio',
        name: 'Jio Connectivity & ARPU Growth',
        description: 'Subscriber growth, tariff hikes, and 5G FWA monetization',
        category: 'VOLUME',
        materiality: 'PRIMARY',
        linkedMetrics: ['revenue_cr', 'ebitda_cr'],
        linkedSegments: ['Jio Infocomm'],
        thesisPillarIds: ['digital_monetization'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'RELIANCE',
        symbol: 'RELIANCE',
        driverId: 'reliance_retail',
        name: 'Reliance Retail Scale & Omnichannel',
        description: 'Store network additions, grocery and fashion throughput, and margin maturation',
        category: 'VOLUME',
        materiality: 'PRIMARY',
        linkedMetrics: ['revenue_cr', 'ebitda_cr'],
        linkedSegments: ['Retail'],
        thesisPillarIds: ['consumption_play'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'RELIANCE',
        symbol: 'RELIANCE',
        driverId: 'reliance_new_energy',
        name: 'New Energy & Gigafactory Capex',
        description: 'Solar module, battery storage, and green hydrogen manufacturing rollout',
        category: 'CAPEX',
        materiality: 'SECONDARY',
        linkedMetrics: ['capex_cr'],
        linkedSegments: ['New Energy'],
        source: 'COMPANY_SPECIFIC',
      },
    ]);

    // 6. DYNAMIC CABLES (DYCL) — Small-Cap Industrial Cable Manufacturer
    this.customDrivers.set('DYCL', [
      {
        securityId: 'INE600Y01019',
        symbol: 'DYCL',
        driverId: 'dycl_hv_cable_mix',
        name: 'HV & LV Cable Mix / Higher-Margin Power Cables',
        description: 'Product mix shift from bare conductors to higher-margin 66kV/132kV high-voltage insulated cables',
        category: 'MARGIN',
        materiality: 'PRIMARY',
        linkedMetrics: ['ebitda_cr', 'revenue_cr'],
        linkedSegments: ['Power Cables'],
        thesisPillarIds: ['margin_expansion_hv_mix'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'INE600Y01019',
        symbol: 'DYCL',
        driverId: 'dycl_order_book',
        name: 'Executable Order Book & Distribution Tenders',
        description: 'Execution pace on ₹800+ Cr order backlog across DISCOMs, railways, and private EPCs',
        category: 'ORDER_BOOK',
        materiality: 'PRIMARY',
        linkedMetrics: ['revenue_cr', 'order_book_cr'],
        linkedSegments: ['Tender Orders'],
        thesisPillarIds: ['order_book_execution'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'INE600Y01019',
        symbol: 'DYCL',
        driverId: 'dycl_working_capital_receivables',
        name: 'Working Capital & Trade Receivables Intensity',
        description: 'Debtor days and cash conversion cycle driven by state utility payment milestones',
        category: 'OTHER',
        materiality: 'PRIMARY',
        linkedMetrics: ['trade_receivables_cr', 'cfo_cr'],
        linkedSegments: ['Cash Flow'],
        thesisPillarIds: ['working_capital_discipline'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'INE600Y01019',
        symbol: 'DYCL',
        driverId: 'dycl_railway_reconductoring',
        name: 'Railway Electrification & Reconductoring Demand',
        description: 'Supply of specialized catenary conductors and high-ampacity cables for railway corridor upgrades',
        category: 'VOLUME',
        materiality: 'PRIMARY',
        linkedMetrics: ['revenue_cr'],
        linkedSegments: ['Railways'],
        source: 'COMPANY_SPECIFIC',
      },
      {
        securityId: 'INE600Y01019',
        symbol: 'DYCL',
        driverId: 'dycl_metal_passthrough',
        name: 'Raw Material Pass-through (Copper / Aluminium)',
        description: 'Contractual price-variation clauses insulating operating margin against base metal swings',
        category: 'COST',
        materiality: 'SECONDARY',
        linkedMetrics: ['ebitda_cr'],
        linkedSegments: ['Procurement'],
        source: 'COMPANY_SPECIFIC',
      },
    ]);
  }
}
