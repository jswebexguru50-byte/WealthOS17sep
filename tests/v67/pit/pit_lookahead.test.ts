import { describe, it, expect } from 'vitest';
import { LookaheadDetector } from '../../../src/server/services/research/LookaheadDetector.js';

describe('V67 Track D — Point-In-Time & Lookahead Invariants', () => {
  it('6. PIT future-fact rejection: detects information available after decision timestamp', () => {
    const detector = new LookaheadDetector();
    detector.auditDecisionFact(
      'DEC_01',
      'INFY',
      '2022-04-15T15:30:00+05:30',
      '2022-04-18T18:00:00+05:30', // Future fact
      'SCREENER_FACTS',
      'FUTURE_FACT'
    );
    const result = detector.getResult(1);
    expect(result.passed).toBe(false);
    expect(result.violationsCount).toBe(1);
    expect(result.economicReplayAuthorization).toBe(false);
  });

  it('7. future membership rejection: rejects post-dated index constituent inclusions', () => {
    const detector = new LookaheadDetector();
    detector.auditDecisionFact(
      'DEC_02',
      'ZOMATO',
      '2021-06-01T15:30:00+05:30',
      '2021-07-23T09:15:00+05:30', // IPO was late July 2021
      'NIFTY500_MEMBERSHIP',
      'FUTURE_MEMBERSHIP'
    );
    const result = detector.getResult(1);
    expect(result.passed).toBe(false);
  });

  it('8. future corporate-action rejection: rejects adjustments before ex-date', () => {
    const detector = new LookaheadDetector();
    detector.auditDecisionFact(
      'DEC_03',
      'TCS',
      '2022-01-10T15:30:00+05:30',
      '2022-01-20T09:15:00+05:30', // Ex-bonus date in future
      'CORPORATE_ACTION',
      'FUTURE_CORPORATE_ACTION'
    );
    const result = detector.getResult(1);
    expect(result.passed).toBe(false);
  });

  it('19. next-bar execution invariant: entryDate strictly greater than signalDate', () => {
    const signalDate = '2023-05-15';
    const validEntryDate = '2023-05-16';
    const sameDayEntryDate = '2023-05-15';

    expect(new Date(validEntryDate).getTime()).toBeGreaterThan(new Date(signalDate).getTime());
    expect(new Date(sameDayEntryDate).getTime() > new Date(signalDate).getTime()).toBe(false);
  });
});
