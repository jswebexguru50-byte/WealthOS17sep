import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('V672-R1 — Canonical v6.5 Immutability & SHA-256 Preservation Tests', () => {
  const canonicalDir = path.resolve('data/v6.5/runs/REPLAY_V65_ED18F3B9A403');
  const ledgerPath = path.join(canonicalDir, 'v65_economic_replay_ledger.jsonl');
  const equityPath = path.join(canonicalDir, 'v65_daily_portfolio_equity.jsonl');

  const EXPECTED_LEDGER_SHA256 = 'f2177c218c0fee5e139d563fff3f43f2b9a2ad75cdae4c96ff9228cb71a1fec3';
  const EXPECTED_EQUITY_SHA256 = '2a274cda1cd1a1f428782e3ee8b0ae058c45d442af0c715657dae06c91d5cabc';

  it('asserts canonical v6.5 trade ledger matches declared SHA-256 bit-for-bit', () => {
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const buf = fs.readFileSync(ledgerPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    expect(hash).toBe(EXPECTED_LEDGER_SHA256);
  });

  it('asserts canonical v6.5 daily equity curve matches declared SHA-256 bit-for-bit', () => {
    expect(fs.existsSync(equityPath)).toBe(true);
    const buf = fs.readFileSync(equityPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    expect(hash).toBe(EXPECTED_EQUITY_SHA256);
  });

  it('verifies exact session and trade counts in canonical baseline', () => {
    const ledgerLines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(l => l.length > 0);
    const equityLines = fs.readFileSync(equityPath, 'utf8').trim().split('\n').filter(l => l.length > 0);

    expect(ledgerLines.length).toBe(4506);
    expect(equityLines.length).toBe(1631);
  });
});
