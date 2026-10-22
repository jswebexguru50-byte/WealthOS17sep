// Simple performance test using Node.js HTTP client
const http = require('http');
const fs = require('fs');

const metrics = [];

function recordMetric(name, duration, category) {
  const metric = {
    name,
    duration,
    timestamp: Date.now(),
    category
  };
  metrics.push(metric);
  console.log(`✓ ${name}: ${duration.toFixed(2)}ms [${category}]`);
}

function waitForServer(url, maxRetries = 60) {
  return new Promise((resolve) => {
    let retries = 0;
    const interval = setInterval(() => {
      http.get(url, (res) => {
        res.destroy();
        clearInterval(interval);
        console.log('✓ Server is ready\n');
        resolve(true);
      }).on('error', () => {
        retries++;
        if (retries >= maxRetries) {
          clearInterval(interval);
          console.log('✗ Server failed to start');
          resolve(false);
        }
      });
    }, 1000);
  });
}

async function checkServerAPIs() {
  console.log('🚀 Starting Performance Analysis\n');

  // Check if server is running
  const serverRunning = await waitForServer('http://localhost:3000/');
  if (!serverRunning) {
    console.error('❌ Server is not responding');
    process.exit(1);
  }

  console.log('📊 PERFORMANCE ANALYSIS - API & DATABASE METRICS\n');

  // Test 1: API endpoint response times
  console.log('Test 1: API Health Check');
  const healthStart = Date.now();
  try {
    const healthMetric = await makeRequest('GET', '/api/health');
    const healthDuration = Date.now() - healthStart;
    recordMetric('API Health Check', healthDuration, 'initial_render');
  } catch (e) {
    console.log('⚠ Health endpoint not available');
  }

  // Test 2: Portfolio list API
  console.log('\nTest 2: Portfolio List API');
  const portStart = Date.now();
  try {
    const portfolioMetric = await makeRequest('GET', '/api/portfolios');
    const portDuration = Date.now() - portStart;
    recordMetric('Portfolio List API', portDuration, 'initial_render');
  } catch (e) {
    console.log('⚠ Portfolio endpoint not available');
  }

  // Test 3: Holdings API (large data set)
  console.log('\nTest 3: Holdings API (Large Data)');
  const holdStart = Date.now();
  try {
    await makeRequest('GET', '/api/holdings?portfolio_id=1&limit=2000');
    const holdDuration = Date.now() - holdStart;
    recordMetric('Holdings API (2000 rows)', holdDuration, 'data_table');
  } catch (e) {
    console.log('⚠ Holdings endpoint not available');
  }

  // Test 4: Strategy Engine API
  console.log('\nTest 4: Strategy Engine API');
  const stratStart = Date.now();
  try {
    await makeRequest('GET', '/api/strategies');
    const stratDuration = Date.now() - stratStart;
    recordMetric('Strategy Engine API', stratDuration, 'initial_render');
  } catch (e) {
    console.log('⚠ Strategy endpoint not available');
  }

  // Test 5: Regime Backtest Data
  console.log('\nTest 5: Regime Backtest Data API');
  const backStart = Date.now();
  try {
    await makeRequest('GET', '/api/regime-backtest-summary');
    const backDuration = Date.now() - backStart;
    recordMetric('Regime Backtest Summary', backDuration, 'data_table');
  } catch (e) {
    console.log('⚠ Backtest endpoint not available');
  }

  // Test 6: Technical Analysis API
  console.log('\nTest 6: Technical Analysis Engine');
  const techStart = Date.now();
  try {
    await makeRequest('GET', '/api/technical-analysis?symbol=INFY');
    const techDuration = Date.now() - techStart;
    recordMetric('Technical Analysis Engine', techDuration, 'initial_render');
  } catch (e) {
    console.log('⚠ Technical Analysis endpoint not available');
  }

  // Test 7: CSV Export
  console.log('\nTest 7: CSV Export (2K rows)');
  const csvStart = Date.now();
  try {
    const csvResponse = await makeRequest('POST', '/api/export/csv', { rows: 2000 });
    const csvDuration = Date.now() - csvStart;
    recordMetric('CSV Export (2K rows)', csvDuration, 'download');
  } catch (e) {
    console.log('⚠ CSV Export endpoint not available');
  }

  // Test 8: Database Query - Portfolio History
  console.log('\nTest 8: Portfolio History Query');
  const histStart = Date.now();
  try {
    await makeRequest('GET', '/api/portfolio-history?portfolio_id=1&days=365');
    const histDuration = Date.now() - histStart;
    recordMetric('Portfolio History (365 days)', histDuration, 'data_table');
  } catch (e) {
    console.log('⚠ Portfolio History endpoint not available');
  }

  printSummary();
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({ status: res.statusCode, data: data });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function printSummary() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 PERFORMANCE TEST SUMMARY');
  console.log('='.repeat(70) + '\n');

  // Group by category
  const byCategory = new Map();
  metrics.forEach(m => {
    if (!byCategory.has(m.category)) {
      byCategory.set(m.category, []);
    }
    byCategory.get(m.category).push(m);
  });

  // Print by category
  byCategory.forEach((ms, category) => {
    console.log(`\n📈 ${category.toUpperCase().replace(/_/g, ' ')}`);
    console.log('-'.repeat(70));

    let totalDuration = 0;
    ms.forEach(m => {
      console.log(`  ${m.name.padEnd(45)} ${m.duration.toFixed(2).padStart(8)}ms`);
      totalDuration += m.duration;
    });

    console.log('-'.repeat(70));
    if (ms.length > 0) {
      console.log(`  Average: ${(totalDuration / ms.length).toFixed(2)}ms | Total: ${totalDuration.toFixed(0)}ms`);
    }
  });

  // Performance warnings
  console.log('\n⚠️  PERFORMANCE ANALYSIS');
  console.log('-'.repeat(70));

  const warnings = [];

  metrics.forEach(m => {
    if (m.category === 'initial_render' && m.duration > 1000) {
      warnings.push(`SLOW: ${m.name}: ${m.duration.toFixed(0)}ms (target: <1000ms)`);
    }
    if (m.category === 'interaction' && m.duration > 100) {
      warnings.push(`SLOW: ${m.name}: ${m.duration.toFixed(0)}ms (target: <100ms)`);
    }
    if (m.category === 'data_table' && m.duration > 500) {
      warnings.push(`SLOW: ${m.name}: ${m.duration.toFixed(0)}ms (target: <500ms)`);
    }
    if (m.category === 'download' && m.duration > 5000) {
      warnings.push(`SLOW: ${m.name}: ${m.duration.toFixed(0)}ms (target: <5000ms)`);
    }
  });

  if (warnings.length === 0) {
    console.log('  ✓ All performance targets met!');
  } else {
    warnings.forEach(w => console.log(`  ${w}`));
  }

  console.log('\n' + '='.repeat(70) + '\n');

  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    metrics: metrics,
    summary: {
      totalTests: metrics.length,
      byCategory: Array.from(byCategory.entries()).map(([cat, ms]) => ({
        category: cat,
        count: ms.length,
        totalDuration: ms.reduce((a, b) => a + b.duration, 0),
        averageDuration: ms.reduce((a, b) => a + b.duration, 0) / ms.length,
        minDuration: Math.min(...ms.map(m => m.duration)),
        maxDuration: Math.max(...ms.map(m => m.duration))
      }))
    }
  };

  fs.writeFileSync(
    'perf_test_results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('✅ Results saved to perf_test_results.json\n');
}

// Run tests
checkServerAPIs().catch(err => {
  console.error('❌ Test error:', err.message);
  process.exit(1);
});
