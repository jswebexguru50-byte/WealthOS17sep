/**
 * CompanyKpiProfiles.ts — Section 4 Golden Company Operating KPI Profiles
 *
 * Maps supported Indian listed companies (starting with the 5 golden companies)
 * to their exact operating KPI sets, business models, and segment splits.
 */

export interface CompanyKpiProfile {
  symbol: string;
  companyName: string;
  businessModel: string;
  primaryKpis: string[];
  secondaryKpis: string[];
  segmentKpis?: Record<string, string[]>;
}

export class CompanyKpiProfiles {
  private static instance: CompanyKpiProfiles;
  private readonly profiles: Map<string, CompanyKpiProfile> = new Map();

  private constructor() {
    this.registerGoldenProfiles();
  }

  public static getInstance(): CompanyKpiProfiles {
    if (!CompanyKpiProfiles.instance) {
      CompanyKpiProfiles.instance = new CompanyKpiProfiles();
    }
    return CompanyKpiProfiles.instance;
  }

  public getProfile(symbol: string): CompanyKpiProfile | null {
    const clean = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    return this.profiles.get(clean) || null;
  }

  private registerGoldenProfiles(): void {
    // 1. TCS — IT Services
    this.profiles.set('TCS', {
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services Ltd',
      businessModel: 'IT_SERVICES',
      primaryKpis: [
        'cc_revenue_growth_yoy',
        'large_deal_tcv_cr',
        'deal_tcv_cr',
        'ebit_margin_pct',
        'employee_utilisation_pct',
        'attrition_pct',
      ],
      secondaryKpis: [
        'headcount',
      ],
    });

    // 2. HDFCBANK — Bank
    this.profiles.set('HDFCBANK', {
      symbol: 'HDFCBANK',
      companyName: 'HDFC Bank Ltd',
      businessModel: 'BANK',
      primaryKpis: [
        'loan_book_cr',
        'deposit_cr',
        'casa_ratio_pct',
        'nim_pct',
        'gnpa_pct',
        'nnpa_pct',
        'credit_cost_pct',
      ],
      secondaryKpis: [
        'capital_adequacy_pct',
      ],
    });

    // 3. TATAMOTORS — Auto
    this.profiles.set('TATAMOTORS', {
      symbol: 'TATAMOTORS',
      companyName: 'Tata Motors Ltd',
      businessModel: 'AUTOMOTIVE',
      primaryKpis: [
        'jlr_volumes_k',
        'jlr_ebit_margin_pct',
        'india_cv_volumes_k',
        'india_pv_volumes_k',
        'net_auto_debt_cr',
      ],
      secondaryKpis: [
        'ebit_margin_pct',
      ],
      segmentKpis: {
        JLR: ['jlr_volumes_k', 'jlr_ebit_margin_pct'],
        DomesticCV: ['india_cv_volumes_k'],
        DomesticPV: ['india_pv_volumes_k'],
      },
    });

    // 4. TATASTEEL — Commodity / Steel
    this.profiles.set('TATASTEEL', {
      symbol: 'TATASTEEL',
      companyName: 'Tata Steel Ltd',
      businessModel: 'COMMODITY',
      primaryKpis: [
        'india_production_mt',
        'india_delivery_mt',
        'india_ebitda_t',
        'europe_ebitda_t',
        'capacity_utilisation_pct',
      ],
      secondaryKpis: [
        'net_debt_cr',
      ],
      segmentKpis: {
        India: ['india_production_mt', 'india_delivery_mt', 'india_ebitda_t'],
        Europe: ['europe_ebitda_t'],
      },
    });

    // 5. RELIANCE — Diversified Conglomerate
    this.profiles.set('RELIANCE', {
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries Ltd',
      businessModel: 'CONGLOMERATE',
      primaryKpis: [
        'revenue_cr',
        'ebitda_cr',
        'capex_cr',
        'net_debt_cr',
      ],
      secondaryKpis: [
        'roce_pct',
      ],
      segmentKpis: {
        O2C: ['ebitda_cr', 'revenue_cr'],
        Retail: ['revenue_cr', 'ebitda_cr'],
        Jio: ['revenue_cr', 'ebitda_cr'],
        NewEnergy: ['capex_cr'],
      },
    });
  }
}
