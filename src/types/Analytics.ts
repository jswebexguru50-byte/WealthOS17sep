export interface AnalyticsUnavailableState {
  quality: 'UNAVAILABLE'; reason: string;
  metrics: { sharpe: null; sortino: null; volatility: null; alpha: null; beta: null; };
}
export const ANALYTICS_UNAVAILABLE: AnalyticsUnavailableState = {
  quality: 'UNAVAILABLE', reason: 'Insufficient daily return history for statistical risk metrics',
  metrics: { sharpe: null, sortino: null, volatility: null, alpha: null, beta: null },
};
