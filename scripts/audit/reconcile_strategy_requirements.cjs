const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../');

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function main() {
  const reqPath = path.join(
    ROOT,
    'reports/v65-delivery-2.2/REQUIREMENTS_SOURCE_REGISTRY.json'
  );

  const stratPath = path.join(
    ROOT,
    'reports/v65-delivery-2.2/WAVE3_6D_STRATEGY_SOURCE_REGISTRY.json'
  );

  const req = read(reqPath);
  const strat = read(stratPath);

  const currentCommit = git(['rev-parse', 'HEAD']);

  const errors = [];

  if (!Array.isArray(req.requirements)) {
    errors.push('requirements is not an array');
  }

  if (req.total_requirements !== req.requirements.length) {
    errors.push(
      `Requirement count mismatch: declared=${req.total_requirements}, actual=${req.requirements.length}`
    );
  }

  const ids = new Set();

  for (const r of req.requirements || []) {
    if (!r.requirementId) {
      errors.push('Requirement without requirementId');
      continue;
    }

    if (ids.has(r.requirementId)) {
      errors.push(`Duplicate requirement ${r.requirementId}`);
    }

    ids.add(r.requirementId);

    if (!r.implementationFiles?.length) {
      errors.push(`${r.requirementId}: missing implementationFiles`);
    }

    if (!r.testFiles?.length) {
      errors.push(`${r.requirementId}: missing testFiles`);
    }

    if (!r.testCommands?.length) {
      errors.push(`${r.requirementId}: missing testCommands`);
    }

    if (!r.actualResult) {
      errors.push(`${r.requirementId}: missing actualResult`);
    }

    if (!r.status) {
      errors.push(`${r.requirementId}: missing status`);
    }

    if (
      r.status === 'IMPLEMENTED_VERIFIED' &&
      r.latestExecutionCommit !== currentCommit
    ) {
      errors.push(
        `${r.requirementId}: PASS evidence is stale. execution=${r.latestExecutionCommit}, current=${currentCommit}`
      );
    }

    if (
      r.status === 'IMPLEMENTED_VERIFIED' &&
      r.actualResult !== 'PASS'
    ) {
      errors.push(
        `${r.requirementId}: status says IMPLEMENTED_VERIFIED but actualResult=${r.actualResult}`
      );
    }

    if (
      r.status === 'PARTIAL' &&
      !r.blocker
    ) {
      errors.push(
        `${r.requirementId}: PARTIAL requirement must identify blocker`
      );
    }
  }

  const strategySymbols = new Set(
    (strat.strategySymbols || []).map(
      x => `${x.file}::${x.symbol}`
    )
  );

  for (const r of req.requirements || []) {
    const file = r.implementationFiles?.[0];
    const symbol = r.implementationSymbols?.[0];

    if (!file || !symbol) continue;

    if (
      r.status !== 'NOT_IMPLEMENTED' &&
      symbol !== 'N/A_NOT_IMPLEMENTED' &&
      !strategySymbols.has(`${file}::${symbol}`) &&
      /S\d+|Strategy|Engine/i.test(r.title || '')
    ) {
      errors.push(
        `${r.requirementId}: implementation claim not found in repository discovery: ${file}::${symbol}`
      );
    }
  }

  if (errors.length) {
    console.error('\nFORENSIC RECONCILIATION FAILED\n');

    for (const e of errors) {
      console.error(` - ${e}`);
    }

    process.exit(1);
  }

  console.log(
    `PASS: ${req.requirements.length} requirements structurally reconciled against current commit ${currentCommit}`
  );
}

main();
