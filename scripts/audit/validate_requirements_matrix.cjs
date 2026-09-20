/**
 * scripts/audit/validate_requirements_matrix.cjs
 *
 * Hard validation script to assert requirements matrix invariants:
 * 1. declared count === actual record count
 * 2. actual count === canonical registry count (49)
 * 3. all IDs present (REQ-001 through REQ-049)
 * 4. no duplicate IDs
 * 5. no empty evidence references
 */

const fs = require('fs');
const path = require('path');

function validate() {
  console.log('Validating Requirements Matrix Invariants...');
  const rootDir = path.resolve(__dirname, '../../');
  const matrixPath = path.join(rootDir, 'reports/v65-delivery-2.2/MASTER_REQUIREMENTS_EVIDENCE_MATRIX.json');

  if (!fs.existsSync(matrixPath)) {
    console.error(`FATAL: Matrix file not found at ${matrixPath}`);
    process.exit(1);
  }

  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  const declaredCount = matrix.total_requirements;
  const records = matrix.requirements || [];
  const actualCount = records.length;

  console.log(`Declared Requirements Count: ${declaredCount}`);
  console.log(`Actual Records Count:       ${actualCount}`);

  if (declaredCount !== 49) {
    console.error(`FAIL: declaredCount (${declaredCount}) !== 49`);
    process.exit(1);
  }

  if (actualCount !== 49) {
    console.error(`FAIL: actualCount (${actualCount}) !== 49`);
    process.exit(1);
  }

  const seenIds = new Set();
  for (let i = 1; i <= 49; i++) {
    const expectedId = `REQ-${String(i).padStart(3, '0')}`;
    const record = records.find(r => r.req_id === expectedId);
    if (!record) {
      console.error(`FAIL: Missing requirement ID ${expectedId}`);
      process.exit(1);
    }
    if (seenIds.has(expectedId)) {
      console.error(`FAIL: Duplicate requirement ID ${expectedId}`);
      process.exit(1);
    }
    seenIds.add(expectedId);

    if (!record.tests || record.tests.length === 0) {
      console.error(`FAIL: Requirement ${expectedId} lacks test evidence reference`);
      process.exit(1);
    }
  }

  console.log('SUCCESS: All 49 requirements verified! Invariants match 100%.');
}

validate();
