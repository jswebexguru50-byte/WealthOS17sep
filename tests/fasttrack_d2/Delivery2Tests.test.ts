import assert from 'assert';
import { CP21DataStatus } from '../../src/server/services/phase2fasttrack/FastTrackTypes';
import { SourceRequestHasher } from '../../src/server/services/phase2fasttrack/SourceRequestHasher';
import { DecisionAuditLedger } from '../../src/server/services/phase2fasttrack/DecisionAuditLedger';
import { TrackBGate } from '../../src/server/services/phase2fasttrack/TrackBGate';
import { CP21Coordinator } from '../../src/server/services/phase2fasttrack/CP21Coordinator';
import { B1SampleBuilder } from '../../src/server/services/phase2fasttrack/B1SampleBuilder';
import { FastTrackCoordinator } from '../../src/server/services/phase2fasttrack/FastTrackCoordinator';

// Helper to run tests
async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`❌ ${name}`);
      console.error(e);
      failed++;
    }
  }

  console.log('--- Running Delivery 2 Tests ---');

  // Source Hashing Tests
  test('SourceRequestHasher: deterministic output', () => {
    const hash1 = SourceRequestHasher.hashRequest('A', 'B', '2020-01-01', '2020-01-02', '1D', 'NONE');
    const hash2 = SourceRequestHasher.hashRequest('A', 'B', '2020-01-01', '2020-01-02', '1D', 'NONE');
    assert.strictEqual(hash1, hash2);
  });
  
  test('SourceRequestHasher: different inputs yield different hashes', () => {
    const hash1 = SourceRequestHasher.hashRequest('A', 'B', '2020-01-01', '2020-01-02', '1D', 'NONE');
    const hash2 = SourceRequestHasher.hashRequest('A', 'C', '2020-01-01', '2020-01-02', '1D', 'NONE');
    assert.notStrictEqual(hash1, hash2);
  });

  // DecisionAuditLedger Tests
  test('DecisionAuditLedger: hash chain integrity', () => {
    const ledger = new DecisionAuditLedger('test-run-1');
    ledger.appendRecord('test-run-1', 'CP2.1', 'VALIDATION', 'S1', 'hash1', 'hash2', { p1: true }, 'PASS', []);
    ledger.appendRecord('test-run-1', 'CP2.1', 'VALIDATION', 'S2', 'hash3', 'hash4', { p2: true }, 'PASS', []);
    assert.strictEqual(ledger.verifyChain(), true);
  });

  test('DecisionAuditLedger: tampering detection', () => {
    const ledger = new DecisionAuditLedger('test-run-2');
    ledger.appendRecord('test-run-2', 'CP2.1', 'VALIDATION', 'S1', 'hash1', 'hash2', { p1: true }, 'PASS', []);
    ledger.appendRecord('test-run-2', 'CP2.1', 'VALIDATION', 'S2', 'hash3', 'hash4', { p2: true }, 'PASS', []);
    
    // tamper
    const records = ledger.getRecords();
    records[0].status = 'FAIL'; // modify an earlier record
    assert.strictEqual(ledger.verifyChain(), false);
  });

  // TrackBGate Tests
  test('TrackBGate: Block B1 with invalid token', () => {
    const coord = new CP21Coordinator('test');
    const gate = new TrackBGate(coord);
    assert.throws(() => {
        gate.authorizeB1({ gate: "CP2.1", decision: "BLOCKED", evidenceHash: "1", generatedAt: "", tokenHash: "" });
    }, /B1_BLOCKED_INVALID_CP21_TOKEN/);
  });

  test('TrackBGate: Block B2 with invalid B1 token', () => {
    const coord = new CP21Coordinator('test');
    const gate = new TrackBGate(coord);
    assert.throws(() => {
        gate.authorizeB2(
            { gate: "CP2.1", decision: "VERIFIED", evidenceHash: "H1", generatedAt: "", tokenHash: "" },
            { gate: "B1", decision: "BLOCKED", evidenceHash: "H1", generatedAt: "", tokenHash: "" }
        );
    }, /B2_BLOCKED_B1_SAMPLE_GATE_NOT_PASSED/);
  });

  // B2 Bypass Tests
  test('B2Bypass: runTrackB explicitly hard-locked', async () => {
    const fastTrackCoord = new FastTrackCoordinator('test');
    let threw = false;
    try {
        await fastTrackCoord.runTrackB();
    } catch(e: any) {
        if (e.message.includes('B2_BLOCKED_B1_SAMPLE_GATE_NOT_PASSED')) {
            threw = true;
        }
    }
    assert.strictEqual(threw, true);
  });

  // B1 Contract Only Tests
  test('B1SampleBuilder: throws contract only error', () => {
      const builder = new B1SampleBuilder({} as any);
      assert.throws(() => {
          builder.constructSample({}, [], {});
      }, /B1_BLOCKED_DELIVERY_2_CONTRACT_ONLY/);
  });

  console.log(`\nTests passed: ${passed}, failed: ${failed}`);
}

runTests();
