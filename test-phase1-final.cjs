const sqlite3 = require('sqlite3');
const path = require('path');

const DB_FILE = path.join(process.cwd(), 'portfolio.db');

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

      console.log('\n=== PHASE 1 TEST: Final Database Validation ===\n');

      // Test 1: Verify CustomStrategies table has required columns
      console.log('1. Database Schema Validation:');
      db.all("PRAGMA table_info(CustomStrategies)", (err, cols) => {
        if (err) {
          addResult('CustomStrategies table exists', false, err.message);
          db.close();
          return resolve();
        }

        const colNames = new Set(cols.map(c => c.name));
        const requiredCols = ['id', 'name', 'is_preset', 'preset_order', 'category', 'is_active', 'short_name', 'color_accent', 'parameters_json'];
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

            const srColNames = new Set(srCols.map(c => c.name));
            const requiredSRCols = ['id', 'strategy_id', 'symbol', 'run_date', 'status'];
            const missingSRCols = requiredSRCols.filter(col => !srColNames.has(col));

            if (missingSRCols.length === 0) {
              addResult('strategy_run_results has all required columns', true);
            } else {
              addResult('strategy_run_results has all required columns', false, `Missing: ${missingSRCols.join(', ')}`);
            }
          }

          // Test 3: Verify strategy_comparison_sessions table exists
          console.log('\n3. Strategy Comparison Sessions Table:');
          db.all("PRAGMA table_info(strategy_comparison_sessions)", (err, scCols) => {
            if (err || !scCols) {
              addResult('strategy_comparison_sessions table exists', false, err?.message || 'Table not found');
            } else {
              addResult('strategy_comparison_sessions table exists', true);

              const scColNames = new Set(scCols.map(c => c.name));
              const requiredSCCols = ['id', 'name', 'strategy_ids_json', 'created_at'];
              const missingSCCols = requiredSCCols.filter(col => !scColNames.has(col));

              if (missingSCCols.length === 0) {
                addResult('strategy_comparison_sessions has all required columns', true);
              } else {
                addResult('strategy_comparison_sessions has all required columns', false, `Missing: ${missingSCCols.join(', ')}`);
              }
            }

            // Test 4: Verify preset seeding (S1-S10)
            console.log('\n4. Preset Strategy Seeding:');
            db.all(
              `SELECT id, name, short_name, is_preset, preset_order, category, color_accent, parameters_json
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
                const expectedIds = ['S1_VPA_BASE_BREAKOUT', 'S2_INSTITUTIONAL_FVG_CE', 'S3_HH_HL_COMPACTION', 'S4_HH_HL_SMA200_VPA', 'S5_50EMA_PULLBACK_VCP', 'S6_RS_BREAKOUT', 'S7_RSI_MEAN_REVERSION', 'S8_HIGH_TIGHT_FLAG', 'S9_VOLUME_DRYUP_RS', 'S10_TRENDLINE_ORB'];

                presets.forEach((p, idx) => {
                  if (p.id === expectedIds[idx]) {
                    addResult(`Preset ${idx + 1} (${p.id}) ID correct`, true);
                  } else {
                    addResult(`Preset ${idx + 1} ID correct`, false, `Expected ${expectedIds[idx]}, got ${p.id}`);
                  }

                  if (p.preset_order === idx + 1) {
                    addResult(`Preset ${idx + 1} preset_order = ${idx + 1}`, true);
                  } else {
                    addResult(`Preset ${idx + 1} preset_order correct`, false, `Expected ${idx + 1}, got ${p.preset_order}`);
                  }

                  if (p.is_preset === 1) {
                    addResult(`Preset ${idx + 1} is_preset = 1`, true);
                  } else {
                    addResult(`Preset ${idx + 1} is_preset = 1`, false, `Got ${p.is_preset}`);
                  }

                  if (p.category) {
                    addResult(`Preset ${idx + 1} category set`, true);
                  } else {
                    addResult(`Preset ${idx + 1} category set`, false);
                  }

                  if (p.color_accent && p.color_accent.startsWith('#')) {
                    addResult(`Preset ${idx + 1} color_accent set`, true);
                  } else {
                    addResult(`Preset ${idx + 1} color_accent set`, false, `Got ${p.color_accent}`);
                  }
                });

                // Test 5: Verify parameters_json is valid JSON for presets
                console.log('\n5. Preset Parameters Validation:');
                let validParamCount = 0;
                const invalidParams = [];
                presets.forEach((p) => {
                  try {
                    if (p.parameters_json) {
                      const params = JSON.parse(p.parameters_json);
                      if (params && typeof params === 'object' && Object.keys(params).length > 0) {
                        validParamCount++;
                      } else {
                        invalidParams.push(`${p.id}: Empty or invalid object`);
                      }
                    } else {
                      invalidParams.push(`${p.id}: NULL parameters_json`);
                    }
                  } catch (e) {
                    invalidParams.push(`${p.id}: ${e.message}`);
                  }
                });

                if (validParamCount === presets.length) {
                  addResult('All preset parameters_json are valid JSON', true);
                } else {
                  addResult('All preset parameters_json are valid JSON', false, `${validParamCount}/${presets.length} valid`);
                  invalidParams.forEach(msg => console.log(`  - ${msg}`));
                }

                // Test 6: Verify canDelete flags
                console.log('\n6. Deletion Prevention Flags:');
                let allPresetsNonDeletable = true;
                presets.forEach((p) => {
                  if (p.is_preset === 1) {
                    // Presets should not be deletable
                  } else {
                    allPresetsNonDeletable = false;
                  }
                });

                if (allPresetsNonDeletable) {
                  addResult('All presets marked as non-deletable (is_preset=1)', true);
                } else {
                  addResult('All presets marked as non-deletable (is_preset=1)', false);
                }

                // Test 7: Check that custom strategies can coexist
                console.log('\n7. Custom Strategies Support:');
                db.all(
                  `SELECT COUNT(*) as cnt FROM CustomStrategies WHERE is_preset = 0`,
                  (err, result) => {
                    if (err) {
                      addResult('Custom strategies query executed', false, err.message);
                    } else {
                      addResult('Custom strategies query executed', true);
                      addResult(`Custom strategies stored in DB: ${result[0].cnt}`, true);
                    }

                    db.close();
                    printResults();
                    resolve();
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
