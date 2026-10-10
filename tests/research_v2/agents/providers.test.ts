import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AdapterNotImplementedError, createProvider, DEFERRED_ADAPTERS, HostAgentProvider, HostTaskMismatchError,
  HostTaskPendingError, hostTaskId, MockProvider, MockScriptExhaustedError, writeBundleFile,
  type HostTaskFile,
} from '../../../src/server/research_v2/agents/adapters/index.js';
import { isMetered, parseJsonFromText } from '../../../src/server/research_v2/agents/provider.js';
import { validateJsonSchema } from '../../../src/server/research_v2/agents/jsonSchema.js';
import { loadAnswersSchema, loadPrompt, loadReviewSchema } from '../../../src/server/research_v2/agents/schemaFiles.js';
import { goodAnswers, makeBundle } from './fixtures/fixture.js';

const request = { system: 'SYS', messages: [{ role: 'user' as const, content: 'do it' }], jsonSchema: { type: 'object' } };

function tmp(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'wq29-host-'));
}

function host(dir: string, over: Partial<ConstructorParameters<typeof HostAgentProvider>[0]> = {}): HostAgentProvider {
  const bundlePath = writeBundleFile(dir, makeBundle());
  return new HostAgentProvider({ role: 'DRAFTER', symbol: 'ALPHA', workDir: dir, bundlePath, ...over });
}

test('HostAgentProvider writes the task file with every path and no secrets', () => {
  const dir = tmp();
  const provider = host(dir);
  const task = provider.writeTask(request);
  const onDisk = JSON.parse(readFileSync(path.join(dir, `drafter_${task.taskId}.task.json`), 'utf8')) as HostTaskFile;
  assert.equal(onDisk.role, 'DRAFTER');
  for (const key of ['systemPromptPath', 'bundlePath', 'schemaPath', 'outputPath'] as const) {
    assert.ok(existsSync(key === 'outputPath' ? path.dirname(onDisk[key]) : onDisk[key]), key);
  }
  assert.equal(readFileSync(onDisk.systemPromptPath, 'utf8'), 'SYS');
  assert.equal(readFileSync(onDisk.promptPath, 'utf8'), 'do it');
  assert.deepEqual(JSON.parse(readFileSync(onDisk.schemaPath, 'utf8')), { type: 'object' });
  assert.equal(task.taskId, hostTaskId('DRAFTER', 'ALPHA', request));
});

test('HostAgentProvider throws a resumable pending error when no response exists', async () => {
  const provider = host(tmp());
  await assert.rejects(() => provider.complete(request), HostTaskPendingError);
});

test('HostAgentProvider reads a raw structured response file', async () => {
  const dir = tmp();
  const provider = host(dir);
  const task = provider.writeTask(request);
  writeFileSync(task.outputPath, JSON.stringify({ hello: 'world' }));
  const response = await provider.complete(request);
  assert.deepEqual(response.json, { hello: 'world' });
  assert.deepEqual(response.usage, { inTok: 0, outTok: 0 });
});

test('HostAgentProvider reads an envelope and records the usage the host reports', async () => {
  const dir = tmp();
  const provider = host(dir);
  const task = provider.writeTask(request);
  writeFileSync(task.outputPath, JSON.stringify({
    taskId: task.taskId, json: { answers: [] }, usage: { inTok: 1200, outTok: 300 }, agent: 'host-session',
  }));
  const response = await provider.complete(request);
  assert.deepEqual(response.json, { answers: [] });
  assert.deepEqual(response.usage, { inTok: 1200, outTok: 300 });
  assert.equal(isMetered(provider), false);
});

test('HostAgentProvider rejects an envelope for a different task', async () => {
  const provider = host(tmp());
  const task = provider.writeTask(request);
  writeFileSync(task.outputPath, JSON.stringify({ taskId: 'other', json: {} }));
  await assert.rejects(() => provider.complete(request), HostTaskMismatchError);
});

test('HostAgentProvider polls until the response file appears', async () => {
  const provider = host(tmp(), { timeoutMs: 5000, pollMs: 1, sleep: async () => undefined });
  const task = provider.writeTask(request);
  let polls = 0;
  const waiting = new HostAgentProvider({
    ...(provider as unknown as { options: ConstructorParameters<typeof HostAgentProvider>[0] }).options,
    timeoutMs: 5000,
    sleep: async () => { polls += 1; if (polls === 3) writeFileSync(task.outputPath, '{"ok":true}'); },
  });
  const response = await waiting.complete(request);
  assert.deepEqual(response.json, { ok: true });
  assert.equal(polls, 3);
});

test('HostAgentProvider can read the response from stdin', async () => {
  const provider = host(tmp(), { responseSource: 'stdin', readStdin: async () => '{"fromStdin":1}' });
  const response = await provider.complete(request);
  assert.deepEqual(response.json, { fromStdin: 1 });
});

