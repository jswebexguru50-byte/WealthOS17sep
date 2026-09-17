/**
 * Standalone Performance Test: Database Queries (Phase 1 & 4)
 *
 * Run with: node performance_test.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, 'test_perf.db');

// Clean up any previous test database
function cleanupTestDb() {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  if (fs.existsSync(`${TEST_DB_PATH}-wal`)) fs.unlinkSync(`${TEST_DB_PATH}-wal`);
  if (fs.existsSync(`${TEST_DB_PATH}-shm`)) fs.unlinkSync(`${TEST_DB_PATH}-shm`);
}

// Promise wrapper for db operations
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Initialize test database with minimal schema
async function initTestDb(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create MasterTickers table
      db.run(`
        CREATE TABLE IF NOT EXISTS MasterTickers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT UNIQUE NOT NULL,
          name TEXT,
          isin TEXT,
          exchange TEXT,
          sector TEXT,
          fmv_31_jan_2018 REAL
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          // Create HistoricalPrices table
          db.run(`
            CREATE TABLE IF NOT EXISTS HistoricalPrices (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              symbol TEXT NOT NULL,
              date TEXT NOT NULL,
              open_price REAL,
              close_price REAL,
              high_price REAL,
              low_price REAL,
              volume INTEGER,
              adjusted_close REAL,
              UNIQUE(symbol, date)
            )
          `, (err) => {
            if (err) {
              reject(err);
            } else {
              // Create CustomStrategies table
              db.run(`
                CREATE TABLE IF NOT EXISTS CustomStrategies (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL UNIQUE,
                  base_template_id TEXT NOT NULL,
                  description TEXT,
                  parameters_json TEXT NOT NULL,
                  is_active INTEGER DEFAULT 1,
                  is_preset INTEGER DEFAULT 0,
                  preset_order INTEGER,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  last_backtest_at DATETIME,
                  backtest_win_rate REAL,
                  backtest_sharpe REAL,
                  backtest_total_signals INTEGER
                )
              `, (err) => {
                if (err) reject(err);
                else {
                  // Create indexes
                  db.run(`CREATE INDEX IF NOT EXISTS idx_master_symbol ON MasterTickers(symbol)`);
                  db.run(`CREATE INDEX IF NOT EXISTS idx_prices_symbol_date ON HistoricalPrices(symbol, date)`);
                  db.run(`CREATE INDEX IF NOT EXISTS idx_strategies_active ON CustomStrategies(is_active)`);
                  db.run(`CREATE INDEX IF NOT EXISTS idx_strategies_preset ON CustomStrategies(is_preset)`, resolve);
                }
              });
            }
          });
        }
      });
    });
  });
}

// Generate realistic stock symbols
function generateSymbols(count) {
  const largecaps = [
    { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'ENERGY' },
    { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT' },
    { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'BANKING' },
    { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'BANKING' },
    { symbol: 'INFY', name: 'Infosys Ltd', sector: 'IT' },
  ];

  const sectors = ['IT', 'BANKING', 'ENERGY', 'PHARMA', 'METALS', 'FMCG', 'AUTO', 'REALTY'];
  const result = [...largecaps];

  for (let i = largecaps.length; i < count; i++) {
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    result.push({
      symbol: `STOCK${i}${randomId}`,
      name: `Company ${i} Ltd`,
      sector: sectors[Math.floor(Math.random() * sectors.length)]
    });
  }

  return result.slice(0, count);
}

// Seed MasterTickers
async function seedMasterTickers(db, count = 750) {
  const symbols = generateSymbols(count);
  console.log(`\n📊 Seeding ${symbols.length} symbols in MasterTickers...`);

  const startTime = Date.now();
  let inserted = 0;

  for (const sym of symbols) {
    try {
      await dbRun(
        db,
        `
          INSERT INTO MasterTickers (symbol, name, isin, exchange, sector, fmv_31_jan_2018)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          sym.symbol,
          sym.name,
          `INE${Math.random().toString(36).substring(7).toUpperCase()}K01`,
          'NSE',
          sym.sector,
          Math.random() * 1000 + 100
        ]
      );
      inserted++;
    } catch (e) {
      // Ignore duplicates
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`✓ Seeded ${inserted} symbols in ${elapsed}ms`);
  return inserted;
}

// Seed HistoricalPrices
async function seedHistoricalPrices(db) {
  console.log(`\n📊 Seeding historical prices...`);
  const startTime = Date.now();

  const symbols = await dbAll(db, `SELECT DISTINCT symbol FROM MasterTickers LIMIT 750`);

  let insertedCount = 0;
  const baseDate = new Date('2023-04-01');
  const endDate = new Date('2025-12-31');

  for (const row of symbols) {
    const symbol = row.symbol;
    let currentDate = new Date(baseDate);

    while (currentDate <= endDate && insertedCount < 10000) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const basePrice = 100 + Math.random() * 900;
      const open = basePrice;
      const close = basePrice * (1 + (Math.random() - 0.5) * 0.05);
      const high = Math.max(open, close) * (1 + Math.random() * 0.02);
      const low = Math.min(open, close) * (1 - Math.random() * 0.02);
      const volume = Math.floor(Math.random() * 10000000);

      try {
        await dbRun(
          db,
          `
            INSERT INTO HistoricalPrices (symbol, date, open_price, close_price, high_price, low_price, volume, adjusted_close)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [symbol, dateStr, open, close, high, low, volume, close]
        );
        insertedCount++;
      } catch (e) {
        // Ignore duplicates
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (insertedCount >= 10000) break;
  }

  const elapsed = Date.now() - startTime;
  console.log(`✓ Seeded ${insertedCount} historical price records in ${elapsed}ms`);
}

// Seed CustomStrategies
async function seedStrategies(db, count = 50) {
  console.log(`\n📊 Seeding ${count} custom strategies...`);
  const startTime = Date.now();

  const baseStrategies = [
    { id: 'S1', name: 'VPA Base Compaction & Breakout', template: 'vpa_compaction' },
    { id: 'S2', name: 'Institutional Inflow + FVG', template: 'institutional_flow' },
    { id: 'S3', name: 'Sequential HH/HL Momentum', template: 'hhhl_momentum' },
  ];

  let inserted = 0;

  for (const strat of baseStrategies) {
    try {
      await dbRun(
        db,
        `
          INSERT INTO CustomStrategies
          (id, name, base_template_id, description, parameters_json, is_active, is_preset, preset_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          strat.id,
          strat.name,
          strat.template,
          `Base strategy: ${strat.name}`,
          JSON.stringify({ threshold: 0.5, lookback: 20 }),
          1,
          1,
          inserted + 1
        ]
      );
      inserted++;
    } catch (e) {
      // Already exists
    }
  }

  // Add custom strategies
  for (let i = 0; i < Math.max(0, count - 3); i++) {
    const customId = `CUSTOM_${Math.random().toString(36).substring(7).toUpperCase()}`;
    try {
      await dbRun(
        db,
        `
          INSERT INTO CustomStrategies
          (id, name, base_template_id, description, parameters_json, is_active, is_preset)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          customId,
          `Custom Strategy ${i + 1}`,
          `template_${i}`,
          `User-defined strategy variant ${i + 1}`,
          JSON.stringify({ threshold: Math.random(), lookback: 10 + Math.floor(Math.random() * 30) }),
          Math.random() > 0.3 ? 1 : 0,
          0
        ]
      );
      inserted++;
    } catch (e) {
      // Ignore errors
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`✓ Seeded ${inserted} strategies in ${elapsed}ms`);
}

// ═══════════════════════════════════════════════════════════
// PERFORMANCE TESTS
// ═══════════════════════════════════════════════════════════

async function test1UniverseLoading(db) {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 1: Universe Loading Performance');
  console.log('═'.repeat(70));

  // Test 1.1: Load full universe
  console.log('\n1.1 Load full universe (no LIMIT)');
  let startTime = Date.now();
  const universe = await dbAll(
    db,
    `
      SELECT DISTINCT symbol, name
      FROM MasterTickers
      WHERE symbol IS NOT NULL AND symbol != ''
    `
  );
  let elapsed = Date.now() - startTime;
  console.log(`  ✓ Loaded ${universe.length} symbols in ${elapsed}ms`);
  console.log(`  Expected: <2000ms | Actual: ${elapsed}ms | ${elapsed < 2000 ? '✓ PASS' : '✗ FAIL'}`);

  // Test 1.2: Load with LIMIT 750
  console.log('\n1.2 Load universe with LIMIT 750');
  startTime = Date.now();
  const universeWith750 = await dbAll(
    db,
    `
      SELECT DISTINCT symbol, name
      FROM MasterTickers
      WHERE symbol IS NOT NULL AND symbol != ''
      LIMIT 750
    `
  );
  elapsed = Date.now() - startTime;
  console.log(`  ✓ Loaded ${universeWith750.length} symbols in ${elapsed}ms`);
  console.log(`  Expected: <500ms | Actual: ${elapsed}ms | ${elapsed < 500 ? '✓ PASS' : '✗ FAIL'}`);

  // Test 1.3: Load with custom LIMIT 100
  console.log('\n1.3 Load universe with LIMIT 100');
  startTime = Date.now();
  const universeWith100 = await dbAll(
    db,
    `
      SELECT DISTINCT symbol, name
      FROM MasterTickers
      WHERE symbol IS NOT NULL AND symbol != ''
      LIMIT 100
    `
  );
  elapsed = Date.now() - startTime;
  console.log(`  ✓ Loaded ${universeWith100.length} symbols in ${elapsed}ms`);
  console.log(`  Expected: <500ms | Actual: ${elapsed}ms | ${elapsed < 500 ? '✓ PASS' : '✗ FAIL'}`);

  return {
    test: '1. Universe Loading',
    full: elapsed,
    limit750: await measureQuery(db, `SELECT DISTINCT symbol, name FROM MasterTickers LIMIT 750`),
    limit100: await measureQuery(db, `SELECT DISTINCT symbol, name FROM MasterTickers LIMIT 100`)
  };
}

async function test2StrategyLibraryQueries(db) {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 2: Strategy Library Query Performance');
  console.log('═'.repeat(70));

  // Test 2.1: Full library query
  console.log('\n2.1 GET /strategies/library query');
  let startTime = Date.now();
  const strategies = await dbAll(
    db,
    `
      SELECT
        id, name, description,
        is_active, parameters_json,
        last_backtest_at, backtest_win_rate
      FROM CustomStrategies
      ORDER BY is_preset DESC, created_at DESC
    `
  );
  let elapsed = Date.now() - startTime;
  console.log(`  ✓ Retrieved ${strategies.length} strategies in ${elapsed}ms`);
  console.log(`  Expected: <100ms | Actual: ${elapsed}ms | ${elapsed < 100 ? '✓ PASS' : '✗ FAIL'}`);

  // Test 2.2: Filter active strategies
  console.log('\n2.2 Filter active strategies');
  startTime = Date.now();
  const activeStrategies = await dbAll(
    db,
    `SELECT * FROM CustomStrategies WHERE is_active = 1 LIMIT 1000`
  );
  elapsed = Date.now() - startTime;
  console.log(`  ✓ Retrieved ${activeStrategies.length} active strategies in ${elapsed}ms`);
  console.log(`  Expected: <50ms | Actual: ${elapsed}ms | ${elapsed < 50 ? '✓ PASS' : '✗ FAIL'}`);

  // Test 2.3: Retrieve single strategy parameters
  console.log('\n2.3 Retrieve single strategy parameters');
  if (strategies.length > 0) {
    const strategyId = strategies[0].id;
    startTime = Date.now();
    const strategy = await dbGet(
      db,
      `SELECT id, name, parameters_json FROM CustomStrategies WHERE id = ?`,
      [strategyId]
    );
    elapsed = Date.now() - startTime;
    console.log(`  ✓ Retrieved strategy ${strategyId} in ${elapsed}ms`);
    console.log(`  Expected: <20ms | Actual: ${elapsed}ms | ${elapsed < 20 ? '✓ PASS' : '✗ FAIL'}`);
  }

  return {
    test: '2. Strategy Library Queries',
    fullLibrary: elapsed,
    activeFilter: await measureQuery(db, `SELECT * FROM CustomStrategies WHERE is_active = 1`),
    singleRetrieve: await measureQuery(db, `SELECT * FROM CustomStrategies LIMIT 1`)
  };
}

async function test3RegressionDetection(db) {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 3: Performance Regression Detection');
  console.log('═'.repeat(70));

  console.log('\n3.1 Universe loading consistency (5 runs)');
  const times = [];
  for (let i = 0; i < 5; i++) {
    const elapsed = await measureQuery(
      db,
      `SELECT DISTINCT symbol FROM MasterTickers WHERE symbol IS NOT NULL`
    );
    times.push(elapsed);
    console.log(`  Run ${i + 1}: ${elapsed}ms`);
  }

  const avgTime = times.reduce((a, b) => a + b) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);
  const variance = ((maxTime - minTime) / avgTime * 100);

  console.log(`\n  Average: ${avgTime.toFixed(0)}ms`);
  console.log(`  Min: ${minTime}ms, Max: ${maxTime}ms`);
  console.log(`  Variance: ${variance.toFixed(1)}%`);
  console.log(`  Expected variance <50% | Actual: ${variance.toFixed(1)}% | ${variance < 50 ? '✓ PASS' : '✗ FAIL'}`);

  return {
    test: '3. Regression Detection',
    avgTime,
    variance
  };
}

async function measureQuery(db, sql) {
  const startTime = Date.now();
  await dbAll(db, sql);
  return Date.now() - startTime;
}

// ═══════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('NRI WealthOS Performance Test: Database Queries (Phase 1 & 4)');
  console.log('═'.repeat(70));

  cleanupTestDb();

  const db = new sqlite3.Database(TEST_DB_PATH);

  try {
    console.log('\n🔧 Initializing test database...');
    await initTestDb(db);

    console.log('✓ Database initialized');

    // Seed data
    await seedMasterTickers(db, 750);
    await seedHistoricalPrices(db);
    await seedStrategies(db, 50);

    // Run tests
    const result1 = await test1UniverseLoading(db);
    const result2 = await test2StrategyLibraryQueries(db);
    const result3 = await test3RegressionDetection(db);

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('PERFORMANCE TEST SUMMARY');
    console.log('═'.repeat(70));

    const summary = {
      timestamp: new Date().toISOString(),
      tests: [
        {
          name: 'Universe Loading',
          fullLoad: '<2000ms',
          limit750: '<500ms',
          limit100: '<500ms'
        },
        {
          name: 'Strategy Library',
          fullQuery: '<100ms',
          activeFilter: '<50ms',
          singleRetrieve: '<20ms'
        },
        {
          name: 'Regression Detection',
          variance: '<50%'
        }
      ],
      notes: 'All tests measure actual database query performance without application overhead'
    };

    console.log(JSON.stringify(summary, null, 2));

    console.log('\n✓ Performance tests complete!\n');

  } catch (err) {
    console.error('\n✗ Test error:', err.message);
    console.error(err.stack);
  } finally {
    db.close(() => {
      cleanupTestDb();
      process.exit(0);
    });
  }
}

main();
