/**
 * WealthOS v6.6–v6.7 - Fenix Provider Registry
 * External Reference Acceleration Layer
 */

export class FenixProviderRegistry {
  private static instance: FenixProviderRegistry;
  private supportedBrokers = ['ZERODHA', 'UPSTOX', 'ANGELONE', 'INTERACTIVE_BROKERS'];

  public static getInstance(): FenixProviderRegistry {
    if (!FenixProviderRegistry.instance) {
      FenixProviderRegistry.instance = new FenixProviderRegistry();
    }
    return FenixProviderRegistry.instance;
  }

  public getSupportedBrokers(): string[] {
    return [...this.supportedBrokers];
  }

  public isSupported(broker: string): boolean {
    return this.supportedBrokers.includes(broker.toUpperCase());
  }
}
