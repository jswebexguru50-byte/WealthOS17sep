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

import fs from 'node:fs';
import { runIndependentVerification } from './../server/services/dataenrichment/verifiers/IndependentVerifier';
import { evaluateDatasetPromotion } from './../server/services/dataenrichment/verifiers/DatasetPromotionGate';
import { DatasetPromotionInput } from './../server/services/dataenrichment/DataStagingContract';

async function runSwarm() {
  console.log('====================================================');
  console.log('D2.2 FAST-TRACK DATA ACQUISITION SWARM (LANE B)');
  console.log('====================================================');
  
  // Launch all agents concurrently
  const promises = agents.map(runAgent);
  const results = await Promise.all(promises);
  
  // Independent Verification & Promotion Gate
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status === 'ACQUIRING') {
      try {
        const manifestPath = path.join(repoRoot, 'data', 'enrichment', 'staging', res.datasetId.split('_')[1]?.toLowerCase() || res.agentId.split('_')[1] || 'unknown', `${res.datasetId}_MANIFEST.json`);
        const dataPath = path.join(path.dirname(manifestPath), `${res.datasetId}.jsonl`);
        const rawPath = path.join(path.dirname(manifestPath), `${res.datasetId}_RAW.bin`);

        if (fs.existsSync(manifestPath) && fs.existsSync(dataPath)) {
          const predicates = runIndependentVerification(res.datasetId, manifestPath, dataPath, rawPath);
          
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          const input: DatasetPromotionInput = {
            datasetId: res.datasetId,
            manifest,
            checks: predicates,
          };
          
          const decision = evaluateDatasetPromotion(input);
          
          if (decision.decision === 'PROMOTED') {
            res.status = 'PROMOTED' as any; // Cast as it's allowed at the swarm level for Control Tower
          } else {
            res.status = 'FAILED';
            res.failureReasons = res.failureReasons || [];
            res.failureReasons.push(...decision.failures);
          }
        } else {
          res.status = 'FAILED';
          res.failureReasons = res.failureReasons || [];
          res.failureReasons.push('Missing manifest or dataset file for independent verification');
        }
      } catch (err: any) {
        res.status = 'FAILED';
        res.failureReasons = res.failureReasons || [];
        res.failureReasons.push(`Independent Verification Crash: ${err.message}`);
      }
    }
  }

  updateControlTower(results);
  
  console.log('Swarm execution completed.');
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSwarm().catch(console.error);
}
