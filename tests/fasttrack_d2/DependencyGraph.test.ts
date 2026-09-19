/**
 * tests/fasttrack_d2/DependencyGraph.test.ts
 *
 * Unit and negative tests for Agent D: Real Compiler Dependency Graph.
 * Verifies:
 * 1. TypeScript Compiler API successfully parses imports, exports, and dynamic imports
 * 2. CP21IndependentVerifier cannot reach TrackBGate (reachable: false, path: [])
 * 3. B1SampleBuilder cannot reach TrackBGate (reachable: false, path: [])
 * 4. Negative Test: Injected dependency edge is immediately caught, path returned, and audit FAILS
 * 5. Full audit passes on clean tree
 */

import assert from 'assert';
import { ModuleDependencyAnalyzer } from '../../src/server/services/phase2fasttrack/ModuleDependencyAnalyzer';

async function runDependencyGraphTests() {
  console.log('\n============================================================');
  console.log('  AGENT D: COMPILER DEPENDENCY GRAPH & ISOLATION TESTS');
  console.log('============================================================\n');

  const analyzer = new ModuleDependencyAnalyzer();
  const audit = analyzer.analyze();

  // Test 1: Real AST resolution
  assert(audit.totalModules > 10, `Expected > 10 modules parsed by AST, got ${audit.totalModules}`);
  assert(audit.totalEdges > 15, `Expected > 15 edges parsed by AST, got ${audit.totalEdges}`);
  console.log(`[PASS] Test 1: Compiler AST parsed ${audit.totalModules} modules and ${audit.totalEdges} static/export edges`);

  // Test 2: CP21IndependentVerifier -> TrackBGate reachability is FALSE
  const verifierQuery = analyzer.checkReachability('CP21IndependentVerifier.ts', 'TrackBGate.ts');
  assert.strictEqual(verifierQuery.reachable, false, 'FAIL: CP21IndependentVerifier must not reach TrackBGate');
  assert.strictEqual(verifierQuery.path.length, 0);
  console.log('[PASS] Test 2: Reachability check (CP21IndependentVerifier -> TrackBGate): reachable = false');

  // Test 3: B1SampleBuilder -> TrackBGate reachability is FALSE
  const b1Query = analyzer.checkReachability('B1SampleBuilder.ts', 'TrackBGate.ts');
  assert.strictEqual(b1Query.reachable, false, 'FAIL: B1SampleBuilder must not reach TrackBGate');
  assert.strictEqual(b1Query.path.length, 0);
  console.log('[PASS] Test 3: Reachability check (B1SampleBuilder -> TrackBGate): reachable = false');

  // Test 4: Mandatory Negative Test - Injected Dependency Path MUST Fail
  console.log('\nInjecting hostile unauthorized path: CP21IndependentVerifier.ts -> HostileMiddleModule.ts -> TrackBGate.ts...');
  analyzer.injectTestEdgeForVerification('CP21IndependentVerifier.ts', 'HostileMiddleModule.ts');
  analyzer.injectTestEdgeForVerification('HostileMiddleModule.ts', 'TrackBGate.ts');

  const hostileQuery = analyzer.checkReachability('CP21IndependentVerifier.ts', 'TrackBGate.ts');
  assert.strictEqual(hostileQuery.reachable, true, 'FAIL: Injected dependency path must be detected!');
  assert.deepStrictEqual(hostileQuery.path, [
    'CP21IndependentVerifier.ts',
    'HostileMiddleModule.ts',
    'TrackBGate.ts'
  ]);
  console.log(`[PASS] Test 4a: Injected hostile path successfully detected: [${hostileQuery.path.join(' -> ')}]`);

  const hostileAudit = analyzer.analyze();
  assert.strictEqual(hostileAudit.passed, false, 'FAIL: Hostile audit must NOT pass!');
  assert(hostileAudit.unauthorizedExecutionPaths.length > 0);
  console.log('[PASS] Test 4b: Hostile audit correctly failed with unauthorizedExecutionPaths violation');

  // Test 5: Fresh analyzer passes cleanly
  const freshAnalyzer = new ModuleDependencyAnalyzer();
  const freshAudit = freshAnalyzer.analyze();
  assert.strictEqual(freshAudit.passed, true);
  assert.strictEqual(freshAudit.unauthorizedExecutionPaths.length, 0);
  console.log('[PASS] Test 5: Clean repository tree passes dependency isolation audit 100%');

  console.log('\n============================================================');
  console.log('  AGENT D: ALL 5 DEPENDENCY GRAPH TESTS PASSED');
  console.log('============================================================\n');
}

runDependencyGraphTests().catch(err => {
  console.error('DEPENDENCY GRAPH TEST FAILED:', err);
  process.exit(1);
});
