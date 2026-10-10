/** Normalises text for comparison: lower case, punctuation removed, whitespace collapsed. */
export function normaliseText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Word shingles of the normalised text; a text shorter than one shingle yields a single shingle. */
export function shingles(text: string, size = 5): Set<string> {
  const words = normaliseText(text).split(' ').filter((w) => w !== '');
  if (words.length === 0) return new Set();
  if (words.length <= size) return new Set([words.join(' ')]);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i += 1) out.add(words.slice(i, i + size).join(' '));
  return out;
}

/** Jaccard similarity of two shingle sets (0 when either is empty). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const s of a) if (b.has(s)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Containment needs this many shingles in the smaller text, so a shared sentence is not a duplicate. */
export const MIN_CONTAINMENT_SHINGLES = 8;

/** Containment of the smaller text inside the larger one; catches a short excerpt copied into a long article. */
export function containment(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size < MIN_CONTAINMENT_SHINGLES) return 0;
  let shared = 0;
  for (const s of small) if (large.has(s)) shared += 1;
  return shared / small.size;
}

/** Default similarity at or above which two excerpts are treated as the same (syndicated) content. */
export const SYNDICATION_THRESHOLD = 0.7;

/** True when two excerpts are near-identical after normalisation (syndicated or copied content). */
export function isSyndicatedCopy(a: string, b: string, threshold = SYNDICATION_THRESHOLD): boolean {
  const sa = shingles(a);
  const sb = shingles(b);
  return Math.max(jaccard(sa, sb), containment(sa, sb)) >= threshold;
}
