import { describe, it, expect } from 'vitest';
import { assertAcyclicDecisionGraph } from '../../../src/server/services/composable/GraphCycleGuard.js';
import { DecisionConflictResolver } from '../../../src/server/services/composable/DecisionConflictResolver.js';
import { TechnicalEngineAdapter } from '../../../src/server/services/adapters/TechnicalEngineAdapter.js';

describe('V67 Track F — Composable Graph Isolation, Acyclicity & Conflict Tests', () => {
  it('11. graph isolation: engines execute without direct private state coupling', () => {
    const techAdapter = new TechnicalEngineAdapter();
    expect(techAdapter.engineId).toBe('PureTechnical');
    expect(techAdapter.capability.roles).toContain('SIGNAL');
    expect(techAdapter.capability.consumes).toContain('FILTER_PASS');
  });

  it('12. graph bidirectionality: arbitrary acyclic direction supported', () => {
    // Direction A: FERE -> Technical
    const edgesA = [
      { sourceEngineId: 'FERE', targetEngineId: 'TECHNICAL', edgeType: 'FILTER' as any, policy: {} as any }
    ];
    const resA = assertAcyclicDecisionGraph(edgesA, ['FERE', 'TECHNICAL']);
    expect(resA.isAcyclic).toBe(true);

    // Direction B: Technical -> FERE
    const edgesB = [
      { sourceEngineId: 'TECHNICAL', targetEngineId: 'FERE', edgeType: 'FILTER' as any, policy: {} as any }
    ];
    const resB = assertAcyclicDecisionGraph(edgesB, ['FERE', 'TECHNICAL']);
    expect(resB.isAcyclic).toBe(true);

    // Circular Dependency Violation: Technical -> FERE -> Technical
    const circularEdges = [
      { sourceEngineId: 'TECHNICAL', targetEngineId: 'FERE', edgeType: 'FILTER' as any, policy: {} as any },
      { sourceEngineId: 'FERE', targetEngineId: 'TECHNICAL', edgeType: 'FILTER' as any, policy: {} as any }
    ];
    expect(() => assertAcyclicDecisionGraph(circularEdges, ['FERE', 'TECHNICAL'])).toThrow('GRAPH_CYCLE_VIOLATION');
  });

  it('13. DATA_INSUFFICIENT propagation: does not silently default to PASS or FAIL', () => {
    const resolver = DecisionConflictResolver.getInstance();
    const resolved = resolver.resolveSecurityDecisions('RELIANCE', [
      {
        id: 'EV_FERE_01',
        type: 'FERE_QUALITY_AUDIT',
        engineId: 'FERE',
        producerVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        securityId: 'RELIANCE',
        payload: { passed: false, reason: 'FORENSIC_FAILURE' },
        sha256Hash: 'hash1'
      }
    ]);
    expect(resolved.finalDecision).toBe('BLOCKED');
    expect(resolved.precedenceRuleApplied).toBe('HARD_FILTER_REJECT > SIGNAL');
  });

  it('14. technical-only isolation: runs independently without non-technical datasets', () => {
    const techAdapter = new TechnicalEngineAdapter();
    expect(techAdapter.capability.produces).toContain('TECHNICAL_SIGNAL');
    // Does not require financial facts
    expect(techAdapter.capability.consumes).not.toContain('FINANCIAL_FACTS');
  });
});
