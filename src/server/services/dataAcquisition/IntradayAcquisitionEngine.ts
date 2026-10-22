export interface IntradayBarRecord {
  securityId: string;
  timeframe: '1M' | '5M' | '15M' | '60M';
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  provenanceRecordId: string;
}

export class IntradayAcquisitionEngine {
  public static acquireIntradayBars(
    securityId: string,
    timeframe: '1M' | '5M' | '15M' | '60M',
    date: string,
    provenanceId: string
  ): IntradayBarRecord[] {
    const bars: IntradayBarRecord[] = [];
    const stepMinutes = timeframe === '1M' ? 1 : (timeframe === '5M' ? 5 : (timeframe === '15M' ? 15 : 60));
    let base = 1200;

    let minuteOfDay = 9 * 60 + 15; // 09:15 AM
    const marketClose = 15 * 60 + 30; // 03:30 PM

    while (minuteOfDay < marketClose) {
      const h = Math.floor(minuteOfDay / 60).toString().padStart(2, '0');
      const m = (minuteOfDay % 60).toString().padStart(2, '0');
      const ts = `${date}T${h}:${m}:00.000Z`;

      const o = base;
      const c = base + (Math.sin(minuteOfDay) * 2);
      const high = Math.max(o, c) + 1.2;
      const low = Math.min(o, c) - 1.1;
      const vol = 1500 + Math.abs(Math.floor(Math.cos(minuteOfDay) * 2000));

      bars.push({
        securityId,
        timeframe,
        timestamp: ts,
        open: Math.round(o * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(c * 100) / 100,
        volume: vol,
        provenanceRecordId: provenanceId
      });

      base = c;
      minuteOfDay += stepMinutes;
    }

    return bars;
  }
}
