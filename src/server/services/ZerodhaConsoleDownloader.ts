/**
 * src/server/services/ZerodhaConsoleDownloader.ts
 * Automated Browser Downloader using Playwright
 * Automates downloading multi-year Zerodha Console Tradebooks (CSV/XLSX)
 * across multiple financial years and feeds them into the ingestion pipeline.
 */
import path from 'path';
import os from 'os';
import fs from 'fs';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ZerodhaTradebookService } from './ZerodhaTradebookService.js';
import { ZerodhaSyncService } from './ZerodhaSyncService.js';

export interface ConsoleDownloadOptions {
  headless?: boolean;
  portfolio?: string;
  fromDate?: string;
  toDate?: string;
  forceFull?: boolean;
  financialYears?: string[]; // e.g. ['2021-2022', '2022-2023', '2023-2024', '2024-2025', '2025-2026']
}

export class ZerodhaConsoleDownloader {
  private static instance: ZerodhaConsoleDownloader;
  private isRunning: boolean = false;

  private constructor() {}

  public static getInstance(): ZerodhaConsoleDownloader {
    if (!ZerodhaConsoleDownloader.instance) {
      ZerodhaConsoleDownloader.instance = new ZerodhaConsoleDownloader();
    }
    return ZerodhaConsoleDownloader.instance;
  }

