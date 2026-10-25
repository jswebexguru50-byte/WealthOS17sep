import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { extractUpstoxLiveQuote } from '../../src/server/yahooFinance.js';

describe('Upstox live quote', () => {
  it('preserves LTP and provider previous close', () => {
    const quote = extractUpstoxLiveQuote({
      data: {
        'NSE_EQ:INE009A01021': {
          instrument_token: 'NSE_EQ|INE009A01021',
          last_price: 1542.35,
          cp: 1520.1,
        },
      },
    }, 'NSE_EQ|INE009A01021');

    assert.deepEqual(quote, { lastPrice: 1542.35, previousClose: 1520.1 });
  });

  it('rejects missing or non-positive LTP rather than inventing a price', () => {
    assert.equal(extractUpstoxLiveQuote({ data: { 'NSE_EQ|INE009A01021': { cp: 1520.1 } } }, 'NSE_EQ|INE009A01021'), null);
    assert.equal(extractUpstoxLiveQuote({ data: { 'NSE_EQ|INE009A01021': { last_price: 0 } } }, 'NSE_EQ|INE009A01021'), null);
  });
});
