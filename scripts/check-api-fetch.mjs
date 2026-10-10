import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const baselinePath = 'config/raw-fetch-baseline.json';
const counts = {};
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) { if (!['server', 'mcp'].includes(entry.name)) scan(file); continue; }
    if (!/\.tsx?$/.test(file) || file === 'src/lib/apiTransport.ts') continue;
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let count = 0;
    const visit = node => {
      if (ts.isCallExpression(node) && (ts.isIdentifier(node.expression) && node.expression.text === 'fetch' ||
        ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'fetch')) count++;
      ts.forEachChild(node, visit);
    };
    visit(source); if (count) counts[file] = count;
  }
}
scan('src');
if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + '\n');
} else {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const regressions = Object.entries(counts).filter(([file, count]) => count > (baseline[file] || 0));
  if (regressions.length) {
    for (const [file, count] of regressions) console.error(`${file}: ${count} raw fetch calls; use apiFetch from apiTransport.`);
    process.exitCode = 1;
  } else console.log('API transport lint passed: no new raw fetch calls. Legacy calls remain behind the credential transport.');
}
