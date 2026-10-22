/**
 * OperatingKpiRegistry.ts — Section 4 Operating KPI Intelligence
 *
 * Canonical taxonomy and registry for non-accounting operating metrics.
 * Accounting facts explain outcomes; operating KPIs explain the business.
 *
 * Constitution invariants:
 * - Directionality must be explicit (HIGHER_BETTER, LOWER_BETTER, CONTEXTUAL)
 * - Units and reporting frequencies must be typed
 * - No fake default numbers
 */

export interface OperatingKpiDefinition {
  metricKey: string;
  displayName: string;
  businessModels: string[];
  unit: 'PERCENT' | 'INR_CR' | 'USD_MN' | 'UNITS_THOUSAND' | 'MILLION_TONNES' | 'RATIO' | 'COUNT' | 'CURRENCY_PER_UNIT';
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'EVENT';
  directionality: 'HIGHER_BETTER' | 'LOWER_BETTER' | 'CONTEXTUAL';
  sourcePreference: string[];
  description?: string;
}

export class OperatingKpiRegistry {
  private static instance: OperatingKpiRegistry;
  private readonly registry: Map<string, OperatingKpiDefinition> = new Map();

  private constructor() {
    this.registerDefinitions();
  }

  public static getInstance(): OperatingKpiRegistry {
    if (!OperatingKpiRegistry.instance) {
      OperatingKpiRegistry.instance = new OperatingKpiRegistry();
    }
    return OperatingKpiRegistry.instance;
  }

  public get(metricKey: string): OperatingKpiDefinition | undefined {
    return this.registry.get(metricKey);
  }

  public getForBusinessModel(businessModel: string): OperatingKpiDefinition[] {
    return Array.from(this.registry.values()).filter(kpi =>
      kpi.businessModels.includes(businessModel) || kpi.businessModels.includes('*')
    );
  }

  public getAll(): OperatingKpiDefinition[] {
    return Array.from(this.registry.values());
  }

