import { Database } from 'sqlite3';
import { CanonicalFactsService, type CanonicalFact } from './CanonicalFactsService.js';

export interface TechnicalSignal {
  symbol: string;
  rsi: number | null;
  ema: number | null;
  momentum: number | null;
  timestamp: string;
  quality_flag: 'NORMAL' | 'DEGRADED_QUALITY';
}

/**
 * ScannerCanonicalService
 *
 * Generates technical trading signals by consuming canonical market facts.
 * This service replaces legacy metric-based analysis with canonical facts,
 * ensuring consistent, auditable technical analysis.
 *
 * Key responsibilities:
 * - Analyze symbols using canonical fact OHLCV data
 * - Calculate technical indicators (RSI, EMA, Momentum)
 * - Enforce canonical facts usage (reject legacy metrics paths)
 * - Maintain audit trail of signal generation
 * - Handle sparse/degraded data gracefully
 */
export class ScannerCanonicalService {
  private static instance: ScannerCanonicalService;
  private db: Database | null = null;
  private canonicalFactsService: CanonicalFactsService;
  private auditLog: string[] = [];

  private constructor() {
    this.canonicalFactsService = CanonicalFactsService.getInstance();
  }

  static getInstance(): ScannerCanonicalService {
    if (!ScannerCanonicalService.instance) {
      ScannerCanonicalService.instance = new ScannerCanonicalService();
    }
    return ScannerCanonicalService.instance;
  }

  setDatabase(db: Database): void {
    this.db = db;
  }

  /**
   * Analyze symbol using canonical facts and generate technical signals
   *
   * @param symbol - Stock symbol to analyze
   * @param startDate - Start date for analysis (YYYY-MM-DD format)
   * @param endDate - End date for analysis (YYYY-MM-DD format)
   * @returns Technical signal with RSI, EMA, Momentum
   * @throws Error if canonical facts are unavailable
   */
  async analyze(symbol: string, startDate: string, endDate: string): Promise<TechnicalSignal> {
    // TODO: Implement analysis logic
    // 1. Verify canonical facts are enabled
    if (!this.canonicalFactsService.isCanonicalFactsEnabled()) {
      throw new Error('Canonical facts not enabled for Scanner');
    }

    // 2. Retrieve canonical facts (not legacy metrics)
    const facts = await this.canonicalFactsService.getFactsBySymbolAndDateRange(
      symbol,
      startDate,
      endDate
    );

    // 3. Validate facts exist
    if (!facts || facts.length === 0) {
      throw new Error(`No canonical facts found for symbol ${symbol}`);
    }

    // 4. Calculate technical indicators
    const rsi = this.calculateRSI(facts);
    const ema = this.calculateEMA(facts);
    const momentum = this.calculateMomentum(facts);

    // 5. Determine quality flag
    const qualityFlag = facts.length > 10 ? 'NORMAL' : 'DEGRADED_QUALITY';

    // 6. Audit log
    this.auditLog.push(
      `[ANALYZE] Symbol: ${symbol}, Facts: ${facts.length}, RSI: ${rsi?.toFixed(2)}, EMA: ${ema?.toFixed(2)}, Momentum: ${momentum?.toFixed(2)}, Quality: ${qualityFlag}`
    );

    return {
      symbol,
      rsi,
      ema,
      momentum,
      timestamp: facts[facts.length - 1].timestamp,
      quality_flag: qualityFlag
    };
  }

  /**
   * Calculate Relative Strength Index (RSI) from canonical facts
   * @param facts - Array of canonical facts
   * @returns RSI value (0-100)
   */
  private calculateRSI(facts: CanonicalFact[]): number {
    // TODO: Implement RSI calculation
    // 1. Calculate price changes between consecutive candles
    // 2. Sum gains and losses
    // 3. Calculate average gain and average loss
    // 4. Calculate RS = avgGain / avgLoss
    // 5. Return RSI = 100 - (100 / (1 + RS))

    if (facts.length < 2) return 50;
    return 50; // Stub return
  }

  /**
   * Calculate Exponential Moving Average (EMA) from canonical facts
   * @param facts - Array of canonical facts
   * @returns EMA value
   */
  private calculateEMA(facts: CanonicalFact[]): number {
    // TODO: Implement EMA calculation
    // 1. Use close prices from canonical facts
    // 2. Apply exponential weighting: k = 2 / (n + 1)
    // 3. Calculate: EMA_t = price_t * k + EMA_(t-1) * (1 - k)

    if (facts.length === 0) return 0;
    return facts[facts.length - 1].close_price; // Stub return
  }

  /**
   * Calculate Momentum from canonical facts
   * @param facts - Array of canonical facts
   * @returns Momentum percentage
   */
  private calculateMomentum(facts: CanonicalFact[]): number {
    // TODO: Implement Momentum calculation
    // Momentum = ((Current Close - Close N periods ago) / Close N periods ago) * 100

    if (facts.length < 2) return 0;
    return 0; // Stub return
  }

  /**
   * Get audit log of signal generation
   * @returns Array of audit log entries
   */
  getAuditLog(): string[] {
    return this.auditLog;
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }
}

export default ScannerCanonicalService;
