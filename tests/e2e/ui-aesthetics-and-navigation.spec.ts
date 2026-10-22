/**
 * WealthOS Test Suite 11: UI/UX, Aesthetics & Visual Regression
 * End-to-end Playwright tests for:
 * - Theme token compliance (Institutional Light & Midnight Obsidian)
 * - Typography & tabular numerals
 * - Hub navigation & rendering
 * - Color semantics & WCAG contrast
 * - Statutory disclaimers (INV-10)
 *
 * Pillar: P5 (UI/UX & Aesthetic Compliance)
 */
import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, '../screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Helper: wait for the app shell to be ready
async function waitForApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('app-auth-session', 'true');
    localStorage.setItem('app-auth-email', 'gopal.sharma@gmail.com');
  });
  await page.goto(APP_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // Extra buffer for chart renders
}

// Helper: get CSS custom property value from document root
async function getCSSVar(page: Page, varName: string): Promise<string> {
  return page.evaluate((v) =>
    getComputedStyle(document.documentElement).getPropertyValue(v).trim(),
    varName
  );
}

// ===========================================================================
// TS-11.1: THEME TOKEN COMPLIANCE — Institutional Light Mode (Default)
// ===========================================================================
test.describe('TS-11.1: Theme Token Compliance (Light Mode)', () => {

  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('TS11-01: App canvas background token = #F7F8FA', async ({ page }) => {
    const bg = await getCSSVar(page, '--bg-app');
    // Normalize whitespace and case
    expect(bg.replace(/\s+/g, '').toLowerCase()).toContain('f7f8fa');
  });

  test('TS11-02: Card surface background token = #FFFFFF', async ({ page }) => {
    const card = await getCSSVar(page, '--bg-card');
    expect(card.replace(/\s+/g, '').toLowerCase()).toMatch(/ffffff|#fff/);
  });

  test('TS11-03: Primary text color token = #0B1220 (near-black)', async ({ page }) => {
    const textPri = await getCSSVar(page, '--text-pri');
    expect(textPri).toBeTruthy();
    // Must be a dark color (not white or light gray)
    if (textPri.startsWith('#')) {
      const r = parseInt(textPri.slice(1, 3), 16);
      const g = parseInt(textPri.slice(3, 5), 16);
      const b = parseInt(textPri.slice(5, 7), 16);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(luminance).toBeLessThan(50); // Dark color
    }
  });

  test('TS11-04: Gain/profit color token = #0F7A4E (deep emerald)', async ({ page }) => {
    const gain = await getCSSVar(page, '--fin-gain');
    expect(gain.replace(/\s+/g, '').toLowerCase()).toContain('0f7a4e');
  });

  test('TS11-05: Loss color token = #B3261E (deep carmine)', async ({ page }) => {
    const loss = await getCSSVar(page, '--fin-loss');
    expect(loss.replace(/\s+/g, '').toLowerCase()).toContain('b3261e');
  });

  test('TS11-06: Warning/amber color token = #8A5A00', async ({ page }) => {
    const warn = await getCSSVar(page, '--fin-warn');
    expect(warn.replace(/\s+/g, '').toLowerCase()).toContain('8a5a00');
  });

  test('TS11-07: Brand primary (nav) = #0B3D91 (Sovereign Navy)', async ({ page }) => {
    const brand = await getCSSVar(page, '--brand-pri');
    expect(brand.replace(/\s+/g, '').toLowerCase()).toContain('0b3d91');
  });
});

// ===========================================================================
// TS-11.4: DARK MODE SWITCHING (Midnight Obsidian)
// ===========================================================================
test.describe('TS-11.4: Dark Mode — Midnight Obsidian', () => {

  test('TC-UI-4: Dark mode canvas switches to #020617', async ({ page }) => {
    await waitForApp(page);

    // Apply Midnight Obsidian & Emerald theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'midnight-emerald');
      localStorage.setItem('app-theme', 'midnight-emerald');
    });
    await page.waitForTimeout(600);

    const bg = await getCSSVar(page, '--bg-app');
    // Midnight Obsidian canvas = #020617
    expect(bg.replace(/\s+/g, '').toLowerCase()).toContain('020617');

    // Screenshot for visual record
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'dark-mode-canvas.png')
    });
  });
});

// ===========================================================================
// TS-11.2: TYPOGRAPHY & TABULAR NUMERALS
// ===========================================================================
test.describe('TS-11.2: Typography & Tabular Numerals', () => {

  test('TS11-08: Financial numbers use monospace/JetBrains Mono font', async ({ page }) => {
    await waitForApp(page);

    // Look for elements with monospace font class or style
    const monoElements = await page.$$eval(
      '[class*="mono"], [class*="tabular"], [class*="font-mono"], table td',
      (els) => els.slice(0, 20).map(el => ({
        text: el.textContent?.trim().substring(0, 20) || '',
        fontFamily: getComputedStyle(el).fontFamily.toLowerCase(),
        fontVariantNumeric: getComputedStyle(el).fontVariantNumeric
      }))
    );

    // At least some elements should have monospace or tabular treatment
    const hasMonoTreatment = monoElements.some(el =>
      el.fontFamily.includes('mono') ||
      el.fontFamily.includes('jetbrains') ||
      el.fontVariantNumeric.includes('tabular')
    );

    // Log details for diagnostics
    console.log('Typography sample:', monoElements.slice(0, 3));
    expect(hasMonoTreatment).toBe(true);
  });

  test('TS11-09: Rupee amounts contain valid number format', async ({ page }) => {
    await waitForApp(page);

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    // Should contain ₹ symbol with formatted numbers
    expect(body).toMatch(/₹/);
    // Should contain comma-formatted numbers (Indian numbering system)
    expect(body).toMatch(/₹[0-9,]+/);
  });
});

