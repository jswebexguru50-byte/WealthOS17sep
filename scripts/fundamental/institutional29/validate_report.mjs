import fs from 'node:fs';
import path from 'node:path';

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Usage: node validate_report.mjs <report.md>');
  process.exit(2);
}

const absolutePath = path.resolve(reportPath);
const markdown = fs.readFileSync(absolutePath, 'utf8');
const sections = [...markdown.matchAll(/^## (\d+)\..*?\r?\n([\s\S]*?)(?=^## \d+\.|^---\s*$)/gm)];

const wordCount = (value) => value
  .replace(/https?:\/\/\S+/g, ' ')
  .replace(/[\[\]#*_`>|]/g, ' ')
  .trim()
  .split(/\s+/)
  .filter(Boolean).length;

const results = sections.map((section) => ({
  question: Number(section[1]),
  words: wordCount(section[2]),
  hasAzad: /\*\*AZAD\.\*\*/.test(section[2]),
  hasRrKabel: /\*\*RRKABEL\.\*\*/.test(section[2]),
  hasEvidenceState: /Evidence state:/i.test(section[2]),
}));

const failures = [];
if (sections.length !== 29) failures.push(`Expected 29 questions; found ${sections.length}`);
for (let question = 1; question <= 29; question += 1) {
  if (!results.some((item) => item.question === question)) failures.push(`Missing question ${question}`);
}
for (const item of results) {
  if (item.words < 150 || item.words > 250) failures.push(`Question ${item.question} has ${item.words} words; expected 150-250`);
  if (!item.hasAzad) failures.push(`Question ${item.question} has no AZAD analysis`);
  if (!item.hasRrKabel) failures.push(`Question ${item.question} has no RRKABEL analysis`);
  if (!item.hasEvidenceState) failures.push(`Question ${item.question} has no evidence state`);
}

const summary = {
  reportPath: absolutePath,
  questions: sections.length,
  minimumWords: results.length ? Math.min(...results.map((item) => item.words)) : 0,
  maximumWords: results.length ? Math.max(...results.map((item) => item.words)) : 0,
  averageWords: results.length
    ? Number((results.reduce((sum, item) => sum + item.words, 0) / results.length).toFixed(1))
    : 0,
  failures,
  status: failures.length === 0 ? 'PASS' : 'FAIL',
};

console.log(JSON.stringify(summary, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
