import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../../../src/server/research_v2/report/render.js';
import { buildSixScripBundle } from '../../../src/server/research_v2/program/sixScrip.js';
import type { SubAnswer } from '../../../src/server/research_v2/domain/index.js';

test('renders a readable institutional dossier grouped by numbered question', () => {
  const bundle = buildSixScripBundle({
    identity: { symbol: 'YUKEN', isin: 'INE000000001', exchange: 'NSE' },
    asOf: '2026-10-11T00:00:00Z',
  });
  const answers: SubAnswer[] = [{
    subQuestionId: 'Q2.a', state: 'ANSWERED', narrative: 'The frozen bundle identifies the documented product mix.',
    claims: [],
  }, {
    subQuestionId: 'Q2.b', state: 'PARTIAL', narrative: 'Use cases need a current company presentation.', claims: [],
    gap: 'No presentation in frozen bundle', nextAction: 'Import the official investor presentation',
  }];
  const report = renderReport(bundle, answers);
  assert.match(report.markdown, /## Executive assessment/);
  assert.match(report.markdown, /## Institutional due-diligence answers/);
  assert.match(report.markdown, /### 2\. Core Product Utility/);
  assert.match(report.markdown, /\*\*Q2\.a — Products and services and segment mix\*\*/);
  assert.match(report.markdown, /\*\*Evidence state:\*\* Partially supported\./);
  assert.match(report.markdown, /## Primary evidence used/);
  assert.doesNotMatch(report.markdown, /## Readiness/);
});
