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

import zlib from 'node:zlib';

export async function resolveUpstoxInstrument(symbol: string): Promise<InstrumentIdentity | null> {
  const url = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';
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

  const instrument = findUpstoxIndex(JSON.parse(decompressedString), symbol);
  if (!instrument) return null;
  const foundKey = instrument.instrument_key;
  const foundType = instrument.instrument_type;
  const foundExch = instrument.exchange;

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

/** Match index identity using the documented JSON schema, never row positions. */
export function findUpstoxIndex(rows: unknown, symbol: string): {
  instrument_key: string; instrument_type: string; exchange: string;
} | null {
  if (!Array.isArray(rows)) throw new Error('INSTRUMENT_RESOLUTION_UNAVAILABLE: Unrecognized JSON schema');
  const wanted = symbol.trim().toUpperCase();
  const matches = rows.filter(row => row && row.segment === 'NSE_INDEX' &&
    row.instrument_type === 'INDEX' && row.exchange === 'NSE' &&
    typeof row.instrument_key === 'string' && row.instrument_key.startsWith('NSE_INDEX|') &&
    [row.name, row.trading_symbol].some(value => typeof value === 'string' && value.trim().toUpperCase() === wanted));
  if (matches.length > 1) throw new Error('INSTRUMENT_RESOLUTION_UNAVAILABLE: Ambiguous index identity');
  return matches[0] || null;
}
