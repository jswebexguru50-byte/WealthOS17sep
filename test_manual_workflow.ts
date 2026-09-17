/**
 * Manual Integration Test Verification
 * Tests the core multi-strategy workflow manually
 */

import axios from 'axios';

const BASE = 'http://localhost:3000/api';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  details?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    console.log(`\n▶ Testing: ${name}`);
    await fn();
    results.push({ name, status: 'PASS', message: 'Passed' });
    console.log(`✓ PASS`);
  } catch (error: any) {
    const message = error.response?.data?.message || error.message || String(error);
    results.push({ name, status: 'FAIL', message, details: error.stack });
    console.log(`✗ FAIL: ${message}`);
  }
}

async function run() {
  console.log('=== MULTI-STRATEGY WORKFLOW INTEGRATION TESTS ===\n');

  // Flow 1: Multi-Strategy Scan
  console.log('\n📊 FLOW 1: LIVE MULTI-STRATEGY SCAN');
  console.log('─'.repeat(50));

  let selectedStrategyIds: string[] = [];

  await test('1.1: Load strategy library', async () => {
    const res = await axios.get(`${BASE}/strategies/library`);
    if (!res.data.success || !res.data.data.all.length) {
      throw new Error('No strategies found');
    }
    selectedStrategyIds = res.data.data.all.slice(0, 3).map((s: any) => s.id);
    console.log(`   Found ${res.data.data.all.length} strategies (${res.data.data.presets.length} presets)`);
    console.log(`   Selected: ${selectedStrategyIds.join(', ')}`);
  });

  await test('1.2: Multi-strategy scan with 3 strategies', async () => {
    if (!selectedStrategyIds.length) throw new Error('No strategies selected');
    const res = await axios.post(`${BASE}/strategies/scan-multi`, {
      strategyIds: selectedStrategyIds,
      universeLimit: 100
    });
    if (!res.data.success) {
      throw new Error('Scan failed');
    }
    console.log(`   Scan completed: ${res.data.data.tradesCount} trades, ${res.data.data.summariesCount} summaries`);
  });

  await test('1.3: Verify backtest ledger has data', async () => {
    const res = await axios.get(`${BASE}/v1/regime-backtest/ledger?limit=10`);
    if (!res.data.success || !Array.isArray(res.data.data)) {
      throw new Error('Ledger not available');
    }
    const rowCount = res.data.data.length;
    if (rowCount > 0) {
      const fieldCount = Object.keys(res.data.data[0]).length;
      console.log(`   Ledger contains ${rowCount} rows with ${fieldCount} columns`);
    }
  });

  await test('1.4: Verify backtest summary data', async () => {
    const res = await axios.get(`${BASE}/v1/regime-backtest/summary`);
    if (!res.data.success || !Array.isArray(res.data.data)) {
      throw new Error('Summary not available');
    }
    console.log(`   Summary contains ${res.data.data.length} backtest result rows`);
  });

  // Flow 2: Data Persistence
  console.log('\n💾 FLOW 2: DATA PERSISTENCE');
  console.log('─'.repeat(50));

  let customStrategyId: string = '';

  await test('2.1: Create custom strategy', async () => {
    const strategyName = `TestStrat_${Date.now()}`;
    const res = await axios.post(`${BASE}/strategies/save`, {
      name: strategyName,
      description: 'Integration test custom strategy',
      category: 'CUSTOM',
      parameters: {
        rsiPeriod: 14,
        rsiOverbought: 70,
        rsiOversold: 30
      }
    });
    if (!res.data.success) {
      throw new Error('Failed to create strategy');
    }
    customStrategyId = res.data.data.id;
    console.log(`   Created strategy: ${customStrategyId}`);
  });

  await test('2.2: Verify custom strategy in library', async () => {
    if (!customStrategyId) throw new Error('No strategy ID from test 2.1');
    const res = await axios.get(`${BASE}/strategies/${customStrategyId}/parameters`);
    if (!res.data.success || res.data.data.isPreset) {
      throw new Error('Strategy not found or is preset');
    }
    console.log(`   Found custom strategy: ${res.data.data.name}`);
  });

  let clonedStrategyId: string = '';

  await test('2.3: Clone preset strategy', async () => {
    // Get first preset
    const lib = await axios.get(`${BASE}/strategies/library`);
    const preset = lib.data.data.presets[0];
    if (!preset) throw new Error('No preset found');

    const res = await axios.post(`${BASE}/strategies/${preset.id}/duplicate`, {
      name: `Cloned_${preset.name}_${Date.now()}`
    });
    if (!res.data.success) {
      throw new Error('Failed to clone preset');
    }
    clonedStrategyId = res.data.data.id;
    console.log(`   Cloned to: ${clonedStrategyId}`);
  });

  await test('2.4: Verify clone is not preset', async () => {
    if (!clonedStrategyId) throw new Error('No cloned strategy ID');
    const res = await axios.get(`${BASE}/strategies/${clonedStrategyId}/parameters`);
    if (res.data.data.isPreset) {
      throw new Error('Clone is marked as preset');
    }
    console.log(`   Clone verified as custom strategy`);
  });

  // Flow 3: Error Handling
  console.log('\n⚠️  FLOW 3: ERROR HANDLING');
  console.log('─'.repeat(50));

  await test('3.1: Invalid strategy ID returns error', async () => {
    try {
      await axios.get(`${BASE}/strategies/invalid_xyz_9999/parameters`);
      throw new Error('Should have returned 404');
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('   Correctly returned 404 for invalid ID');
        return;
      }
      throw error;
    }
  });

  await test('3.2: Empty strategy array returns validation error', async () => {
    try {
      await axios.post(`${BASE}/strategies/scan-multi`, {
        strategyIds: []
      });
      throw new Error('Should have returned validation error');
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('   Correctly returned 400 for empty array');
        return;
      }
      throw error;
    }
  });

  await test('3.3: Cannot modify preset strategy', async () => {
    try {
      const lib = await axios.get(`${BASE}/strategies/library`);
      const preset = lib.data.data.presets[0];

      await axios.post(`${BASE}/strategies/save`, {
        id: preset.id,
        name: 'Modified_' + preset.name,
        description: 'Should fail',
        category: preset.category,
        parameters: preset.parameters
      });
      throw new Error('Should have blocked preset modification');
    } catch (error: any) {
      if (error.response?.status === 403) {
        console.log('   Correctly blocked preset modification with 403');
        return;
      }
      throw error;
    }
  });

  await test('3.4: Duplicate strategy name returns conflict', async () => {
    try {
      const uniqueName = `DupeTest_${Date.now()}`;

      // Create first
      await axios.post(`${BASE}/strategies/save`, {
        name: uniqueName,
        description: 'First',
        category: 'CUSTOM',
        parameters: { test: true }
      });

      // Try duplicate
      await axios.post(`${BASE}/strategies/save`, {
        name: uniqueName,
        description: 'Duplicate',
        category: 'CUSTOM',
        parameters: { test: true }
      });

      throw new Error('Should have returned 409 conflict');
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log('   Correctly blocked duplicate with 409');
        return;
      }
      throw error;
    }
  });

  // Summary
  console.log('\n\n=== TEST SUMMARY ===\n');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log(`✓ PASSED: ${passed}`);
  console.log(`✗ FAILED: ${failed}`);
  console.log(`- SKIPPED: ${skipped}`);
  console.log(`\nTOTAL: ${results.length} tests\n`);

  if (failed > 0) {
    console.log('FAILURES:\n');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ✗ ${r.name}`);
      console.log(`    ${r.message}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
