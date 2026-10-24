import { Database } from 'sqlite3';
import { CanonicalFactsService, type CanonicalFact } from './CanonicalFactsService.js';

export interface StrategyRecommendation {
  symbol: string;
  portfolio: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  regime: string | null;
  confidence: number;
  timestamp: string;
  canonical_facts_used: boolean;
}

/**
 * ITASCanonicalService (Intelligent Trading Analysis System)
 *
 * Executes strategy rules against canonical market facts to generate
 * buy/sell/hold recommendations. This service replaces legacy metric-based
 * strategy evaluation with canonical facts, ensuring consistent decision-making
 * across all portfolios.
 *
 * Key responsibilities:
 * - Evaluate strategy rules against canonical fact data
 * - Retrieve facts filtered by regime and strategy
 * - Generate recommendations for multiple portfolios
 * - Enforce canonical facts usage (reject legacy metrics)
 * - Maintain execution audit trail
 * - Handle regime transitions correctly
 */
export class ITASCanonicalService {
  private static instance: ITASCanonicalService;
  private db: Database | null = null;
  private canonicalFactsService: CanonicalFactsService;
  private auditLog: string[] = [];

  private constructor() {
    this.canonicalFactsService = CanonicalFactsService.getInstance();
  }

  static getInstance(): ITASCanonicalService {
    if (!ITASCanonicalService.instance) {
      ITASCanonicalService.instance = new ITASCanonicalService();
    }
    return ITASCanonicalService.instance;
  }

  setDatabase(db: Database): void {
    this.db = db;
  }

  /**
   * Evaluate strategy rules against canonical facts and generate recommendations
   *
   * @param regime - Market regime (e.g., 'BULL', 'BEAR', 'RANGE')
   * @param strategyId - Strategy identifier (e.g., 'S1', 'S2', 'S3')
   * @param symbols - Array of stock symbols to evaluate
   * @param portfolio - Portfolio identifier
   * @returns Array of buy/sell/hold recommendations
   * @throws Error if canonical facts unavailable or strategy invalid
   */
  async evaluateStrategy(
    regime: string,
    strategyId: string,
    symbols: string[],
    portfolio: string
  ): Promise<StrategyRecommendation[]> {
    // TODO: Implement strategy evaluation logic
    // 1. Verify canonical facts are enabled
    if (!this.canonicalFactsService.isCanonicalFactsEnabled()) {
      throw new Error('Canonical facts not enabled for ITAS');
    }

    // 2. Retrieve canonical facts filtered by regime and strategy
    const facts = await this.canonicalFactsService.getFactsByRegimeAndStrategy(
      regime,
      strategyId,
      symbols
    );

    // 3. Validate facts exist
    if (!facts || facts.length === 0) {
      throw new Error(
        `No canonical facts found for regime ${regime} and strategy ${strategyId}`
      );
    }

    // 4. Group facts by symbol
    const factsBySymbol = new Map<string, CanonicalFact[]>();
    for (const fact of facts) {
      if (!factsBySymbol.has(fact.symbol)) {
        factsBySymbol.set(fact.symbol, []);
      }
      factsBySymbol.get(fact.symbol)!.push(fact);
    }

    // 5. Evaluate rules for each symbol
    const recommendations: StrategyRecommendation[] = [];
    for (const [symbol, symbolFacts] of factsBySymbol) {
      const latestFact = symbolFacts[symbolFacts.length - 1];

      // 6. Skip if regime is null (degraded data)
      if (!latestFact.regime_indicator) {
        this.auditLog.push(
          `[SKIP] Symbol: ${symbol}, Regime: NULL, Action: SKIPPED (degraded data)`
        );
        continue;
      }

      // 7. Evaluate strategy rules
      const action = this.evaluateStrategyRules(symbol, strategyId, latestFact, symbolFacts);

      // 8. Create recommendation
      recommendations.push({
        symbol,
        portfolio,
        action,
        regime: latestFact.regime_indicator,
        confidence: 0.75,
        timestamp: latestFact.timestamp,
        canonical_facts_used: true
      });

      // 9. Audit log
      this.auditLog.push(
        `[EVALUATE] Symbol: ${symbol}, Regime: ${regime}, Strategy: ${strategyId}, Action: ${action}, Portfolio: ${portfolio}, Timestamp: ${latestFact.timestamp}`
      );
    }

    return recommendations;
  }

  /**
   * Evaluate strategy rules for a symbol based on canonical facts
   *
   * @param symbol - Stock symbol
   * @param strategyId - Strategy identifier
   * @param latestFact - Most recent canonical fact
   * @param history - Historical canonical facts
   * @returns Buy/Sell/Hold action
   */
  private evaluateStrategyRules(
    symbol: string,
    strategyId: string,
    latestFact: CanonicalFact,
    history: CanonicalFact[]
  ): 'BUY' | 'SELL' | 'HOLD' {
    // TODO: Implement strategy-specific rules
    // Example rules (customize per strategy):
    // - S1: Price trend + Volume confirmation
    // - S2: Momentum + Mean reversion
    // - S3: Support/Resistance breakout
    // - S4: Multiple timeframe confluence

    // Placeholder: Simple rule based on price and volume
    const avgVolume = history.reduce((sum, f) => sum + f.volume, 0) / history.length;
    const isHighVolume = latestFact.volume > avgVolume * 1.2;

    const isPriceUp =
      history.length > 1 && latestFact.close_price > history[history.length - 2].close_price;

    if (isPriceUp && isHighVolume) {
      return 'BUY';
    } else if (!isPriceUp && isHighVolume) {
      return 'SELL';
    }
    return 'HOLD';
  }

  /**
   * Get audit log of strategy evaluations
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

  /**
   * Verify canonical facts source in configuration
   * @returns true if canonical facts are the primary source
   */
  verifyCanonicalFactsSource(): boolean {
    // TODO: Check configuration
    // - Verify no LegacyMetricsService is being used
    // - Check canonical_facts_enabled flag
    // - Audit database queries for legacy_metrics references
    return true;
  }
}

export default ITASCanonicalService;