test('different roles and requests produce different task ids; same request is stable', () => {
  const a = hostTaskId('DRAFTER', 'ALPHA', request);
  assert.equal(a, hostTaskId('DRAFTER', 'ALPHA', request));
  assert.notEqual(a, hostTaskId('REVIEWER', 'ALPHA', request));
  assert.notEqual(a, hostTaskId('DRAFTER', 'ALPHA', { ...request, system: 'OTHER' }));
});

test('MockProvider replays a script in order, records calls and runs dry loudly', async () => {
  const mock = MockProvider.fromRecording('mock', [{ n: 1 }, { n: 2 }], { inTok: 5, outTok: 6 });
  assert.deepEqual((await mock.complete(request)).json, { n: 1 });
  const second = await mock.complete(request);
  assert.deepEqual(second.json, { n: 2 });
  assert.deepEqual(second.usage, { inTok: 5, outTok: 6 });
  assert.equal(mock.calls.length, 2);
  await assert.rejects(() => mock.complete(request), MockScriptExhaustedError);
});

test('MockProvider supports function scripts and scripted errors', async () => {
  const fn = new MockProvider('fn', (_req, i) => ({ json: { i } }));
  assert.deepEqual((await fn.complete(request)).json, { i: 0 });
  const failing = new MockProvider('bad', [{ error: 'boom' }]);
  await assert.rejects(() => failing.complete(request), /boom/);
});

test('API adapters are listed as not implemented and are never constructed', () => {
  assert.deepEqual(DEFERRED_ADAPTERS.map(a => a.id), ['claude', 'openai', 'gemini', 'bedrock', 'local']);
  assert.ok(DEFERRED_ADAPTERS.every(a => a.status === 'NOT_IMPLEMENTED'));
  for (const adapter of ['claude', 'openai', 'gemini', 'bedrock', 'local'] as const) {
    assert.throws(() => createProvider({ adapter }), AdapterNotImplementedError);
  }
});

test('createProvider builds the host agent and the mock without any key', () => {
  const saved = { ...process.env };
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) delete process.env[k];
  try {
    const mock = createProvider({ adapter: 'mock', id: 'm', script: [] });
    assert.equal(mock.id, 'm');
    const dir = tmp();
    const hostProvider = createProvider({
      adapter: 'host-agent',
      options: { role: 'REVIEWER', symbol: 'ALPHA', workDir: dir, bundlePath: path.join(dir, 'b.json') },
    });
    assert.equal(hostProvider.id, 'host-agent');
  } finally {
    Object.assign(process.env, saved);
  }
});

test('parseJsonFromText handles fenced and prefixed JSON and rejects text without JSON', () => {
  assert.deepEqual(parseJsonFromText('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonFromText('Here you go: {"a":2}'), { a: 2 });
  assert.throws(() => parseJsonFromText('no json here'));
});

test('packaged schemas accept a good draft and reject malformed ones', () => {
  const schema = loadAnswersSchema();
  assert.deepEqual(validateJsonSchema({ answers: goodAnswers() }, schema), []);
  assert.ok(validateJsonSchema({ answers: [] }, schema).length > 0, 'empty answers');
  assert.ok(validateJsonSchema({ answers: [{ subQuestionId: 'Q1.a', state: 'MAYBE', claims: [], narrative: '' }] }, schema)
    .some(e => e.includes('enum')));
  const extra = goodAnswers();
  (extra[1].claims[0] as unknown as Record<string, unknown>).confidence = 0.9;
  assert.ok(validateJsonSchema({ answers: extra }, schema).some(e => e.includes('unexpected')));
});

test('review schema forbids anything but verdict and findings', () => {
  const schema = loadReviewSchema();
  const ok = { verdict: 'REVISE', findings: [{ subQuestionId: 'Q2.a', severity: 'BLOCKING', defect: 'd', evidence: 'e', requiredFix: 'f' }] };
  assert.deepEqual(validateJsonSchema(ok, schema), []);
  assert.ok(validateJsonSchema({ ...ok, newFacts: [{ factId: 'x' }] }, schema).length > 0);
  assert.ok(validateJsonSchema({ verdict: 'PASS' }, schema).length > 0);
});

test('prompts are provider-neutral Markdown and name no vendor', () => {
  for (const name of ['drafter', 'reviewer'] as const) {
    const text = loadPrompt(name);
    assert.ok(text.length > 500);
    assert.doesNotMatch(text, /openai|anthropic|claude|gemini|gpt/i);
  }
  assert.match(loadPrompt('drafter'), /UNCLAIMED|claim/);
  assert.match(loadPrompt('reviewer'), /cannot add facts/);
});
