const fs = require('fs');
const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');
const endpoints = [];
lines.forEach((l, idx) => {
  const m = l.match(/app\.(get|post|put|delete)\(['"]([^'"]+)['"]/);
  if (m) endpoints.push({ line: idx + 1, method: m[1].toUpperCase(), path: m[2] });
});
console.log('Total endpoints directly in server.ts:', endpoints.length);
endpoints.forEach(e => console.log(`Line ${String(e.line).padStart(5)} | ${e.method.padEnd(6)} ${e.path}`));
