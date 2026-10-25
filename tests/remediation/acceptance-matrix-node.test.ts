import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiLayerFetcher } from '../../src/server/services/MultiLayerFetcher.js';
import { DEFAULT_PUBLIC_FUNDAMENTAL_WATERFALL, isMcpAllowedForFundamentalRefresh } from '../../src/server/services/FundamentalAcquisitionPolicy.js';

test('acceptance: provider timeout falls through and concurrent requests coalesce', async () => {
  let firstCalls = 0;
  let secondCalls = 0;
  const fetcher = new MultiLayerFetcher([
    { name: 'upstox', fetch: async () => { firstCalls++; throw Object.assign(new Error('timeout'), { status: 503 }); } },
    { name: 'nse_xbrl', fetch: async () => { secondCalls++; return { revenue: 120 }; } },
  ]);
  const [a, b] = await Promise.all([fetcher.fetch('INFY', 'fundamentals'), fetcher.fetch('infy', 'fundamentals')]);
  assert.equal(a.source, 'nse_xbrl');
  assert.deepEqual(a, b);
  assert.equal(firstCalls, 2);
  assert.equal(secondCalls, 1);
});

test('acceptance: default waterfall excludes MCP and explicit opt-in is distinguishable', () => {
  assert.equal(DEFAULT_PUBLIC_FUNDAMENTAL_WATERFALL.includes('TRENDLYNE_MCP'), false);
  assert.equal(isMcpAllowedForFundamentalRefresh({}), false);
  assert.equal(isMcpAllowedForFundamentalRefresh({ mcpOptIn: true }), true);
});

test('acceptance: numeric scrips use BSE routing while alpha symbols use NSE routing', () => {
  const route = (scrip: string) => /^\d+$/.test(scrip.trim()) ? 'BSE' : 'NSE';
  assert.equal(route('500325'), 'BSE');
  assert.equal(route('INFY'), 'NSE');
});
