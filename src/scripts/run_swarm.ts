import { spawn } from 'node:child_process';
import path from 'node:path';
import { updateControlTower } from './swarm/SwarmControlTower';
import { SwarmAgentResult } from './swarm/SwarmAgentResult';

const repoRoot = process.cwd();
const agents = [
  'agent_b1_nifty50.ts',
  'agent_b2_nifty500.ts',
  'agent_b3_sectors.ts',
  'agent_b4_constituents.ts',
  'agent_b5_sector_mapping.ts',
  'agent_b6_intraday15m.ts',
  'agent_b7_calendar.ts',
  'agent_b8_corporate_actions.ts'
];

async function runAgent(agentScript: string): Promise<SwarmAgentResult> {
  const scriptPath = path.join(repoRoot, 'src', 'scripts', 'swarm', agentScript);
  
  return new Promise((resolve) => {
    // We use tsx to execute the typescript file
    const child = spawn('npx', ['tsx', scriptPath], {
      shell: true,
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'inherit'] // pipe stdout, inherit stderr
    });

    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      try {
        const result = JSON.parse(output.trim()) as SwarmAgentResult;
        resolve(result);
      } catch (e) {
        resolve({
          agentId: agentScript,
          runId: 'unknown',
          datasetId: 'unknown',
          status: 'FAILED',
          source: 'UNKNOWN',
          provider: 'UNKNOWN',
          rowsAcquired: 0,
          rowsValidated: 0,
          rowsRejected: 0,
          pitStatus: 'PIT_NOT_VERIFIABLE',
          calendarStatus: 'UNKNOWN',
          failureReasons: ['Failed to parse JSON output from child process or process crashed', String(e)],
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        });
      }
    });
    
    child.on('error', (err) => {
      resolve({
        agentId: agentScript,
        runId: 'unknown',
        datasetId: 'unknown',
        status: 'FAILED',
        source: 'UNKNOWN',
        provider: 'UNKNOWN',
        rowsAcquired: 0,
        rowsValidated: 0,
        rowsRejected: 0,
        pitStatus: 'PIT_NOT_VERIFIABLE',
        calendarStatus: 'UNKNOWN',
        failureReasons: [`Failed to spawn child process: ${err.message}`],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      });
    });
  });
}

async function runSwarm() {
  console.log('====================================================');
  console.log('D2.2 FAST-TRACK DATA ACQUISITION SWARM (LANE B)');
  console.log('====================================================');
  
  // Launch all agents concurrently
  const promises = agents.map(runAgent);
  const results = await Promise.all(promises);
  
  updateControlTower(results);
  
  console.log('Swarm execution completed.');
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSwarm().catch(console.error);
}
