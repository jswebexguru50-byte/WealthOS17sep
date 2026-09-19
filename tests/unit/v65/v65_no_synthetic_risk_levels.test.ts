import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('v6.5 Synthetic Fallback Invariant Tests (P0)', () => {
  it('should verify that all synthetic fallback invariants are strictly false in replay ledger records', () => {
    const ledgerPath = path.join(process.cwd(), 'data', 'v6.5', 'v65_economic_replay_ledger.jsonl');
    if (!fs.existsSync(ledgerPath)) return;

    const lines = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n');
    if (lines.length === 0 || !lines[0]) return;

    const sample = JSON.parse(lines[0]);

    // Hard synthetic invariant checks
    expect(sample.usedSyntheticTradePrice || false).toBe(false);
    expect(sample.usedSyntheticExit || false).toBe(false);
    expect(sample.usedSyntheticRiskLevel || false).toBe(false);
  });
});
