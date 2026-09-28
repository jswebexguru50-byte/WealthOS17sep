export type DerivedMetricFormula = (facts: Record<string, number | null>) => number | null | 'MISSING' | 'NOT_MEANINGFUL';

export interface DerivedMetricDefinition {
  canonical_metric: string;
  required_inputs: string[];
  formula: DerivedMetricFormula;
  compatible_periods: string[];
  compatible_scopes: string[];
  unit: string;
  version: string;
}

export const FinancialMetricRegistry: Record<string, DerivedMetricDefinition> = {
  // PROFITABILITY
  'gross_margin': {
    canonical_metric: 'gross_margin_derived',
    required_inputs: ['revenue', 'cogs'],
    compatible_periods: ['QUARTER', 'ANNUAL', 'TTM'],
    compatible_scopes: ['CONSOLIDATED', 'STANDALONE'],
    unit: 'PERCENTAGE',
    version: 'V1',
    formula: (facts) => {
      if (facts['revenue'] == null || facts['cogs'] == null) return 'MISSING';
      if (facts['revenue'] === 0) return 'NOT_MEANINGFUL';
      return ((facts['revenue']! - facts['cogs']!) / facts['revenue']!) * 100;
    }
  },
  'ebitda_margin': {
    canonical_metric: 'ebitda_margin_derived',
    required_inputs: ['ebitda', 'revenue'],
    compatible_periods: ['QUARTER', 'ANNUAL', 'TTM'],
    compatible_scopes: ['CONSOLIDATED', 'STANDALONE'],
    unit: 'PERCENTAGE',
    version: 'V1',
    formula: (facts) => {
      if (facts['ebitda'] == null || facts['revenue'] == null) return 'MISSING';
      if (facts['revenue'] === 0) return 'NOT_MEANINGFUL';
      return (facts['ebitda']! / facts['revenue']!) * 100;
    }
  },
  'pat_margin': {
    canonical_metric: 'pat_margin_derived',
    required_inputs: ['pat', 'revenue'],
    compatible_periods: ['QUARTER', 'ANNUAL', 'TTM'],
    compatible_scopes: ['CONSOLIDATED', 'STANDALONE'],
    unit: 'PERCENTAGE',
    version: 'V1',
    formula: (facts) => {
      if (facts['pat'] == null || facts['revenue'] == null) return 'MISSING';
      if (facts['revenue'] === 0) return 'NOT_MEANINGFUL';
      return (facts['pat']! / facts['revenue']!) * 100;
    }
  },

  // CASH QUALITY
  'fcf': {
    canonical_metric: 'fcf_derived',
    required_inputs: ['cfo', 'capex_cash_outflow'],
    compatible_periods: ['ANNUAL', 'TTM'],
    compatible_scopes: ['CONSOLIDATED', 'STANDALONE'],
    unit: 'INR_CRORE',
    version: 'V1',
    formula: (facts) => {
      // Disabled pending Capex sign convention verification
      return 'MISSING';
    }
  },
  'fcf_margin': {
    canonical_metric: 'fcf_margin_derived',
    required_inputs: ['cfo', 'capex_cash_outflow', 'revenue'],
    compatible_periods: ['ANNUAL', 'TTM'],
    compatible_scopes: ['CONSOLIDATED', 'STANDALONE'],
    unit: 'PERCENTAGE',
    version: 'V1',
    formula: (facts) => {
      // Disabled pending Capex sign convention verification
      return 'MISSING';
    }
  },
  'cfo_pat_ratio': {
    canonical_metric: 'cfo_pat_ratio_derived',
    required_inputs: ['cfo', 'pat'],
    compatible_periods: ['ANNUAL', 'TTM'],
    compatible_scopes: ['CONSOLIDATED', 'STANDALONE'],
    unit: 'RATIO',
    version: 'V1',
    formula: (facts) => {
      if (facts['cfo'] == null || facts['pat'] == null) return 'MISSING';
      if (facts['pat'] === 0) return 'NOT_MEANINGFUL';
      return facts['cfo']! / facts['pat']!;
    }
  },
  'fcf_pat_ratio': {
    canonical_metric: 'fcf_pat_ratio_derived',
    required_inputs: ['cfo', 'capex_cash_outflow', 'pat'],
    compatible_periods: ['ANNUAL', 'TTM'],
    compatible_scopes: ['CONSOLIDATED', 'STANDALONE'],
    unit: 'RATIO',
    version: 'V1',
    formula: (facts) => {
      // Disabled pending Capex sign convention verification
      return 'MISSING';
    }
  },

  // BALANCE SHEET STRENGTH
  'debt_equity': {
    canonical_metric: 'debt_to_equity_derived',
    required_inputs: ['total_debt', 'net_worth'],
    compatible_periods: ['ANNUAL', 'TTM'],
    compatible_scopes: ['CONSOLIDATED', 'STANDALONE'],
    unit: 'RATIO',
    version: 'V1',
    formula: (facts) => {
      if (facts['total_debt'] == null || facts['net_worth'] == null) return 'MISSING';
      if (facts['net_worth'] === 0) return 'NOT_MEANINGFUL';
      return facts['total_debt']! / facts['net_worth']!;
    }
  },
  'net_debt_ebitda': {
    canonical_metric: 'net_debt_ebitda_derived',
    required_inputs: ['net_debt', 'ebitda'],
    compatible_periods: ['ANNUAL', 'TTM'],
    compatible_scopes: ['CONSOLIDATED', 'STANDALONE'],
    unit: 'RATIO',
    version: 'V1',
    formula: (facts) => {
      if (facts['net_debt'] == null || facts['ebitda'] == null) return 'MISSING';
      if (facts['ebitda'] === 0) return 'NOT_MEANINGFUL';
      return facts['net_debt']! / facts['ebitda']!;
    }
  },
  
  // ROCE
  'roce': {
    canonical_metric: 'roce_derived',
    required_inputs: ['ebit', 'capital_employed'],
    compatible_periods: ['ANNUAL'],
    compatible_scopes: ['CONSOLIDATED', 'STANDALONE'],
    unit: 'PERCENTAGE',
    version: 'V1',
    formula: (facts) => {
      if (facts['ebit'] == null || facts['capital_employed'] == null) return 'MISSING';
      if (facts['capital_employed']! <= 0) return 'NOT_MEANINGFUL';
      return (facts['ebit']! / facts['capital_employed']!) * 100;
    }
  }
};
