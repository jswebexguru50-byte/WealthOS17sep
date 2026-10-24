/**
 * src/server/services/SourceRegistry.ts
 * Maps source types to handlers and reliability weights
 */

export interface SourceHandler {
  type: string;
  name: string;
  reliabilityWeight: number;
  handler: (portfolioId: string) => Promise<any>;
}

export class SourceRegistry {
  private static instance: SourceRegistry;
  private sources: Map<string, SourceHandler> = new Map();
  private reliabilityWeights: Map<string, number> = new Map([
    ['broker', 0.98],
    ['exchange', 0.99],
    ['cache', 0.7],
    ['api', 0.85],
    ['error', 0.0]
  ]);

  static getInstance(): SourceRegistry {
    if (!SourceRegistry.instance) {
      SourceRegistry.instance = new SourceRegistry();
    }
    return SourceRegistry.instance;
  }

  register(source: SourceHandler): void {
    this.sources.set(source.type, source);
  }

  getSource(type: string): SourceHandler | undefined {
    return this.sources.get(type);
  }

  getAllSources(): SourceHandler[] {
    return Array.from(this.sources.values());
  }

  getReliabilityWeight(type: string): number {
    return this.reliabilityWeights.get(type) ?? 0.5;
  }
}
