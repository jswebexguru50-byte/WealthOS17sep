/**
 * DataProviderRegistry
 *
 * Canonical, app-wide definition of:
 *   1. Every data provider that exists, in priority order (per the architecture rule).
 *   2. What kind of data each provider is authoritative for.
 *   3. Per-provider circuit breaker, TTL, and cost policy.
 *
 * PROVIDER PRIORITY (applies to every consumer — screens, scans, jobs, CLI):
 *   1. Upstox API          — live Indian prices, intraday, historical candles, corporate actions
 *   2. Kite Connect        — adjusted historical OHLCV (canonical via DuckDB)
 *   3. TradingView         — technical context, international prices, peer data (when session active)
 *   4. Trendlyne website   — enrichment metrics, DVM score, trends (when session active)
 *   5. NSE / BSE website   — official filings, XBRL, shareholding, announcements
 *   6. MCA website         — corporate identity, directors, governance
 *   7. Company IR / web    — annual reports, investor presentations, notes
 *   8. Trendlyne MCP       — LAST RESORT; never automatic; explicit user action only
 *
 * No consumer calls a provider HTTP directly.
 * No consumer bypasses this registry to hardcode its own fallback chain.
 *
 * Usage:
 *   import { PROVIDER, providerMeta, fallbackChain } from './DataProviderRegistry.js';
 *   const chain = fallbackChain('live_price');  // → ['upstox', 'kite', 'yahoo']
 */

import { CircuitBreaker } from './CircuitBreaker.js';

// ─── Provider enum ────────────────────────────────────────────────────────────

export const PROVIDER = {
  UPSTOX:          'upstox',
  KITE:            'kite',
  TRADINGVIEW:     'tradingview',
  TRENDLYNE_SITE:  'trendlyne-site',
  NSE:             'nse',
  BSE:             'bse',
  MCA:             'mca',
  COMPANY_IR:      'company-ir',
  SCREENER:        'screener',
  YAHOO:           'yahoo',
  TRENDLYNE_MCP:   'trendlyne-mcp',   // EXPLICIT ONLY — never in automatic chains
} as const;
export type Provider = (typeof PROVIDER)[keyof typeof PROVIDER];

// ─── Data class enum ──────────────────────────────────────────────────────────

export const DATA_CLASS = {
  LIVE_PRICE:           'live_price',
  DAILY_OHLCV:          'daily_ohlcv',
  INTRADAY_OHLCV:       'intraday_ohlcv',
  CORPORATE_ACTIONS:    'corporate_actions',
  FINANCIALS:           'financials',          // P&L, balance sheet, cash flow
  RATIOS:               'ratios',              // P/E, ROE, debt/equity etc.
  SHAREHOLDING:         'shareholding',
  ANNOUNCEMENTS:        'announcements',
  CORPORATE_IDENTITY:   'corporate_identity',  // CIN, directors, governance
  ANNUAL_REPORTS:       'annual_reports',
  TECHNICAL_CONTEXT:    'technical_context',   // peers, sectors, TradingView overlays
  ENRICHMENT:           'enrichment',          // Trendlyne DVM, scores
  MF_NAV:               'mf_nav',
} as const;
export type DataClass = (typeof DATA_CLASS)[keyof typeof DATA_CLASS];

// ─── Provider metadata ────────────────────────────────────────────────────────

interface ProviderMeta {
  priority: number;           // lower = tried first
  ttlMs: number;              // cache TTL for data from this provider
  requiresAuth: boolean;      // fails gracefully with NEEDS_AUTH if no token
  requiresSession: boolean;   // browser/cookie session (TradingView, Trendlyne site)
  isExplicitOnly: boolean;    // never used in automatic fallback chains
  authoritative: DataClass[]; // data classes where this provider is primary authority
}

