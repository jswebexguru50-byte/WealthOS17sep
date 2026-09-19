/**
 * WealthOS v6.6 - PIT Context & Research Clock
 * Agent E Deliverable
 * 
 * SPEC MANDATE:
 * - MarketSessionContext awareness for Asia/Kolkata.
 * - Deterministic ResearchClock: forbids live system clock leakage during replay.
 */

import crypto from 'crypto';
import { MarketSessionContext } from '../data/PITDataValidator.js';

export class PITContext {
  private readonly sessionContext = new MarketSessionContext();
  public readonly decisionDate: string; // YYYY-MM-DD
  public readonly decisionTimestamp: string; // ISO Asia/Kolkata
  public readonly contextHash: string;

  constructor(decisionDate: string, dataset = 'DailyOHLCV') {
    this.decisionDate = decisionDate;
    this.decisionTimestamp = this.sessionContext.getDecisionTimestamp(decisionDate, dataset);
    this.contextHash = crypto
      .createHash('sha256')
      .update(`${this.decisionDate}|${this.decisionTimestamp}`)
      .digest('hex');
  }

  public static createForDate(decisionDate: string, dataset = 'DailyOHLCV'): PITContext {
    return new PITContext(decisionDate, dataset);
  }

  /**
   * Deterministic clock for economic replay engines.
   * Prohibits new Date() or Date.now() in replay logic.
   */
  public getClock(): ResearchClock {
    return new ResearchClock(this);
  }
}

export class ResearchClock {
  constructor(private readonly pitContext: PITContext) {}

  public get decisionDate(): string {
    return this.pitContext.decisionDate;
  }

  public get decisionTimestamp(): string {
    return this.pitContext.decisionTimestamp;
  }

  /**
   * Prohibits live system clock usage
   */
  public now(): never {
    throw new Error(
      'FORBIDDEN: Live system clock access detected in deterministic research replay. Use decisionTimestamp instead.'
    );
  }
}
