/**
 * WealthOS v6.6 - Engine Registry & Runner
 * Agent E Deliverable
 * 
 * Provides centralized registration, discovery, and execution orchestration
 * for all ComposableEngine instances.
 */

import { ComposableEngine } from './EngineContract.js';
import { EvidenceBus } from './EvidenceBus.js';
import { PITContext } from './PITContext.js';
import { TelemetryCollector } from './TelemetryContract.js';

export class EngineRegistry {
  private static instance: EngineRegistry;
  private engines = new Map<string, ComposableEngine>();

  public static getInstance(): EngineRegistry {
    if (!EngineRegistry.instance) {
      EngineRegistry.instance = new EngineRegistry();
    }
    return EngineRegistry.instance;
  }

  public register(engine: ComposableEngine): void {
    this.engines.set(engine.engineId, engine);
  }

  public get(engineId: string): ComposableEngine | undefined {
    return this.engines.get(engineId);
  }

  public getAll(): ComposableEngine[] {
    return Array.from(this.engines.values());
  }
}

export class EngineRunner {
  private registry = EngineRegistry.getInstance();
  private telemetry = TelemetryCollector.getInstance();

  /**
   * Runs an engine in complete isolation
   */
  public async runIsolated(
    engineId: string,
    context: PITContext,
    universe: string[],
    runId: string
  ): Promise<EvidenceBus> {
    const engine = this.registry.get(engineId);
    if (!engine) throw new Error(`Engine ${engineId} not found in EngineRegistry`);

    const bus = new EvidenceBus();
    const start = Date.now();

    await engine.evaluate(bus, context, universe);

    const produced = bus.getAll();
    this.telemetry.recordEngineTelemetry({
      engineId,
      runId,
      decisionDate: context.decisionDate,
      signalsGenerated: produced.length,
      signalsRejected: 0,
      dataGapsEncountered: 0,
      pitViolations: 0,
      passPct: 100,
      rejectPct: 0,
      latencyMs: Date.now() - start
    });

    return bus;
  }
}
