const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../');

// We will inspect server.ts and all files in src/server
function getCandidateFiles() {
  const files = [path.join(rootDir, 'server.ts')];
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (!['node_modules', 'dist', '.git'].includes(ent.name)) walk(full);
      } else if (ent.name.endsWith('.ts') || ent.name.endsWith('.js')) {
        files.push(full);
      }
    }
  }
  walk(path.join(rootDir, 'src/server'));
  return files;
}

const candidateFiles = getCandidateFiles();
console.log(`Analyzing ${candidateFiles.length} files for write loops...`);

const inventory = [];

for (const fullPath of candidateFiles) {
  const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
  const code = fs.readFileSync(fullPath, 'utf8');
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if line is loop opening
    const loopMatch = line.match(/(for\s*\(|for\s+await\s*\(|while\s*\(|\.forEach\s*\()/);
    if (!loopMatch) continue;

    // Scan the loop body (up to 70 lines or matching brace)
    let hasDbWrite = false;
    let writeLine = -1;
    let opType = 'UNKNOWN';
    let table = 'UNKNOWN';
    let containsAsyncIO = false; // like fetch, external network calls

    const maxJ = Math.min(lines.length, i + 80);
    for (let j = i; j < maxJ; j++) {
      const l = lines[j];
      if (/fetch\(|axios\.|https?\.request|http\.get/i.test(l)) {
        containsAsyncIO = true;
      }
      const matchWrite = l.match(/(INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+([A-Za-z0-9_]+)/i);
      if (matchWrite && /(dbRun|db\.run|st\.run|stmt\.run|db\.prepare)/.test(l)) {
        hasDbWrite = true;
        writeLine = j + 1;
        opType = matchWrite[1].toUpperCase();
        table = matchWrite[2];
        break;
      } else if (/(await\s+dbRun|db\.run|st\.run|stmt\.run)/.test(l)) {
        // check nearby lines for SQL
        for (let k = Math.max(0, j - 6); k <= Math.min(lines.length - 1, j + 6); k++) {
          const m = lines[k].match(/(INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+([A-Za-z0-9_]+)/i);
          if (m) {
            hasDbWrite = true;
            writeLine = j + 1;
            opType = m[1].toUpperCase();
            table = m[2];
            break;
          }
        }
        if (hasDbWrite) break;
      }
    }

    if (hasDbWrite) {
      // Check if wrapped in withTx or BEGIN IMMEDIATE within 50 lines before
      let hasTx = false;
      const startScan = Math.max(0, i - 45);
      for (let k = startScan; k <= i; k++) {
        if (/withTx\s*\(|BEGIN\s+IMMEDIATE|BEGIN\s+TRANSACTION/i.test(lines[k])) {
          hasTx = true;
          break;
        }
      }

      const safeToBatch = !containsAsyncIO;
      let status = 'NEEDS_REMEDIATION';
      if (hasTx) {
        status = 'TRANSACTION_PROTECTED';
      } else if (!safeToBatch) {
        status = 'UNSAFE_DUE_TO_ASYNC_IO';
      }

      inventory.push({
        file: relPath,
        line: i + 1,
        writeLine: writeLine,
        operationType: opType,
        tablesAffected: [table],
        transactionProtected: hasTx,
        safeToBatch: safeToBatch,
        containsAsyncIO: containsAsyncIO,
        status: status,
        snippet: line.trim()
      });
    }
  }
}

console.log(`Identified ${inventory.length} write loop sites.`);
const outputPath = path.join(rootDir, 'scripts/maintenance/review_write_loop_inventory.json');
fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2));
console.log(`Saved inventory to ${outputPath}`);

// Summary stats
const summary = {
  total: inventory.length,
  transactionProtected: inventory.filter(x => x.transactionProtected).length,
  needsRemediation: inventory.filter(x => x.status === 'NEEDS_REMEDIATION').length,
  unsafeDueToAsyncIO: inventory.filter(x => x.status === 'UNSAFE_DUE_TO_ASYNC_IO').length,
};
console.log('Summary:', summary);
