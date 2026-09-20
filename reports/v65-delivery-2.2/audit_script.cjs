const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = getFiles('tests');
let findings = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8').split('\n');
  content.forEach((line, i) => {
    const text = line.trim();
    if (text.includes('.skip(')) findings.push({ file, line: i + 1, type: '.skip', text, class: 'FORBIDDEN_BYPASS' });
    else if (text.includes('.only(')) findings.push({ file, line: i + 1, type: '.only', text, class: 'FORBIDDEN_BYPASS' });
    else if (text.includes('fix.js')) findings.push({ file, line: i + 1, type: 'fix.js', text, class: 'FORBIDDEN_BYPASS' });
    else if (text.includes('.bak')) findings.push({ file, line: i + 1, type: '.bak', text, class: 'REQUIRES_REVIEW' });
    else if (text.includes('process.exit(')) findings.push({ file, line: i + 1, type: 'process.exit', text, class: 'LEGITIMATE_TEST_INFRASTRUCTURE' });
    else if (text.includes('catch (e) {}') || text.includes('catch(() => {})')) findings.push({ file, line: i + 1, type: 'swallowed_exception', text, class: 'FORBIDDEN_BYPASS' });
    else if (text.includes('expect(true).toBe(true)') || text.includes('expect(1).toBe(1)')) findings.push({ file, line: i + 1, type: 'hardcoded_pass', text, class: 'FORBIDDEN_BYPASS' });
    else if (text.includes('vi.mock') && text.includes('Verification')) findings.push({ file, line: i + 1, type: 'mocked_verification', text, class: 'FORBIDDEN_BYPASS' });
  });
});

let md = '# TEST INTEGRITY REPORT\n\n';
md += '| File | Line | Type | Classification | Context |\n';
md += '|---|---|---|---|---|\n';
findings.forEach(f => {
  md += '| ' + f.file.replace(/\\/g, '/') + ' | ' + f.line + ' | ' + f.type + ' | ' + f.class + ' | `' + f.text.substring(0, 50).replace(/\|/g, '-') + '` |\n';
});

if (findings.length === 0) {
  md += '| None | - | - | - | Zero unexplained bypasses found |\n';
}

fs.writeFileSync('reports/v65-delivery-2.2/TEST_INTEGRITY_REPORT.md', md);
console.log('Wrote TEST_INTEGRITY_REPORT.md with ' + findings.length + ' findings.');
