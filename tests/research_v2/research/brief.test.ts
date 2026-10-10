import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBrief, defaultPreferredSource } from '../../../src/server/research_v2/research/researchItems.js';

test('buildBrief returns one line per gap with sub-question, fact and preferred source, in numeric order', () => {
  const lines = buildBrief('TATATECH', [
    { subQuestionId: 'Q10.a', factNeeded: 'Promoter pledge at latest quarter end' },
    {
      subQuestionId: 'Q2.b',
      factNeeded: 'Related party transactions for FY26',
      preferredSource: 'Annual report FY26 note 40',
    },
    { subQuestionId: 'Q2.a', factNeeded: 'Order book at 30 Sep 2026' },
  ]);
  assert.deepEqual(lines.map((l) => l.subQuestionId), ['Q2.a', 'Q2.b', 'Q10.a']);
  assert.equal(lines[1]?.preferredSource, 'Annual report FY26 note 40');
  assert.match(lines[0]?.preferredSource ?? '', /MANAGEMENT_CLAIM/);
  assert.match(lines[2]?.preferredSource ?? '', /shareholding/i);
  for (const line of lines) {
    assert.deepEqual(Object.keys(line).sort(), ['factNeeded', 'preferredSource', 'subQuestionId']);
  }
});

test('buildBrief drops duplicate and empty gaps and rejects an empty symbol', () => {
  const lines = buildBrief('X', [
    { subQuestionId: 'Q3.a', factNeeded: 'Auditor name' },
    { subQuestionId: 'Q3.a', factNeeded: '  auditor NAME ' },
    { subQuestionId: 'Q3.b', factNeeded: '   ' },
  ]);
  assert.equal(lines.length, 1);
  assert.deepEqual(buildBrief('X', []), []);
  assert.throws(() => buildBrief(' ', []), /symbol is required/);
});

test('the default preferred source is always a primary source description', () => {
  assert.equal(defaultPreferredSource('something unusual'), 'Annual report or exchange filing');
  assert.match(defaultPreferredSource('SEBI penalty order'), /regulator/i);
  assert.match(defaultPreferredSource('Auditor remuneration'), /Annual report/);
});
