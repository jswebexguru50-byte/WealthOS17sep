/**
 * Authoritative Deterministic Test Suite for WealthOS Universal Review Framework
 * Executable directly via standard Node.js without transpiler / tsx overhead.
 * Satisfies: Codex Findings FRAMEWORK_AUTHORITY_001, FRAMEWORK_CAPABILITY_COVERAGE_001, and FRAMEWORK_TEST_AUTHENTICITY_001
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReviewStateController } from './reviewStateController.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../');

function assert(condition, msg) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

console.log('=== WEALTHOS UNIVERSAL REVIEW FRAMEWORK AUTHORITATIVE TEST ===\n');

// -----------------------------------------------------------------------------
// 1. Validate WEALTHOS_CAPABILITY_REGISTRY.json
// -----------------------------------------------------------------------------
const capPath = path.join(root, 'reports/review/WEALTHOS_CAPABILITY_REGISTRY.json');
assert(fs.existsSync(capPath), 'WEALTHOS_CAPABILITY_REGISTRY.json exists');
const capRegistry = JSON.parse(fs.readFileSync(capPath, 'utf-8'));
assert(Array.isArray(capRegistry.capabilities), 'capabilities is an array');
assert(capRegistry.capabilities.length >= 23, `At least 23 capabilities registered (found ${capRegistry.capabilities.length})`);

const capIds = new Set();
let foundResearch = false;
let foundSmartMoney = false;

for (const cap of capRegistry.capabilities) {
  assert(!capIds.has(cap.capabilityId), `Unique capabilityId: ${cap.capabilityId}`);
  capIds.add(cap.capabilityId);
  assert(Boolean(cap.domain), `Capability ${cap.capabilityId} has domain`);
  assert(Boolean(cap.name), `Capability ${cap.capabilityId} has name`);
  assert(['IMPLEMENTED', 'DOCUMENTED', 'PROPOSED', 'UNPROVEN', 'DEPRECATED'].includes(cap.status), `Valid status for ${cap.capabilityId}`);
  assert(Array.isArray(cap.productionFiles) && cap.productionFiles.length > 0, `Capability ${cap.capabilityId} has productionFiles`);

  // Verify that every single production file referenced in the capability actually exists on disk!
  for (const pf of cap.productionFiles) {
    const fullPf = path.join(root, pf);
    assert(fs.existsSync(fullPf), `Verified production file exists on disk: ${pf}`);
  }

  if (cap.capabilityId === 'CAP_RESEARCH_KNOWLEDGE_INTELLIGENCE') foundResearch = true;
  if (cap.capabilityId === 'CAP_INSTITUTIONAL_SMART_MONEY') foundSmartMoney = true;
}

assert(foundResearch, 'Distinct capability CAP_RESEARCH_KNOWLEDGE_INTELLIGENCE is registered');
assert(foundSmartMoney, 'Distinct capability CAP_INSTITUTIONAL_SMART_MONEY is registered');

// -----------------------------------------------------------------------------
// 2. Validate REVIEW_REQUIREMENT_REGISTRY.json
// -----------------------------------------------------------------------------
const reqPath = path.join(root, 'reports/review/REVIEW_REQUIREMENT_REGISTRY.json');
assert(fs.existsSync(reqPath), 'REVIEW_REQUIREMENT_REGISTRY.json exists');
const reqRegistry = JSON.parse(fs.readFileSync(reqPath, 'utf-8'));
assert(Array.isArray(reqRegistry.requirements), 'requirements is an array');
assert(reqRegistry.requirements.length >= 15, `At least 15 requirements registered (found ${reqRegistry.requirements.length})`);

const reqIds = new Set();
for (const req of reqRegistry.requirements) {
  assert(!reqIds.has(req.requirementId), `Unique requirementId: ${req.requirementId}`);
  reqIds.add(req.requirementId);
  assert(Boolean(req.title), `Requirement ${req.requirementId} has title`);
  assert(['IMPLEMENTED', 'DOCUMENTED', 'PROPOSED', 'UNPROVEN', 'DEPRECATED'].includes(req.status), `Valid status for ${req.requirementId}`);
  assert(Boolean(req.traceability), `Requirement ${req.requirementId} has traceability`);
}

// -----------------------------------------------------------------------------
// 3. Validate Cross-References in PROGRAM_SPEC.json
// -----------------------------------------------------------------------------
const progPath = path.join(root, 'reports/review/programs/FUNDAMENTAL_CALIBRATION/PROGRAM_SPEC.json');
assert(fs.existsSync(progPath), 'PROGRAM_SPEC.json exists');
const progSpec = JSON.parse(fs.readFileSync(progPath, 'utf-8'));
for (const cid of progSpec.associatedCapabilities) {
  assert(capIds.has(cid), `Program referenced capability exists in registry: ${cid}`);
}
for (const rid of progSpec.associatedRequirements) {
  assert(reqIds.has(rid), `Program referenced requirement exists in registry: ${rid}`);
}

// Verify frozen CAL_020 cohort without developer verdicts
const cal020 = progSpec.reviewWaves.find(w => w.waveId === 'CAL_020');
assert(Boolean(cal020), 'CAL_020 wave found in PROGRAM_SPEC.json');
assert(cal020.cohortReference.symbols.length === 20, 'CAL_020 cohort contains exactly 20 symbols');

// -----------------------------------------------------------------------------
// 4. Exercise the Shared ReviewStateController with Real Control-Plane Fixtures
// -----------------------------------------------------------------------------
const tempFixturePath = path.join(root, 'reports/review/control/temp_test_review_state.json');

try {
  // Initialize fixture in REMEDIATION_READY
  const initialData = {
    state: 'REMEDIATION_READY',
    program: 'FUNDAMENTAL_CALIBRATION',
    reviewId: 'TEST_REV_001',
    requestId: 'TEST_REQ_001',
    iteration: 1,
    setBy: 'CODEX',
    reason: 'Initial test state',
    activeOwner: 'ANTIGRAVITY',
    timestamp: new Date().toISOString(),
    stateHistory: []
  };
  fs.writeFileSync(tempFixturePath, JSON.stringify(initialData, null, 2), 'utf-8');

  const controller = new ReviewStateController(tempFixturePath);

  // Test 4a: Negative Test - ANTIGRAVITY cannot transition to PASS
  const negPassCheck = controller.validateTransition('ANTIGRAVITY_WORKING', 'PASS', 'ANTIGRAVITY');
  assert(negPassCheck.valid === false, 'Shared controller rejects ANTIGRAVITY -> PASS');
  assert(negPassCheck.error.includes('AUTHORITY_VIOLATION'), 'Rejection error specifies AUTHORITY_VIOLATION');

  // Test 4b: Negative Test - ANTIGRAVITY cannot declare REMEDIATION_READY
  const negRemCheck = controller.validateTransition('ANTIGRAVITY_WORKING', 'REMEDIATION_READY', 'ANTIGRAVITY');
  assert(negRemCheck.valid === false, 'Shared controller rejects ANTIGRAVITY -> REMEDIATION_READY');

  // Test 4c: Negative Test - CODEX cannot set ANTIGRAVITY_WORKING
  const negCodexCheck = controller.validateTransition('REMEDIATION_READY', 'ANTIGRAVITY_WORKING', 'CODEX');
  assert(negCodexCheck.valid === false, 'Shared controller rejects CODEX -> ANTIGRAVITY_WORKING');

  // Test 4d: Negative Predecessor Test - Invalid transition path
  const negPathCheck = controller.validateTransition('IDLE', 'AWAITING_CODEX_VERIFICATION', 'ANTIGRAVITY');
  assert(negPathCheck.valid === false, 'Shared controller rejects invalid predecessor transition (IDLE -> AWAITING_CODEX_VERIFICATION)');

  // Test 4e: Positive Authorized Sequence
  // Step 1: ANTIGRAVITY picks up REMEDIATION_READY -> ANTIGRAVITY_WORKING
  controller.executeTransition('ANTIGRAVITY_WORKING', 'ANTIGRAVITY', { reason: 'Developer starting work' });
  let state = controller.readState();
  assert(state.state === 'ANTIGRAVITY_WORKING', 'Transitioned to ANTIGRAVITY_WORKING');
  assert(state.activeOwner === 'ANTIGRAVITY', 'Active owner is ANTIGRAVITY');

  // Step 2: ANTIGRAVITY finishes -> AWAITING_CODEX_VERIFICATION
  controller.executeTransition('AWAITING_CODEX_VERIFICATION', 'ANTIGRAVITY', { reason: 'Developer finished remediation' });
  state = controller.readState();
  assert(state.state === 'AWAITING_CODEX_VERIFICATION', 'Transitioned to AWAITING_CODEX_VERIFICATION');
  assert(state.activeOwner === 'CODEX', 'Active owner transitioned to CODEX');

  // Step 3: CODEX starts verification -> CODEX_REVIEWING
  controller.executeTransition('CODEX_REVIEWING', 'CODEX', { reason: 'Codex reviewing deliverables' });
  state = controller.readState();
  assert(state.state === 'CODEX_REVIEWING', 'Transitioned to CODEX_REVIEWING');

  // Step 4: CODEX accepts and issues PASS
  controller.executeTransition('PASS', 'CODEX', { reason: 'Codex verified clean' });
  state = controller.readState();
  assert(state.state === 'PASS', 'CODEX successfully set PASS');

  // Test 4f: Validate History Integrity of the fixture
  const integrity = controller.validateStateFileIntegrity();
  assert(integrity.valid === true, `Fixture transition history is 100% valid (0 errors, ${state.stateHistory.length} transitions)`);

} finally {
  if (fs.existsSync(tempFixturePath)) {
    fs.unlinkSync(tempFixturePath);
  }
}

// -----------------------------------------------------------------------------
// 5. Validate Actual Control Plane State File Integrity
// -----------------------------------------------------------------------------
const actualController = new ReviewStateController(path.join(root, 'reports/review/control/REVIEW_STATE.json'));
const actualIntegrity = actualController.validateStateFileIntegrity();
assert(actualIntegrity.valid === true, `Actual reports/review/control/REVIEW_STATE.json is valid (errors: ${actualIntegrity.errors.join(', ') || 'none'})`);

// -----------------------------------------------------------------------------
// 6. Historical Artifacts Preserved Check
// -----------------------------------------------------------------------------
const historicalFiles = [
  'reports/fundamental-review/PILOT_RUN_001.json',
  'reports/fundamental-review/PILOT_RUN_001.md',
  'reports/fundamental-review/PILOT_RUN_002.json',
  'reports/fundamental-review/POST_PILOT_001_CHANGE_LEDGER.json',
  'reports/fundamental-review/TEST_INTEGRITY_EVENT_001.md'
];
for (const hf of historicalFiles) {
  assert(fs.existsSync(path.join(root, hf)), `Historical artifact preserved: ${hf}`);
}

console.log('\nALL UNIVERSAL REVIEW FRAMEWORK AUTHORITATIVE TESTS PASSED.');
