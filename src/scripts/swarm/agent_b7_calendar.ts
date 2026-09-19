import { SwarmAgentResult } from './SwarmAgentResult';
import { assertSourceSupports } from '../../server/services/dataenrichment/DataSourceRegistry';

export async function run(): Promise<SwarmAgentResult> {
  const agentId = 'B7';
  const datasetId = 'B7_TRADING_CALENDAR';
  const startedAt = new Date().toISOString();
  
  const result: SwarmAgentResult = {
    agentId,
    runId: `run-${Date.now()}`,
    datasetId,
    status: 'DATA_INSUFFICIENT',
    source: 'UPSTOX_V3',
    provider: 'UPSTOX',
    rowsAcquired: 0,
    rowsValidated: 0,
    rowsRejected: 0,
    pitStatus: 'PIT_NOT_VERIFIABLE',
    calendarStatus: 'UNKNOWN',
    failureReasons: ['DATA_INSUFFICIENT: NO_AUTHORIZED_SOURCE_CONFIGURED'],
    startedAt,
    completedAt: new Date().toISOString()
  };

  try {
    assertSourceSupports('UPSTOX_V3', 'TRADING_CALENDAR');
  } catch (err: any) {
    result.failureReasons.push(err.message);
  }

  return result;
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().then(res => {
    console.log(JSON.stringify(res));
    process.exit(0);
  });
}
