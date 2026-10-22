import { chromium } from 'playwright';

async function testCdp() {
  console.log('Testing connection to Opera on 127.0.0.1:9222...');
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 4000 });
    console.log('✓ Successfully connected to Opera over CDP!');
    const contexts = browser.contexts();
    for (let cIdx = 0; cIdx < contexts.length; cIdx++) {
      const pages = contexts[cIdx].pages();
      console.log(`Context ${cIdx} has ${pages.length} pages:`);
      for (const p of pages) {
        console.log(`  - Title: "${await p.title()}" | URL: ${p.url()}`);
      }
    }
    await browser.close();
  } catch (err) {
    console.log('Could not connect to Opera on port 9222:', err.message);
  }
}

testCdp();
