/**
 * WealthOS v6.6–v6.7 - Execution Provider Registry
 * Execution Architecture
 */

export class ExecutionProviderRegistry {
  private static instance: ExecutionProviderRegistry;
  private providers = ['FENIX_PAPER', 'UPSTOX_INTRADAY', 'RESEARCH_SIMULATOR'];

  public static getInstance(): ExecutionProviderRegistry {
    if (!ExecutionProviderRegistry.instance) {
      ExecutionProviderRegistry.instance = new ExecutionProviderRegistry();
    }
    return ExecutionProviderRegistry.instance;
  }

  public getSupportedProviders(): string[] {
    return [...this.providers];
  }
}
