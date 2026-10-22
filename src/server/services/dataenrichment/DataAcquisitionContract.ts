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
import zlib from 'node:zlib';

export async function resolveUpstoxInstrument(symbol: string): Promise<InstrumentIdentity | null> {
  const url = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.csv.gz';
  const retrievedAt = new Date().toISOString();
  let rawBytes: Buffer;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`INSTRUMENT_RESOLUTION_UNAVAILABLE: Failed to download ${url}`);
    }
    rawBytes = Buffer.from(await res.arrayBuffer());
  } catch (err: any) {
    throw new Error(`INSTRUMENT_RESOLUTION_UNAVAILABLE: ${err.message}`);
  }

  const rawSha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
  
  let decompressedString: string;
  try {
    const unzipped = zlib.gunzipSync(rawBytes);
    decompressedString = unzipped.toString('utf8');
  } catch (err: any) {
    throw new Error(`INSTRUMENT_RESOLUTION_UNAVAILABLE: Failed to decompress gzip. ${err.message}`);
  }

  const decompressedSha256 = crypto.createHash('sha256').update(decompressedString, 'utf8').digest('hex');

  // The CSV format for Upstox NSE is roughly:
  // instrument_key,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,option_type,exchange
  // Example: NSE_INDEX|Nifty 50,256265,NIFTY 50,NIFTY 50,22500,,,0,0,INDEX,,NSE
  
  const lines = decompressedString.split('\n');
  const headers = lines[0].split(',');
  const keyIdx = headers.findIndex(h => h === 'instrument_key');
  const nameIdx = headers.findIndex(h => h === 'name');
  const typeIdx = headers.findIndex(h => h === 'instrument_type');
  const exchIdx = headers.findIndex(h => h === 'exchange');

  if (keyIdx === -1 || nameIdx === -1 || typeIdx === -1 || exchIdx === -1) {
    throw new Error('INSTRUMENT_RESOLUTION_UNAVAILABLE: Unrecognized CSV schema');
  }

  let foundKey: string | null = null;
  let foundType: string | null = null;
  let foundExch: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length > Math.max(keyIdx, nameIdx, typeIdx, exchIdx)) {
      if (row[nameIdx] === symbol && row[typeIdx] === 'INDEX' && row[exchIdx] === 'NSE') {
        foundKey = row[keyIdx];
        foundType = row[typeIdx];
        foundExch = row[exchIdx];
        break;
      }
    }
  }

  if (!foundKey) {
    return null;
  }
  
  const resolvedAt = new Date().toISOString();
  
  return {
    provider: 'UPSTOX_V3',
    instrumentKey: foundKey,
    displayName: symbol,
    exchange: foundExch!,
    instrumentType: foundType!,
    resolvedAt,
    resolutionEvidenceHash: hashInstrumentEvidence({
      symbol, 
      resolvedAt, 
      resolutionMethod: 'PROVIDER_INSTRUMENT_MASTER_DOWNLOAD',
      sourceUrl: url,
      retrievedAt,
      rawSha256,
      decompressedSha256,
      instrumentKey: foundKey,
      instrumentType: foundType,
      exchange: foundExch
    })
  };
}
