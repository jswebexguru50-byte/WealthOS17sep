import { describe, it, expect } from 'vitest';
import { AdversarialAttackSuite } from '../../../src/server/services/audit/AdversarialAttackSuite.js';

describe('V67.1 Adversarial Attack Suite — Active Falsification Tests', () => {
  const suite = new AdversarialAttackSuite();

  it('Attack A: data substitution triggers CURRENT_UNIVERSE_CONTAMINATION', () => {
    const res = suite.attackA_DataSubstitution();
    expect(res.attackDefended).toBe(true);
    expect(res.actualOutcome).toBe('CURRENT_UNIVERSE_CONTAMINATION');
  });

  it('Attack B: available-at lookahead triggers LOOKAHEAD', () => {
    const res = suite.attackB_AvailableAtLookahead();
    expect(res.attackDefended).toBe(true);
    expect(res.actualOutcome).toBe('LOOKAHEAD');
  });

  it('Attack C: parameter mutation triggers RESEARCH_CONTAMINATION', () => {
    const res = suite.attackC_ConfigurationMutation();
    expect(res.attackDefended).toBe(true);
    expect(res.actualOutcome).toBe('RESEARCH_CONTAMINATION');
  });

  it('Attack D: ledger mutation triggers TAMPER_DETECTED', () => {
    const res = suite.attackD_LedgerMutation();
    expect(res.attackDefended).toBe(true);
    expect(res.actualOutcome).toBe('TAMPER_DETECTED');
  });

  it('Attack E: single-byte frozen file mutation triggers FROZEN_CONTROL_MISMATCH', () => {
    const res = suite.attackE_FrozenFileMutation();
    expect(res.attackDefended).toBe(true);
    expect(res.actualOutcome).toBe('FROZEN_CONTROL_MISMATCH');
  });

  it('Attack F: auditor dependency leakage triggers AUDITOR_DEPENDENCY_VIOLATION', () => {
    const res = suite.attackF_AuditorContamination();
    expect(res.attackDefended).toBe(true);
    expect(res.actualOutcome).toBe('AUDITOR_DEPENDENCY_VIOLATION');
  });

  it('Attack G: live execution bypass triggers GATE_11_PRODUCTION_PROMOTION_NOT_AUTHORIZED', () => {
    const res = suite.attackG_ExecutionBypass();
    expect(res.attackDefended).toBe(true);
    expect(res.actualOutcome).toBe('GATE_11_PRODUCTION_PROMOTION_NOT_AUTHORIZED');
  });

  it('Attack H: missing data records triggers DATA_INSUFFICIENT', () => {
    const res = suite.attackH_MissingData();
    expect(res.attackDefended).toBe(true);
    expect(res.actualOutcome).toBe('DATA_INSUFFICIENT');
  });

  it('All 8 adversarial attacks defended successfully', () => {
    const res = suite.runAllAttacks();
    expect(res.allDefended).toBe(true);
    expect(res.defendedAttacks).toBe(8);
  });
});
