/**
 * Waterfall Mocks - Test doubles for TTL Waterfall implementation
 */

export class MockTimeProvider {
  private now: number = 0;
  private monotonic: number = 0;
  public useMonotonicClock: boolean = false;
  private static currentInstance?: MockTimeProvider;

  constructor() {
    MockTimeProvider.currentInstance = this;
  }

  setNow(timestamp: number): void {
    this.now = timestamp;
    this.monotonic = timestamp;
  }

  getNow(): number {
    return this.now;
  }

  setMonotonicTime(timestamp: number): void {
    this.monotonic = timestamp;
  }

  getMonotonicTime(): number {
    return this.monotonic;
  }

  static getCurrentInstance(): MockTimeProvider | undefined {
    return MockTimeProvider.currentInstance;
  }
}

export class MockHttpClient {
  private responses: Map<string, any> = new Map();
  private errors: Map<string, any> = new Map();
  private callLog: any[] = [];

  setResponse(url: string, data: any): void {
    this.responses.set(url, data);
    this.errors.delete(url);
  }

  setError(url: string, error: any): void {
    this.errors.set(url, error);
    this.responses.delete(url);
  }

  async fetch(url: string, options?: any): Promise<any> {
    this.callLog.push({ url, options, timestamp: Date.now() });

    const error = this.errors.get(url);
    if (error) {
      const err = new Error(typeof error === 'string' ? error : error.message || 'HTTP Error');
      (err as any).status = error.status || 0;
      (err as any).code = error.code || error;
      throw err;
    }

    const response = this.responses.get(url);
    if (!response) {
      throw new Error(`No mock response set for ${url}`);
    }

    return { ok: true, json: async () => response, status: 200 };
  }

  getCallLog(): any[] {
    return this.callLog;
  }

  reset(): void {
    this.responses.clear();
    this.errors.clear();
    this.callLog = [];
  }
}

export class MockWebSocketClient {
  private isConnected: boolean = true;
  private handlers: Map<string, Function> = new Map();
  private messages: any[] = [];

  on(event: string, handler: Function): void {
    this.handlers.set(event, handler);
  }

  emit(event: string, data: any): void {
    const handler = this.handlers.get(event);
    if (handler) handler(data);
  }

  send(event: string, data: any): void {
    this.messages.push({ event, data, timestamp: Date.now() });
    this.emit(event, data);
  }

  disconnect(): void {
    this.isConnected = false;
    this.emit('disconnect', {});
  }

  reconnect(): void {
    this.isConnected = true;
    this.emit('connect', {});
  }

  isReady(): boolean {
    return this.isConnected;
  }

  getMessages(): any[] {
    return this.messages;
  }
}

export class MockCacheStore {
  private cache: Map<string, any> = new Map();
  private invalidatedKeys: Set<string> = new Set();
  private logger?: MockLogger;
  private timeProvider?: any;
  private static globalTimeProvider?: any;

  constructor(timeProvider?: any) {
    this.timeProvider = timeProvider;
  }

  static setGlobalTimeProvider(timeProvider: any): void {
    MockCacheStore.globalTimeProvider = timeProvider;
  }

  set(key: string, value: any): void {
    if (value.ttl === 0) {
      // Zero TTL means always stale, don't cache
      return;
    }
    let timeProvider = this.timeProvider || MockCacheStore.globalTimeProvider;
    if (!timeProvider) {
      timeProvider = MockTimeProvider.getCurrentInstance();
    }
    const now = timeProvider?.getNow ? timeProvider.getNow() : Date.now();
    this.cache.set(key, { ...value, _storedAt: now });
    this.invalidatedKeys.delete(key);
  }

  get(key: string): any {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired - always check, using provided time provider or real time
    let timeProvider = this.timeProvider || MockCacheStore.globalTimeProvider;
    if (!timeProvider) {
      timeProvider = MockTimeProvider.getCurrentInstance();
    }
    const now = timeProvider?.getNow ? timeProvider.getNow() : Date.now();

    if (entry.expiresAt && now >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  getRaw(key: string): any {
    // Get cached entry without doing TTL checking
    // This allows the caller to do their own freshness checking
    return this.cache.get(key) || null;
  }

  invalidate(key: string, context?: any): void {
    this.cache.delete(key);
    this.invalidatedKeys.add(key);
    if (this.logger && context) {
      this.logger.warn(`Cache invalidated: ${key} by ${context.user || 'unknown'}`);
    }
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern.replace('*', '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.invalidate(key);
      }
    }
  }

  evict(key: string): void {
    this.cache.delete(key);
  }

  size(): number {
    return this.cache.size;
  }

  getInvalidatedKeys(): string[] {
    return Array.from(this.invalidatedKeys);
  }

  setLogger(logger: MockLogger): void {
    this.logger = logger;
  }

  setTimeProvider(timeProvider: any): void {
    this.timeProvider = timeProvider;
  }

  clear(): void {
    this.cache.clear();
    this.invalidatedKeys.clear();
  }
}

export class MockConfigProvider {
  private config: Map<string, any> = new Map();
  private listeners: Function[] = [];