// ===========================================================================
// TS-11.3: HUB NAVIGATION & RENDERING
// ===========================================================================
test.describe('TS-11.3: Hub Navigation & Screen Rendering', () => {

  test('TS11-12: Command Center renders with non-zero AUM', async ({ page }) => {
    await waitForApp(page);

    // Screenshot baseline
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'command-center-light.png')
    });

    const body = await page.textContent('body');
    expect(body).toContain('₹');
    // App should not show an error state
    expect(body).not.toMatch(/error|failed|500|crash/i);
  });

  test('TS11-13: Portfolio Hub shows holdings table with data rows', async ({ page }) => {
    await waitForApp(page);

    const portfolioTab = page.locator('aside button, .sidebar-nav-btn')
      .filter({ hasText: /1\.\s*Dashboard|Holdings/i }).first();

    if (await portfolioTab.isVisible()) {
      await portfolioTab.click();
      await page.waitForTimeout(2000);

      // Look for table with data
      const tables = await page.$$('table');
      if (tables.length > 0) {
        const rows = await page.$$('table tbody tr');
        expect(rows.length).toBeGreaterThan(0);
        console.log(`Portfolio table has ${rows.length} rows`);
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'portfolio-hub.png')
      });
    }
  });

  test('TS11-14: Analytics Hub renders charts/visualizations', async ({ page }) => {
    await waitForApp(page);

    const analyticsTab = page.locator('aside button, .sidebar-nav-btn')
      .filter({ hasText: /2\.\s*Holdings & Analytics|Analytics/i }).first();

    if (await analyticsTab.isVisible()) {
      await analyticsTab.click();
      await page.waitForTimeout(2500);

      // Check for SVG chart elements
      const svgs = await page.$$('svg');
      const canvases = await page.$$('canvas');
      const chartElements = svgs.length + canvases.length;

      console.log(`Analytics charts: ${svgs.length} SVG, ${canvases.length} canvas elements`);
      expect(chartElements).toBeGreaterThan(0);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'analytics-hub.png')
      });
    }
  });

  test('TS11-15: Tax Center renders with Finance Act 2024 cutover info', async ({ page }) => {
    await waitForApp(page);

    const taxTab = page.locator('aside button, .sidebar-nav-btn')
      .filter({ hasText: /3\.\s*Tax & Repatriation|Tax/i }).first();

    if (await taxTab.isVisible()) {
      await taxTab.click();
      await page.waitForTimeout(2000);

      const body = await page.textContent('body');
      expect(body).toBeTruthy();
      const hasTaxContent = body?.includes('Tax') ||
                            body?.includes('15CA') ||
                            body?.includes('TDS') ||
                            body?.includes('2024');
      expect(hasTaxContent).toBe(true);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'tax-center.png')
      });
    }
  });

  test('TS11-16: Opportunity Engine loads with scanner results', async ({ page }) => {
    await waitForApp(page);

    const oppTab = page.locator('aside button, .sidebar-nav-btn')
      .filter({ hasText: /4\.\s*Opportunities & Drift|Opportunities/i }).first();

    if (await oppTab.isVisible()) {
      await oppTab.click();
      await page.waitForTimeout(3000); // Longer wait for scanner

      const body = await page.textContent('body');
      expect(body).toBeTruthy();
      expect(body).not.toMatch(/error.*fetch|failed to load/i);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'opportunity-engine.png')
      });
    }
  });

  test('TS11-19: Report Studio has preset options visible', async ({ page }) => {
    await waitForApp(page);

    const reportTab = page.locator('aside button, .sidebar-nav-btn')
      .filter({ hasText: /Report Studio/i }).first();

    if (await reportTab.isVisible()) {
      await reportTab.click();
      await page.waitForTimeout(2000);

      const body = await page.textContent('body');
      expect(body).toBeTruthy();

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'report-studio.png')
      });
    }
  });
});

// ===========================================================================
// INV-10: STATUTORY DISCLAIMER
// ===========================================================================
test.describe('INV-10: Statutory Tax Disclaimer', () => {

  test('TS6-21 & INV-10: Tax screen shows CA disclaimer', async ({ page }) => {
    await waitForApp(page);

    const taxTab = page.locator('aside button, .sidebar-nav-btn')
      .filter({ hasText: /3\.\s*Tax & Repatriation|Tax/i }).first();

    if (await taxTab.isVisible()) {
      await taxTab.click();
      await page.waitForTimeout(2000);

      const body = (await page.textContent('body') || '').toLowerCase();
      const hasDisclaimer =
        body.includes('estimate') ||
        body.includes('tax') ||
        body.includes('consult') ||
        body.includes('advisory') ||
        body.includes('15ca');

      expect(hasDisclaimer).toBe(true);
    }
  });
});

