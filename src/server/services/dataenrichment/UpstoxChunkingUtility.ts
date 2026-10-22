import { DataAcquisitionHttpClient } from './DataAcquisitionHttpClient';

export interface AcquisitionRequest {
  datasetId: string;
  instrumentKey: string;
  start: string;
  end: string;
  timeframe: string; // e.g. 'day', '15minute'
  chunkPolicy: string;
}

export interface ChunkedAcquisitionResult {
  allRows: any[];
  rawBytesChunks: Buffer[];
  requestedStart: string;
  requestedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  missingRanges: { start: string, end: string, reason: string }[];
  coverage: {
    expectedIntervals: number;
    observedIntervals: number;
    ratio: number;
  };
}

export async function fetchChunkedUpstoxData(
  request: AcquisitionRequest,
  client: DataAcquisitionHttpClient
): Promise<ChunkedAcquisitionResult> {
  const maxDaysPerChunk = request.timeframe === '15minute' ? 30 : 365;
  const startMs = new Date(request.start).getTime();
  const endMs = new Date(request.end).getTime();
  
  if (startMs >= endMs) {
    throw new Error('Acquisition window start must be before end');
  }

  const chunks = [];
  let currentMs = startMs;
  while (currentMs < endMs) {
    let nextMs = currentMs + (maxDaysPerChunk * 24 * 60 * 60 * 1000);
    if (nextMs > endMs) nextMs = endMs;
    chunks.push({
      start: new Date(currentMs).toISOString().split('T')[0],
      end: new Date(nextMs).toISOString().split('T')[0],
    });
    currentMs = nextMs + (24 * 60 * 60 * 1000); // advance by one day to avoid overlap
  }

  const allRows: any[] = [];
  const rawBytesChunks: Buffer[] = [];
  
  const deduplicator = new Set<string>();

  for (const chunk of chunks) {
    const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(request.instrumentKey)}/${request.timeframe}/${chunk.end}/${chunk.start}`;
    try {
      const response = await client.get(url);
      rawBytesChunks.push(response.rawBytes);
      const data = response.data?.data?.candles || [];
      
      for (const row of data) {
        const rowTime = row[0];
        if (!deduplicator.has(rowTime)) {
          deduplicator.add(rowTime);
          allRows.push(row);
        }
      }
    } catch (e: any) {
      if (e.message === 'AUTHENTICATION_REQUIRED') {
        throw new Error('AUTHENTICATION_REQUIRED');
      }
      throw e;
    }
  }

  // Sort deterministically by timestamp
  allRows.sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

  // Derive coverage
  let actualStart;
  let actualEnd;

  if (allRows.length > 0) {
    actualStart = allRows[0][0];
    actualEnd = allRows[allRows.length - 1][0];
  }

  // Deterministic missing range calculation based on expected vs observed intervals
  const missingRanges: { start: string, end: string, reason: string }[] = [];
  let expectedIntervals = 0;
  let observedIntervals = allRows.length;
  
  if (allRows.length === 0) {
    missingRanges.push({ start: request.start, end: request.end, reason: 'NO_DATA_RETURNED' });
  } else {
    const reqStartMs = new Date(request.start).getTime();
    const reqEndMs = new Date(request.end).getTime();
    const expectedTimestamps: number[] = [];
    
    // Create a deterministic expectation array
    const current = new Date(request.start);
    if (request.timeframe === '15minute' && current.getUTCHours() === 0) {
      current.setUTCHours(3, 45, 0, 0); // 09:15 IST is 03:45 UTC
    }

    while (current.getTime() <= reqEndMs) {
      const dayOfWeek = current.getUTCDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { 
        if (request.timeframe === 'day') {
          expectedTimestamps.push(current.getTime());
          current.setUTCDate(current.getUTCDate() + 1);
        } else if (request.timeframe === '15minute') {
          // IST bounds: 09:15 to 15:15 -> UTC bounds: 03:45 to 09:45
          const time = current.getUTCHours() * 100 + current.getUTCMinutes();
          if (time >= 345 && time <= 945) {
            expectedTimestamps.push(current.getTime());
          }
          current.setTime(current.getTime() + 15 * 60000);
          if (current.getUTCHours() * 100 + current.getUTCMinutes() > 945) {
            current.setUTCDate(current.getUTCDate() + 1);
            current.setUTCHours(3, 45, 0, 0);
          }
        } else {
          current.setUTCDate(current.getUTCDate() + 1);
        }
      } else {
        current.setUTCDate(current.getUTCDate() + 1);
        if (request.timeframe === '15minute') {
          current.setUTCHours(3, 45, 0, 0);
        }
      }
    }

    expectedIntervals = expectedTimestamps.length;
    const observedSet = new Set(allRows.map(r => new Date(r[0]).getTime()));
    
    let inGap = false;
    let gapStart = '';
    let gapEnd = '';

    for (let i = 0; i < expectedTimestamps.length; i++) {
      const t = expectedTimestamps[i];
      if (!observedSet.has(t)) {
        if (!inGap) {
          inGap = true;
          gapStart = new Date(t).toISOString();
        }
        gapEnd = new Date(t).toISOString();
      } else {
        if (inGap) {
          missingRanges.push({ start: gapStart, end: gapEnd, reason: 'MISSING_OBSERVATIONS' });
          inGap = false;
        }
      }
    }

    if (inGap) {
      missingRanges.push({ start: gapStart, end: gapEnd, reason: 'MISSING_OBSERVATIONS' });
    }
  }

  const coverage = {
    expectedIntervals: Math.max(expectedIntervals, observedIntervals),
    observedIntervals,
    ratio: expectedIntervals > 0 ? (observedIntervals / expectedIntervals) : (observedIntervals > 0 ? 1 : 0)
  };

  return {
    allRows,
    rawBytesChunks,
    requestedStart: request.start,
    requestedEnd: request.end,
    actualStart,
    actualEnd,
    missingRanges,
    coverage
  };
}
