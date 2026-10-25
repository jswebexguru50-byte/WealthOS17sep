import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('src/lib/api.ts', 'utf8');
const inbox = fs.readFileSync('src/components/PortfolioIntelligenceWatchlist.tsx', 'utf8');

test('shared requestJson exposes one retry-aware JSON contract', () => {
  assert.match(api, /export async function requestJson/);
  assert.match(api, /safeFetchJson<T>\(url, options\)/);
});

test('intelligence inbox uses the shared API client rather than raw fetch', () => {
  assert.match(inbox, /import \{ requestJson \} from ['"]\.\.\/lib\/api['"]/);
  assert.match(inbox, /requestJson<\{ items\?: InboxItem\[\] \}>/);
  assert.match(inbox, /\/api\/v2\/intelligence-inbox/);
  assert.doesNotMatch(inbox, /fetch\(['"]\/api\/v2\/intelligence-inbox/);
});
