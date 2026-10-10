import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiTransport, confirmationFor } from '../../src/lib/apiTransport.js';
import { timingSafeMatch } from '../../src/server/config.js';

const password = 'fixture-password';
test('each destructive action sends its exact typed phrase and password to a disposable HTTP fixture', async () => {
  const origin = 'https://fixture.test';
  let writes = 0;
  const fixture = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (!timingSafeMatch(String(request.headers.get('x-app-password')), password)) return new Response('{}', { status: 401 });
    const body = request.body ? await request.text() : '';
    const expected = confirmationFor(new URL(request.url).pathname, request.method);
    let phrase = expected;
    if (body && request.headers.get('content-type')?.includes('application/json')) phrase = JSON.parse(body).confirmPhrase;
    if (phrase !== expected) return new Response('{}', { status: 400 });
    writes++; return Response.json({ success: true, data: { phrase } });
  };
  const calls: string[] = [];
  const transport = createApiTransport(fixture, () => origin, () => password, () => assert.fail('Unexpected 401'), async request => { calls.push(request.phrase); return request.phrase; });
    for (const [url, phrase] of Object.entries({
      '/api/pms/purge-bank-book': 'PURGE_BANK_BOOK', '/api/admin/purge-transactions': 'PURGE_TRANSACTIONS',
      '/api/admin/purge-everything': 'PURGE_EVERYTHING', '/api/purge-data': 'PURGE_DATA',
      '/api/purge-master-tickers': 'PURGE_MASTER_TICKERS', '/api/restore-database/chunk/complete': 'RESTORE_DATABASE',
      '/api/portfolios/Test%20Portfolio': 'DELETE_PORTFOLIO',
    })) {
      await test(`confirmation ${phrase}`, async () => {
        const response = await transport(url, { method: phrase === 'DELETE_PORTFOLIO' ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portfolio: 'Fixture' }) });
        assert.equal(response.status, 200); assert.equal((await response.json()).data.phrase, phrase);
      });
    }
    const form = new FormData(); form.append('marker', 'fixture');
    const restored = await transport('/api/restore-database', { method: 'POST', body: form });
    assert.equal(restored.status, 200); assert.equal((await restored.json()).data.phrase, 'RESTORE_DATABASE');
    assert.equal(writes, 8); assert.equal(calls.length, 8);
});
test('cancelled or aborted confirmation sends no request', async () => {
  let requests = 0;
  const send = async () => { requests++; return new Response('{}'); };
  const cancelled = createApiTransport(send, () => 'https://fixture.test', () => password, () => {}, async () => null);
  assert.equal((await cancelled('/api/purge-data', { method: 'POST' })).status, 400);
  const controller = new AbortController(); controller.abort();
  const aborted = createApiTransport(send, () => 'https://fixture.test', () => password, () => {}, async request => request.phrase);
  assert.equal((await aborted('/api/purge-data', { method: 'POST', signal: controller.signal })).status, 400); assert.equal(requests, 0);
});
test('credentials stay on the same-origin API; request headers and binary bodies are preserved', async () => {
  const seen: Request[] = [];
  const transport = createApiTransport(async (input, init) => { seen.push(new Request(input, init)); return new Response('{}'); }, () => 'https://fixture.test', () => password, () => {}, async () => null);
  await transport(new Request('https://fixture.test/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-upload-id': 'fixture' }, body: new Uint8Array([1, 2, 3]) }));
  assert.equal(seen[0].headers.get('x-app-password'), password); assert.equal(seen[0].headers.get('x-upload-id'), 'fixture'); assert.deepEqual([...new Uint8Array(await seen[0].arrayBuffer())], [1, 2, 3]);
  await transport('https://other.test/api/admin/database-file');
  assert.equal(seen[1].headers.get('x-app-password'), null);
});
test('401 opens a prompt once and never replays a destructive request', async () => {
  let sent = 0, prompts = 0;
  const transport = createApiTransport(async () => { sent++; return new Response('{}', { status: 401 }); }, () => 'https://fixture.test', () => password, () => { prompts++; }, async request => request.phrase);
  assert.equal((await transport('/api/purge-data', { method: 'POST' })).status, 401);
  assert.equal(sent, 1); assert.equal(prompts, 1);
});
