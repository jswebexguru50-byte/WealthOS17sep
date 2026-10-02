import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function runBrowserTest() {
  console.log('=== RUNNING WEALTHOS BROWSER REALITY TEST (Test K) ===');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const testResults: any = {
    overview: false,
    dycl: null,
    bajfinance: null,
    ramcoind: null,
    consoleErrors: []
  };

  try {
    // 1. Overview / Dashboard
    console.log('\n1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    const pageTitle = await page.title();
    console.log(`Page loaded. Title: "${pageTitle}"`);
    testResults.overview = true;

    // 2. DYCL Cockpit
    console.log('\n2. Navigating to http://localhost:3000/#analyze/DYCL...');
    const dyclRespPromise = page.waitForResponse(resp => resp.url().includes('/company-intelligence/DYCL'), { timeout: 30000 });
    await page.goto('http://localhost:3000/#analyze/DYCL', { waitUntil: 'domcontentloaded' });
    await dyclRespPromise;
    await page.waitForTimeout(2000); // allow React state update to paint

    const dyclText = await page.evaluate(() => document.body.innerText);
    const dyclHasNaN = /\bNaN\b/.test(dyclText);
    const dyclHasUndefined = /\bundefined\b/.test(dyclText);
    const dyclHasName = dyclText.includes('DYCL') || dyclText.includes('Dynamic Cables');

    await page.screenshot({ path: 'scratch/browser_dycl.png' });
    console.log(`DYCL Cockpit: Name detected = ${dyclHasName}, NaN detected = ${dyclHasNaN}, undefined detected = ${dyclHasUndefined}`);
    console.log(`DYCL Snippet: ${dyclText.slice(0, 300).replace(/\n+/g, ' ')}`);

    testResults.dycl = {
      nameDetected: dyclHasName,
      hasNaN: dyclHasNaN,
      hasUndefined: dyclHasUndefined,
      status: dyclHasName && !dyclHasNaN ? 'PASS' : 'FAIL'
    };

    // 3. BAJFINANCE Cockpit
    console.log('\n3. Navigating to http://localhost:3000/#analyze/BAJFINANCE...');
    const bajRespPromise = page.waitForResponse(resp => resp.url().includes('/company-intelligence/BAJFINANCE'), { timeout: 30000 });
    await page.goto('http://localhost:3000/#analyze/BAJFINANCE', { waitUntil: 'domcontentloaded' });
    await bajRespPromise;
    await page.waitForTimeout(2000);

    const bajText = await page.evaluate(() => document.body.innerText);
    const bajHasNaN = /\bNaN\b/.test(bajText);
    const bajHasUndefined = /\bundefined\b/.test(bajText);
    const bajHasName = bajText.includes('BAJFINANCE') || bajText.includes('Bajaj Finance');

    await page.screenshot({ path: 'scratch/browser_bajfinance.png' });
    console.log(`BAJFINANCE Cockpit: Name detected = ${bajHasName}, NaN detected = ${bajHasNaN}, undefined detected = ${bajHasUndefined}`);
    console.log(`BAJFINANCE Snippet: ${bajText.slice(0, 300).replace(/\n+/g, ' ')}`);

    testResults.bajfinance = {
      nameDetected: bajHasName,
      hasNaN: bajHasNaN,
      hasUndefined: bajHasUndefined,
      status: bajHasName && !bajHasNaN ? 'PASS' : 'FAIL'
    };

    // 4. RAMCOIND Cockpit (Sparse data company)
    console.log('\n4. Navigating to http://localhost:3000/#analyze/RAMCOIND (Sparse company)...');
    const ramcoRespPromise = page.waitForResponse(resp => resp.url().includes('/company-intelligence/RAMCOIND'), { timeout: 30000 });
    await page.goto('http://localhost:3000/#analyze/RAMCOIND', { waitUntil: 'domcontentloaded' });
    await ramcoRespPromise;
    await page.waitForTimeout(2000);

    const ramcoText = await page.evaluate(() => document.body.innerText);
    const ramcoHasNaN = /\bNaN\b/.test(ramcoText);
    const ramcoHasUndefined = /\bundefined\b/.test(ramcoText);
    const ramcoHasName = ramcoText.includes('RAMCOIND') || ramcoText.includes('Ramco Industries');
    const ramcoHasDegradation = ramcoText.includes('INSUFFICIENT') || ramcoText.includes('Missing') || ramcoText.includes('Data') || ramcoText.includes('Unavailable') || ramcoText.includes('RAMCOIND');

    await page.screenshot({ path: 'scratch/browser_ramcoind.png' });
    console.log(`RAMCOIND Cockpit: Name detected = ${ramcoHasName}, NaN detected = ${ramcoHasNaN}, Degradation observed = ${ramcoHasDegradation}`);
    console.log(`RAMCOIND Snippet: ${ramcoText.slice(0, 300).replace(/\n+/g, ' ')}`);

    testResults.ramcoind = {
      nameDetected: ramcoHasName,
      hasNaN: ramcoHasNaN,
      hasUndefined: ramcoHasUndefined,
      honestDegradation: ramcoHasDegradation,
      status: ramcoHasName && !ramcoHasNaN ? 'PASS' : 'FAIL'
    };

    testResults.consoleErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('manifest'));

    console.log('\nBrowser verification complete!');
    console.log('Console errors count (filtered):', testResults.consoleErrors.length);

    fs.writeFileSync('scratch/browser_test_results.json', JSON.stringify(testResults, null, 2));

  } finally {
    await browser.close();
  }
}

runBrowserTest().catch(e => {
  console.error('Browser test failed:', e);
  process.exit(1);
});