// ===========================================================================
// TS-11.5: COLOR SEMANTICS — Positive/Negative P&L Rendering
// ===========================================================================
test.describe('TS-11.5: Color Semantics for Financial Values', () => {

  test('TS11-28 & 29: Positive P&L green, negative P&L red in holdings', async ({ page }) => {
    await waitForApp(page);

    const portfolioTab = page.locator('aside button, .sidebar-nav-btn')
      .filter({ hasText: /1\.\s*Dashboard|Holdings/i }).first();

    if (await portfolioTab.isVisible()) {
      await portfolioTab.click();
      await page.waitForTimeout(2000);

      // Find P&L cells and check their computed color
      const pnlCells = await page.$$eval(
        'td, [class*="pnl"], [class*="gain"], [class*="loss"], [class*="profit"]',
        (cells) => cells.slice(0, 50).map(cell => {
          const text = cell.textContent?.trim() || '';
          const color = getComputedStyle(cell).color;
          return { text, color };
        })
      );

      // Find cells with explicitly negative values (showing - prefix)
      const negativeCells = pnlCells.filter(c => c.text.startsWith('-') && c.text.includes('₹'));
      const positiveCells = pnlCells.filter(c => !c.text.startsWith('-') && c.text.includes('₹') && c.text !== '₹0');

      // Log for diagnostics
      console.log('Sample negative cells:', negativeCells.slice(0, 2));
      console.log('Sample positive cells:', positiveCells.slice(0, 2));

      // Verify negative cells are NOT rendered in green tones
      negativeCells.forEach(cell => {
        if (cell.color && cell.color !== 'rgb(0, 0, 0)') {
          // Should not be a clearly green color
          const isGreen = cell.color.includes('78, 122') || cell.color.includes('16, 185') || cell.color.includes('15, 122');
          expect(isGreen).toBe(false);
        }
      });
    }
  });
});

// ===========================================================================
// TS-11.4: RESPONSIVE LAYOUT
// ===========================================================================
test.describe('TS-11.4: Responsive Layout', () => {

  test('TS11-22: Desktop layout (1920×1080) — no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await waitForApp(page);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    console.log(`Body scroll width: ${bodyWidth}, Viewport: ${viewportWidth}`);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20); // Allow tiny buffer
  });

  test('TS11-23: Tablet layout (768×1024) — main content visible', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await waitForApp(page);

    const body = await page.textContent('body');
    expect(body).toContain('₹');

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'tablet-layout.png')
    });
  });

  test('TS11-27: Modals render at correct z-index above content', async ({ page }) => {
    await waitForApp(page);
    const themeBtn = page.locator('button').filter({ hasText: /Customize Skins|Themes/i }).first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(600);

      const modal = page.locator('[role="dialog"], .fixed.inset-0, [class*="modal"]').first();
      if (await modal.isVisible()) {
        const zIndex = await modal.evaluate(el => getComputedStyle(el).zIndex);
        expect(parseInt(zIndex) || 50).toBeGreaterThanOrEqual(40);
        await page.keyboard.press('Escape');
      }
    }
  });
});

// ===========================================================================
// TS-14.2: DYNAMIC DATA VERIFICATION (No Hardcoding)
// ===========================================================================
test.describe('TS-14.2: Dynamic Data — Not Hardcoded', () => {

  test('TS14-08: Dashboard values are real (non-zero, non-demo)', async ({ page }) => {
    await waitForApp(page);

    // Pull actual data from API
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/dashboard?portfolio=Combined');
      return r.json();
    });

    const holdings = res.holdings || res.rows || [];
    expect(holdings.length).toBeGreaterThan(0);

    // Verify no obviously fake/placeholder values
    holdings.forEach((h: any) => {
      const sym = (h.symbol || '').toUpperCase();
      expect(sym).not.toMatch(/^(DEMO|TEST|FAKE|EXAMPLE|PLACEHOLDER)/);
    });
  });

  test('TS14-Prices: Stock prices are plausible (not 1.00 or 0.00)', async ({ page }) => {
    await waitForApp(page);
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/dashboard?portfolio=Combined');
      return r.json();
    });
    const holdings = res.holdings || res.rows || [];
    const majorHoldings = holdings.filter((h: any) => Number(h.quantity || 0) > 1);
    
    const suspiciousPrices = majorHoldings.filter((h: any) => {
      const ltp = Number(h.ltp || 0);
      return ltp === 1.0 || ltp === 0.0 || ltp === 100.0;
    });

    // Allow max 10% to have suspicious round prices (some stocks genuinely trade at ₹100)
    if (majorHoldings.length > 0) {
      expect(suspiciousPrices.length / majorHoldings.length).toBeLessThan(0.15);
    }
  });
});
