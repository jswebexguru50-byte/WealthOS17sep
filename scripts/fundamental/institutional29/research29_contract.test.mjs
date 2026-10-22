import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCUSED_DOCUMENT_QUERIES,
  RESEARCH_QUESTIONS,
  TRENDLYNE_REQUIRED_VIEWS,
  validateContract,
} from './contract.mjs';
import { buildGapResolutionPlan, resolveMissingEvidence } from './source_resolver.mjs';

test('institutional contract contains exactly 29 ordered questions', () => {
  assert.equal(validateContract(), true);
  assert.equal(RESEARCH_QUESTIONS.length, 29);
  assert.deepEqual(RESEARCH_QUESTIONS.map(item => item.id), Array.from({ length: 29 }, (_, index) => index + 1));
});

test('every answer has the agreed 150-250 word contract', () => {
  for (const item of RESEARCH_QUESTIONS) assert.deepEqual(item.targetWords, { min: 150, max: 250 });
});

test('Trendlyne plan includes all research-relevant non-parameter views', () => {
  assert.deepEqual(TRENDLYNE_REQUIRED_VIEWS, ['overview', 'technical', 'news', 'events', 'shareholding', 'sast', 'bulblockdeal']);
});

test('qualitative coverage uses focused document searches', () => {
  assert.ok(FOCUSED_DOCUMENT_QUERIES.length >= 10);
  assert.ok(FOCUSED_DOCUMENT_QUERIES.some(query => query.includes('customer concentration')));
  assert.ok(FOCUSED_DOCUMENT_QUERIES.some(query => query.includes('related party')));
  assert.ok(FOCUSED_DOCUMENT_QUERIES.some(query => query.includes('statutory auditor')));
});

test('technical support and liquidity require adjusted OHLCV', () => {
  for (const id of [1, 28, 29]) {
    assert.ok(RESEARCH_QUESTIONS.find(item => item.id === id)?.localDomains.includes('ADJUSTED_OHLCV'));
  }
});

test('missing document evidence resolves to focused searches and primary filings', () => {
  const question = RESEARCH_QUESTIONS.find(item => item.id === 4);
  const action = resolveMissingEvidence('AZAD', { ...question, status: 'DATA_INSUFFICIENT' }, 'LOCAL_DOMAIN:DOCUMENTS');
  assert.equal(action.priority, 'P0');
  assert.equal(action.providerFallback.provider, 'TRENDLYNE_MCP');
  assert.ok(action.providerFallback.focusedQueries[0].arguments.query.includes('customer concentration'));
  assert.ok(action.primarySources.some(source => source.includes('NSE/BSE')));
});

test('missing views resolve to the correct Trendlyne tool without replacing primary evidence', () => {
  const question = { ...RESEARCH_QUESTIONS[0], status: 'PARTIAL' };
  assert.equal(resolveMissingEvidence('AZAD', question, 'TRENDLYNE_VIEW:news').providerFallback.tool, 'get_overview_news_corp_events');
  assert.equal(resolveMissingEvidence('AZAD', question, 'TRENDLYNE_VIEW:sast').providerFallback.tool, 'get_ownership_deals_insider_sast');
});

test('gap plan deduplicates repeated provider calls', () => {
  const question = { ...RESEARCH_QUESTIONS[0], status: 'PARTIAL', missing: ['TRENDLYNE_VIEW:news'] };
  const plan = buildGapResolutionPlan('AZAD', [question, { ...question, id: 99 }]);
  assert.equal(plan.actions.length, 2);
  assert.equal(plan.uniqueProviderCalls.length, 1);
});
