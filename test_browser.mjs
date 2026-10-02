import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    console.log('Navigating...');
    page.goto('http://localhost:4000/scrip-dossier/TCS').catch(e => console.log('goto error: ' + e));
    
    console.log('Clicking Sign In...');
    try {
        await page.waitForSelector('button', { timeout: 10000 });
        await page.click('button');
    } catch(e) {
        console.log('No button found: ' + e.message);
    }
    
    console.log('Waiting for load...');
    await new Promise(r => setTimeout(r, 8000));
    
    await page.screenshot({ path: 'tcs_remote_test_fixed3.png' });
    console.log('Screenshot saved to tcs_remote_test_fixed3.png');
    
    await browser.close();
    process.exit(0);
})();
