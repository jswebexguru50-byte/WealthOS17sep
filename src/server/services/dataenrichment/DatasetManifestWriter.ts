import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SwarmAgentResult } from '../../../scripts/swarm/SwarmAgentResult';
import { hashCanonicalDataset, serializeDataset } from './CanonicalObservationSerializer';

const stagingBase = path.join(process.cwd(), 'data', 'enrichment', 'staging');

export function writeDataset(
  workstream: string,
  datasetId: string,
  rows: any[],
  agentResult: Omit<SwarmAgentResult, 'rawSha256' | 'canonicalSha256'>,
  rawBytes?: Buffer
): SwarmAgentResult {
  const wsPath = path.join(stagingBase, workstream);
  fs.mkdirSync(wsPath, { recursive: true });
  
  const dataPath = path.join(wsPath, `${datasetId}.jsonl`);
  const rawPath = path.join(wsPath, `${datasetId}_RAW.bin`);
  const manifestPath = path.join(wsPath, `${datasetId}_MANIFEST.json`);
  
  let canonicalSha256 = '';
  let rawSha256 = '';
  
  if (rawBytes && rawBytes.length > 0) {
    fs.writeFileSync(rawPath, rawBytes);
    rawSha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
  }

  if (rows.length > 0) {
    // Canonical format serialization
    const lines = serializeDataset(rows);
    fs.writeFileSync(dataPath, lines + '\n', 'utf8');
    
    canonicalSha256 = hashCanonicalDataset(rows);
  }
  
  const finalResult: SwarmAgentResult = {
    ...agentResult,
    rawSha256,
    canonicalSha256,
  };
  
  fs.writeFileSync(manifestPath, JSON.stringify(finalResult, null, 2) + '\n', 'utf8');
  return finalResult;
}
