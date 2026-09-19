import crypto from 'node:crypto';

export interface InstrumentIdentity {
  provider: string;
  instrumentKey: string;
  displayName: string;
  exchange: string;
  instrumentType: string;
  resolvedAt: string;
  resolutionEvidenceHash: string;
}

export function hashInstrumentEvidence(evidence: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
}

import fs from 'node:fs';
import path from 'node:path';

export function resolveUpstoxInstrument(symbol: string): InstrumentIdentity | null {
  const masterPath = path.join(process.cwd(), 'data', 'mock_upstox_instrument_master.json');
  if (!fs.existsSync(masterPath)) {
    throw new Error('DATA_INSUFFICIENT: Missing Provider Instrument Master file.');
  }

  const data = fs.readFileSync(masterPath, 'utf8');
  const instruments = JSON.parse(data);

  const found = instruments.find((i: any) => i.name === symbol && i.instrument_type === 'INDEX' && i.exchange === 'NSE');
  
  if (!found) {
    return null;
  }
  
  const resolvedAt = new Date().toISOString();
  
  return {
    provider: 'UPSTOX_V3',
    instrumentKey: found.instrument_key,
    displayName: symbol,
    exchange: found.exchange,
    instrumentType: found.instrument_type,
    resolvedAt,
    resolutionEvidenceHash: hashInstrumentEvidence({
      symbol, found, resolvedAt, resolutionMethod: 'PROVIDER_INSTRUMENT_MASTER'
    })
  };
}
