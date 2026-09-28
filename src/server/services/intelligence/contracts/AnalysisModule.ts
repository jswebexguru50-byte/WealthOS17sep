export type AnalysisModule =
  | 'TECHNICAL'
  | 'FUNDAMENTAL'
  | 'FERE'
  | 'QGLP'
  | 'MANAGEMENT'
  | 'BUSINESS_INFLECTION'
  | 'VALUATION'
  | 'SMART_MONEY'
  | 'MARKET_CONTEXT'
  | 'CATALYST'
  | 'RISK'
  | 'PORTFOLIO';

export const ALL_ANALYSIS_MODULES: readonly AnalysisModule[] = [
  'TECHNICAL',
  'FUNDAMENTAL',
  'FERE',
  'QGLP',
  'MANAGEMENT',
  'BUSINESS_INFLECTION',
  'VALUATION',
  'SMART_MONEY',
  'MARKET_CONTEXT',
  'CATALYST',
  'RISK',
  'PORTFOLIO',
] as const;
