/**
 * Phase 4 Debug Test - Quick endpoint check
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api';

async function testEndpoint(method, path, body = null) {
  try {
    const url = `${BASE_URL}${path}`;
    console.log(`\n${method} ${url}`);

    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (body) {
      options.body = JSON.stringify(body);
      console.log(`Body: ${JSON.stringify(body, null, 2)}`);
    }

    const res = await fetch(url, options);
    const text = await res.text();

    console.log(`Status: ${res.status}`);
    console.log(`Response length: ${text.length}`);

    if (text.length < 500) {
      console.log(`Response: ${text}`);
    } else {
      try {
        const json = JSON.parse(text);
        console.log(`Response (parsed JSON):`, JSON.stringify(json, null, 2).substring(0, 500));
      } catch (e) {
        console.log(`Response (first 500 chars): ${text.substring(0, 500)}`);
      }
    }

    return res.status;
  } catch (error) {
    console.error(`ERROR:`, error.message);
    return null;
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('Phase 4 Debug - Endpoint Check');
  console.log('='.repeat(80));

  // Test 1: Universe count
  await testEndpoint('GET', '/v1/regime-backtest/universe-count');

  // Test 2: Summary
  await testEndpoint('GET', '/v1/regime-backtest/summary');

  // Test 3: POST /run with minimal data
  await testEndpoint('POST', '/v1/regime-backtest/run', {
    strategyIds: ['S1_VPA_BASE_BREAKOUT'],
    universeLimit: 3
  });

  // Test 4: Ledger
  await testEndpoint('GET', '/v1/regime-backtest/ledger?limit=1');

  // Test 5: Check if the scan-multi endpoint exists
  await testEndpoint('POST', '/technical-strategies/scan-multi', {
    strategyIds: ['S1_VPA_BASE_BREAKOUT'],
    symbols: ['RELIANCE']
  });

  console.log('\n' + '='.repeat(80));
}

main().catch(console.error);
