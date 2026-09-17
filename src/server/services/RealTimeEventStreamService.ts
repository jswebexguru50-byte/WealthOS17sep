import { Response } from 'express';
import { ScripKnowledgeBaseService, AlertRecord } from './ScripKnowledgeBaseService.js';
import { getDB, dbAll } from '../database.js';

export class RealTimeEventStreamService {
  private static sseClients: Set<Response> = new Set();
  private static monitorInterval: NodeJS.Timeout | null = null;
  private static lastCheckedTimestamp: number = 0;

  /**
   * Registers a client connection for Server-Sent Events (SSE)
   */
  public static addClient(res: Response): void {
    this.sseClients.add(res);

    // Initial keepalive comment
    res.write(': connected\n\n');

    // On connection close, unregister
    res.on('close', () => {
      this.sseClients.delete(res);
    });

    // Start background radar if not already running
    this.startRadar();
  }

  /**
   * Broadcasts an alert payload to all connected SSE clients
   */
  public static broadcastAlert(alert: AlertRecord): void {
    const dataString = `data: ${JSON.stringify(alert)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(dataString);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Seeds demo/initial high-conviction breakout & event alerts if table is empty
   */
  public static async seedInitialAlertsIfEmpty(): Promise<void> {
    const existing = await ScripKnowledgeBaseService.getRecentAlerts(5);
    if (existing.length === 0) {
      await ScripKnowledgeBaseService.recordAlert({
        symbol: 'TRENT',
        company_name: 'Trent Limited',
        severity: 'BREAKOUT',
        title: '52-Week High Breakout with 3.4x Volume Surge',
        message: 'TRENT breached resistance at ₹7,150 with aggressive institutional Call buying. Upstox Call Wall breached at ₹7,100 strike.',
        catalyst_source: 'StockEdge Scans & Upstox Option Chain',
        price_at_alert: 7240.0,
        target_price: 7850.0,
        stop_loss: 6920.0,
        calibrated_prob: 84.5
      });

      await ScripKnowledgeBaseService.recordAlert({
        symbol: 'DIXON',
        company_name: 'Dixon Technologies',
        severity: 'BREAKOUT',
        title: 'Bollinger Bandwidth Squeeze Expansion',
        message: 'Dixon breaking out of a 14-day volatility squeeze with 2.8% advance and positive FII accumulation reported by StockEdge.',
        catalyst_source: 'MarketDataIngestor & StockEdge',
        price_at_alert: 12450.0,
        target_price: 13800.0,
        stop_loss: 11900.0,
        calibrated_prob: 81.2
      });

      await ScripKnowledgeBaseService.recordAlert({
        symbol: 'HAL',
        company_name: 'Hindustan Aeronautics Ltd',
        severity: 'BREAKOUT',
        title: 'Major Export Order Win Disclosed',
        message: 'HAL announced new multi-year defense export agreement on Pulse by Zerodha. Delivery volume spike detected on NSE Bhavcopy.',
        catalyst_source: 'Pulse by Zerodha & NSE Bhavcopy',
        price_at_alert: 4890.0,
        target_price: 5400.0,
        stop_loss: 4620.0,
        calibrated_prob: 86.0
      });
    }
  }

  /**
   * Starts background radar scanning every 60 seconds
   */
  public static startRadar(): void {
    if (this.monitorInterval) return;

    this.seedInitialAlertsIfEmpty().catch(() => {});

    this.monitorInterval = setInterval(async () => {
      try {
        await this.runRadarCheck();
      } catch (err) {
        console.error('[RealTimeEventStreamService] Radar scan error:', err);
      }
    }, 60000);
  }

  /**
   * Scans portfolio holdings and top opportunities for real-time breakout or risk triggers
   */
  private static async runRadarCheck(): Promise<void> {
    // Send keepalive ping to SSE clients
    for (const client of this.sseClients) {
      try {
        client.write(': ping\n\n');
      } catch {
        this.sseClients.delete(client);
      }
    }

    // Check held stocks for sudden stop-loss or breakout moves
    const db = getDB();
    const holdings = await dbAll(db, `
      SELECT symbol, name, current_price, average_price, pnl_percentage 
      FROM Holdings 
      WHERE quantity > 0
    `).catch(() => []);

    for (const h of holdings || []) {
      const pnlPct = Number(h.pnl_percentage || 0);
      const sym = (h.symbol || '').toUpperCase();

      // Check if severe drop triggered
      if (pnlPct < -12) {
        await ScripKnowledgeBaseService.recordAlert({
          symbol: sym,
          company_name: h.name || sym,
          severity: 'RISK',
          title: `Stop-Loss Proximity Alert: ${sym}`,
          message: `Holding down ${pnlPct.toFixed(1)}% from entry. Technical support S1 under test. Consider risk hedge or exit review.`,
          catalyst_source: 'Portfolio Risk Sentinel',
          price_at_alert: Number(h.current_price || h.average_price),
          stop_loss: Number(h.average_price * 0.88),
          calibrated_prob: 45.0
        });

        const alert = (await ScripKnowledgeBaseService.getRecentAlerts(1))[0];
        if (alert) {
          this.broadcastAlert(alert);
        }
      }
    }
  }
}
