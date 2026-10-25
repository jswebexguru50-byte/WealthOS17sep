import { describe, it, expect } from 'vitest';
import { getDirectWebProviderReadiness } from '../../src/server/services/DirectWebProviderReadiness.js';

describe('DirectWebProviderReadiness', () => {
  it('direct website providers require their own session and never infer readiness from MCP', () => {
    const result = getDirectWebProviderReadiness({ environmentKeys: ['TRENDLYNE_MCP_URL'] });
    expect(result.map(item => [item.provider, item.status, item.configured])).toEqual([
      ['TRENDLYNE_DIRECT', 'NEEDS_AUTH', false],
      ['TRADINGVIEW_DIRECT', 'NEEDS_AUTH', false],
    ]);
  });

  it('direct website providers become adapter-ready only from named direct-session keys', () => {
    const result = getDirectWebProviderReadiness({
      environmentKeys: ['TRENDLYNE_DIRECT_SESSION'],
      appConfigKeys: ['TradingView_Direct_Session'],
    });
    expect(result.map(item => [item.provider, item.status, item.configured])).toEqual([
      ['TRENDLYNE_DIRECT', 'READY_FOR_ADAPTER', true],
      ['TRADINGVIEW_DIRECT', 'READY_FOR_ADAPTER', true],
    ]);
    expect(JSON.stringify(result).includes('TRENDLYNE_DIRECT_SESSION')).toBe(false);
  });
});
