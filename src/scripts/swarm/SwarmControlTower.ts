import fs from 'node:fs';
import path from 'node:path';
import { SwarmAgentResult } from './SwarmAgentResult';

const repoRoot = process.cwd();
const reportDir = path.join(repoRoot, 'reports', 'v65-delivery-2.2');
const outputPath = path.join(reportDir, 'D22_CONTROL_TOWER_STATUS.json');

export interface SwarmStatus {
  swarmStatus: 'ACQUIRING' | 'PARTIAL_DATA_READY' | 'ALL_DATA_READY' | 'FAILED';
  agents: Record<string, SwarmAgentResult['status']>;
}

export function updateControlTower(agentResults: SwarmAgentResult[]): void {
  const agents: Record<string, SwarmAgentResult['status']> = {};
  
  let allPromoted = true;
  let hasPromoted = false;
  let hasFailed = false;
  
  for (const result of agentResults) {
    agents[result.agentId] = result.status;
    if (result.status === 'PROMOTED') {
      hasPromoted = true;
    } else if (result.status === 'FAILED') {
      hasFailed = true;
      allPromoted = false;
    } else {
      allPromoted = false;
    }
  }
  
  const swarmStatus = allPromoted 
    ? 'ALL_DATA_READY' 
    : (hasFailed ? 'FAILED' : (hasPromoted ? 'PARTIAL_DATA_READY' : 'BLOCKED'));

  const controlTowerData = {
    schemaVersion: 'D22_CONTROL_TOWER_STATUS_V2',
    swarmStatus,
    agents,
    timestamp: new Date().toISOString(),
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(controlTowerData, null, 2) + '\n', 'utf8');
  
  console.log(`Control Tower Updated: ${swarmStatus}`);
  console.log(JSON.stringify(agents, null, 2));
}
