export interface SourcePolicy {
  sourceId: string;
  name: string;
  requestsPerMinute: number;
  requestsPerHour?: number;
  concurrency: number;
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
    exponentialFactor: number;
  };
  allowedDomains: string[];
  enabled: boolean;
}

export class DataSourceRegistry {
  private sources: Map<string, SourcePolicy> = new Map();

  constructor() {
    this.registerDefaultSources();
  }

  public registerSource(policy: SourcePolicy): void {
    this.sources.set(policy.sourceId, policy);
  }

  public getPolicy(sourceId: string): SourcePolicy | undefined {
    return this.sources.get(sourceId);
  }

  public getAllSources(): SourcePolicy[] {
    return Array.from(this.sources.values());
  }

  public getEnabledSources(): SourcePolicy[] {
    return Array.from(this.sources.values()).filter(s => s.enabled);
  }

  private registerDefaultSources(): void {
    this.registerSource({
      sourceId: 'SRC_UPSTOX_V2',
      name: 'Upstox Historical and Intraday Market Data API',
      requestsPerMinute: 300,
      requestsPerHour: 10000,
      concurrency: 4,
      retryPolicy: { maxAttempts: 5, backoffMs: 500, exponentialFactor: 2 },
      allowedDomains: ['D2_DAILY_OHLCV', 'D7_INTRADAY', 'D8_FNO'],
      enabled: true
    });

    this.registerSource({
      sourceId: 'SRC_NSE_BHAVCOPY',
      name: 'NSE Official Historical Bhavcopy and Delivery Feeds',
      requestsPerMinute: 60,
      requestsPerHour: 2000,
      concurrency: 2,
      retryPolicy: { maxAttempts: 4, backoffMs: 1000, exponentialFactor: 2 },
      allowedDomains: ['D1_SECURITY_MASTER', 'D2_DAILY_OHLCV', 'D9_SECTOR_INDEX', 'D10_SURVEILLANCE'],
      enabled: true
    });

    this.registerSource({
      sourceId: 'SRC_FERE_FUNDAMENTALS',
      name: 'FERE Fundamental Statement & Quality Store',
      requestsPerMinute: 120,
      concurrency: 3,
      retryPolicy: { maxAttempts: 3, backoffMs: 500, exponentialFactor: 2 },
      allowedDomains: ['D4_FINANCIAL_STATEMENTS', 'D5_SHAREHOLDING'],
      enabled: true
    });

    this.registerSource({
      sourceId: 'SRC_CORPORATE_ANNOUNCEMENTS',
      name: 'NSE/BSE Regulatory Filings & Event Calendar',
      requestsPerMinute: 60,
      concurrency: 2,
      retryPolicy: { maxAttempts: 4, backoffMs: 1000, exponentialFactor: 2 },
      allowedDomains: ['D3_CORPORATE_ACTIONS', 'D6_EVENTS'],
      enabled: true
    });
  }
}