  set(key: string, value: any): void {
    this.config.set(key, value);
    this.listeners.forEach(listener => listener(key, value));
  }

  get(key: string): any {
    return this.config.get(key);
  }

  has(key: string): boolean {
    return this.config.has(key);
  }

  onChange(listener: Function): void {
    this.listeners.push(listener);
  }

  getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    this.config.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  clear(): void {
    this.config.clear();
  }
}

export class MockLogger {
  private logs: string[] = [];
  private errorLogs: string[] = [];
  private warningLogs: string[] = [];

  log(message: string, ...args: any[]): void {
    const msg = `[LOG] ${message}`;
    this.logs.push(msg);
  }

  warn(message: string, ...args: any[]): void {
    const msg = `[WARN] ${message}`;
    this.warningLogs.push(msg);
    this.logs.push(msg);
  }

  error(message: string, ...args: any[]): void {
    const msg = `[ERROR] ${message}`;
    this.errorLogs.push(msg);
    this.logs.push(msg);
  }

  info(message: string, ...args: any[]): void {
    const msg = `[INFO] ${message}`;
    this.logs.push(msg);
  }

  debug(message: string, ...args: any[]): void {
    const msg = `[DEBUG] ${message}`;
    this.logs.push(msg);
  }

  getLogs(): string[] {
    return this.logs;
  }

  getErrorLogs(): string[] {
    return this.errorLogs;
  }

  getWarningLogs(): string[] {
    return this.warningLogs;
  }

  clear(): void {
    this.logs = [];
    this.errorLogs = [];
    this.warningLogs = [];
  }
}

export class MockMetricsExporter {
  private evictions: Map<string, number> = new Map();
  private hits: Map<string, number> = new Map();
  private misses: Map<string, number> = new Map();
  private tierUsage: Map<string, number> = new Map();
  private fallbackRecords: any[] = [];
  private alerts: Set<string> = new Set();
  private logger?: MockLogger;
  private thresholds: Map<string, number> = new Map();

  recordEviction(metricType: string, count: number): void {
    const current = this.evictions.get(metricType) || 0;
    this.evictions.set(metricType, current + count);

    // Check threshold
    const threshold = this.thresholds.get('eviction_threshold') || 100;
    if (current + count > threshold) {
      this.logger?.warn(`High eviction rate for ${metricType}: ${current + count}`);
    }
  }

  recordHit(metricType: string, count: number): void {
    const current = this.hits.get(metricType) || 0;
    this.hits.set(metricType, current + count);
  }

  recordMiss(metricType: string, count: number): void {
    const current = this.misses.get(metricType) || 0;
    this.misses.set(metricType, current + count);
  }

  recordTierUsage(tier: string, count: number): void {
    const current = this.tierUsage.get(tier) || 0;
    this.tierUsage.set(tier, current + count);

    // Check if secondary usage is too high
    if (tier === 'secondary') {
      const primaryCount = this.tierUsage.get('primary') || 1;
      const secondaryThreshold = this.thresholds.get('secondary_activation') || 0.5;
      const rate = (current + count) / (primaryCount + current + count);
      if (rate > secondaryThreshold) {
        this.alerts.add('primary_unhealthy');
        this.logger?.warn('Primary fetcher appears unhealthy - secondary usage too high');
      }
    }
  }

  recordTierFallback(tier: string, reason: string): void {
    this.fallbackRecords.push({ tier, reason, timestamp: Date.now() });
  }

  getEvictions(metricType: string): number {
    return this.evictions.get(metricType) || 0;
  }

  getHitRate(metricType: string): number {
    const hits = this.hits.get(metricType) || 0;
    const misses = this.misses.get(metricType) || 0;
    const total = hits + misses;
    return total === 0 ? 0 : hits / total;
  }

  getEvictionRate(metricType: string): number {
    const evictions = this.evictions.get(metricType) || 0;
    return evictions;
  }

  getTierUsage(tier: string): number {
    return this.tierUsage.get(tier) || 0;
  }

  getFallbackRecords(): any[] {
    return this.fallbackRecords;
  }

  getTriggeredAlerts(): string[] {
    return Array.from(this.alerts);
  }

  exportPrometheus(): string {
    let output = '';
    this.evictions.forEach((count, metric) => {
      output += `cache_evictions{metric="${metric}"} ${count}\n`;
    });
    this.hits.forEach((count, metric) => {
      output += `cache_hits{metric="${metric}"} ${count}\n`;
    });
    return output;
  }

  setLogger(logger: MockLogger): void {
    this.logger = logger;
  }

  setThreshold(key: string, value: number): void {
    this.thresholds.set(key, value);
  }

  clear(): void {
    this.evictions.clear();
    this.hits.clear();
    this.misses.clear();
    this.tierUsage.clear();
    this.fallbackRecords = [];
    this.alerts.clear();
  }
}
