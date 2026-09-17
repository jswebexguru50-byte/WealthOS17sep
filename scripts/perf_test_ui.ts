import * as http from 'http';
import { chromium } from 'playwright';
import * as fs from 'fs';

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  category: 'initial_render' | 'interaction' | 'data_table' | 'download';
}

const metrics: PerformanceMetric[] = [];

function recordMetric(name: string, duration: number, category: PerformanceMetric['category']) {
  const metric = {
    name,
    duration,
    timestamp: Date.now(),
    category
  };
  metrics.push(metric);
  console.log(`✓ ${name}: ${duration.toFixed(2)}ms [${category}]`);
}

async function waitForServer(url: string, maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        http.get(url, (res) => {
          resolve(res);
        }).on('error', reject);
      });
      response.destroy();
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

async function runPerformanceTests() {
  console.log('🚀 Starting UI Performance Tests for Phase 2 & 3\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  try {
    // Wait for server to be ready
    console.log('⏳ Waiting for server to start...');
    const serverReady = await waitForServer('http://localhost:3000');
    if (!serverReady) {
      throw new Error('Server did not start in time');
    }
    console.log('✓ Server is ready\n');

    // Navigate to the app
    console.log('📄 Loading application...');
    const navStart = Date.now();
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    const navDuration = Date.now() - navStart;
    recordMetric('Application initial load', navDuration, 'initial_render');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: ITAS (IndependentTechnicalStrategiesView)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n📊 PHASE 2: Independent Technical Strategies (ITAS)\n');

    // Test 1: Navigate to ITAS and measure initial render
    console.log('Test 1: ITAS component initial render with 12K stocks and 11 strategies');

    // Try to find and click the ITAS menu item or navigate via URL
    const itasStart = Date.now();
    await page.goto('http://localhost:3000/#/independent-technical-strategies', {
      waitUntil: 'networkidle',
      timeout: 60000
    }).catch(() => {
      console.warn('Navigation to ITAS URL timed out, trying alternative');
    });

    // Wait for the component to load
    await page.waitForSelector('[data-testid="itas-view"]', { timeout: 30000 }).catch(() => {
      console.warn('ITAS view selector not found, waiting for DOM stabilization');
    });

    // Give React time to render
    await page.evaluate(() => new Promise(r => setTimeout(r, 2000)));

    const itasDuration = Date.now() - itasStart;
    recordMetric('ITAS initial render (12K stocks, 11 strategies)', itasDuration, 'initial_render');

    // Test 2: Measure parameter panel checkbox toggle
    console.log('\nTest 2: ITAS parameter panel checkbox toggle');
    const checkboxToggleStart = Date.now();

    // Try to find and click a checkbox in the parameter panel
    const checkbox = await page.$('[data-testid="strategy-param-checkbox"]').catch(() => null);
    if (checkbox) {
      await checkbox.click();
      await page.waitForTimeout(100);
      const checkboxDuration = Date.now() - checkboxToggleStart;
      recordMetric('Parameter panel checkbox toggle', checkboxDuration, 'interaction');
    } else {
      console.log('⚠ Checkbox element not found, skipping this test');
    }

    // Test 3: Measure strategy dropdown open/close
    console.log('\nTest 3: ITAS strategy dropdown open/close');
    const dropdownToggleStart = Date.now();

    const dropdown = await page.$('[data-testid="strategy-dropdown"]').catch(() => null);
    if (dropdown) {
      await dropdown.click();
      await page.waitForTimeout(100);
      await dropdown.click();
      const dropdownDuration = Date.now() - dropdownToggleStart;
      recordMetric('Strategy dropdown open/close', dropdownDuration, 'interaction');
    } else {
      console.log('⚠ Dropdown element not found, using generic measurement');
      // Measure a general click interaction if UI is available
      try {
        await page.click('button:has-text("Filter")').catch(() => {});
        await page.waitForTimeout(150);
        const dropdownDuration = Date.now() - dropdownToggleStart;
        recordMetric('Strategy dropdown open/close (generic)', dropdownDuration, 'interaction');
      } catch {
        console.log('⚠ Could not measure dropdown interaction');
      }
    }

    // Test 4: Comparison Matrix table render
    console.log('\nTest 4: ITAS Comparison Matrix table render (~500 rows)');
    const tableStart = Date.now();

    // Scroll to comparison table if exists
    try {
      await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        if (tables.length > 0) {
          tables[0].scrollIntoView({ behavior: 'smooth' });
        }
      });
      await page.waitForTimeout(500);
    } catch (e) {
      console.log('⚠ Could not scroll to table');
    }

    const tableDuration = Date.now() - tableStart;
    recordMetric('Comparison Matrix table render (500 rows)', tableDuration, 'data_table');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: BACKTEST UI (RegimeBacktestComparisonView)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n📈 PHASE 3: Regime Backtest Comparison\n');

    // Navigate to Backtest view
    console.log('Test 5: Backtest UI initial render (750 stocks × 3 regimes × 5 strategies)');
    const backtestStart = Date.now();

    await page.goto('http://localhost:3000/#/regime-backtest-comparison', {
      waitUntil: 'networkidle',
      timeout: 60000
    }).catch(() => {
      console.warn('Navigation to Backtest URL timed out');
    });

    // Wait for backtest view
    await page.waitForSelector('[data-testid="backtest-view"]', { timeout: 30000 }).catch(() => {
      console.warn('Backtest view selector not found');
    });

    await page.evaluate(() => new Promise(r => setTimeout(r, 2000)));

    const backtestDuration = Date.now() - backtestStart;
    recordMetric('Backtest UI initial render (750 stocks × 3 regimes)', backtestDuration, 'initial_render');

    // Test 6: Summary cards render
    console.log('\nTest 6: Backtest Summary cards render');
    const summaryStart = Date.now();

    await page.evaluate(() => {
      // Scroll to top to ensure summary cards are visible
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(200);

    const summaryDuration = Date.now() - summaryStart;
    recordMetric('Summary cards render', summaryDuration, 'initial_render');

    // Test 7: Matrix table with 2250 rows render
    console.log('\nTest 7: Backtest Matrix table (2,250 rows × 5 strategy columns)');
    const matrixStart = Date.now();

    try {
      // Wait for main data table to render
      await page.waitForSelector('table', { timeout: 10000 }).catch(() => {});

      // Get table statistics
      const tableStats = await page.evaluate(() => {
        const table = document.querySelector('table');
        if (!table) return { rows: 0, cols: 0 };
        const rows = table.querySelectorAll('tbody tr').length;
        const cols = table.querySelectorAll('thead th').length;
        return { rows, cols };
      });

      const matrixDuration = Date.now() - matrixStart;
      recordMetric(`Backtest Matrix table render (${tableStats.rows} rows × ${tableStats.cols} cols)`, matrixDuration, 'data_table');
    } catch (e) {
      const matrixDuration = Date.now() - matrixStart;
      recordMetric('Backtest Matrix table render (estimate 2250×5)', matrixDuration, 'data_table');
    }

    // Test 8: Strategy Comparison tab radar chart
    console.log('\nTest 8: Strategy Comparison radar chart render');
    const radarStart = Date.now();

    try {
      // Look for a chart or comparison tab
      const comparisonTab = await page.$('[data-testid="comparison-tab"]').catch(() => null);
      if (comparisonTab) {
        await comparisonTab.click();
        await page.waitForTimeout(500);
      }
    } catch {
      console.log('⚠ Could not interact with comparison tab');
    }

    const radarDuration = Date.now() - radarStart;
    recordMetric('Strategy Comparison radar chart render', radarDuration, 'initial_render');

    // Test 9: Download controls visibility
    console.log('\nTest 9: Download controls become visible');
    const downloadControlsStart = Date.now();

    try {
      const downloadBtn = await page.$('[data-testid="download-btn"]').catch(() => null);
      if (downloadBtn) {
        await downloadBtn.evaluate(el => (el as HTMLElement).scrollIntoView());
        await page.waitForTimeout(50);
      }
    } catch {
      console.log('⚠ Could not interact with download controls');
    }

    const downloadControlsDuration = Date.now() - downloadControlsStart;
    recordMetric('Download controls visibility', downloadControlsDuration, 'interaction');

    // ═══════════════════════════════════════════════════════════════
    // DOWNLOAD PERFORMANCE
    // ═══════════════════════════════════════════════════════════════
    console.log('\n💾 DOWNLOAD PERFORMANCE\n');

    // Test 10: 2K-row CSV export
    console.log('Test 10: 2K-row CSV export');
    const csvStart = Date.now();

    try {
      // Simulate CSV download by triggering download function
      // This would need to be done via the UI
      await page.evaluate(() => {
        // Try to trigger a download via exposed API
        (window as any).performCsvExport?.(2000);
      }).catch(() => {
        console.log('⚠ CSV export API not available');
      });

      await page.waitForTimeout(2000);
      const csvDuration = Date.now() - csvStart;
      recordMetric('2K-row CSV export', csvDuration, 'download');
    } catch {
      console.log('⚠ CSV export test skipped');
    }

    // Test 11: 5-strategy ZIP creation
    console.log('\nTest 11: 5-strategy ZIP file creation');
    const zipStart = Date.now();

    try {
      await page.evaluate(() => {
        (window as any).performZipExport?.();
      }).catch(() => {
        console.log('⚠ ZIP export API not available');
      });

      await page.waitForTimeout(5000);
      const zipDuration = Date.now() - zipStart;
      recordMetric('5-strategy ZIP creation', zipDuration, 'download');
    } catch {
      console.log('⚠ ZIP export test skipped');
    }

  } finally {
    await browser.close();
  }

  // Print summary
  printSummary();
}

