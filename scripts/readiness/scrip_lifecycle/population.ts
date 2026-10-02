export interface TestCompanyDefinition {
  symbol: string;
  name: string;
  isin: string;
  category: string;
  sector: string;
  industry?: string;
  entryRoutes: string[];
  expectedProperties: {
    isNormal?: boolean;
    isFinancial?: boolean;
    hasSparseFacts?: boolean;
    isRecentIpo?: boolean;
    hasCoverageGap?: boolean;
    isLossMaking?: boolean;
    isHighLeverage?: boolean;
    hasTurnaroundGrowth?: boolean;
    hasCorporateActionHistory?: boolean;
    hasFailedGuidance?: boolean;
    hasConflictingProviderData?: boolean;
  };
}

export const LIFECYCLE_TEST_COHORT: TestCompanyDefinition[] = [
  // 3 manually selected normal companies
  {
    symbol: 'TCS',
    name: 'Tata Consultancy Services Limited',
    isin: 'INE467B01029',
    category: 'MANUAL_NORMAL',
    sector: 'Information Technology',
    industry: 'Computers - Software',
    entryRoutes: ['MANUAL_TICKER', 'MANUAL_NAME'],
    expectedProperties: { isNormal: true }
  },
  {
    symbol: 'INFY',
    name: 'Infosys Limited',
    isin: 'INE009A01021',
    category: 'MANUAL_NORMAL',
    sector: 'Information Technology',
    industry: 'Computers - Software',
    entryRoutes: ['MANUAL_TICKER', 'MANUAL_NAME'],
    expectedProperties: { isNormal: true }
  },
  {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Limited',
    isin: 'INE040A01034',
    category: 'MANUAL_NORMAL',
    sector: 'Financial Services',
    industry: 'Banks - Private Sector',
    entryRoutes: ['MANUAL_TICKER', 'MANUAL_NAME'],
    expectedProperties: { isNormal: true, isFinancial: true }
  },

  // 3 fundamental-filter discoveries
  {
    symbol: 'TITAN',
    name: 'Titan Company Limited',
    isin: 'INE280A01028',
    category: 'FUNDAMENTAL_FILTER_DISCOVERY',
    sector: 'Consumer Discretionary',
    industry: 'Gems, Jewellery And Watches',
    entryRoutes: ['FUNDAMENTAL_FILTER', 'WATCHLIST'],
    expectedProperties: { isNormal: true }
  },
  {
    symbol: 'SUNPHARMA',
    name: 'Sun Pharmaceutical Industries Limited',
    isin: 'INE044A01036',
    category: 'FUNDAMENTAL_FILTER_DISCOVERY',
    sector: 'Healthcare',
    industry: 'Pharmaceuticals',
    entryRoutes: ['FUNDAMENTAL_FILTER'],
    expectedProperties: { isNormal: true }
  },
  {
    symbol: 'BEL',
    name: 'Bharat Electronics Limited',
    isin: 'INE263A01024',
    category: 'FUNDAMENTAL_FILTER_DISCOVERY',
    sector: 'Capital Goods',
    industry: 'Aerospace & Defence',
    entryRoutes: ['FUNDAMENTAL_FILTER', 'CATALYST_EVENT'],
    expectedProperties: { isNormal: true }
  },

  // 3 technical discoveries
  {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Limited',
    isin: 'INE002A01018',
    category: 'TECHNICAL_DISCOVERY',
    sector: 'Oil Gas & Consumable Fuels',
    industry: 'Refineries/Petro-Products',
    entryRoutes: ['TECHNICAL_STRATEGY', 'MULTI_FILTER'],
    expectedProperties: { isNormal: true }
  },
  {
    symbol: 'TATAMOTORS',
    name: 'Tata Motors Limited',
    isin: 'INE155A01022',
    category: 'TECHNICAL_DISCOVERY',
    sector: 'Automobile and Auto Components',
    industry: 'Automobiles - 4 Wheelers',
    entryRoutes: ['TECHNICAL_STRATEGY'],
    expectedProperties: { isNormal: true }
  },
  {
    symbol: 'TATASTEEL',
    name: 'Tata Steel Limited',
    isin: 'INE081A01020',
    category: 'TECHNICAL_DISCOVERY',
    sector: 'Metals & Mining',
    industry: 'Iron & Steel',
    entryRoutes: ['TECHNICAL_STRATEGY'],
    expectedProperties: { isNormal: true }
  },

  // 2 discovered by both fundamental and technical
  {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank Limited',
    isin: 'INE090A01021',
    category: 'DUAL_DISCOVERY',
    sector: 'Financial Services',
    industry: 'Banks - Private Sector',
    entryRoutes: ['FUNDAMENTAL_FILTER', 'TECHNICAL_STRATEGY', 'DUAL_CONVERGENCE'],
    expectedProperties: { isNormal: true, isFinancial: true }
  },
  {
    symbol: 'DYCL',
    name: 'Dynamic Cables Limited',
    isin: 'INE600K01018',
    category: 'DUAL_DISCOVERY',
    sector: 'Capital Goods',
    industry: 'Cables - Electrical',
    entryRoutes: ['FUNDAMENTAL_FILTER', 'TECHNICAL_STRATEGY', 'DUAL_CONVERGENCE'],
    expectedProperties: { isNormal: true }
  },

  // ASHIANA
  {
    symbol: 'ASHIANA',
    name: 'Ashiana Housing Limited',
    isin: 'INE365D01021',
    category: 'ASHIANA_SPECIAL',
    sector: 'Real Estate',
    industry: 'Residential Commercial Projects',
    entryRoutes: ['MANUAL_TICKER', 'MANUAL_NAME', 'FUNDAMENTAL_FILTER', 'TECHNICAL_STRATEGY'],
    expectedProperties: { hasTurnaroundGrowth: true }
  },

  // STYL
  {
    symbol: 'STYL',
    name: 'Seshaasai Technologies Limited',
    isin: 'INE04VU01023',
    category: 'STYL_AMBIGUOUS',
    sector: 'Technology',
    industry: 'IT Services',
    entryRoutes: ['MANUAL_TICKER', 'AMBIGUOUS_TICKER'],
    expectedProperties: { isRecentIpo: true }
  },

  // STYLAMIND
  {
    symbol: 'STYLAMIND',
    name: 'Stylam Industries Limited',
    isin: 'INE239C01020',
    category: 'STYLAMIND_SIMILAR',
    sector: 'Consumer Cyclical',
    industry: 'Laminates / Decorative',
    entryRoutes: ['MANUAL_TICKER', 'MANUAL_NAME', 'SIMILAR_COMPANY'],
    expectedProperties: { isNormal: true }
  },

  // 2 portfolio companies
  {
    symbol: 'AKIKO',
    name: 'Akiko Global Services Limited',
    isin: 'INE0RRJ01015',
    category: 'PORTFOLIO_HOLDING',
    sector: 'Financial Services',
    industry: 'Fintech / Services',
    entryRoutes: ['PORTFOLIO_HOLDINGS'],
    expectedProperties: { isNormal: true }
  },
  {
    symbol: 'APLAPOLLO',
    name: 'APL Apollo Tubes Limited',
    isin: 'INE702C01027',
    category: 'PORTFOLIO_HOLDING',
    sector: 'Capital Goods',
    industry: 'Steel Tubes & Pipes',
    entryRoutes: ['PORTFOLIO_HOLDINGS', 'WATCHLIST'],
    expectedProperties: { isNormal: true }
  },

  // 1 recent IPO
  {
    symbol: 'BAJAJHFL',
    name: 'Bajaj Housing Finance Limited',
    isin: 'INE377Y01017',
    category: 'RECENT_IPO',
    sector: 'Financial Services',
    industry: 'Housing Finance',
    entryRoutes: ['IPO_DISCOVERY', 'MANUAL_TICKER'],
    expectedProperties: { isRecentIpo: true, isFinancial: true }
  },

  // 1 company with sparse fundamentals
  {
    symbol: 'WAVEBTEST',
    name: 'Wave Mechanics Test Scrip',
    isin: 'IN9999999999',
    category: 'SPARSE_FUNDAMENTALS',
    sector: 'Industrials',
    industry: 'Engineering Test',
    entryRoutes: ['PREVIOUSLY_REJECTED', 'DATA_DEFICIENT'],
    expectedProperties: { hasSparseFacts: true }
  },

  // 1 DuckDB coverage-gap case
  {
    symbol: 'UNICHEMLAB',
    name: 'Unichem Laboratories Limited',
    isin: 'INE351A01035',
    category: 'DUCKDB_COVERAGE_GAP',
    sector: 'Healthcare',
    industry: 'Pharmaceuticals',
    entryRoutes: ['DATA_DEFICIENT', 'MANUAL_TICKER'],
    expectedProperties: { hasCoverageGap: true }
  },

  // 1 loss-making company & 1 highly leveraged company
  {
    symbol: 'IDEA',
    name: 'Vodafone Idea Limited',
    isin: 'INE669E01016',
    category: 'LOSS_MAKING_HIGH_LEVERAGE',
    sector: 'Telecommunication',
    industry: 'Telecom - Services',
    entryRoutes: ['MANUAL_TICKER', 'FUNDAMENTAL_FILTER'],
    expectedProperties: { isLossMaking: true, isHighLeverage: true }
  },

  // 1 company with exceptional one-year growth / turnaround
  {
    symbol: 'SUZLON',
    name: 'Suzlon Energy Limited',
    isin: 'INE040H01021',
    category: 'EXCEPTIONAL_GROWTH',
    sector: 'Capital Goods',
    industry: 'Wind Turbines / Green Energy',
    entryRoutes: ['FUNDAMENTAL_FILTER', 'TECHNICAL_STRATEGY', 'CATALYST_EVENT'],
    expectedProperties: { hasTurnaroundGrowth: true }
  },

  // 1 company with corporate action/symbol history
  {
    symbol: 'ARE&M',
    name: 'Amara Raja Energy & Mobility Limited',
    isin: 'INE885A01032',
    category: 'CORPORATE_ACTION_HISTORY',
    sector: 'Automobile and Auto Components',
    industry: 'Auto Parts & Equipment',
    entryRoutes: ['MANUAL_TICKER', 'CATALYST_EVENT'],
    expectedProperties: { hasCorporateActionHistory: true }
  },

  // 1 company where management guidance subsequently failed
  {
    symbol: 'PAYTM',
    name: 'One 97 Communications Limited',
    isin: 'INE982J01020',
    category: 'GUIDANCE_FAILED_REGULATORY',
    sector: 'Financial Services',
    industry: 'Financial Technology (Fintech)',
    entryRoutes: ['MANUAL_TICKER', 'CATALYST_EVENT'],
    expectedProperties: { hasFailedGuidance: true }
  },

  // 1 company with conflicting provider data
  {
    symbol: 'BLISSGVS',
    name: 'Bliss GVS Pharma Limited',
    isin: 'INE416D01022',
    category: 'CONFLICTING_PROVIDER_DATA',
    sector: 'Healthcare',
    industry: 'Pharmaceuticals',
    entryRoutes: ['MANUAL_TICKER', 'FUNDAMENTAL_FILTER'],
    expectedProperties: { hasConflictingProviderData: true }
  }
];
