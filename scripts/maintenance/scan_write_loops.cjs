const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../');
const targets = ['server.ts'];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        walk(full);
      }
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
      const rel = path.relative(rootDir, full).replace(/\\/g, '/');
      targets.push(rel);
    }
  }
}

const serverDir = path.join(rootDir, 'src/server');
if (fs.existsSync(serverDir)) {
  walk(serverDir);
}

console.log(`Scanning ${targets.length} files...`);

const results = [];

for (const rel of targets) {
  const full = path.join(rootDir, rel);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  const lines = content.split('\n');

  // Simple state machine or regex search for loops with dbRun / write operations
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if line starts or contains a loop: for (, for await, while (, .forEach(
    const isLoop = /(for\s*\(|for\s+await\s*\(|while\s*\(|\.forEach\s*\()/.test(line);
    if (!isLoop) continue;

    // Scan forward up to 80 lines to see if there is dbRun or db.run or db.prepare with INSERT/UPDATE/DELETE
    let hasWrite = false;
    let writeLine = -1;
    let opType = 'UNKNOWN';
    let tableMatch = null;
    let loopBlock = [];

    // Let's bracket count or check up to 80 lines
    const maxLookahead = Math.min(lines.length, i + 80);
    for (let j = i; j < maxLookahead; j++) {
      loopBlock.push(lines[j]);
      const checkLine = lines[j];
      const match = checkLine.match(/(?:dbRun|db\.run|st\.run|stmt\.run)\s*\([^)]*?(INSERT|UPDATE|DELETE|REPLACE)\s+(?:INTO\s+)?([A-Za-z0-9_]+)/i) ||
                    checkLine.match(/(?:dbRun|db\.run)\s*\(\s*(?:db\s*,\s*)?['"`]\s*(INSERT|UPDATE|DELETE|REPLACE)\s+(?:INTO\s+)?([A-Za-z0-9_]+)/i);
      if (match) {
        hasWrite = true;
        writeLine = j + 1;
        opType = match[1].toUpperCase();
        tableMatch = match[2];
        break;
      }
      // Also look for dynamic SQL or template strings
      if (/(?:await\s+dbRun|db\.run)\s*\(/.test(checkLine)) {
        // check SQL in vicinity
        for (let k = Math.max(0, j - 5); k <= Math.min(lines.length - 1, j + 5); k++) {
          const sqlMatch = lines[k].match(/(INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+([A-Za-z0-9_]+)/i);
          if (sqlMatch) {
            hasWrite = true;
            writeLine = j + 1;
            opType = sqlMatch[1].toUpperCase();
            tableMatch = sqlMatch[2];
            break;
          }
        }
        if (hasWrite) break;
      }
    }

    if (hasWrite) {
      // Check if surrounded by withTx or BEGIN IMMEDIATE within 30 lines before
      let hasTx = false;
      const scanBack = Math.max(0, i - 35);
      for (let b = scanBack; b <= i; b++) {
        if (/withTx\s*\(|BEGIN\s+IMMEDIATE|BEGIN\s+TRANSACTION/i.test(lines[b])) {
          hasTx = true;
          break;
        }
      }

      results.push({
        file: rel,
        line: i + 1,
        writeLine: writeLine,
        operationType: opType,
        tablesAffected: [tableMatch || 'UNKNOWN'],
        transactionProtected: hasTx,
        loopSnippet: line.trim()
      });
    }
  }
}

console.log(`Found ${results.length} loop write sites.`);
fs.writeFileSync(path.join(rootDir, 'scratch/detected_write_loops.json'), JSON.stringify(results, null, 2));
