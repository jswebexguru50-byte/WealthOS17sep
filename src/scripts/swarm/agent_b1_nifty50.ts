import { SwarmAgentResult } from './SwarmAgentResult';
import { DataAcquisitionHttpClient } from '../../server/services/dataenrichment/DataAcquisitionHttpClient';
import { assertSourceSupports } from '../../server/services/dataenrichment/DataSourceRegistry';
import { resolveUpstoxInstrument } from '../../server/services/dataenrichment/DataAcquisitionContract';
import { writeDataset } from '../../server/services/dataenrichment/DatasetManifestWriter';

export async function run(): Promise<SwarmAgentResult> {
  const agentId = 'B1';
  const datasetId = 'B1_NIFTY50_OHLCV';
  const startedAt = new Date().toISOString();
  
  let result: SwarmAgentResult = {
    agentId,
    runId: `run-${Date.now()}`,
    datasetId,
    status: 'ACQUIRING',
    source: 'UPSTOX_V3',
    provider: 'UPSTOX',
    rowsAcquired: 0,
    rowsValidated: 0,
    rowsRejected: 0,
    pitStatus: 'UNKNOWN',
    calendarStatus: 'UNKNOWN',
    failureReasons: [],
    startedAt,
    completedAt: ''
  };

  try {
    assertSourceSupports('UPSTOX_V3', 'INDEX_OHLCV');
    result.pitStatus = 'UNKNOWN'; // Start as UNKNOWN until verification

    assertSourceSupports('UPSTOX_V3', 'DAILY_OHLCV');

    const instrument = await resolveUpstoxInstrument('NIFTY 50');
    if (!instrument) {
      throw new Error('INSTRUMENT_RESOLUTION_UNAVAILABLE: Cannot resolve instrument identity for NIFTY 50');
    }

    const client = new DataAcquisitionHttpClient('UPSTOX_V3');
    const requestedStart = '2024-01-01';
    const requestedEnd = '2026-09-01'; 
    
    // Use V3 endpoint
    const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrument.instrumentKey)}/day/${requestedEnd}/${requestedStart}`;
    
    let rawBytes: Buffer;
    let data;
    const dataAcquisitionTimestamp = new Date().toISOString();
    
    try {
      const response = await client.get(url);
      rawBytes = response.rawBytes;
      data = response.data?.data?.candles || [];
    } catch (e: any) {
      if (e.message === 'AUTHENTICATION_REQUIRED') {
        throw new Error('AUTHENTICATION_REQUIRED');
      }
      throw e;
    }
    
    const dataReceivedTimestamp = new Date().toISOString();

    const rows: any[] = data.map((c: any) => {
      const barStartTime = c[0];
      return {
        instrumentKey: instrument.instrumentKey,
        barStartTime,
        providerTimestamp: barStartTime,
        observationTimestamp: undefined,
        dataAcquisitionTimestamp,
        dataReceivedTimestamp,
        evaluationTimestamp: undefined,
        candleState: 'CLOSED',
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
      };
    });

    result.rowsAcquired = rows.length;
    result.rowsValidated = rows.length;
    result.completedAt = new Date().toISOString();
    
    result = writeDataset('daily', datasetId, rows, result, rawBytes);
    return result;

  } catch (err: any) {
    if (err.message === 'AUTHENTICATION_REQUIRED') {
      result.status = 'BLOCKED';
      result.reasonCode = 'AUTHENTICATION_REQUIRED';
    } else if (err.message.includes('INSTRUMENT_RESOLUTION_UNAVAILABLE')) {
      result.status = 'BLOCKED';
      result.reasonCode = 'INSTRUMENT_RESOLUTION_UNAVAILABLE';
    } else {
      result.status = err.message.includes('DATA_INSUFFICIENT') ? 'DATA_INSUFFICIENT' : 'FAILED';
    }
    result.failureReasons.push(err.message);
    result.completedAt = new Date().toISOString();
    return writeDataset('daily', datasetId, [], result);
  }
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().then(res => {
    console.log(JSON.stringify(res));
    process.exit(0);
  });
}
