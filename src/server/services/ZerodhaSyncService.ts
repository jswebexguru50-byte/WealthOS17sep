/**
 * src/server/services/ZerodhaSyncService.ts
 * Direct Zerodha Kite API & Enctoken Ingestion Service
 * Supports official Kite Connect token, web enctoken session, 1-click browser auto-detect,
 * 1-click bookmarklet push, and connected browser launching.
 */
import { DatabaseManager } from './DatabaseManager.js';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

export interface ZerodhaHoldingRaw {
  tradingsymbol: string;
  exchange: string;
  isin: string;
  quantity: number;
  t1_quantity?: number;
  realised_quantity?: number;
  average_price: number;
  last_price: number;
  close_price?: number;
  pnl?: number;
  day_change?: number;
  day_change_percentage?: number;
}

export interface ZerodhaSyncResult {
  success: boolean;
  portfolio: string;
  syncedAt: string;
  totalHoldings: number;
  totalValuation: number;
  totalInvested: number;
  unrealizedPnl: number;
  items: Array<{
    symbol: string;
    isin: string;
    quantity: number;
    avgPrice: number;
    lastPrice: number;
    currentValue: number;
    pnl: number;
  }>;
  message?: string;
  error?: string;
}

export class ZerodhaSyncService {
  private static instance: ZerodhaSyncService;
  private lastDetectedSession: { enctoken: string; user_id?: string; timestamp: number } | null = null;
  private browserLaunchInProgress: boolean = false;

  private constructor() {}

  public static getInstance(): ZerodhaSyncService {
    if (!ZerodhaSyncService.instance) {
      ZerodhaSyncService.instance = new ZerodhaSyncService();
    }
    return ZerodhaSyncService.instance;
  }

  /**
   * Set session token from external push (e.g., bookmarklet, extension, or console snippet)
   */
  public setSession(enctoken: string, user_id?: string): void {
    const cleanToken = enctoken.trim();
    if (!cleanToken) return;

    this.lastDetectedSession = {
      enctoken: cleanToken,
      user_id: (user_id && user_id.trim()) ? user_id.trim() : 'Zerodha User',
      timestamp: Date.now()
    };
    (globalThis as any).__wealthos_zerodha_session = this.lastDetectedSession;
    console.log(`[ZerodhaSyncService] Session linked successfully for user: ${this.lastDetectedSession.user_id}`);
  }

  /**
   * Retrieve active session from instance or global scope
   */
  public getSession(): { enctoken: string; user_id?: string; timestamp: number } | null {
    return this.lastDetectedSession || (globalThis as any).__wealthos_zerodha_session || null;
  }

  /**
   * Clear any cached session
   */
  public clearSession(): void {
    this.lastDetectedSession = null;
    delete (globalThis as any).__wealthos_zerodha_session;
    console.log('[ZerodhaSyncService] Session cleared.');
  }

