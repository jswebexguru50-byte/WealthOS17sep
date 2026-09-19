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
  missingRanges: { start: string, end: string }[];
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
  const missingRanges = [];

  if (allRows.length > 0) {
    actualStart = allRows[0][0];
    actualEnd = allRows[allRows.length - 1][0];

    // Dummy missing ranges logic for now
    // A real implementation would scan the expected calendar and find missing dates
    if (new Date(actualStart).getTime() > new Date(request.start).getTime() + (7 * 24 * 60 * 60 * 1000)) {
       missingRanges.push({ start: request.start, end: actualStart });
    }
  } else {
    missingRanges.push({ start: request.start, end: request.end });
  }

  return {
    allRows,
    rawBytesChunks,
    requestedStart: request.start,
    requestedEnd: request.end,
    actualStart,
    actualEnd,
    missingRanges
  };
}