  private registerDefinitions(): void {
    const defs: OperatingKpiDefinition[] = [
      // ─── IT SERVICES (e.g. TCS, Infosys) ──────────────────────────────────
      {
        metricKey: 'cc_revenue_growth_yoy',
        displayName: 'Constant Currency Revenue Growth (YoY)',
        businessModels: ['IT_SERVICES'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['investor_presentation', 'press_release', 'company_facts'],
        description: 'Year-on-year revenue growth in constant currency terms, eliminating exchange rate volatility.',
      },
      {
        metricKey: 'deal_tcv_cr',
        displayName: 'Total Contract Value (TCV) Deal Wins',
        businessModels: ['IT_SERVICES'],
        unit: 'INR_CR',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['investor_presentation', 'concall_transcript'],
        description: 'Total value of all deals signed during the period.',
      },
      {
        metricKey: 'large_deal_tcv_cr',
        displayName: 'Large Deal TCV',
        businessModels: ['IT_SERVICES'],
        unit: 'INR_CR',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['investor_presentation', 'press_release'],
        description: 'Contract value of marquee large deals (typically >$50M).',
      },
      {
        metricKey: 'employee_utilisation_pct',
        displayName: 'Employee Utilisation (excl. trainees)',
        businessModels: ['IT_SERVICES'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['factsheet', 'investor_presentation'],
        description: 'Percentage of billable staff actively deployed on revenue-generating projects.',
      },
      {
        metricKey: 'attrition_pct',
        displayName: 'Trailing 12-Month (LTM) Attrition',
        businessModels: ['IT_SERVICES'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'LOWER_BETTER',
        sourcePreference: ['factsheet', 'investor_presentation'],
        description: 'Voluntary employee turnover rate over past 12 months.',
      },
      {
        metricKey: 'headcount',
        displayName: 'Total Headcount',
        businessModels: ['IT_SERVICES'],
        unit: 'COUNT',
        frequency: 'QUARTERLY',
        directionality: 'CONTEXTUAL',
        sourcePreference: ['factsheet', 'press_release'],
        description: 'Total active employee count at end of quarter.',
      },
      {
        metricKey: 'ebit_margin_pct',
        displayName: 'Operating EBIT Margin',
        businessModels: ['IT_SERVICES', 'MANUFACTURING', 'AUTOMOTIVE'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['company_facts', 'financial_results'],
        description: 'Earnings before interest and tax divided by net revenue.',
      },

      // ─── BANKING & NBFC (e.g. HDFCBANK) ───────────────────────────────────
      {
        metricKey: 'loan_book_cr',
        displayName: 'Gross Advances / Loan Book',
        businessModels: ['BANK', 'NBFC'],
        unit: 'INR_CR',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['company_facts', 'investor_presentation'],
        description: 'Total outstanding loan book size.',
      },
      {
        metricKey: 'deposit_cr',
        displayName: 'Total Deposits',
        businessModels: ['BANK'],
        unit: 'INR_CR',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['company_facts', 'investor_presentation'],
        description: 'Total customer deposits mobilized.',
      },
      {
        metricKey: 'casa_ratio_pct',
        displayName: 'CASA Ratio',
        businessModels: ['BANK'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['investor_presentation', 'company_facts'],
        description: 'Current and savings account deposits as % of total deposits.',
      },
      {
        metricKey: 'nim_pct',
        displayName: 'Net Interest Margin (NIM)',
        businessModels: ['BANK', 'NBFC'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['investor_presentation', 'company_facts'],
        description: 'Net interest income as a percentage of average interest-earning assets.',
      },
      {
        metricKey: 'gnpa_pct',
        displayName: 'Gross NPA Ratio',
        businessModels: ['BANK', 'NBFC'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'LOWER_BETTER',
        sourcePreference: ['investor_presentation', 'financial_results'],
        description: 'Gross non-performing assets as a percentage of gross advances.',
      },
      {
        metricKey: 'nnpa_pct',
        displayName: 'Net NPA Ratio',
        businessModels: ['BANK', 'NBFC'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'LOWER_BETTER',
        sourcePreference: ['investor_presentation', 'financial_results'],
        description: 'Net non-performing assets after provisions as % of net advances.',
      },
      {
        metricKey: 'credit_cost_pct',
        displayName: 'Annualised Credit Cost',
        businessModels: ['BANK', 'NBFC'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'LOWER_BETTER',
        sourcePreference: ['investor_presentation', 'concall_transcript'],
        description: 'Loan-loss provisioning expenses divided by average advances.',
      },
      {
        metricKey: 'capital_adequacy_pct',
        displayName: 'Capital Adequacy Ratio (CRAR)',
        businessModels: ['BANK', 'NBFC'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['financial_results', 'investor_presentation'],
        description: 'Total regulatory capital divided by risk-weighted assets.',
      },

      // ─── AUTOMOTIVE (e.g. Tata Motors) ────────────────────────────────────
      {
        metricKey: 'jlr_volumes_k',
        displayName: 'JLR Wholesales (excl. CJLR)',
        businessModels: ['AUTOMOTIVE', 'MANUFACTURING'],
        unit: 'UNITS_THOUSAND',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['investor_presentation', 'press_release'],
        description: 'Wholesale vehicle deliveries for Jaguar Land Rover.',
      },
      {
        metricKey: 'jlr_ebit_margin_pct',
        displayName: 'JLR EBIT Margin',
        businessModels: ['AUTOMOTIVE', 'MANUFACTURING'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['investor_presentation', 'concall_transcript'],
        description: 'Operating EBIT margin for Jaguar Land Rover segment.',
      },
      {
        metricKey: 'india_cv_volumes_k',
        displayName: 'India Commercial Vehicle Volumes',
        businessModels: ['AUTOMOTIVE', 'MANUFACTURING'],
        unit: 'UNITS_THOUSAND',
        frequency: 'MONTHLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['monthly_sales_release', 'press_release'],
        description: 'Domestic India commercial vehicle volume deliveries.',
      },
      {
        metricKey: 'india_pv_volumes_k',
        displayName: 'India Passenger Vehicle Volumes',
        businessModels: ['AUTOMOTIVE', 'MANUFACTURING'],
        unit: 'UNITS_THOUSAND',
        frequency: 'MONTHLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['monthly_sales_release', 'press_release'],
        description: 'Domestic India passenger vehicle volume deliveries.',
      },
      {
        metricKey: 'net_auto_debt_cr',
        displayName: 'Net Automotive Debt',
        businessModels: ['AUTOMOTIVE', 'MANUFACTURING'],
        unit: 'INR_CR',
        frequency: 'QUARTERLY',
        directionality: 'LOWER_BETTER',
        sourcePreference: ['investor_presentation', 'company_facts'],
        description: 'Total automotive borrowings minus cash and liquid investments.',
      },

      // ─── COMMODITY / STEEL (e.g. Tata Steel) ──────────────────────────────
      {
        metricKey: 'india_production_mt',
        displayName: 'India Crude Steel Production',
        businessModels: ['COMMODITY'],
        unit: 'MILLION_TONNES',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['production_release', 'investor_presentation'],
        description: 'Crude steel production volume across Indian facilities.',
      },
      {
        metricKey: 'india_delivery_mt',
        displayName: 'India Steel Deliveries',
        businessModels: ['COMMODITY'],
        unit: 'MILLION_TONNES',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['production_release', 'investor_presentation'],
        description: 'Finished steel deliveries to domestic customers.',
      },
      {
        metricKey: 'india_ebitda_t',
        displayName: 'India EBITDA per Tonne',
        businessModels: ['COMMODITY'],
        unit: 'CURRENCY_PER_UNIT',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['investor_presentation', 'factsheet'],
        description: 'EBITDA generated per tonne of steel delivered in India.',
      },
      {
        metricKey: 'europe_ebitda_t',
        displayName: 'Europe EBITDA per Tonne',
        businessModels: ['COMMODITY'],
        unit: 'CURRENCY_PER_UNIT',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['investor_presentation', 'factsheet'],
        description: 'EBITDA per tonne across UK and Netherlands steel operations.',
      },
      {
        metricKey: 'capacity_utilisation_pct',
        displayName: 'Plant Capacity Utilisation',
        businessModels: ['COMMODITY', 'MANUFACTURING'],
        unit: 'PERCENT',
        frequency: 'QUARTERLY',
        directionality: 'HIGHER_BETTER',
        sourcePreference: ['investor_presentation', 'annual_report'],
        description: 'Actual production divided by rated operational capacity.',
      },
    ];

    for (const def of defs) {
      this.registry.set(def.metricKey, def);
    }
  }
}
