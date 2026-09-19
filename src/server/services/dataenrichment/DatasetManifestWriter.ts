import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SwarmAgentResult } from '../../scripts/swarm/SwarmAgentResult';

const stagingBase = path.join(process.cwd(), 'data', 'enrichment', 'staging');

export function writeDataset(
  workstream: string,
  datasetId: string,
  rows: any[],
  agentResult: Omit<SwarmAgentResult, 'rawSha256' | 'canonicalSha256'>
): SwarmAgentResult {
  const wsPath = path.join(stagingBase, workstream);
  fs.mkdirSync(wsPath, { recursive: true });
  
  const dataPath = path.join(wsPath, `${datasetId}.jsonl`);
  const manifestPath = path.join(wsPath, `${datasetId}_MANIFEST.json`);
  
  let canonicalSha256 = '';
  
  if (rows.length > 0) {
    const lines = rows.map(r => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(dataPath, lines, 'utf8');
    
    canonicalSha256 = crypto.createHash('sha256').update(lines, 'utf8').digest('hex');
  }
  
  const finalResult: SwarmAgentResult = {
    ...agentResult,
    rawSha256: canonicalSha256,
    canonicalSha256,
  };
  
  fs.writeFileSync(manifestPath, JSON.stringify(finalResult, null, 2) + '\n', 'utf8');
  return finalResult;
}
