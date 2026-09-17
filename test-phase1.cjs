const sqlite3 = require('sqlite3');
const path = require('path');
const assert = require('assert');

const DB_FILE = path.join(process.cwd(), 'portfolio.db');

// Test Results
const results = [];

function addResult(testName, passed, errorMsg = '') {
  results.push({
    name: testName,
    passed,
    error: errorMsg
  });
  console.log(`${passed ? '✓' : '✗'} ${testName}${errorMsg ? ': ' + errorMsg : ''}`);
}

function runTests() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_FILE, (err) => {
      if (err) {
        console.error('Failed to connect to database:', err);
        return reject(err);
      }

      console.log('\n=== PHASE 1 TEST: Data Layer Implementation ===\n');

      // Test 1: Verify CustomStrategies table has required columns
      console.log('1. Database Schema Validation:');
      db.all("PRAGMA table_info(CustomStrategies)", (err, cols) => {
        if (err) {
          addResult('CustomStrategies table exists', false, err.message);
          db.close();
          return resolve();
        }

        const colNames = new Set(cols.map(c => c.name));
        const requiredCols = ['is_preset', 'preset_order', 'category', 'is_active', 'short_name', 'color_accent'];
        const missingCols = requiredCols.filter(col => !colNames.has(col));

        if (missingCols.length === 0) {
          addResult('CustomStrategies has all required columns', true);
        } else {
          addResult('CustomStrategies has all required columns', false, `Missing: ${missingCols.join(', ')}`);
        }

        // Test 2: Verify strategy_run_results table exists
        console.log('\n2. Strategy Run Results Table:');
        db.all("PRAGMA table_info(strategy_run_results)", (err, srCols) => {
          if (err || !srCols) {
            addResult('strategy_run_results table exists', false, err?.message || 'Table not found');
          } else {
            addResult('strategy_run_results table exists', true);
          }

          // Test 3: Verify strategy_comparison_sessions table exists
          console.log('\n3. Strategy Comparison Sessions Table:');
          db.all("PRAGMA table_info(strategy_comparison_sessions)", (err, scCols) => {
            if (err || !scCols) {
              addResult('strategy_comparison_sessions table exists', false, err?.message || 'Table not found');
            } else {
              addResult('strategy_comparison_sessions table exists', true);
            }

            // Test 4: Verify preset seeding (S1-S10)
            console.log('\n4. Preset Strategy Seeding:');
            db.all(
              `SELECT id, name, short_name, is_preset, preset_order, category, color_accent
               FROM CustomStrategies
               WHERE is_preset = 1
               ORDER BY preset_order ASC`,
              (err, presets) => {
                if (err) {
                  addResult('Presets query executed', false, err.message);
                  db.close();
                  printResults();
                  return resolve();
                }

                addResult('Presets query executed', true);

                // Check count
                if (presets.length === 10) {
                  addResult('All 10 built-in presets seeded', true);
                } else {
                  addResult('All 10 built-in presets seeded', false, `Found ${presets.length} presets instead of 10`);
                }

                // Verify preset details
                const strategyIds = ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA', 'S5_50EMA_PULLBACK_VCP', 'S6_RS_BREAKOUT', 'S7_RSI_MEAN_REVERSION', 'S8_HIGH_TIGHT_FLAG', 'S9_VOLUME_DRYUP_RS', 'S10_TRENDLINE_ORB'];

                presets.forEach((p, idx) => {
                  if (p.id === strategyIds[idx]) {
                    addResult(`Preset S${idx + 1} ID correct`, true);
                  } else {
                    addResult(`Preset S${idx + 1} ID correct`, false, `Expected ${strategyIds[idx]}, got ${p.id}`);
                  }

                  if (p.preset_order === idx + 1) {
                    addResult(`Preset S${idx + 1} preset_order correct`, true);
                  } else {
                    addResult(`Preset S${idx + 1} preset_order correct`, false, `Expected ${idx + 1}, got ${p.preset_order}`);
                  }

                  if (p.is_preset === 1) {
                    addResult(`Preset S${idx + 1} is_preset = 1`, true);
                  } else {
                    addResult(`Preset S${idx + 1} is_preset = 1`, false, `Got ${p.is_preset}`);
                  }

                  if (p.color_accent && p.color_accent.startsWith('#')) {
                    addResult(`Preset S${idx + 1} color_accent set`, true);
                  } else {
                    addResult(`Preset S${idx + 1} color_accent set`, false, `Got ${p.color_accent}`);
                  }
                });

                // Test 5: Verify parameters_json is valid JSON for presets
                console.log('\n5. Preset Parameters Validation:');
                let validParamCount = 0;
                presets.forEach((p) => {
                  try {
                    const params = JSON.parse(p.parameters_json);
                    if (params && typeof params === 'object') {
                      validParamCount++;
                    }
                  } catch (e) {
                    // Invalid JSON
                  }
                });

                if (validParamCount === presets.length) {
                  addResult('All preset parameters_json are valid JSON', true);
                } else {
                  addResult('All preset parameters_json are valid JSON', false, `${validParamCount}/${presets.length} valid`);
                }

                // Test 6: Test API endpoints indirectly via database state
                console.log('\n6. API Endpoint Database Support:');

                // Check that custom strategies can be created (test the data structure)
                db.run(
                  `INSERT OR IGNORE INTO CustomStrategies
                   (id, name, description, category, parameters_json, base_template_id, is_preset, is_active, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  ['custom_test_001', 'Test Custom Strategy', 'Test desc', 'BREAKOUT', '{}', 'S1_VPA_BASE_BREAKOUT', 0, 1, new Date().toISOString(), new Date().toISOString()],
                  function(err) {
                    if (err) {
                      addResult('Can insert custom strategies', false, err.message);
                    } else {
                      addResult('Can insert custom strategies', true);

                      // Verify duplication works
                      db.get(
                        `SELECT * FROM CustomStrategies WHERE id = 'custom_test_001'`,
                        (err, row) => {
                          if (err || !row) {
                            addResult('Can retrieve custom strategies', false, err?.message || 'Not found');
                          } else {
                            addResult('Can retrieve custom strategies', true);
                          }

                          // Test deletion prevention for presets
                          db.get(
                            `SELECT is_preset FROM CustomStrategies WHERE id = 'S1_VPA_BASE_BREAKOUT'`,
                            (err, preset) => {
                              if (err) {
                                addResult('Can identify presets for deletion prevention', false, err.message);
                              } else if (preset.is_preset === 1) {
                                addResult('Can identify presets for deletion prevention', true);
                              } else {
                                addResult('Can identify presets for deletion prevention', false, 'is_preset not 1');
                              }

                              // Cleanup
                              db.run(`DELETE FROM CustomStrategies WHERE id = 'custom_test_001'`, () => {
                                db.close();
                                printResults();
                                resolve();
                              });
                            }
                          );
                        }
                      );
                    }
                  }
                );
              }
            );
          });
        });
      });
    });
  });
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
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
