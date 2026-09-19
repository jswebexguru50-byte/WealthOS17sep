import { describe, it, expect, beforeAll } from 'vitest';
import { CanonicalLedgerReconciliation } from '../../../src/server/services/phase2fasttrack/CanonicalLedgerReconciliation';
import { ImmutableSignal } from '../../../src/server/services/phase2fasttrack/FastTrackTypes';

describe('Canonical Ledger Substitution Attacks', () => {
  let reconciler: CanonicalLedgerReconciliation;
  let canonicalSignals: ImmutableSignal[] = [];

  beforeAll(async () => {
    reconciler = new CanonicalLedgerReconciliation();
    canonicalSignals = await reconciler.parseLedger('reports/v674-phase2/02_CORRECTED_SIGNALS.csv');
  });

  it('should pass on exactly identical canonical ledger', async () => {
    const passed = await reconciler.reconcile(canonicalSignals);
    expect(passed).toBe(true);
  });

  it('should FAIL on 19-record substitution attack', async () => {
    const mock19 = canonicalSignals.slice(0, 19);
    const passed = await reconciler.reconcile(mock19);
    expect(passed).toBe(false);
  });

  it('should FAIL on single parameter modification', async () => {
    const modified = JSON.parse(JSON.stringify(canonicalSignals));
    modified[0].signal = false;
    const passed = await reconciler.reconcile(modified);
    expect(passed).toBe(false);
  });

  it('should FAIL on single security modification', async () => {
    const modified = JSON.parse(JSON.stringify(canonicalSignals));
    modified[0].securityId = 'FAKE_SEC';
    const passed = await reconciler.reconcile(modified);
    expect(passed).toBe(false);
  });

  it('should FAIL on single decision date modification', async () => {
    const modified = JSON.parse(JSON.stringify(canonicalSignals));
    modified[0].decisionDate = '2099-01-01T15:35:00Z';
    const passed = await reconciler.reconcile(modified);
    expect(passed).toBe(false);
  });
});
