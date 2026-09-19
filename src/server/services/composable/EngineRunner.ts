/**
 * WealthOS v6.6 - Engine Runner
 * Agent E Deliverable
 * 
 * Execution harness orchestrating DecisionGraph runs, EvidenceBus lifecycle,
 * telemetry recording, and per-security conflict resolution.
 */

import { DecisionGraph } from './DecisionGraph.js';
import { EvidenceBus } from './EvidenceBus.js';
import { PITContext } from './PITContext.js';
import { DecisionConflictResolver, ConflictResolutionResult } from './DecisionConflictResolver.js';
import { TelemetryCollector } from './TelemetryCollector.js';
import { DecisionTraceRecorder } from './DecisionTrace.js';

export interface RunResults {
  runId: string;
  decisionDate: string;
  decisions: ConflictResolutionResult[];
  executionTimeMs: number;
}

export class EngineRunner {
  private conflictResolver = new DecisionConflictResolver();
  private telemetry = TelemetryCollector.getInstance();
  private traceRecorder = DecisionTraceRecorder.getInstance();

  public async run(
    graph: DecisionGraph,
    context: PITContext,
    targetSecurityIds: string[],
    runId: string = `RUN_${Date.now()}`
  ): Promise<RunResults> {
    const startTime = Date.now();
    const bus = new EvidenceBus();

    // Execute the complete graph in topological sequence
    await graph.execute(context, bus);

    // Resolve decisions per target security
    const decisions: ConflictResolutionResult[] = [];
    for (const secId of targetSecurityIds) {
      const secEvidence = bus.getEvidenceForSecurity(secId);
      const res = this.conflictResolver.resolve(secId, secEvidence);
      decisions.push(res);

      // Record trace
      this.traceRecorder.recordTrace({
        securityId: secId,
        decisionDate: context.decisionDate,
        runId,
        layers: secEvidence.map(e => ({
          engineId: e.engineId,
          role: 'SIGNAL',
          result: res.finalDecision === 'BLOCKED' ? 'REJECT' : 'PASS',
          evidenceId: e.id,
          reason: e.type
        })),
        finalDecision: res.finalDecision
      });
    }

    const duration = Date.now() - startTime;

    this.telemetry.record({
      runId,
      engineId: 'GRAPH_RUNNER',
      decisionDate: context.decisionDate,
      executionDurationMs: duration,
      evidenceProduced: bus.getAllEvidence().length,
      rejectionsEmitted: decisions.filter(d => d.finalDecision === 'BLOCKED').length,
      approvalsEmitted: decisions.filter(d => d.finalDecision === 'BUY').length,
      dataGapsEncountered: 0,
      memoryHeapUsedBytes: process.memoryUsage().heapUsed,
      timestamp: context.decisionTimestamp
    });

    return {
      runId,
      decisionDate: context.decisionDate,
      decisions,
      executionTimeMs: duration
    };
  }
}
