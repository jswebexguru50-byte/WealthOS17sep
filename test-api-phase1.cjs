const http = require('http');

const BASE_URL = 'http://localhost:3000';
const results = [];

function addResult(testName, passed, errorMsg = '', details = '') {
  results.push({
    name: testName,
    passed,
    error: errorMsg,
    details
  });
  console.log(`${passed ? '✓' : '✗'} ${testName}${errorMsg ? ': ' + errorMsg : ''}`);
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data, error: e.message });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n=== PHASE 1 API TEST: Data Layer Implementation ===\n');

  try {
    // Test 1: GET /api/strategies/library
    console.log('1. GET /api/strategies/library');
    const libraryRes = await makeRequest('GET', '/api/strategies/library');

    if (libraryRes.status === 200 && libraryRes.data.success) {
      addResult('Endpoint returns 200 OK', true, '', `Total strategies: ${libraryRes.data.data.total}`);

      const { presets, custom, all } = libraryRes.data.data;

      if (presets && Array.isArray(presets)) {
        if (presets.length === 10) {
          addResult('All 10 presets returned', true, '', `Presets: ${presets.length}`);

          // Verify each preset has required fields
          let presetsValid = true;
          const requiredFields = ['id', 'name', 'short_name', 'category', 'is_preset', 'preset_order', 'color_accent', 'parameters'];

          presets.forEach((p, idx) => {
            const missing = requiredFields.filter(f => !(f in p));
            if (missing.length > 0) {
              presetsValid = false;
              addResult(`Preset S${idx + 1} has all required fields`, false, `Missing: ${missing.join(', ')}`);
            } else {
              addResult(`Preset S${idx + 1} has all required fields`, true);
            }
          });

          // Verify preset_order is sequential
          let orderCorrect = true;
          presets.forEach((p, idx) => {
            if (p.preset_order !== idx + 1) {
              orderCorrect = false;
              addResult(`Preset S${idx + 1} preset_order is correct`, false, `Expected ${idx + 1}, got ${p.preset_order}`);
            } else {
              addResult(`Preset S${idx + 1} preset_order is correct`, true);
            }
          });

          // Verify parameters are valid objects
          let paramsValid = true;
          presets.forEach((p, idx) => {
            if (!p.parameters || typeof p.parameters !== 'object' || Array.isArray(p.parameters)) {
              paramsValid = false;
              addResult(`Preset S${idx + 1} parameters is valid object`, false);
            } else {
              addResult(`Preset S${idx + 1} parameters is valid object`, true);
            }
          });

        } else {
          addResult('All 10 presets returned', false, `Found ${presets.length} presets`);
        }
      } else {
        addResult('Presets array returned', false, 'presets is not an array');
      }

      // Check custom strategies
      if (custom && Array.isArray(custom)) {
        addResult('Custom strategies array returned', true, '', `Custom: ${custom.length}`);
      } else {
        addResult('Custom strategies array returned', false, 'custom is not an array');
      }

    } else {
      addResult('Endpoint returns 200 OK', false, `Status: ${libraryRes.status}`);
    }

    // Test 2: GET /api/strategies/presets/catalog
    console.log('\n2. GET /api/strategies/presets/catalog');
    const catalogRes = await makeRequest('GET', '/api/strategies/presets/catalog');

    if (catalogRes.status === 200 && catalogRes.data.success) {
      addResult('Catalog endpoint returns 200 OK', true, '', `Strategies: ${catalogRes.data.data.length}`);

      if (Array.isArray(catalogRes.data.data) && catalogRes.data.data.length === 10) {
        addResult('Catalog returns all 10 strategy definitions', true);
      } else {
        addResult('Catalog returns all 10 strategy definitions', false, `Found ${catalogRes.data.data?.length || 0}`);
      }
    } else {
      addResult('Catalog endpoint returns 200 OK', false, `Status: ${catalogRes.status}`);
    }

    // Test 3: POST /api/strategies/save (create custom strategy)
    console.log('\n3. POST /api/strategies/save');
    const saveRes = await makeRequest('POST', '/api/strategies/save', {
      name: 'Test Custom Strategy',
      description: 'Test description',
      category: 'BREAKOUT',
      parameters: { test: 'value' },
      baseTemplateId: 'S1_VPA_BASE_BREAKOUT'
    });

    if (saveRes.status === 200 && saveRes.data.success) {
      addResult('Create custom strategy returns 200 OK', true, '', `Created ID: ${saveRes.data.data.id}`);
      const customId = saveRes.data.data.id;

      // Test 4: GET /api/strategies/:id/parameters
      console.log('\n4. GET /api/strategies/:id/parameters');
      const paramRes = await makeRequest('GET', `/api/strategies/${customId}/parameters`);

      if (paramRes.status === 200 && paramRes.data.success) {
        addResult('Get parameters returns 200 OK', true);
        if (paramRes.data.data.parameters && typeof paramRes.data.data.parameters === 'object') {
          addResult('Parameters object is valid', true);
        } else {
          addResult('Parameters object is valid', false, 'Not a valid object');
        }
      } else {
        addResult('Get parameters returns 200 OK', false, `Status: ${paramRes.status}`);
      }

      // Test 5: POST /api/strategies/:id/duplicate
      console.log('\n5. POST /api/strategies/:id/duplicate');
      const dupRes = await makeRequest('POST', `/api/strategies/${customId}/duplicate`, {
        newName: 'Test Custom Strategy (Copy)'
      });

      if (dupRes.status === 200 && dupRes.data.success) {
        addResult('Duplicate strategy returns 200 OK', true, '', `New ID: ${dupRes.data.data.id}`);
        const duplicateId = dupRes.data.data.id;

        // Test 6: DELETE /api/strategies/:id (custom)
        console.log('\n6. DELETE /api/strategies/:id (custom)');
        const delRes = await makeRequest('DELETE', `/api/strategies/${duplicateId}`, null);

        if (delRes.status === 200 && delRes.data.success) {
          addResult('Delete custom strategy returns 200 OK', true);
        } else {
          addResult('Delete custom strategy returns 200 OK', false, `Status: ${delRes.status}`);
        }
      } else {
        addResult('Duplicate strategy returns 200 OK', false, `Status: ${dupRes.status}`);
      }

      // Test 7: DELETE /api/strategies/:id (preset - should fail)
      console.log('\n7. DELETE /api/strategies/:id (preset - should fail)');
      const delPresetRes = await makeRequest('DELETE', '/api/strategies/S1_VPA_BASE_BREAKOUT', null);

      if (delPresetRes.status === 403) {
        addResult('Delete preset returns 403 Forbidden', true);
        if (delPresetRes.data.success === false && delPresetRes.data.message.includes('cannot be deleted')) {
          addResult('Error message indicates presets cannot be deleted', true);
        } else {
          addResult('Error message indicates presets cannot be deleted', false, delPresetRes.data.message);
        }
      } else {
        addResult('Delete preset returns 403 Forbidden', false, `Status: ${delPresetRes.status}`);
      }

      // Test 8: Cleanup - delete the test custom strategy
      await makeRequest('DELETE', `/api/strategies/${customId}`, null);

    } else {
      addResult('Create custom strategy returns 200 OK', false, `Status: ${saveRes.status}`, saveRes.data.message);
    }

    // Test 9: POST /api/strategies/scan-strategy
    console.log('\n8. POST /api/strategies/scan-strategy');
    const scanRes = await makeRequest('POST', '/api/strategies/scan-strategy', {
      strategyId: 'S1_VPA_BASE_BREAKOUT',
      universeLimit: 10
    });

    if (scanRes.status === 200 && scanRes.data.success) {
      addResult('Single strategy scan returns 200 OK', true, '', `Trades: ${scanRes.data.data.tradesCount}`);
    } else {
      addResult('Single strategy scan returns 200 OK', false, `Status: ${scanRes.status}`, scanRes.data.message);
    }

    // Test 10: POST /api/strategies/scan-multi
    console.log('\n9. POST /api/strategies/scan-multi');
    const multiScanRes = await makeRequest('POST', '/api/strategies/scan-multi', {
      strategyIds: ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE'],
      universeLimit: 10
    });

    if (multiScanRes.status === 200 && multiScanRes.data.success) {
      addResult('Multi-strategy scan returns 200 OK', true, '', `Trades: ${multiScanRes.data.data.tradesCount}`);
    } else {
      addResult('Multi-strategy scan returns 200 OK', false, `Status: ${multiScanRes.status}`, multiScanRes.data.message);
    }

  } catch (err) {
    console.error('Test error:', err);
    addResult('Tests executed without errors', false, err.message);
  }

  printResults();
}

function printResults() {
  console.log('\n\n=== TEST SUMMARY ===\n');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${results.length}`);

  if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}${r.error ? ': ' + r.error : ''}`);
      if (r.details) console.log(`    Details: ${r.details}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Wait a bit for server to be ready, then run tests
setTimeout(() => {
  runTests().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
}, 2000);
