/**
 * Direct website providers are intentionally separate from MCP.  This module
 * only determines whether a pre-authenticated session has been configured; it
 * never reads, returns, logs, or serializes a credential value.
 */

export type DirectWebProviderId = 'TRENDLYNE_DIRECT' | 'TRADINGVIEW_DIRECT';
export type DirectWebProviderStatus = 'READY_FOR_ADAPTER' | 'NEEDS_AUTH';

export interface DirectWebProviderReadiness {
  provider: DirectWebProviderId;
  status: DirectWebProviderStatus;
  configured: boolean;
  browserSessionRequired: true;
  detail: string;
}

export interface DirectWebProviderConfigInput {
  /** Keys only: callers must never pass or expose credential values. */
  environmentKeys?: Iterable<string>;
  /** Keys only from AppConfig: values remain in the database. */
  appConfigKeys?: Iterable<string>;
}

const TRENDLYNE_SESSION_KEYS = [
  'TRENDLYNE_DIRECT_SESSION',
  'TRENDLYNE_SESSION_COOKIE',
  'Trendlyne_Direct_Session',
  'Trendlyne_Session_Cookie',
] as const;

const TRADINGVIEW_SESSION_KEYS = [
  'TRADINGVIEW_DIRECT_SESSION',
  'TRADINGVIEW_SESSION_COOKIE',
  'TradingView_Direct_Session',
  'TradingView_Session_Cookie',
] as const;

function containsAny(keys: Set<string>, candidates: readonly string[]): boolean {
  return candidates.some(key => keys.has(key));
}

/**
 * Pure, secret-free configuration detector.  An MCP URL is deliberately not
 * accepted as proof that a direct website provider is available.
 */
export function getDirectWebProviderReadiness(input: DirectWebProviderConfigInput = {}): DirectWebProviderReadiness[] {
  const keys = new Set([
    ...Array.from(input.environmentKeys ?? []),
    ...Array.from(input.appConfigKeys ?? []),
  ]);
  const trendlyneConfigured = containsAny(keys, TRENDLYNE_SESSION_KEYS);
  const tradingViewConfigured = containsAny(keys, TRADINGVIEW_SESSION_KEYS);

  return [
    {
      provider: 'TRENDLYNE_DIRECT',
      status: trendlyneConfigured ? 'READY_FOR_ADAPTER' : 'NEEDS_AUTH',
      configured: trendlyneConfigured,
      browserSessionRequired: true,
      detail: trendlyneConfigured
        ? 'A direct Trendlyne session is configured. It may be used by the non-MCP adapter when enabled.'
        : 'Sign in to Trendlyne through the approved direct-browser connection, then save only its session reference in secure app settings.',
    },
    {
      provider: 'TRADINGVIEW_DIRECT',
      status: tradingViewConfigured ? 'READY_FOR_ADAPTER' : 'NEEDS_AUTH',
      configured: tradingViewConfigured,
      browserSessionRequired: true,
      detail: tradingViewConfigured
        ? 'A direct TradingView session is configured. It may be used by the non-MCP adapter when enabled.'
        : 'Sign in to TradingView through the approved direct-browser connection, then save only its session reference in secure app settings.',
    },
  ];
}

