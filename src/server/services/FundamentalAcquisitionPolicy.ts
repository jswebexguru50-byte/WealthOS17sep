/**
 * Default acquisition policy for user-initiated fundamental refreshes.
 *
 * MCP is deliberately absent from the executable default plan.  A caller must
 * set `mcpOptIn: true` and use a separate, auditable MCP action before an MCP
 * transport can be considered.  This keeps normal UI refreshes, scheduled
 * public refreshes, and test runs from silently spending a paid MCP call.
 */

export type FundamentalProviderId =
  | 'LOCAL_CANONICAL'
  | 'NSE_XBRL'
  | 'BSE_PUBLIC'
  | 'SCREENER_PUBLIC'
  | 'TRENDLYNE_DIRECT'
  | 'TRADINGVIEW_DIRECT'
  | 'UPSTOX_DIRECT'
  | 'KITE_DIRECT'
  | 'TRENDLYNE_MCP';

export interface FundamentalProviderOutcome {
  source: FundamentalProviderId;
  order: number;
  status: 'AVAILABLE' | 'CACHED' | 'ATTEMPTED' | 'UNAVAILABLE' | 'INSUFFICIENT' | 'NOT_CONFIGURED' | 'NOT_INVOKED' | 'NOT_REQUESTED' | 'NEEDS_AUTH' | 'MCP_OPT_IN_REQUIRED';
  detail: string;
  invoked: boolean;
  mcpUsed: boolean;
}

export interface FundamentalAcquisitionContext {
  localFactCount: number;
  cacheFresh: boolean;
  publicAcquisitionError?: string | null;
  publicSourceUrl?: string | null;
  mcpOptIn?: boolean;
  configured?: Partial<Record<'trendlyneDirect' | 'tradingViewDirect' | 'upstox' | 'kite', boolean>>;
  /** Direct web session state is observed without ever exposing its value. */
  directWebReadiness?: Partial<Record<'TRENDLYNE_DIRECT' | 'TRADINGVIEW_DIRECT', {
    configured: boolean;
    detail: string;
  }>>;
}

/** The only default executable chain.  It has no MCP provider. */
export const DEFAULT_PUBLIC_FUNDAMENTAL_WATERFALL: readonly FundamentalProviderId[] = [
  'LOCAL_CANONICAL', 'NSE_XBRL', 'BSE_PUBLIC', 'SCREENER_PUBLIC',
  'TRENDLYNE_DIRECT', 'TRADINGVIEW_DIRECT', 'UPSTOX_DIRECT', 'KITE_DIRECT'
] as const;

export function isMcpAllowedForFundamentalRefresh(context: Pick<FundamentalAcquisitionContext, 'mcpOptIn'>): boolean {
  return context.mcpOptIn === true;
}

/**
 * Produces user-visible source outcomes without exposing tokens, URLs with
 * credentials, or treating configuration as a successful fetch.
 */
export function buildFundamentalSourceOutcomes(context: FundamentalAcquisitionContext): FundamentalProviderOutcome[] {
  const configured = context.configured ?? {};
  const publicFailure = context.publicAcquisitionError?.trim() || null;
  const directStatus = (isConfigured: boolean | undefined, name: string, readiness?: { configured: boolean; detail: string }): Pick<FundamentalProviderOutcome, 'status' | 'detail'> => {
    if (readiness && !readiness.configured) return { status: 'NEEDS_AUTH', detail: readiness.detail };
    if (readiness?.configured) return { status: 'NOT_INVOKED', detail: `${readiness.detail} No verified direct adapter was invoked by this refresh.` };
    if (!isConfigured) return { status: 'NEEDS_AUTH', detail: `${name} is not configured for direct acquisition.` };
    return { status: 'NOT_INVOKED', detail: `${name} is configured but has no verified direct adapter in this refresh path, so it was not called.` };
  };

  return [
    { source: 'LOCAL_CANONICAL', order: 1, status: context.localFactCount > 0 ? 'AVAILABLE' : 'INSUFFICIENT', detail: `${context.localFactCount} usable canonical facts before refresh.`, invoked: false, mcpUsed: false },
    { source: 'NSE_XBRL', order: 2, status: 'NOT_INVOKED', detail: 'NSE XBRL must be collected through the verified filing pipeline; no unverified browser scrape was attempted.', invoked: false, mcpUsed: false },
    { source: 'BSE_PUBLIC', order: 3, status: publicFailure ? 'UNAVAILABLE' : (context.cacheFresh ? 'CACHED' : 'ATTEMPTED'), detail: context.cacheFresh ? 'Fresh public-source artifact reused (24-hour TTL).' : (publicFailure || 'BSE public endpoints attempted where a BSE code could be resolved.'), invoked: !context.cacheFresh, mcpUsed: false },
    { source: 'SCREENER_PUBLIC', order: 4, status: context.publicSourceUrl ? 'AVAILABLE' : (publicFailure ? 'UNAVAILABLE' : 'INSUFFICIENT'), detail: context.publicSourceUrl || 'No promotable public financial statement was returned.', invoked: !context.cacheFresh, mcpUsed: false },
    { source: 'TRENDLYNE_DIRECT', order: 5, ...directStatus(configured.trendlyneDirect, 'Trendlyne direct', context.directWebReadiness?.TRENDLYNE_DIRECT), invoked: false, mcpUsed: false },
    { source: 'TRADINGVIEW_DIRECT', order: 6, ...directStatus(configured.tradingViewDirect, 'TradingView direct', context.directWebReadiness?.TRADINGVIEW_DIRECT), invoked: false, mcpUsed: false },
    { source: 'UPSTOX_DIRECT', order: 7, ...directStatus(configured.upstox, 'Upstox'), invoked: false, mcpUsed: false },
    { source: 'KITE_DIRECT', order: 8, ...directStatus(configured.kite, 'Kite'), invoked: false, mcpUsed: false },
    {
      source: 'TRENDLYNE_MCP', order: 9,
      status: isMcpAllowedForFundamentalRefresh(context) ? 'MCP_OPT_IN_REQUIRED' : 'NOT_REQUESTED',
      detail: isMcpAllowedForFundamentalRefresh(context)
        ? 'MCP was explicitly requested, but this public refresh endpoint never invokes MCP. Use the separate audited MCP action.'
        : 'MCP is disabled for default refreshes and was not called.',
      invoked: false, mcpUsed: false,
    },
  ];
}
