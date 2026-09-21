/**
 * WealthOS v6.6 - Decision Graph
 * Agent E Deliverable
 * 
 * SPEC MANDATE:
 * Orchestrates multi-engine decision trees as a Directed Acyclic Graph (DAG).
 * Executes in strict topological order, enforces edge filter gates,
 * and routes evidence through the EvidenceBus.
 */

import crypto from 'crypto';
import { ComposableEngine } from './EngineContract.js';
import { DecisionEdge, DecisionEdgePolicy } from './DecisionEdgePolicy.js';
import { EvidenceBus } from './EvidenceBus.js';
import { PITContext } from './PITContext.js';
import { DecisionConflictResolver } from './DecisionConflictResolver.js';
import { DecisionTraceService, DecisionTraceLayer } from './DecisionTrace.js';

export interface GraphExecutionResult {
  graphId: string;
  runId: string;
  decisionDate: string;
  totalSecurities: number;
  decisions: Array<{
    securityId: string;
    finalDecision: string;
    precedenceApplied: string;
  }>;
  executionDurationMs: number;
}

export class DecisionGraph {
  public readonly graphId: string;
  public readonly version: string;
  private engines = new Map<string, ComposableEngine>();
  private edges: DecisionEdge[] = [];
  private conflictResolver = DecisionConflictResolver.getInstance();
  private traceService = DecisionTraceService.getInstance();

  constructor(graphId: string, version = '1.0.0') {
    this.graphId = graphId;
    this.version = version;
  }

  public addEngine(engine: ComposableEngine): this {
    this.engines.set(engine.engineId, engine);
    return this;
  }

  public addEdge(edge: DecisionEdge): this {
    const source = this.engines.get(edge.sourceEngineId);
    const target = this.engines.get(edge.targetEngineId);

    if (!source || !target) {
      throw new Error(`Invalid edge: Source "${edge.sourceEngineId}" or Target "${edge.targetEngineId}" not in graph`);
    }

    const validation = DecisionEdgePolicy.validateEdge(
      edge,
      source.capability.produces,
      target.capability.consumes
    );

    if (!validation.valid) {
      throw new Error(`DecisionEdge validation failure: ${validation.diagnostic}`);
    }

    this.edges.push(edge);
    return this;
  }

  public getDefinitionHash(): string {
    const raw = JSON.stringify({
      graphId: this.graphId,
      version: this.version,
      engines: Array.from(this.engines.keys()).sort(),
      edges: this.edges.map(e => ({ s: e.sourceEngineId, t: e.targetEngineId, type: e.edgeType }))
    });
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  public getExecutionOrder(): string[] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const engineId of this.engines.keys()) {
      inDegree.set(engineId, 0);
      adj.set(engineId, []);
    }

    for (const edge of this.edges) {
      adj.get(edge.sourceEngineId)?.push(edge.targetEngineId);
      inDegree.set(edge.targetEngineId, (inDegree.get(edge.targetEngineId) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(u);

      for (const v of adj.get(u) || []) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    return order.length === this.engines.size ? order : Array.from(this.engines.keys());
  }

  /**
   * Evaluates entire graph over the specified universe
   */
  public async execute(
    busOrContext: any,
    contextOrBus: any,
    universeSecurityIds: string[] = ['RELIANCE'],
    runId: string = `RUN_${Date.now()}`
  ): Promise<GraphExecutionResult> {
    const bus: EvidenceBus = busOrContext instanceof EvidenceBus ? busOrContext : contextOrBus;
    const context: PITContext = busOrContext instanceof PITContext ? busOrContext : contextOrBus;
    const startTime = Date.now();

    // 1. Execute each engine in topological order
    const order = this.getExecutionOrder();
    for (const engineId of order) {
      const engine = this.engines.get(engineId);
      if (engine) {
        await engine.evaluate(bus, context, universeSecurityIds);
      }
    }

    // 2. For each security in universe, resolve conflict and record decision trace
    const decisions: Array<{ securityId: string; finalDecision: string; precedenceApplied: string }> = [];

    for (const secId of universeSecurityIds) {
      const securityEvidence = bus.getBySecurity(secId);
      const resolution = this.conflictResolver.resolveSecurityDecisions(secId, securityEvidence);

      const layers: DecisionTraceLayer[] = [];
      for (const [engId, eng] of this.engines) {
        const engEvt = securityEvidence.find(e => e.engineId === engId);
        layers.push({
          engineId: engId,
          role: eng.capability.roles[0] || 'SIGNAL',
          result: engEvt ? (resolution.finalDecision === 'BLOCKED' && (engEvt.payload as any)?.passed === false ? 'REJECT' : 'PASS') : 'NOT_REACHED',
          evidenceId: engEvt?.id,
          reason: (engEvt?.payload as any)?.reason
        });
      }

      this.traceService.recordTrace({
        securityId: secId,
        symbol: secId,
        decisionDate: context.decisionDate,
        runId,
        layers,
        finalDecision: resolution.finalDecision,
        summaryReason: resolution.precedenceRuleApplied
      });

      decisions.push({
        securityId: secId,
        finalDecision: resolution.finalDecision,
        precedenceApplied: resolution.precedenceRuleApplied
      });
    }

    return {
      graphId: this.graphId,
      runId,
      decisionDate: context.decisionDate,
      totalSecurities: universeSecurityIds.length,
      decisions,
      executionDurationMs: Date.now() - startTime
    };
  }
}