  /**
   * Automatically detect active Zerodha session & enctoken from the user's open browser tab
   * Connects via Chrome DevTools Protocol across ports 9222, 9223, 9224, 9225, 9229, 9333
   */
  public async autoDetectSessionFromBrowser(): Promise<{
    success: boolean;
    enctoken?: string;
    user_id?: string;
    pageTitle?: string;
    error?: string;
  }> {
    // 1. Check if we have a fresh pushed session (< 4 hours old)
    const session = this.getSession();
    if (session && (Date.now() - session.timestamp < 4 * 3600 * 1000)) {
      this.lastDetectedSession = session;
      return {
        success: true,
        enctoken: session.enctoken,
        user_id: session.user_id,
        pageTitle: 'Connected Zerodha Session'
      };
    }

    // 2. Check Chrome / Edge DevTools Protocol ports
    const cdpPorts = [9222, 9223, 9224, 9225, 9229, 9333];

    for (const port of cdpPorts) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1200) });
        if (!res.ok) continue;

        const pages = await res.json();
        if (!Array.isArray(pages)) continue;

        const zerodhaPage = pages.find((p: any) => p.url && (p.url.includes('kite.zerodha.com') || p.url.includes('console.zerodha.com') || p.url.includes('zerodha.com')));
        if (!zerodhaPage || !zerodhaPage.webSocketDebuggerUrl) continue;

        const cookieResult: any = await new Promise((resolve) => {
          try {
            const ws = new WebSocket(zerodhaPage.webSocketDebuggerUrl);
            const timer = setTimeout(() => {
              try { ws.close(); } catch {}
              resolve(null);
            }, 3500);

            ws.on('open', () => {
              // 1. Enable Network
              ws.send(JSON.stringify({ id: 100, method: 'Network.enable' }));
              // 2. Query cookies via Network
              ws.send(JSON.stringify({
                id: 101,
                method: 'Network.getCookies',
                params: { urls: ['https://kite.zerodha.com', 'https://console.zerodha.com'] }
              }));
              // 3. Query cookies via Storage
              ws.send(JSON.stringify({
                id: 102,
                method: 'Storage.getCookies'
              }));
              // 4. Also evaluate document.cookie
              ws.send(JSON.stringify({
                id: 103,
                method: 'Runtime.evaluate',
                params: {
                  expression: `(() => {
                    const c = document.cookie;
                    const u = document.querySelector('.user-id')?.innerText || document.querySelector('.avatar')?.innerText || '';
                    return { cookie: c, user_id: u };
                  })()`,
                  returnByValue: true
                }
              }));
            });

            ws.on('message', (data: any) => {
              try {
                const resp = JSON.parse(data.toString());
                
                // Check Network.getCookies / Storage.getCookies
                if ((resp.id === 101 || resp.id === 102) && resp.result?.cookies) {
                  const cookies = resp.result.cookies;
                  const enctoken = cookies.find((c: any) => c.name === 'enctoken')?.value;
                  const user_id = cookies.find((c: any) => c.name === 'user_id')?.value;
                  if (enctoken) {
                    clearTimeout(timer);
                    ws.close();
                    resolve({ enctoken, user_id });
                    return;
                  }
                }

                // Check Runtime.evaluate result
                if (resp.id === 103 && resp.result?.result?.value) {
                  const val = resp.result.result.value;
                  if (val.cookie && typeof val.cookie === 'string') {
                    const match = val.cookie.match(/(?:^|;\s*)enctoken=([^;]+)/);
                    if (match && match[1]) {
                      const userMatch = val.cookie.match(/(?:^|;\s*)user_id=([^;]+)/);
                      clearTimeout(timer);
                      ws.close();
                      resolve({
                        enctoken: decodeURIComponent(match[1]),
                        user_id: val.user_id || (userMatch ? decodeURIComponent(userMatch[1]) : undefined)
                      });
                      return;
                    }
                  }
                }
              } catch {
                // keep waiting or timeout
              }
            });

            ws.on('error', () => {
              clearTimeout(timer);
              resolve(null);
            });
          } catch {
            resolve(null);
          }
        });

        if (cookieResult && cookieResult.enctoken) {
          this.setSession(cookieResult.enctoken, cookieResult.user_id);

          return {
            success: true,
            enctoken: cookieResult.enctoken,
            user_id: cookieResult.user_id || 'Active User',
            pageTitle: zerodhaPage.title || 'Zerodha Kite'
          };
        }
      } catch {
        // try next port
      }
    }

    return {
      success: false,
      error: 'No active Zerodha Kite tab detected via DevTools protocol. Standard browsers require remote debugging or the 1-Click Bookmarklet to read open tabs.'
    };
  }

  /**
   * Launch a connected Chrome / Edge window with remote debugging enabled
   * pointing directly to kite.zerodha.com
   */
  public async launchConnectedBrowser(): Promise<{
    success: boolean;
    message: string;
    browserType?: string;
  }> {
    if (this.browserLaunchInProgress) {
      return { success: true, message: 'Browser launch is already running.' };
    }

    this.browserLaunchInProgress = true;
    try {
      const isWindows = process.platform === 'win32';
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      ];

      let executablePath = '';
      if (isWindows) {
        for (const p of chromePaths) {
          if (fs.existsSync(p)) {
            executablePath = p;
            break;
          }
        }
      }

      const userDataDir = path.join(os.homedir(), '.wealthos_zerodha_chrome');
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }

      if (executablePath) {
        console.log(`[ZerodhaSyncService] Spawning connected browser: ${executablePath}`);
        const child = spawn(executablePath, [
          '--remote-debugging-port=9222',
          `--user-data-dir=${userDataDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          'https://kite.zerodha.com'
        ], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();

        // Start background poller to auto-capture token as soon as user logs in
        this.pollForLoginToken(120000);

        return {
          success: true,
          browserType: executablePath.includes('msedge') ? 'Microsoft Edge' : 'Google Chrome',
          message: 'Connected browser launched on port 9222! Log in on the browser window, and your session will be auto-detected.'
        };
      }

      // Fallback: try using Playwright channel if executable wasn't found in default path
      try {
        const { chromium } = await import('playwright');
        const context = await chromium.launchPersistentContext(userDataDir, {
          channel: 'chrome',
          headless: false,
          args: ['--remote-debugging-port=9222', '--start-maximized']
        });
        const page = context.pages()[0] || await context.newPage();
        await page.goto('https://kite.zerodha.com');

        this.pollForLoginToken(120000);

        return {
          success: true,
          browserType: 'Playwright Chrome',
          message: 'Connected Chrome window opened! Log in to Zerodha and your session will be captured automatically.'
        };
      } catch (pwErr: any) {
        throw new Error(`Could not find Chrome/Edge on system: ${pwErr.message}`);
      }
    } catch (err: any) {
      console.error('[ZerodhaSyncService] Browser launch failed:', err);
      return {
        success: false,
        message: `Failed to launch connected browser: ${err.message}`
      };
    } finally {
      this.browserLaunchInProgress = false;
    }
  }

  /**
   * Polls CDP or persistent session for login token up to maxDurationMs
   */
  private async pollForLoginToken(maxDurationMs: number = 60000): Promise<void> {
    const startTime = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - startTime > maxDurationMs) {
        clearInterval(interval);
        return;
      }
      try {
        const res = await this.autoDetectSessionFromBrowser();
        if (res.success && res.enctoken) {
          console.log('[ZerodhaSyncService] Successfully auto-captured token from connected browser window!');
          clearInterval(interval);
        }
      } catch {}
    }, 2500);
  }

  /**
   * Fetch live holdings from Zerodha Kite via enctoken or Kite Connect access token
   */
  public async syncHoldings(
    token: string, 
    tokenType: 'ENCTOKEN' | 'KITE_CONNECT', 
    portfolioName: string = 'Self',
    apiKey?: string
  ): Promise<ZerodhaSyncResult> {
    const isKiteConnect = tokenType === 'KITE_CONNECT';
    const authHeader = isKiteConnect
      ? `token ${apiKey || ''}:${token.trim()}`
      : `enctoken ${token.trim()}`;

    const url = isKiteConnect
      ? 'https://api.kite.trade/portfolio/holdings'
      : 'https://kite.zerodha.com/oms/portfolio/holdings';

    try {
      console.log(`[ZerodhaSyncService] Initiating sync for portfolio: "${portfolioName}", method: ${tokenType}`);
      const headers: Record<string, string> = {
        'Authorization': authHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      };

      if (isKiteConnect) {
        headers['X-Kite-Version'] = '3';
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        let errDetail = response.statusText;
        try {
          const errJson: any = await response.json();
          if (errJson && errJson.message) {
            errDetail = errJson.message;
          }
        } catch {}
        throw new Error(`Zerodha API error (${response.status}): ${errDetail}`);
      }

      const json: any = await response.json();
      if (json.status !== 'success' || !Array.isArray(json.data)) {
        throw new Error(json.message || 'Invalid response format received from Zerodha Kite');
      }

      const holdings: ZerodhaHoldingRaw[] = json.data;
      const db = DatabaseManager.getInstance();

      // Clear existing ZerodhaHoldings for this portfolio to maintain latest state
      await db.execute('DELETE FROM ZerodhaHoldings WHERE portfolio = ?', [portfolioName]).catch(() => {});

      let totalVal = 0;
      let totalCost = 0;
      const syncedItems: any[] = [];

      for (const h of holdings) {
        const totalQty = (h.quantity || 0) + (h.t1_quantity || 0);
        if (totalQty <= 0) continue;

        const val = totalQty * (h.last_price || h.average_price || 0);
        const cost = totalQty * (h.average_price || 0);
        const pnl = val - cost;

        totalVal += val;
        totalCost += cost;

        await db.execute(`
          INSERT INTO ZerodhaHoldings (
            portfolio, isin, symbol, name, quantity, avg_price, current_price, current_value, pnl, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          portfolioName,
          h.isin || '',
          h.tradingsymbol,
          h.tradingsymbol,
          totalQty,
          h.average_price,
          h.last_price,
          val,
          pnl
        ]).catch((err) => {
          console.error('[ZerodhaSyncService] Database insert error for symbol', h.tradingsymbol, err);
        });

        // Upsert into MasterTickers
        if (h.isin) {
          await db.execute(`
            INSERT INTO MasterTickers (isin, symbol, name, last_price)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(isin) DO UPDATE SET
              last_price = excluded.last_price,
              symbol = COALESCE(MasterTickers.symbol, excluded.symbol)
          `, [h.isin, h.tradingsymbol, h.tradingsymbol, h.last_price]).catch(() => {});
        }

        syncedItems.push({
          symbol: h.tradingsymbol,
          isin: h.isin,
          quantity: totalQty,
          avgPrice: h.average_price,
          lastPrice: h.last_price,
          currentValue: val,
          pnl
        });
      }

      return {
        success: true,
        portfolio: portfolioName,
        syncedAt: new Date().toISOString(),
        totalHoldings: syncedItems.length,
        totalValuation: totalVal,
        totalInvested: totalCost,
        unrealizedPnl: totalVal - totalCost,
        items: syncedItems,
        message: `Successfully synchronized ${syncedItems.length} holdings from Zerodha Kite.`
      };

    } catch (err: any) {
      console.error('[ZerodhaSyncService] Sync failed:', err);
      return {
        success: false,
        portfolio: portfolioName,
        syncedAt: new Date().toISOString(),
        totalHoldings: 0,
        totalValuation: 0,
        totalInvested: 0,
        unrealizedPnl: 0,
        items: [],
        error: err.message
      };
    }
  }
}