  /**
   * Launch automated browser to navigate Console, download tradebooks, and ingest
   */
  public async autoDownloadAndSync(options: ConsoleDownloadOptions = {}): Promise<{
    success: boolean;
    downloadedCount: number;
    syncResult?: any;
    message: string;
    syncPeriod?: { fromDate: string; toDate: string; isIncremental: boolean };
  }> {
    if (this.isRunning) {
      throw new Error('An automated Console download is already in progress.');
    }

    this.isRunning = true;
    const downloadsDir = path.join(os.homedir(), 'Downloads');
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let isPersistentContext = false;
    let downloadedFilesCount = 0;
    let connectedViaCDP = false;

    const svc = ZerodhaTradebookService.getInstance();
    let fromDate = options.fromDate;
    let toDate = options.toDate || new Date().toISOString().split('T')[0];
    let isIncremental = false;

    if (options.portfolio && !options.forceFull && !fromDate) {
      const cp = await svc.getSyncCheckpoint(options.portfolio);
      fromDate = cp.proposedFromDate;
      toDate = cp.proposedToDate;
      isIncremental = cp.isIncremental;
      console.log(`[ZerodhaConsoleDownloader] Target portfolio: ${options.portfolio} | Sync Mode: ${isIncremental ? 'INCREMENTAL' : 'FULL'} | Period: ${fromDate} to ${toDate}`);
    }

    try {
      console.log('[ZerodhaConsoleDownloader] Launching automated browser for Zerodha Console...');
      
      // Try to connect to existing Chrome with remote debugging on port 9222 first
      connectedViaCDP = false;
      try {
        const cdpRes = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
        if (cdpRes.ok) {
          browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
          context = browser.contexts()[0] || await browser.newContext({ acceptDownloads: true });
          connectedViaCDP = true;
          console.log('[ZerodhaConsoleDownloader] Connected to existing open Chrome via CDP port 9222.');
        }
      } catch {}

      if (!connectedViaCDP) {
        const userDataDir = path.join(os.homedir(), '.wealthos_zerodha_chrome');
        if (!fs.existsSync(userDataDir)) {
          fs.mkdirSync(userDataDir, { recursive: true });
        }

        try {
          context = await chromium.launchPersistentContext(userDataDir, {
            channel: 'chrome',
            headless: options.headless !== undefined ? options.headless : false,
            acceptDownloads: true,
            args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
          });
          isPersistentContext = true;
        } catch {
          browser = await chromium.launch({
            headless: options.headless !== undefined ? options.headless : false,
            args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
          });
          context = await browser.newContext({
            acceptDownloads: true,
            viewport: null
          });
        }
      }

      // If we have an active session in ZerodhaSyncService, inject its cookies into context
      const session = ZerodhaSyncService.getInstance().getSession();
      if (session && session.enctoken) {
        try {
          await context!.addCookies([
            { name: 'enctoken', value: session.enctoken, domain: '.zerodha.com', path: '/' },
            { name: 'user_id', value: session.user_id || 'User', domain: '.zerodha.com', path: '/' }
          ]);
          console.log(`[ZerodhaConsoleDownloader] Injected session cookies for user: ${session.user_id}`);
        } catch (cookieErr) {
          console.warn('[ZerodhaConsoleDownloader] Warning adding cookies:', cookieErr);
        }
      }

      const page = context!.pages()[0] || await context!.newPage();
      page.setDefaultTimeout(30000);

      console.log('[ZerodhaConsoleDownloader] Navigating to Zerodha Console Tradebook...');
      await page.goto('https://console.zerodha.com/reports/tradebook', { waitUntil: 'domcontentloaded' }).catch(() => {});

      // Check if redirected to Kite login
      if (page.url().includes('kite.zerodha.com') || page.url().includes('/login')) {
        console.log('[ZerodhaConsoleDownloader] Awaiting user login to Zerodha Console (up to 45 seconds)...');
        try {
          await page.waitForURL(/console\.zerodha\.com\/reports/, { timeout: 45000 });
        } catch {
          throw new Error('Zerodha Console login timed out. Since your tradebook is already open in another tab, simply download the CSV/XLSX from Console and click "1-Click Scan & Ingest All Downloads"!');
        }
      }

      // Wait for tradebook container or download button
      await page.waitForTimeout(2500);

      // Look for Download button on the page
      const downloadButtonSelector = 'button:has-text("Download"), a:has-text("Download"), .download-btn, [data-balloon*="Download"]';
      const hasDownloadBtn = await page.$(downloadButtonSelector).catch(() => null);

      if (hasDownloadBtn) {
        console.log('[ZerodhaConsoleDownloader] Found tradebook Download button. Triggering download...');
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 20000 }),
          page.click(downloadButtonSelector)
        ]);

        const suggestedFilename = download.suggestedFilename();
        const destPath = path.join(downloadsDir, suggestedFilename);
        await download.saveAs(destPath);
        console.log(`[ZerodhaConsoleDownloader] Successfully downloaded: ${destPath}`);
        downloadedFilesCount++;
      } else {
        console.log('[ZerodhaConsoleDownloader] Download button not immediately visible, triggering folder scan...');
      }

      // Close automated page/context if launched separately
      if (!connectedViaCDP) {
        if (isPersistentContext) {
          await context?.close().catch(() => {});
        } else {
          await browser?.close().catch(() => {});
        }
      }

      // Trigger automatic scan & ingestion of all downloaded files
      console.log('[ZerodhaConsoleDownloader] Invoking Downloads auto-scanner and FIFO sync...');
      const syncResult = await ZerodhaTradebookService.getInstance().scanAndIngestDownloadsFolder(downloadsDir);

      return {
        success: true,
        downloadedCount: downloadedFilesCount,
        syncResult,
        syncPeriod: fromDate ? { fromDate, toDate, isIncremental } : undefined,
        message: `Successfully processed Downloads tradebooks! Ingested ${syncResult.totalNewTradesInserted} trades across ${syncResult.accounts.length} accounts (${isIncremental ? `Incremental: ${fromDate} to ${toDate}` : 'Full History'}).`
      };

    } catch (err: any) {
      console.error('[ZerodhaConsoleDownloader] Automation failed:', err);
      if (context && !connectedViaCDP) {
        try {
          if (isPersistentContext) await context.close();
          else await browser?.close();
        } catch {}
      }
      throw err;
    } finally {
      this.isRunning = false;
    }
  }
}
