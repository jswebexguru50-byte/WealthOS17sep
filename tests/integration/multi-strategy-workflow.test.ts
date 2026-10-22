/**
 * Multi-Strategy Workflow Integration Tests
 *
 * Tests end-to-end workflows for:
 * 1. Live multi-strategy scan
 * 2. Multi-strategy backtest
 * 3. Data persistence (custom strategies)
 * 4. Error handling
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';
const DEFAULT_TIMEOUT = 60000;

// Helper to make API calls with timeout
async function apiCall<T>(
  method: 'GET' | 'POST',
  path: string,
  data?: any,
  timeout = DEFAULT_TIMEOUT
): Promise<T> {
  try {
    const config: any = { timeout };
    const fullUrl = `${API_BASE}${path}`;

    if (method === 'GET') {
      const response = await axios.get(fullUrl, config);
      return response.data;
    } else {
      const response = await axios.post(fullUrl, data, config);
      return response.data;
    }
  } catch (error: any) {
    if (error.response) {
      throw new Error(`API Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

describe('Multi-Strategy Workflow Integration Tests', () => {

  // ===== 1. LIVE MULTI-STRATEGY SCAN =====
  describe('Flow 1: Live Multi-Strategy Scan', () => {

    test('1.1: GET /strategies/library returns all available strategies', async () => {
      const response = await apiCall<any>('GET', '/strategies/library');

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data.all)).toBe(true);
      expect(response.data.all.length).toBeGreaterThan(0);

      // Verify structure
      const strategy = response.data.all[0];
      expect(strategy).toHaveProperty('id');
      expect(strategy).toHaveProperty('name');
      expect(strategy).toHaveProperty('is_preset');
      expect(strategy).toHaveProperty('parameters');

      console.log(`Found ${response.data.all.length} strategies (${response.data.presets.length} presets, ${response.data.custom.length} custom)`);
    }, DEFAULT_TIMEOUT);

    test('1.2: User selects 3 strategies from dropdown', async () => {
      const response = await apiCall<any>('GET', '/strategies/library');

      const strategies = response.data.all;
      expect(strategies.length).toBeGreaterThanOrEqual(3);

      const selected = strategies.slice(0, 3);
      const selectedIds = selected.map((s: any) => s.id);

      console.log(`Selected strategies: ${selectedIds.join(', ')}`);
      expect(selectedIds.length).toBe(3);
    });

    test('1.3: POST /strategies/scan-multi with 3 strategies completes', async () => {
      const strategies = await apiCall<any>('GET', '/strategies/library');
      const selectedIds = strategies.data.all.slice(0, 3).map((s: any) => s.id);

      const response = await apiCall<any>('POST', '/strategies/scan-multi', {
        strategyIds: selectedIds,
        universeLimit: 100 // Use subset for faster test
      }, 120000);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.strategyIds.length).toBe(3);
      expect(response.data.summariesCount).toBeGreaterThanOrEqual(0);

      console.log(`Multi-strategy scan completed: ${response.data.tradesCount} trades, ${response.data.summariesCount} summaries`);
    }, 130000);

    test('1.4: GET /v1/regime-backtest/ledger returns matrix rows', async () => {
      const response = await apiCall<any>('GET', '/v1/regime-backtest/ledger?limit=10');

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);

      if (response.data.length > 0) {
        const row = response.data[0];
        expect(row).toHaveProperty('symbol');

        // Log actual structure for debugging
        const fields = Object.keys(row);
        console.log(`Matrix row fields: ${fields.slice(0, 10).join(', ')}... (${fields.length} total)`);
      }
    }, DEFAULT_TIMEOUT);

    test('1.5: GET /v1/regime-backtest/summary returns backtest summaries', async () => {
      const response = await apiCall<any>('GET', '/v1/regime-backtest/summary');

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);

      if (response.data.length > 0) {
        const summary = response.data[0];
        // Log actual structure
        const fields = Object.keys(summary);
        console.log(`Summary row fields: ${fields.join(', ')}`);
      }
    }, DEFAULT_TIMEOUT);

    test('1.6: Data consistency check - ledger has rows', async () => {
      const ledger = await apiCall<any>('GET', '/v1/regime-backtest/ledger?limit=100');

      if (ledger.data.length > 0) {
        const symbols = new Set(ledger.data.map((l: any) => l.symbol));
        console.log(`Ledger contains ${symbols.size} unique symbols`);
        expect(symbols.size).toBeGreaterThan(0);
      }
    }, DEFAULT_TIMEOUT);
  });

  // ===== 2. MULTI-STRATEGY BACKTEST =====
  describe('Flow 2: Multi-Strategy Backtest', () => {

    test('2.1: POST /strategies/scan-multi with 5 strategies executes', async () => {
      const strategies = await apiCall<any>('GET', '/strategies/library');
      const selectedIds = strategies.data.all.slice(0, Math.min(5, strategies.data.all.length)).map((s: any) => s.id);

      const response = await apiCall<any>('POST', '/strategies/scan-multi', {
        strategyIds: selectedIds,
        universeLimit: 50
      }, 120000);

      expect(response.success).toBe(true);
      expect(response.data.strategyIds.length).toBeLessThanOrEqual(5);

      console.log(`5-strategy scan: ${response.data.tradesCount} trades, ${response.data.summariesCount} summaries`);
    }, 130000);

    test('2.2: GET /v1/regime-backtest/trades returns trade-level results', async () => {
      const response = await apiCall<any>('GET', '/v1/regime-backtest/trades');

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);

      if (response.data.length > 0) {
        const trade = response.data[0];
        console.log(`Trade record has fields: ${Object.keys(trade).join(', ')}`);
        console.log(`Found ${response.data.length} trades`);
      }
    }, DEFAULT_TIMEOUT);

    test('2.3: Download ledger as CSV', async () => {
      const response = await apiCall<any>('GET', '/v1/regime-backtest/ledger?limit=50');

      expect(response.data).toBeDefined();

      // Simulate CSV generation
      if (response.data.length > 0) {
        const headers = Object.keys(response.data[0]);
        const csvHeaders = headers.join(',');
        const csvRows = response.data.map((row: any) =>
          headers.map(h => row[h]).join(',')
        );

        const csv = [csvHeaders, ...csvRows].join('\n');
        expect(csv.length).toBeGreaterThan(0);

        console.log(`Generated CSV with ${csvRows.length} rows and ${headers.length} columns`);
      }
    }, DEFAULT_TIMEOUT);

    test('2.4: Verify ledger data is consistent', async () => {
      const ledger = await apiCall<any>('GET', '/v1/regime-backtest/ledger?limit=100');

      if (ledger.data.length >= 2) {
        const row1 = ledger.data[0];
        const row2 = ledger.data[1];

        // Both rows should have the same structure
        const fields1 = Object.keys(row1);
        const fields2 = Object.keys(row2);

        expect(fields1.length).toBe(fields2.length);
        console.log(`Data consistency: ${fields1.length} fields per row`);
      }
    }, DEFAULT_TIMEOUT);
  });

  // ===== 3. DATA PERSISTENCE =====
  describe('Flow 3: Data Persistence', () => {

    test('3.1: Save new custom strategy via POST /strategies/save', async () => {
      const newStrategy = {
        name: 'Test_Custom_Strategy_' + Date.now(),
        description: 'Integration test custom strategy',
        category: 'CUSTOM',
        parameters: {
          rsiPeriod: 14,
          rsiOverbought: 70,
          rsiOversold: 30,
          entryType: 'DIVERGENCE'
        }
      };

      const response = await apiCall<any>('POST', '/strategies/save', newStrategy);

      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty('id');

      const strategyId = response.data.id;
      console.log(`Created custom strategy: ${strategyId}`);

      // Store for later validation
      (global as any).testStrategyId = strategyId;
    }, DEFAULT_TIMEOUT);

    test('3.2: Verify custom strategy appears in library on next load', async () => {
      const strategyId = (global as any).testStrategyId;

      if (!strategyId) {
        console.log('Skipping - no strategy ID from test 3.1');
        return;
      }

      const response = await apiCall<any>('GET', `/strategies/${strategyId}/parameters`);

      expect(response.success).toBe(true);
      expect(response.data.id).toBe(strategyId);
      expect(response.data.isPreset).toBe(false);

      console.log(`Found custom strategy in library: ${response.data.name}`);
    }, DEFAULT_TIMEOUT);

    test('3.3: Clone preset strategy via POST /strategies/:id/duplicate', async () => {
      const strategies = await apiCall<any>('GET', '/strategies/library');
      const preset = strategies.data.presets[0];

      const cloneData = {
        name: 'Cloned_' + preset.name + '_' + Date.now()
      };

      const response = await apiCall<any>('POST', `/strategies/${preset.id}/duplicate`, cloneData);

      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty('id');
      expect(response.data.is_preset).toBe(0);

      console.log(`Cloned preset strategy: new ID ${response.data.id}`);
      (global as any).clonedStrategyId = response.data.id;
    }, DEFAULT_TIMEOUT);

    test('3.4: Verify clone has different ID but maintains structure', async () => {
      const clonedId = (global as any).clonedStrategyId;

      if (!clonedId) {
        console.log('Skipping - no cloned strategy ID from test 3.3');
        return;
      }

      const response = await apiCall<any>('GET', `/strategies/${clonedId}/parameters`);

      expect(response.success).toBe(true);
      expect(response.data.isPreset).toBe(false);
      expect(response.data.parameters).toBeDefined();

      console.log(`Clone verified: is_preset=${response.data.isPreset}, has parameters`);
    }, DEFAULT_TIMEOUT);
  });

  // ===== 4. ERROR HANDLING =====
  describe('Flow 4: Error Handling', () => {

    test('4.1: Empty strategyIds array returns validation error', async () => {
      try {
        await apiCall<any>('POST', '/strategies/scan-multi', {
          strategyIds: [],
          universeLimit: 0
        }, 60000);

        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Error');
        console.log('Empty strategy array returned validation error as expected');
      }
    }, DEFAULT_TIMEOUT);

    test('4.2: Invalid strategyId returns 404 error', async () => {
      try {
        await apiCall<any>('GET', `/strategies/invalid_strategy_id_xyz_9999/parameters`);

        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Error 404');
        console.log('Invalid strategy ID returned 404 as expected');
      }
    }, DEFAULT_TIMEOUT);

    test('4.3: Attempting to modify preset strategy returns 403', async () => {
      try {
        const strategies = await apiCall<any>('GET', '/strategies/library');
        const preset = strategies.data.presets[0];

        // Try to update a preset
        await apiCall<any>('POST', '/strategies/save', {
          id: preset.id,
          name: 'Modified_' + preset.name,
          description: 'This should fail',
          category: preset.category,
          parameters: preset.parameters
        });

        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Error');
        console.log('Preset modification blocked as expected');
      }
    }, DEFAULT_TIMEOUT);

    test('4.4: Missing required parameters returns validation error', async () => {
      try {
        await apiCall<any>('POST', '/strategies/scan-multi', {
          // Missing strategyIds
          universeLimit: 100
        }, 60000);

        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Error');
        console.log('Missing parameters returned error as expected');
      }
    }, DEFAULT_TIMEOUT);

    test('4.5: Duplicate strategy name returns 409 conflict', async () => {
      try {
        const newName = 'UniqueTest_' + Date.now();

        // Create first strategy
        const response1 = await apiCall<any>('POST', '/strategies/save', {
          name: newName,
          description: 'First strategy',
          category: 'CUSTOM',
          parameters: { test: true }
        });

        expect(response1.success).toBe(true);

        // Try to create duplicate
        await apiCall<any>('POST', '/strategies/save', {
          name: newName,
          description: 'Second strategy with same name',
          category: 'CUSTOM',
          parameters: { test: true }
        });

        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Error 409');
        console.log('Duplicate strategy name blocked as expected');
      }
    }, DEFAULT_TIMEOUT);
  });

  // ===== CLEANUP =====
  afterAll(async () => {
    // Delete test custom strategy if created
    const strategyId = (global as any).testStrategyId;
    if (strategyId) {
      try {
        await apiCall<any>('POST', '/strategies/delete', {
          strategyId
        });
        console.log(`Cleaned up test strategy: ${strategyId}`);
      } catch (error) {
        console.log(`Could not delete test strategy (may have been cleaned up): ${strategyId}`);
      }
    }
  });
});
