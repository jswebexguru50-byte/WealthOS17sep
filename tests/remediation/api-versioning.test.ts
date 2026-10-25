import test from 'node:test';
import assert from 'node:assert/strict';
import { apiVersioning } from '../../src/server/middleware/ApiVersioning.js';

function run(path: string, method = 'GET') {
  const headers = new Map<string, string>();
  let called = false;
  apiVersioning()({ path, method } as any, { setHeader: (k: string, v: string) => headers.set(k, v) } as any, () => { called = true; });
  return { headers, called };
}

test('version middleware identifies v2 and does not deprecate it', () => {
  const result = run('/api/v2/facts/ticker/INFY');
  assert.equal(result.called, true);
  assert.equal(result.headers.get('X-API-Version'), 'v2');
  assert.equal(result.headers.get('Deprecation'), undefined);
});

test('legacy GET receives deprecation metadata', () => {
  const result = run('/api/tickers');
  assert.equal(result.headers.get('X-API-Version'), 'v1');
  assert.equal(result.headers.get('Deprecation'), 'true');
  assert.equal(result.headers.get('Sunset'), '2027-01-01T00:00:00Z');
});
