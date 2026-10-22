import { test } from 'vitest';
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
    'src/server/services/phase2fasttrack/CP21IndependentVerifier.ts',
    'HostileMiddleModule.ts',
    'src/server/services/phase2fasttrack/TrackBGate.ts'
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

  // Test 6: Uninspected module throws ANALYZER_VERIFIER_FAILURE (distinguishing uninspected from no path)
  assert.throws(
    () => freshAnalyzer.checkReachability('CP21IndependentVerifier.ts', 'NonExistentModuleUninspected.ts'),
    /ANALYZER_VERIFIER_FAILURE/,
    'FAIL: Querying uninspected module must throw ANALYZER_VERIFIER_FAILURE'
  );
  console.log('[PASS] Test 6: Uninspected module correctly threw ANALYZER_VERIFIER_FAILURE');

  // Test 7: Deliberate same-basename collision: src/server/services/a/Foo.ts vs src/server/services/b/Foo.ts
  console.log('\nTesting same-basename collision (src/server/services/a/Foo.ts vs src/server/services/b/Foo.ts)...');
  freshAnalyzer.injectTestEdgeForVerification('src/server/services/a/Foo.ts', 'src/server/services/a/Bar.ts');
  freshAnalyzer.injectTestEdgeForVerification('src/server/services/b/Foo.ts', 'src/server/services/b/Baz.ts');

  const canonA = freshAnalyzer.toCanonicalPath('src/server/services/a/Foo.ts');
  const canonB = freshAnalyzer.toCanonicalPath('src/server/services/b/Foo.ts');
  assert.notStrictEqual(canonA, canonB, 'FAIL: a/Foo.ts and b/Foo.ts must have distinct canonical paths');
  assert.strictEqual(canonA, 'src/server/services/a/Foo.ts');
  assert.strictEqual(canonB, 'src/server/services/b/Foo.ts');

  // Ambiguous basename lookup for Foo.ts must return null
  const ambiguousRes = freshAnalyzer.resolveCanonicalModule('Foo.ts');
  assert.strictEqual(ambiguousRes, null, 'FAIL: Ambiguous Foo.ts query must resolve to null, requiring exact canonical path');
  console.log('[PASS] Test 7: Same-basename collision test passed (a/Foo.ts and b/Foo.ts remain distinct nodes)');

  console.log('\n============================================================');
  console.log('  AGENT D: ALL 7 DEPENDENCY GRAPH TESTS PASSED');
  console.log('============================================================\n');
}

test('Legacy Script', async () => { await runDependencyGraphTests(); });