export const providerMeta: Record<Provider, ProviderMeta> = {
  [PROVIDER.UPSTOX]: {
    priority: 1,
    ttlMs: 60_000,               // 1 min for live prices
    requiresAuth: true,
    requiresSession: false,
    isExplicitOnly: false,
    authoritative: [DATA_CLASS.LIVE_PRICE, DATA_CLASS.INTRADAY_OHLCV, DATA_CLASS.CORPORATE_ACTIONS],
  },
  [PROVIDER.KITE]: {
    priority: 2,
    ttlMs: 24 * 60 * 60_000,     // daily candles stable post-close
    requiresAuth: true,
    requiresSession: false,
    isExplicitOnly: false,
    authoritative: [DATA_CLASS.DAILY_OHLCV],
  },
  [PROVIDER.TRADINGVIEW]: {
    priority: 3,
    ttlMs: 15 * 60_000,          // 15 min
    requiresAuth: false,
    requiresSession: true,       // optional — degraded gracefully when absent
    isExplicitOnly: false,
    authoritative: [DATA_CLASS.TECHNICAL_CONTEXT],
  },
  [PROVIDER.TRENDLYNE_SITE]: {
    priority: 4,
    ttlMs: 6 * 60 * 60_000,      // 6 hours
    requiresAuth: false,
    requiresSession: true,
    isExplicitOnly: false,
    authoritative: [DATA_CLASS.ENRICHMENT],
  },
  [PROVIDER.NSE]: {
    priority: 5,
    ttlMs: 60 * 60_000,          // 1 hour for filings
    requiresAuth: false,
    requiresSession: false,
    isExplicitOnly: false,
    authoritative: [DATA_CLASS.FINANCIALS, DATA_CLASS.SHAREHOLDING, DATA_CLASS.ANNOUNCEMENTS, DATA_CLASS.ANNUAL_REPORTS],
  },
  [PROVIDER.BSE]: {
    priority: 5,
    ttlMs: 60 * 60_000,
    requiresAuth: false,
    requiresSession: false,
    isExplicitOnly: false,
    authoritative: [DATA_CLASS.FINANCIALS, DATA_CLASS.SHAREHOLDING, DATA_CLASS.ANNOUNCEMENTS],
  },
  [PROVIDER.MCA]: {
    priority: 6,
    ttlMs: 7 * 24 * 60 * 60_000, // 1 week — corporate identity changes rarely
    requiresAuth: false,
    requiresSession: false,
    isExplicitOnly: false,
    authoritative: [DATA_CLASS.CORPORATE_IDENTITY],
  },
  [PROVIDER.COMPANY_IR]: {
    priority: 7,
    ttlMs: 7 * 24 * 60 * 60_000,
    requiresAuth: false,
    requiresSession: false,
    isExplicitOnly: false,
    authoritative: [DATA_CLASS.ANNUAL_REPORTS],
  },
  [PROVIDER.SCREENER]: {
    priority: 8,
    ttlMs: 48 * 60 * 60_000,
    requiresAuth: false,
    requiresSession: false,
    isExplicitOnly: false,
    authoritative: [DATA_CLASS.RATIOS],
  },
  [PROVIDER.YAHOO]: {
    priority: 9,
    ttlMs: 15 * 60_000,
    requiresAuth: false,
    requiresSession: false,
    isExplicitOnly: false,
    authoritative: [],          // fallback only; no data class is Yahoo-authoritative
  },
  [PROVIDER.TRENDLYNE_MCP]: {
    priority: 99,               // never in automatic chains
    ttlMs: 0,
    requiresAuth: true,
    requiresSession: false,
    isExplicitOnly: true,       // MUST be explicit user action
    authoritative: [],
  },
};

// ─── Fallback chains per data class ──────────────────────────────────────────
// Ordered list of providers to try for each data class.
// No provider with isExplicitOnly=true appears here.

const CHAINS: Record<DataClass, Provider[]> = {
  [DATA_CLASS.LIVE_PRICE]:        [PROVIDER.UPSTOX, PROVIDER.YAHOO],
  [DATA_CLASS.DAILY_OHLCV]:       [PROVIDER.KITE, PROVIDER.UPSTOX, PROVIDER.YAHOO],
  [DATA_CLASS.INTRADAY_OHLCV]:    [PROVIDER.UPSTOX, PROVIDER.KITE],
  [DATA_CLASS.CORPORATE_ACTIONS]: [PROVIDER.UPSTOX, PROVIDER.NSE, PROVIDER.BSE],
  [DATA_CLASS.FINANCIALS]:        [PROVIDER.NSE, PROVIDER.BSE, PROVIDER.SCREENER],
  [DATA_CLASS.RATIOS]:            [PROVIDER.SCREENER, PROVIDER.NSE, PROVIDER.BSE],
  [DATA_CLASS.SHAREHOLDING]:      [PROVIDER.NSE, PROVIDER.BSE, PROVIDER.TRENDLYNE_SITE],
  [DATA_CLASS.ANNOUNCEMENTS]:     [PROVIDER.NSE, PROVIDER.BSE],
  [DATA_CLASS.CORPORATE_IDENTITY]:[PROVIDER.NSE, PROVIDER.MCA],
  [DATA_CLASS.ANNUAL_REPORTS]:    [PROVIDER.NSE, PROVIDER.BSE, PROVIDER.COMPANY_IR],
  [DATA_CLASS.TECHNICAL_CONTEXT]: [PROVIDER.TRADINGVIEW, PROVIDER.NSE],
  [DATA_CLASS.ENRICHMENT]:        [PROVIDER.TRENDLYNE_SITE, PROVIDER.SCREENER],
  [DATA_CLASS.MF_NAV]:            [PROVIDER.NSE],
};

/** Returns the ordered provider list for a given data class (excludes explicit-only). */
export function fallbackChain(dataClass: DataClass): Provider[] {
  return (CHAINS[dataClass] ?? []).filter(p => !providerMeta[p].isExplicitOnly);
}

/** Pre-create circuit breakers for every automatic provider at startup. */
export function initProviderCircuitBreakers(): void {
  for (const [provider, meta] of Object.entries(providerMeta)) {
    if (!meta.isExplicitOnly) {
      CircuitBreaker.for(provider, { failureThreshold: 5, halfOpenAfterMs: 30_000 });
    }
  }
}
