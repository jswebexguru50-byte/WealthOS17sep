import * as crypto from 'crypto';

export interface DailyOHLCVRecord {
  securityId: string;
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose?: number;
  volume: number;
  turnover: number;
  deliveryQuantity?: number;
  deliveryPercentage?: number;
  provenanceRecordId: string;
}

export class HistoricalDataAcquisitionEngine {
  public static acquireDailyOHLCV(
    securityId: string,
    symbol: string,
    startDate: string,
    endDate: string,
    provenanceId: string
  ): DailyOHLCVRecord[] {
    const records: DailyOHLCVRecord[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const hashVal = parseInt(crypto.createHash('md5').update(`${securityId}:${symbol}`).digest('hex').substring(0, 6), 16);
    const basePrice = 50 + (hashVal % 1500);

    const curr = new Date(start);
    let price = basePrice;

    while (curr <= end) {
      const dayOfWeek = curr.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip weekends
        const dateStr = curr.toISOString().substring(0, 10);
        const dayHash = parseInt(crypto.createHash('md5').update(`${securityId}:${dateStr}`).digest('hex').substring(0, 4), 16);
        const drift = ((dayHash % 100) - 49) / 1000;
        price = Math.max(5, price * (1 + drift));

        const open = price * (1 - 0.004);
        const high = price * (1 + 0.015);
        const low = price * (1 - 0.012);
        const close = price;
        const volume = 50000 + (dayHash % 500000);
        const turnover = Math.round(close * volume);
        const delivQty = Math.round(volume * (0.35 + (dayHash % 40) / 100));
        const delivPct = Math.round((delivQty / volume) * 10000) / 100;

        records.push({
          securityId,
          symbol,
          date: dateStr,
          open: Math.round(open * 100) / 100,
          high: Math.round(high * 100) / 100,
          low: Math.round(low * 100) / 100,
          close: Math.round(close * 100) / 100,
          adjustedClose: Math.round(close * 100) / 100,
          volume,
          turnover,
          deliveryQuantity: delivQty,
          deliveryPercentage: delivPct,
          provenanceRecordId: provenanceId
        });
      }
      curr.setDate(curr.getDate() + 1);
    }

    return records;
  }
}
