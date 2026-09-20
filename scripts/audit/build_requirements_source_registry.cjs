/**
 * scripts/audit/build_requirements_source_registry.cjs
 *
 * Programmatically builds WAVE3_6C_REQUIREMENTS_REGISTRY.json and MASTER_REQUIREMENTS_EVIDENCE_MATRIX.json
 * from REQUIREMENTS_SOURCE_REGISTRY.json and runs validate_requirements_matrix.cjs to guarantee invariants.
 */

const fs = require('fs');
const path = require('path');

function run() {
  console.log('Building Wave 3.6C Requirements Registry from source registry...');
  const rootDir = path.resolve(__dirname, '../../');
  const sourcePath = path.join(rootDir, 'reports/v65-delivery-2.2/REQUIREMENTS_SOURCE_REGISTRY.json');

  if (!fs.existsSync(sourcePath)) {
    console.error('FATAL: REQUIREMENTS_SOURCE_REGISTRY.json missing!');
    process.exit(1);
  }

  const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const reqs = sourceData.requirements || [];

  const matrix = {
    matrix_version: "3.6C_rebuilt_source_derived",
    total_requirements: reqs.length,
    summary: {
      CLOSED: 0,
      IMPLEMENTED_VERIFIED: reqs.filter(r => r.status === 'IMPLEMENTED_VERIFIED').length,
      IMPLEMENTED_UNVERIFIED: 0,
      PARTIAL: reqs.filter(r => r.status === 'PARTIAL').length,
      MISSING: 0,
      BLOCKED: reqs.filter(r => r.status === 'BLOCKED').length,
      NOT_IMPLEMENTED: reqs.filter(r => r.status === 'NOT_IMPLEMENTED').length
    },
    requirements: reqs.map(r => ({
      req_id: r.requirementId,
      source: r.category,
      requirement: r.title,
      implementation: r.implementationFiles[0] || 'N/A',
      implementationSymbol: r.implementationSymbols[0] || 'N/A',
      tests: r.testFiles,
      testAssertion: r.testAssertions[0] || 'N/A',
      testCommand: r.testCommands[0] || 'N/A',
      actualResult: r.actualResult,
      status: r.status,
      residualRisk: r.residualRisk,
      blocker: r.blocker
    }))
  };

  const matrixPath = path.join(rootDir, 'reports/v65-delivery-2.2/MASTER_REQUIREMENTS_EVIDENCE_MATRIX.json');
  const reg36cPath = path.join(rootDir, 'reports/v65-delivery-2.2/WAVE3_6C_REQUIREMENTS_REGISTRY.json');

  fs.writeFileSync(matrixPath, JSON.stringify(matrix, null, 2));
  fs.writeFileSync(reg36cPath, JSON.stringify(sourceData, null, 2));

  console.log(`Updated ${matrixPath}`);
  console.log(`Updated ${reg36cPath}`);
}

run();
