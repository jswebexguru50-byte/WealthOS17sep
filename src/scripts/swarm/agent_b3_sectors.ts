import { SwarmAgentResult } from './SwarmAgentResult';
import { DataAcquisitionHttpClient } from '../../server/services/dataenrichment/DataAcquisitionHttpClient';
import { assertSourceSupports } from '../../server/services/dataenrichment/DataSourceRegistry';
import { resolveUpstoxInstrument } from '../../server/services/dataenrichment/DataAcquisitionContract';
import { writeDataset } from '../../server/services/dataenrichment/DatasetManifestWriter';
import { fetchChunkedUpstoxData, AcquisitionRequest } from '../../server/services/dataenrichment/UpstoxChunkingUtility';

export async function run(): Promise<SwarmAgentResult> {
  const agentId = 'B3';
  const datasetId = 'B3_SECTORS_OHLCV';
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
    result.pitStatus = 'UNKNOWN'; // Start as UNKNOWN until verification
    
    assertSourceSupports('UPSTOX_V3', 'INDEX_OHLCV');
    assertSourceSupports('UPSTOX_V3', 'DAILY_OHLCV');

    const sectors = ['NIFTY BANK', 'NIFTY IT'];
    const client = new DataAcquisitionHttpClient('UPSTOX_V3');
    const rows: any[] = [];
    const rawBytesChunks: Buffer[] = [];
    
    let actualStart: string | undefined;
    let actualEnd: string | undefined;
    const missingRanges: any[] = [];

    const requestedStart = process.env.ACQUISITION_START;
    const requestedEnd = process.env.ACQUISITION_END; 
    
    if (!requestedStart || !requestedEnd) {
       throw new Error('DATA_INSUFFICIENT: ACQUISITION_START and ACQUISITION_END are required');
    }

    for (const sector of sectors) {
      const instrument = await resolveUpstoxInstrument(sector);
      if (!instrument) {
        throw new Error(`INSTRUMENT_RESOLUTION_UNAVAILABLE: Cannot resolve instrument identity for ${sector}`);
      }

      const request: AcquisitionRequest = {
        datasetId,
        instrumentKey: instrument.instrumentKey,
        start: requestedStart,
        end: requestedEnd,
        timeframe: 'day',
        chunkPolicy: 'AUTO'
      };

      const dataAcquisitionTimestamp = new Date().toISOString();
      
      const chunkedResult = await fetchChunkedUpstoxData(request, client);
      const dataReceivedTimestamp = new Date().toISOString();

      const newRows: any[] = chunkedResult.allRows.map((c: any) => {
        const barStartTime = c[0];
        return {
          instrumentKey: instrument.instrumentKey,
          sectorName: sector,
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

      rows.push(...newRows);
      rawBytesChunks.push(...chunkedResult.rawBytesChunks);
      
      actualStart = chunkedResult.actualStart || actualStart;
      actualEnd = chunkedResult.actualEnd || actualEnd;
      missingRanges.push(...chunkedResult.missingRanges);
    }

    result.rowsAcquired = rows.length;
    result.rowsValidated = rows.length;
    result.completedAt = new Date().toISOString();
    
    const manifestResult: any = {
      ...result,
      requestedStart: process.env.ACQUISITION_START,
      requestedEnd: process.env.ACQUISITION_END,
      actualStart,
      actualEnd,
      missingRanges
    };
    
    result = writeDataset('sectors', datasetId, rows, manifestResult, Buffer.concat(rawBytesChunks));
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
    return writeDataset('sectors', datasetId, [], result);
  }
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().then(res => {
    console.log(JSON.stringify(res));
    process.exit(0);
  });
}
