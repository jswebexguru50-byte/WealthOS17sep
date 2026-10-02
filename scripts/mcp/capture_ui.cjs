const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Handle Login if present
  await page.goto('http://localhost:3000/#analyze/TCS', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  if (await page.getByText(/SIGN IN AS/i).isVisible()) {
    await page.getByText(/SIGN IN AS/i).click();
    await page.waitForTimeout(3000); // Wait for auth to complete
  }

  // Test TCS page
  await page.goto('http://localhost:3000/#analyze/TCS', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // give it time to load data
  const tcsText = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync('TCS_UI_TEXT.txt', tcsText);

  // Test Portfolio Maa page
  await page.goto('http://localhost:3000/#portfolio/Maa', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const maaText = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync('MAA_UI_TEXT.txt', maaText);

  await browser.close();
  console.log('Successfully captured UI text.');
})();
