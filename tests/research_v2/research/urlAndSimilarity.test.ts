import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeUrl, classifyHost, hashCanonicalUrl, scopedUrlHash, hostOf,
} from '../../../src/server/research_v2/research/urlTools.js';
import {
  isSyndicatedCopy, jaccard, normaliseText, shingles,
} from '../../../src/server/research_v2/research/similarity.js';

test('canonicalizeUrl strips www, fragment, tracking params, trailing slash and sorts the query', () => {
  const a = canonicalizeUrl('HTTP://WWW.Example.com:80/News/Item/?b=2&utm_source=x&a=1#top');
  assert.equal(a, 'https://example.com/News/Item?a=1&b=2');
  assert.equal(canonicalizeUrl('https://example.com/News/Item?a=1&b=2&fbclid=zzz'), a);
});

test('canonicalizeUrl keeps a non-default port and rejects non-http schemes', () => {
  assert.equal(canonicalizeUrl('https://example.com:8443/x'), 'https://example.com:8443/x');
  assert.equal(canonicalizeUrl('ftp://example.com/x'), null);
  assert.equal(canonicalizeUrl('javascript:alert(1)'), null);
  assert.equal(canonicalizeUrl('not a url'), null);
  assert.equal(canonicalizeUrl('trendlyne-doc:'), null);
});

test('internal document URLs pass through unchanged', () => {
  assert.equal(canonicalizeUrl('trendlyne-doc://X/doc1/page%203'), 'trendlyne-doc://X/doc1/page%203');
});

test('classifyHost separates primary, secondary and unknown hosts', () => {
  assert.equal(classifyHost('https://www.bseindia.com/x'), 'PRIMARY');
  assert.equal(classifyHost('https://nsearchives.nseindia.com/x'), 'PRIMARY');
  assert.equal(classifyHost('https://www.sebi.gov.in/x'), 'PRIMARY');
  const secondary = ['moneycontrol.com', 'stockscans.in', 'multibagg.ai', 'valueresearchonline.com',
    'ft.com', 'cnbctv18.com', 'youtube.com', 'x.com', 'reddit.com'];
  for (const host of secondary) assert.equal(classifyHost(`https://www.${host}/a`), 'SECONDARY', host);
  assert.equal(classifyHost('https://investors.example.com/ar.pdf'), 'UNKNOWN');
  assert.equal(classifyHost('https://notbseindia.com/x'), 'UNKNOWN');
  assert.equal(hostOf('trendlyne-doc://x/y'), null);
});

test('hashes are stable and the scoped hash differs per symbol', () => {
  const url = 'https://example.com/a';
  assert.equal(hashCanonicalUrl(url), hashCanonicalUrl(url));
  assert.match(hashCanonicalUrl(url), /^[0-9a-f]{64}$/);
  assert.notEqual(scopedUrlHash('AAA', url), scopedUrlHash('BBB', url));
  assert.equal(scopedUrlHash('aaa', url), scopedUrlHash('AAA', url));
});

test('normaliseText and shingles ignore case and punctuation', () => {
  assert.equal(normaliseText('  Revenue, UP 12%!  '), 'revenue up 12');
  assert.deepEqual([...shingles('a b c', 5)], ['a b c']);
  assert.equal(shingles('').size, 0);
});

test('isSyndicatedCopy flags re-published text and ignores different text', () => {
  const body = 'Tata Technologies reported a rise in consolidated revenue to 1,300 crore for the quarter, '
    + 'driven by growth in the automotive vertical and a strong order pipeline across regions.';
  const syndicated = `(Reuters) ${body.toUpperCase()} Read more at the source.`;
  assert.equal(isSyndicatedCopy(body, syndicated), true);
  const other = 'The board declared an interim dividend of five rupees per share with the record date set for '
    + 'the second week of November after approving the standalone results at its meeting.';
  assert.equal(isSyndicatedCopy(body, other), false);
  assert.equal(jaccard(new Set(), new Set(['a'])), 0);
});

test('a short shared sentence inside a long article is not treated as a duplicate', () => {
  const sentence = 'The company reported revenue growth of twelve percent this quarter.';
  const article = `${sentence} ${'Unrelated analysis of sector dynamics and input costs follows here. '.repeat(10)}`;
  assert.equal(isSyndicatedCopy(sentence, article), false);
});
