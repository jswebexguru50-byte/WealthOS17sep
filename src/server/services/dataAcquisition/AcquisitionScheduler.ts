import { AcquisitionQueue } from './AcquisitionQueue';
import { SecurityUniverseProvider, SecurityUniverseRecord } from './SecurityUniverseProvider';

export class AcquisitionScheduler {
  private queue: AcquisitionQueue;
  private universeProvider: SecurityUniverseProvider;

  constructor(queue: AcquisitionQueue, universeProvider: SecurityUniverseProvider) {
    this.queue = queue;
    this.universeProvider = universeProvider;
  }

  public scheduleFullUniverseTasks(): void {
    const universe = this.universeProvider.getUniverseRecords();

    for (const sec of universe) {
      // P0: Master & Real-time Quote
      this.queue.enqueue(sec.securityId, sec.symbol, 'D1_SECURITY_MASTER', 'SRC_NSE_BHAVCOPY', 0);

      // P1: Historical Daily OHLCV (2020 to 2026)
      this.queue.enqueue(sec.securityId, sec.symbol, 'D2_DAILY_OHLCV', 'SRC_UPSTOX_V2', 1, '2020-01-01', '2026-09-18');

      // P2: Financial Statements
      this.queue.enqueue(sec.securityId, sec.symbol, 'D4_FINANCIAL_STATEMENTS', 'SRC_FERE_FUNDAMENTALS', 2);

      // P3: Corporate Actions & Shareholding
      this.queue.enqueue(sec.securityId, sec.symbol, 'D3_CORPORATE_ACTIONS', 'SRC_CORPORATE_ANNOUNCEMENTS', 3);
      this.queue.enqueue(sec.securityId, sec.symbol, 'D5_SHAREHOLDING', 'SRC_FERE_FUNDAMENTALS', 3);
      this.queue.enqueue(sec.securityId, sec.symbol, 'D6_EVENTS', 'SRC_CORPORATE_ANNOUNCEMENTS', 3);

      // P4: Intraday
      this.queue.enqueue(sec.securityId, sec.symbol, 'D7_INTRADAY', 'SRC_UPSTOX_V2', 4, '2026-09-18', '2026-09-18');

      // P5: Derivatives & Surveillance
      this.queue.enqueue(sec.securityId, sec.symbol, 'D8_FNO', 'SRC_UPSTOX_V2', 5, '2026-09-18', '2026-09-18');
      this.queue.enqueue(sec.securityId, sec.symbol, 'D10_SURVEILLANCE', 'SRC_NSE_BHAVCOPY', 5, '2026-09-18', '2026-09-18');
    }

    // Benchmark Indices
    this.queue.enqueue('NIFTY50', 'NIFTY50', 'D9_SECTOR_INDEX', 'SRC_NSE_BHAVCOPY', 0, '2026-09-18', '2026-09-18');
    this.queue.enqueue('NIFTY500', 'NIFTY500', 'D9_SECTOR_INDEX', 'SRC_NSE_BHAVCOPY', 0, '2026-09-18', '2026-09-18');

    this.queue.saveState();
  }
}
