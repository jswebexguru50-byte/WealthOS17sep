export const ANALYTICS_UNAVAILABLE = {
 quality:'UNAVAILABLE' as const,
 reason:'Verified daily return and benchmark observations are required',
 metrics:{sharpe:null,sortino:null,volatility:null,alpha:null,beta:null}
};
