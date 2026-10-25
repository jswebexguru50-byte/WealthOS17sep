import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PUBLIC_FUNDAMENTAL_WATERFALL,
  buildFundamentalSourceOutcomes,
  isMcpAllowedForFundamentalRefresh,
} from '../../src/server/services/FundamentalAcquisitionPolicy.js';

describe('FundamentalAcquisitionPolicy', () => {
  it('default fundamental waterfall cannot invoke MCP', () => {
    expect(DEFAULT_PUBLIC_FUNDAMENTAL_WATERFALL.includes('TRENDLYNE_MCP')).toBe(false);
    expect(isMcpAllowedForFundamentalRefresh({})).toBe(false);
    const mcp = buildFundamentalSourceOutcomes({ localFactCount: 0, cacheFresh: false })
      .find(item => item.source === 'TRENDLYNE_MCP');
    expect(mcp).toEqual({
      source: 'TRENDLYNE_MCP', order: 9, status: 'NOT_REQUESTED',
      detail: 'MCP is disabled for default refreshes and was not called.',
      invoked: false, mcpUsed: false,
    });
  });

  it('an explicit MCP request remains non-executing until an audited MCP action exists', () => {
    expect(isMcpAllowedForFundamentalRefresh({ mcpOptIn: true })).toBe(true);
    const mcp = buildFundamentalSourceOutcomes({ localFactCount: 0, cacheFresh: false, mcpOptIn: true })
      .find(item => item.source === 'TRENDLYNE_MCP');
    expect(mcp?.status).toBe('MCP_OPT_IN_REQUIRED');
    expect(mcp?.invoked).toBe(false);
    expect(mcp?.mcpUsed).toBe(false);
  });

  it('configured providers are not represented as fetched until a verified adapter promotes facts', () => {
    const outcomes = buildFundamentalSourceOutcomes({
      localFactCount: 4,
      cacheFresh: false,
      publicSourceUrl: 'https://www.screener.in/company/DEMO/consolidated/',
      configured: {
        trendlyneDirect: true,
        tradingViewDirect: true,
        upstox: true,
        kite: true,
      },
    });

    expect(outcomes.map(item => item.source)).toEqual([
      'LOCAL_CANONICAL', 'NSE_XBRL', 'BSE_PUBLIC', 'SCREENER_PUBLIC',
      'TRENDLYNE_DIRECT', 'TRADINGVIEW_DIRECT', 'UPSTOX_DIRECT', 'KITE_DIRECT', 'TRENDLYNE_MCP',
    ]);
    for (const source of ['TRENDLYNE_DIRECT', 'TRADINGVIEW_DIRECT', 'UPSTOX_DIRECT', 'KITE_DIRECT'] as const) {
      const outcome = outcomes.find(item => item.source === source);
      expect(outcome?.status).toBe('NOT_INVOKED');
      expect(outcome?.invoked).toBe(false);
      expect(outcome?.mcpUsed).toBe(false);
    }
    expect(outcomes.find(item => item.source === 'SCREENER_PUBLIC')?.status).toBe('AVAILABLE');
    expect(outcomes.some(item => item.source === 'TRENDLYNE_MCP' && item.mcpUsed)).toBe(false);
  });
});
