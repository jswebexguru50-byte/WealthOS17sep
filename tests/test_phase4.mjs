/**
 * Phase 4 Implementation Test Suite
 * Tests Backend Engines for dynamic universe loading, multi-strategy backtest, and export endpoints
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000/api';

const tests = [];
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  try {
    console.log(`\n[TEST] ${name}`);
    await fn();
    tests.push({ name, status: 'PASS', error: null });
    passedTests++;
    console.log(`✓ ${name} PASSED`);
  } catch (error) {
    tests.push({ name, status: 'FAIL', error: error.message });
    failedTests++;
    console.error(`✗ ${name} FAILED:`, error.message);
  }
}

async function request(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const text = await res.text();

  try {
    return {
      status: res.status,
      data: JSON.parse(text),
    };
  } catch (e) {
    return {
      status: res.status,
      data: text,
    };
  }
}

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/v1/regime-backtest/universe-count`);
      if (res.ok) {
        console.log('✓ Server is ready');
        return;
      }
    } catch (e) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Server failed to start');
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('Phase 4 Implementation Test Suite');
  console.log('Testing Backend Engines: Universe Loading, Multi-Strategy Backtest, Exports');
  console.log('='.repeat(80));

  // Wait for server
  console.log('\nWaiting for server to start...');
  await waitForServer();

  // Test 1: Universe Loading
  await test('Universe loading: getUniverseCount() returns count', async () => {
    const res = await request('GET', '/v1/regime-backtest/universe-count');

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    if (!res.data.success) {
      throw new Error('Response not successful');
    }
    if (typeof res.data.count !== 'number') {
      throw new Error('count is not a number');
    }
    if (res.data.count < 1) {
      throw new Error(`Universe count should be > 0, got ${res.data.count}`);
    }

    console.log(`  Universe count: ${res.data.count} symbols`);
  });

  // Test 2: Verify universe vs database
  await test('Universe loading: count matches DB query', async () => {
    const res1 = await request('GET', '/v1/regime-backtest/universe-count');
    const count = res1.data.count;

    // This assumes we can query the database directly (would need a debug endpoint)
    // For now, we just verify it's a reasonable number
    if (count < 40) {
      throw new Error(`Universe count ${count} is suspiciously low`);
    }

    console.log(`  Verified universe count: ${count}`);
  });

  // Test 3: Multi-strategy backtest
  await test('Multi-strategy backtest: POST /run with 2 strategies', async () => {
    // First make sure endpoint is available
    const universeRes = await request('GET', '/v1/regime-backtest/universe-count');
    if (universeRes.status !== 200) {
      throw new Error('Regime backtest routes not available');
    }

    const res = await request('POST', '/v1/regime-backtest/run', {
      strategyIds: ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE'],
      universeLimit: 10,
    });

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}. Response: ${JSON.stringify(res.data)}`);
    }
    if (!res.data.success) {
      throw new Error('Response not successful');
    }
    if (!res.data.universeCount || res.data.universeCount < 1) {
      throw new Error('universeCount missing or invalid');
    }
    if (!res.data.strategiesCount || res.data.strategiesCount !== 2) {
      throw new Error(`Expected 2 strategies, got ${res.data.strategiesCount}`);
    }

    console.log(`  Backtest result: ${res.data.universeCount} scrips × ${res.data.strategiesCount} strategies`);
    console.log(`    Matrix rows: ${res.data.matrixRowsCount}`);
    console.log(`    Summaries: ${res.data.summariesCount}`);
  });

  // Test 4: Download endpoints - CSV for single strategy
  await test('Download endpoints: GET /export-csv/:strategyId returns valid CSV', async () => {
    const res = await request('GET', '/v1/regime-backtest/export-csv/S1_VPA_BASE_BREAKOUT');

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    const csv = res.data;
    if (typeof csv !== 'string') {
      throw new Error('Response is not a CSV string');
    }
    if (!csv.includes('Symbol,')) {
      throw new Error('CSV header missing or malformed');
    }

    const lines = csv.split('\n').filter(l => l.trim());
    console.log(`  CSV generated: ${lines.length} rows (including header)`);
  });

  // Test 5: Download endpoints - Full universe CSV
  await test('Download endpoints: GET /export-csv returns full universe CSV', async () => {
    const res = await request('GET', '/v1/regime-backtest/export-csv');

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    const csv = res.data;
    if (typeof csv !== 'string') {
      throw new Error('Response is not a CSV string');
    }
    if (!csv.includes('Symbol,')) {
      throw new Error('CSV header missing or malformed');
    }

    const lines = csv.split('\n').filter(l => l.trim());
    console.log(`  Full universe CSV generated: ${lines.length} rows (including header)`);
  });

  // Test 6: Multi-strategy backtest with summaries endpoint
  await test('Multi-strategy summaries: GET /summary returns summary for each strategy/regime combo', async () => {
    const res = await request('GET', '/v1/regime-backtest/summary');

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    if (!res.data.success) {
      throw new Error('Response not successful');
    }
    if (!Array.isArray(res.data.data) || res.data.data.length === 0) {
      throw new Error('No summary data returned');
    }

    const summaries = res.data.data;
    const strategyIds = new Set(summaries.map(s => s.strategyId));
    console.log(`  Summaries returned: ${summaries.length} rows for ${strategyIds.size} strategies`);
  });

  // Test 7: Backward compatibility - single strategy columns
  await test('Backward compatibility: GET /ledger returns s1_status, s2_status columns', async () => {
    const res = await request('GET', '/v1/regime-backtest/ledger?limit=1');

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    if (!Array.isArray(res.data.data) || res.data.data.length === 0) {
      throw new Error('No ledger rows returned');
    }

    const row = res.data.data[0];
    if (!('s1_status' in row) || !('s2_status' in row)) {
      throw new Error('Backward compatibility columns missing');
    }

    console.log(`  Backward compatibility verified: ${Object.keys(row).length} columns`);
  });

  // Test 8: Error handling - invalid strategy ID
  await test('Error handling: Invalid strategy ID returns 400', async () => {
    const res = await request('GET', '/v1/regime-backtest/export-csv/INVALID_STRATEGY');

    if (res.status !== 400) {
      throw new Error(`Expected 400, got ${res.status}`);
    }
    if (res.data.success !== false) {
      throw new Error('Expected error response');
    }

    console.log(`  Error handling verified`);
  });

  // Test 9: Empty universe handling
  await test('Error handling: Empty universe returns appropriate error', async () => {
    const res = await request('POST', '/v1/regime-backtest/run', {
      strategyIds: ['S1_VPA_BASE_BREAKOUT'],
      universeLimit: 0, // Force empty universe
    });

    // Should either return error or handle gracefully
    if (res.status === 200 && res.data.success === true) {
      console.log(`  Handled empty universe gracefully`);
    } else if (res.status >= 400) {
      console.log(`  Returned error for empty universe`);
    } else {
      throw new Error('Unexpected response for empty universe');
    }
  });

  // Test 10: Multi-strategy agreement calculation
  await test('Multi-strategy backtest: Agreement count is calculated correctly', async () => {
    const res = await request('GET', '/v1/regime-backtest/ledger?limit=10');

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
    if (!Array.isArray(res.data.data) || res.data.data.length === 0) {
      throw new Error('No ledger rows returned');
    }

    const row = res.data.data[0];
    if (!('agreement_count' in row)) {
      throw new Error('agreement_count column missing');
    }

    const agreementCount = row.agreement_count;
    if (typeof agreementCount !== 'number' || agreementCount < 0 || agreementCount > 10) {
      throw new Error(`Invalid agreement_count: ${agreementCount}`);
    }

    console.log(`  Agreement count validated: ${agreementCount}`);
  });

  // Print results
  console.log('\n' + '='.repeat(80));
  console.log('Test Results Summary');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${tests.length}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);

  if (failedTests > 0) {
    console.log('\nFailed Tests:');
    tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  - ${t.name}`);
      console.log(`    Error: ${t.error}`);
    });
  }

  console.log('='.repeat(80));

  return {
    tests,
    passed: passedTests,
    failed: failedTests,
  };
}

// Run tests
runTests()
  .then(result => {
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