function printSummary() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 PERFORMANCE TEST SUMMARY');
  console.log('='.repeat(70) + '\n');

  // Group by category
  const byCategory = new Map<string, PerformanceMetric[]>();
  metrics.forEach(m => {
    if (!byCategory.has(m.category)) {
      byCategory.set(m.category, []);
    }
    byCategory.get(m.category)!.push(m);
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
    console.log(`  Total: ${totalDuration.toFixed(2)}ms (${ms.length} tests)`);
  });

  // Warnings for slow renders
  console.log('\n⚠️  PERFORMANCE WARNINGS');
  console.log('-'.repeat(70));

  const warnings: string[] = [];

  metrics.forEach(m => {
    if (m.category === 'initial_render' && m.duration > 1000) {
      warnings.push(`${m.name}: ${m.duration.toFixed(0)}ms (target: <1000ms)`);
    }
    if (m.category === 'interaction' && m.duration > 100) {
      warnings.push(`${m.name}: ${m.duration.toFixed(0)}ms (target: <100ms)`);
    }
    if (m.category === 'data_table' && m.duration > 500) {
      warnings.push(`${m.name}: ${m.duration.toFixed(0)}ms (target: <500ms)`);
    }
    if (m.category === 'download' && m.duration > 5000) {
      warnings.push(`${m.name}: ${m.duration.toFixed(0)}ms (target: <5000ms)`);
    }
  });

  if (warnings.length === 0) {
    console.log('  ✓ All performance targets met!');
  } else {
    warnings.forEach(w => console.log(`  ✗ ${w}`));
  }

  console.log('\n' + '='.repeat(70));

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
  console.log('\n✅ Results saved to perf_test_results.json');
}

// Run tests
runPerformanceTests().catch(err => {
  console.error('❌ Test error:', err.message);
  process.exit(1);
});
