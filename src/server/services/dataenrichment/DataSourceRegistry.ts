export type SupportedDatasetType =
  | 'DAILY_OHLCV'
  | 'INTRADAY_OHLCV'
  | 'INDEX_OHLCV'
  | 'CONSTITUENTS'
  | 'SECTOR_MAPPING'
  | 'CORPORATE_ACTIONS'
  | 'TRADING_CALENDAR';

export interface DataSourceCapability {
  sourceId: string;
  datasets: string[];
  supports: SupportedDatasetType[];
  earliestSupportedDate?: string;
  latestSupportedDate?: string;
  supportedIntervals?: string[];
  providesPublicationTimestamp: boolean;
  providesAcquisitionTimestamp: boolean;
  authenticationRequired: boolean;
}

const REGISTRY: Record<string, DataSourceCapability> = {
  'UPSTOX_V3': {
    sourceId: 'UPSTOX_V3',
    datasets: [
      'B1_NIFTY50_OHLCV',
      'B2_NIFTY500_OHLCV',
      'B3_SECTOR_OHLCV',
      'B6_INTRADAY_15M',
    ],
    supports: [
      'INTRADAY_OHLCV',
      'DAILY_OHLCV',
      'INDEX_OHLCV',
    ],
    earliestSupportedDate: '2022-01-01',
    supportedIntervals: ['1minute', '30minute', '15minute', 'day', 'week', 'month'],
    providesPublicationTimestamp: false, // Upstox provides bar timestamps, not explicit publication
    providesAcquisitionTimestamp: true, // We capture this at REST edge
    authenticationRequired: true,
  },
};

export function getSourceCapability(sourceId: string): DataSourceCapability | undefined {
  return REGISTRY[sourceId];
}

export function assertSourceSupports(sourceId: string, requiredType: SupportedDatasetType): DataSourceCapability {
  const cap = getSourceCapability(sourceId);
  if (!cap) {
    throw new Error(`SOURCE_UNKNOWN:${sourceId}`);
  }
  if (!cap.supports.includes(requiredType)) {
    throw new Error(`SOURCE_CAPABILITY_UNSUPPORTED:${sourceId}:${requiredType}`);
  }
  return cap;
}
