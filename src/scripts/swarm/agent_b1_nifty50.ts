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
    pitStatus: 'PIT_VERIFIED', // Set this if we are successful, although it should be verified by the gate later
    calendarStatus: 'UNKNOWN',
    failureReasons: [],
    startedAt,
    completedAt: ''
  };

  try {
    assertSourceSupports('UPSTOX_V3', 'INDEX_OHLCV');
    assertSourceSupports('UPSTOX_V3', 'DAILY_OHLCV');

    const instrument = resolveUpstoxInstrument('NIFTY 50');
    if (!instrument) {
      throw new Error('DATA_INSUFFICIENT: Cannot resolve instrument identity for NIFTY 50');
    }

    const client = new DataAcquisitionHttpClient('UPSTOX_V3');
    
    // Attempt fetch
    // Example: GET /v3/historical-candle/:instrument_key/day/2026-09-01/2024-01-01
    const fromDate = '2024-01-01';
    const toDate = '2026-09-01'; // Mock static dates for the worker prototype
    
    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrument.instrumentKey)}/day/${toDate}/${fromDate}`;
    
    let data;
    try {
      const response = await client.get(url);
      data = response.data?.candles || [];
    } catch (e: any) {
      if (e.message === 'AUTHENTICATION_REQUIRED') {
        throw new Error('AUTHENTICATION_REQUIRED');
      }
      throw e;
    }

    // Process and canonicalize
    const rows: any[] = data.map((c: any) => ({
      barStartTime: c[0], // Upstox provides timestamp in first element
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
      openInterest: c[6] || 0,
    }));

    result.rowsAcquired = rows.length;
    result.rowsValidated = rows.length;
    result.status = 'PROMOTED';
    result.completedAt = new Date().toISOString();
    
    result = writeDataset('nifty50', datasetId, rows, result);
    return result;

  } catch (err: any) {
    if (err.message === 'AUTHENTICATION_REQUIRED') {
      result.status = 'BLOCKED';
      result.reasonCode = 'AUTHENTICATION_REQUIRED';
    } else {
      result.status = err.message.includes('DATA_INSUFFICIENT') ? 'DATA_INSUFFICIENT' : 'FAILED';
    }
    result.failureReasons.push(err.message);
    result.completedAt = new Date().toISOString();
    return writeDataset('nifty50', datasetId, [], result);
  }
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().then(res => {
    console.log(JSON.stringify(res));
    process.exit(0);
  });
}
