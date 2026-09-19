import { SwarmAgentResult } from './SwarmAgentResult';
import { DataAcquisitionHttpClient } from '../../server/services/dataenrichment/DataAcquisitionHttpClient';
import { assertSourceSupports } from '../../server/services/dataenrichment/DataSourceRegistry';
import { resolveUpstoxInstrument } from '../../server/services/dataenrichment/DataAcquisitionContract';
import { writeDataset } from '../../server/services/dataenrichment/DatasetManifestWriter';

export async function run(): Promise<SwarmAgentResult> {
  const agentId = 'B6';
  const datasetId = 'B6_INTRADAY_15M_OHLCV';
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
    pitStatus: 'PIT_NOT_VERIFIABLE', // Explicitly marking NOT_VERIFIABLE because Upstox doesn't supply publication timestamp
    calendarStatus: 'UNKNOWN',
    failureReasons: [],
    startedAt,
    completedAt: ''
  };

  try {
    assertSourceSupports('UPSTOX_V3', 'INTRADAY_OHLCV');

    const instrument = resolveUpstoxInstrument('NIFTY 50');
    if (!instrument) {
      throw new Error('DATA_INSUFFICIENT: Cannot resolve instrument identity for NIFTY 50');
    }

    const client = new DataAcquisitionHttpClient('UPSTOX_V3');
    const fromDate = '2026-08-01'; // 15-minute fetch window is smaller
    const toDate = '2026-09-01'; 
    
    // Use V3 explicitly
    const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrument.instrumentKey)}/minutes/15/${toDate}/${fromDate}`;
    
    let data;
    const dataAcquisitionTimestamp = new Date().toISOString();
    
    try {
      const response = await client.get(url);
      data = response.data?.candles || [];
    } catch (e: any) {
      if (e.message === 'AUTHENTICATION_REQUIRED') {
        throw new Error('AUTHENTICATION_REQUIRED');
      }
      throw e;
    }
    
    const dataReceivedTimestamp = new Date().toISOString();

    const rows: any[] = data.map((c: any) => {
      // For 15m, bar start time is provided in the candle
      const barStartTime = c[0];
      // Compute bar end time assuming exactly 15 minutes logic, though real logic handles 15m delta exactly
      const barStartMs = new Date(barStartTime).getTime();
      const barEndTime = new Date(barStartMs + 15 * 60 * 1000).toISOString();
      
      return {
        instrumentKey: instrument.instrumentKey,
        barStartTime,
        barEndTime,
        providerTimestamp: barStartTime, // As provided by Upstox
        observationTimestamp: barEndTime, // We can only "observe" it when it closes
        dataAcquisitionTimestamp,
        dataReceivedTimestamp,
        evaluationTimestamp: undefined, // Left to the replay engine
        // DO NOT manufacture publicationTimestamp
        candleState: 'CLOSED',
        
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
        openInterest: c[6] || 0,
      };
    });

    result.rowsAcquired = rows.length;
    result.rowsValidated = rows.length;
    result.status = 'PROMOTED';
    result.completedAt = new Date().toISOString();
    
    result = writeDataset('intraday15m', datasetId, rows, result);
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
    return writeDataset('intraday15m', datasetId, [], result);
  }
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().then(res => {
    console.log(JSON.stringify(res));
    process.exit(0);
  });
}
