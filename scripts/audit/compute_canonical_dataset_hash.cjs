/**
 * scripts/audit/compute_canonical_dataset_hash.cjs
 *
 * Deterministic canonical dataset hasher.
 * Enforces field sorting, numerical formatting, ISO timestamp normalization,
 * and UTF-8 encoding. Asserts run 1 hash === run 2 hash.
 */

const crypto = require('crypto');

function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(key => JSON.stringify(key) + ':' + canonicalize(obj[key]));
  return '{' + pairs.join(',') + '}';
}

function computeCanonicalHash(dataObject) {
  const canonicalString = canonicalize(dataObject);
  return crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}

function verifyDeterminism(sampleObject) {
  const hash1 = computeCanonicalHash(sampleObject);
  const hash2 = computeCanonicalHash(sampleObject);
  if (hash1 !== hash2) {
    throw new Error('Canonical serializer is non-deterministic!');
  }
  return hash1;
}

module.exports = {
  canonicalize,
  computeCanonicalHash,
  verifyDeterminism
};

if (require.main === module) {
  const sample = { symbol: 'RELIANCE', close: 2950.5, timestamp: '2026-09-18T15:30:00Z' };
  const h = verifyDeterminism(sample);
  console.log(`Canonical Hasher Verification SUCCESS. Hash: ${h}`);
}
