import crypto from 'node:crypto';

export interface CanonicalMarketObservation {
  instrumentKey: string;
  barStartTime: string;
  providerTimestamp: string;
  observationTimestamp?: string;
  dataAcquisitionTimestamp: string;
  dataReceivedTimestamp: string;
  evaluationTimestamp?: string;
  candleState: 'OPEN' | 'CLOSED';
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  [key: string]: any;
}

function normalizeNumber(val: any): number {
  if (val === null || val === undefined) {
    throw new Error('NO_NULL_NUMERIC: Numeric value cannot be null or undefined');
  }
  const n = Number(val);
  if (Number.isNaN(n)) {
    throw new Error('CANONICAL_NUMBER_INVALID: NaN detected');
  }
  if (!Number.isFinite(n)) {
    throw new Error('CANONICAL_NUMBER_INVALID: Infinity detected');
  }
  return n;
}

function normalizeString(val: any): string | undefined {
  if (val === null || val === undefined) return undefined;
  return String(val);
}

export function serializeObservation(obs: CanonicalMarketObservation): string {
  // Deterministic ordering of standard fields
  const orderedKeys = [
    'instrumentKey',
    'barStartTime',
    'providerTimestamp',
    'observationTimestamp',
    'dataAcquisitionTimestamp',
    'dataReceivedTimestamp',
    'evaluationTimestamp',
    'candleState',
    'open',
    'high',
    'low',
    'close',
    'volume'
  ];

  const result: Record<string, any> = {};

  // Standard fields
  for (const key of orderedKeys) {
    let val = (obs as any)[key];
    
    if (['open', 'high', 'low', 'close', 'volume'].includes(key)) {
      val = normalizeNumber(val);
    } else {
      val = normalizeString(val);
    }
    
    if (val !== undefined) {
      result[key] = val;
    }
  }

  // Add any extra fields deterministically (sorted)
  const extraKeys = Object.keys(obs)
    .filter(k => !orderedKeys.includes(k))
    .sort();
  
  for (const key of extraKeys) {
    const val = obs[key];
    if (val !== undefined && val !== null) {
      if (typeof val === 'number') {
        result[key] = normalizeNumber(val);
      } else {
        result[key] = String(val);
      }
    }
  }

  return JSON.stringify(result);
}

export function serializeDataset(rows: CanonicalMarketObservation[]): string {
  return rows.map(r => serializeObservation(r)).join('\n');
}

export function hashCanonicalObservation(obs: CanonicalMarketObservation): string {
  const serialized = serializeObservation(obs);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

export function hashCanonicalDataset(rows: CanonicalMarketObservation[]): string {
  const serialized = serializeDataset(rows);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}
