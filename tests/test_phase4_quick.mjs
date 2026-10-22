/**
 * Phase 4 Quick Test Suite - Focused endpoint tests
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api';
const tests = [];
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  try {
    console.log(`[TEST] ${name}`);
    await fn();
    tests.push({ name, status: 'PASS', error: null });
    passedTests++;
    console.log(`✓ ${name} PASSED\n`);
  } catch (error) {
    tests.push({ name, status: 'FAIL', error: error.message });
    failedTests++;
    console.error(`✗ ${name} FAILED: ${error.message}\n`);
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
        console.log('✓ Server is ready\n');
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
  console.log('Phase 4 Implementation Test Suite - QUICK');
  console.log('Testing Backend Engines: Universe Loading, Multi-Strategy Backtest, Exports');
  console.log('='.repeat(80) + '\n');

  // Wait for server
  console.log('Waiting for server to start...');
  await waitForServer();

  // Test 1: Universe loading
  await test('1. Universe loading: getUniverseCount()', async () => {
    const res = await request('GET', '/v1/regime-backtest/universe-count');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!res.data.success) throw new Error('Response not successful');
    if (typeof res.data.count !== 'number' || res.data.count < 1) {
      throw new Error(`Universe count invalid: ${res.data.count}`);
    }
    console.log(`  - Universe count: ${res.data.count} symbols`);
  });

  // Test 2: Multi-strategy backtest
  await test('2. Multi-strategy backtest: POST /v1/regime-backtest/run', async () => {
    const res = await request('POST', '/v1/regime-backtest/run', {
      strategyIds: ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE'],
      universeLimit: 10,
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}. Response: ${JSON.stringify(res.data)}`);
    if (!res.data.success) throw new Error('Response not successful');
    if (!res.data.universeCount || res.data.universeCount < 1) throw new Error('universeCount invalid');
    if (!res.data.strategiesCount || res.data.strategiesCount !== 2) {
      throw new Error(`Expected 2 strategies, got ${res.data.strategiesCount}`);
    }

    console.log(`  - Backtest: ${res.data.universeCount} scrips × ${res.data.strategiesCount} strategies`);
    console.log(`  - Matrix rows: ${res.data.matrixRowsCount}`);
    console.log(`  - Summaries: ${res.data.summariesCount}`);
  });

  // Test 3: CSV export for single strategy
  await test('3. CSV export: GET /v1/regime-backtest/export-csv/:strategyId', async () => {
    const res = await request('GET', '/v1/regime-backtest/export-csv/S1_VPA_BASE_BREAKOUT');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (typeof res.data !== 'string') throw new Error('Response is not CSV');
    if (!res.data.includes('Symbol,')) throw new Error('CSV header missing');

    const lines = res.data.split('\n').filter(l => l.trim());
    console.log(`  - CSV rows: ${lines.length} (including header)`);
  });

  // Test 4: Full universe CSV export
  await test('4. Full universe CSV: GET /v1/regime-backtest/export-csv', async () => {
    const res = await request('GET', '/v1/regime-backtest/export-csv');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (typeof res.data !== 'string') throw new Error('Response is not CSV');
    if (!res.data.includes('Symbol,')) throw new Error('CSV header missing');

    const lines = res.data.split('\n').filter(l => l.trim());
    console.log(`  - Full universe CSV rows: ${lines.length} (including header)`);
  });

  // Test 5: Backward compatibility - s1_status, s2_status columns
  await test('5. Backward compatibility: GET /v1/regime-backtest/ledger returns s1_status, s2_status', async () => {
    const res = await request('GET', '/v1/regime-backtest/ledger?limit=1');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!Array.isArray(res.data.data) || res.data.data.length === 0) {
      throw new Error('No ledger rows');
    }

    const row = res.data.data[0];
    if (!('s1_status' in row) || !('s2_status' in row)) {
      throw new Error('Backward compatibility columns missing');
    }

    console.log(`  - Backward compatibility verified: ${Object.keys(row).length} columns`);
    console.log(`  - s1_status: ${row.s1_status}, s2_status: ${row.s2_status}`);
  });

  // Test 6: Summary endpoint
  await test('6. Summaries: GET /v1/regime-backtest/summary', async () => {
    const res = await request('GET', '/v1/regime-backtest/summary');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!Array.isArray(res.data.data)) throw new Error('No summary data');

    const strategies = new Set(res.data.data.map(s => s.strategyId));
    const regimes = new Set(res.data.data.map(s => s.regime));
    console.log(`  - Summaries: ${res.data.data.length} rows`);
    console.log(`  - Strategies: ${strategies.size}, Regimes: ${regimes.size}`);
  });

  // Test 7: Error handling - invalid strategy
  await test('7. Error handling: Invalid strategy ID returns 400', async () => {
    const res = await request('GET', '/v1/regime-backtest/export-csv/INVALID_STRATEGY');
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    console.log(`  - Error handling verified`);
  });

  // Test 8: Agreement count populated
  await test('8. Multi-strategy agreement: Agreement count calculated', async () => {
    const res = await request('GET', '/v1/regime-backtest/ledger?limit=10');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!Array.isArray(res.data.data) || res.data.data.length === 0) {
      throw new Error('No ledger rows');
    }

    const row = res.data.data[0];
    if (!('agreement_count' in row)) throw new Error('agreement_count missing');

    const count = row.agreement_count;
    if (typeof count !== 'number' || count < 0) throw new Error(`Invalid agreement_count: ${count}`);

    console.log(`  - Agreement count validated: ${count}`);
  });

  // Print results
  console.log('='.repeat(80));
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
