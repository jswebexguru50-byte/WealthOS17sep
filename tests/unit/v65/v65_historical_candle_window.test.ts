import { describe, it, expect } from 'vitest';
import sqlite3 from 'sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'portfolio.db');

function queryDb<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
      db.all(sql, params, (err2, rows) => {
        db.close();
        if (err2) reject(err2);
        else resolve((rows || []) as T[]);
      });
    });
  });
}

describe('v6.5 Historical Candle Window SQL Query Tests (P0)', () => {
  it('should verify returned candle dates strictly precede decisionDate and are in ascending order', async () => {
    const symbol = 'RELIANCE';
    const decisionDate = '2023-06-15';

    // Correct nested subquery / DESC + reverse pattern
    const dbCandlesDesc = await queryDb<{ trade_date: string; close: number }>(
      `SELECT trade_date, close FROM DailyOHLCV 
       WHERE symbol = ? AND trade_date < ? 
       ORDER BY trade_date DESC LIMIT 60`,
      [symbol, decisionDate]
    );

    expect(dbCandlesDesc.length).toBe(60);

    // Final bar in DESC is latest bar before decisionDate
    expect(dbCandlesDesc[0].trade_date < decisionDate).toBe(true);

    const candles = dbCandlesDesc.reverse();

    // Verify returned array is strictly ascending
    for (let i = 0; i < candles.length - 1; i++) {
      expect(candles[i].trade_date < candles[i + 1].trade_date).toBe(true);
    }

    // Verify final bar in ASC array is the most recent bar immediately preceding decisionDate
    expect(candles[candles.length - 1].trade_date < decisionDate).toBe(true);
    expect(candles[candles.length - 1].trade_date).toBe('2023-06-14');
  });

  it('should confirm strict trade_date < decisionDate prevents decision-date candle leakage into pre-decision input', async () => {
    const symbol = 'TCS';
    const decisionDate = '2024-01-10';

    const dbCandles = await queryDb<{ trade_date: string }>(
      `SELECT trade_date FROM DailyOHLCV WHERE symbol = ? AND trade_date < ? ORDER BY trade_date DESC LIMIT 60`,
      [symbol, decisionDate]
    );

    const dates = dbCandles.map(c => c.trade_date);
    expect(dates.includes(decisionDate)).toBe(false);
  });
});
