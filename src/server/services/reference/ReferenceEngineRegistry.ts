/**
 * WealthOS v6.6–v6.7 - Reference Engine Registry
 * External Reference Acceleration Layer
 * 
 * Central registry for external reference implementations.
 */

import { ReferenceEngineContract } from './ReferenceEngineContract.js';

export class ReferenceEngineRegistry {
  private static instance: ReferenceEngineRegistry;
  private engines = new Map<string, ReferenceEngineContract>();

  public static getInstance(): ReferenceEngineRegistry {
    if (!ReferenceEngineRegistry.instance) {
      ReferenceEngineRegistry.instance = new ReferenceEngineRegistry();
    }
    return ReferenceEngineRegistry.instance;
  }

  public register(engine: ReferenceEngineContract): void {
    this.engines.set(engine.referenceId.toUpperCase(), engine);
  }

  public get(referenceId: string): ReferenceEngineContract | undefined {
    return this.engines.get(referenceId.toUpperCase());
  }

  public getAll(): ReferenceEngineContract[] {
    return Array.from(this.engines.values());
  }
}
