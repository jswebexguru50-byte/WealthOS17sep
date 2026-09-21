const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../');
const SRC = path.join(ROOT, 'src');

function walk(dir) {
  const result = [];

  if (!fs.existsSync(dir)) return result;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === '.git'
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      result.push(...walk(full));
    } else if (
      /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)
    ) {
      result.push(full);
    }
  }

  return result;
}

function sha256(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();
}

function main() {
  const files = walk(SRC);

  const records = [];

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');

    const classMatches = [
      ...code.matchAll(
        /\bclass\s+([A-Za-z0-9_]+)(?:\s+extends\s+[^{]+)?\s*\{/g
      )
    ];

    const functionMatches = [
      ...code.matchAll(
        /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g
      )
    ];

    const methodMatches = [
      ...code.matchAll(
        /\b(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z0-9_]+)\s*\([^;{}]*\)\s*[:{]/g
      )
    ];

    for (const match of [
      ...classMatches.map(m => ({
        kind: 'class',
        symbol: m[1]
      })),
      ...functionMatches.map(m => ({
        kind: 'function',
        symbol: m[1]
      })),
      ...methodMatches.map(m => ({
        kind: 'method',
        symbol: m[1]
      }))
    ]) {
      if (/^(if|for|while|switch|catch)$/.test(match.symbol)) {
        continue;
      }

      records.push({
        file: relative(file),
        fileSha256: sha256(file),
        symbol: match.symbol,
        kind: match.kind
      });
    }
  }

  const strategyRecords = records.filter(r =>
    /strategy|engine|rotation|wave|alpha|smartmoney|research/i.test(
      `${r.file} ${r.symbol}`
    )
  );

  const registry = {
    registry_version: '3.6D_repository_discovered',
    sourceCommit: git(['rev-parse', 'HEAD']),
    generatedAt: new Date().toISOString(),

    scannedRoots: ['src'],

    filesScanned: files.map(f => ({
      file: relative(f),
      sha256: sha256(f)
    })),

    strategySymbols: strategyRecords,

    discoveryRule:
      'Strategy registry is repository-discovered. No strategy is considered implemented merely because a numeric strategy ID exists in a requirements file.'
  };

  const out = path.join(
    ROOT,
    'reports/v65-delivery-2.2/WAVE3_6D_STRATEGY_SOURCE_REGISTRY.json'
  );

  fs.writeFileSync(out, JSON.stringify(registry, null, 2) + '\n');

  console.log(`Wrote ${out}`);
}

main();
