/**
 * Citation verifier — Phase 2 Hardened (CiteCheck Pattern).
 *
 * Implements structured 3-stage candidate retrieval and verification:
 *   Stage 1: Direct literal & normalized containment check (EXACT: 1.0)
 *   Stage 2: Sliding-window best candidate retrieval (Dice coefficient via string-similarity)
 *   Stage 3: Token-level Jaccard overlap & boundary analysis for graded labeling:
 *     - EXACT (>= 0.90 similarity or 100% token containment)
 *     - MINOR_MISMATCH (0.65 - 0.89 similarity: slight punctuation/tense/number rephrasing)
 *     - MAJOR_MISMATCH (0.35 - 0.64 similarity: substantial paraphrase/distortion)
 *     - UNVERIFIABLE (< 0.35 similarity: cannot locate candidate grounding)
 *     - FABRICATED (empty or missing citation)
 */

const stringSimilarity = require("string-similarity");

const EXACT_THRESHOLD = 0.90;
const MINOR_THRESHOLD = 0.65;
const UNVERIFIABLE_THRESHOLD = 0.35;

/**
 * Step 2 Invariant: Heading detection is NOT evidence for operational assertions.
 * An MD&A heading found does not constitute evidence for an operational outlook assertion.
 * The assertion must have its own substantive supporting span.
 */
function isHeadingOrBoilerplate(text) {
  if (!text) return true;
  const t = text.trim().toLowerCase();
  
  // Standard heading & boilerplate phrases
  const headingPatterns = [
    /^management\s+discussion\s+(and|&)\s+analysis/i,
    /^directors['’]?\s+report/i,
    /^board['’]?s\s+report/i,
    /^md&a\s+report/i,
    /^economic\s+overview/i,
    /^global\s+economic\s+overview/i,
    /^macroeconomic\s+overview/i,
    /^industry\s+overview/i,
    /^industry\s+structure\s+and\s+developments/i,
    /^business\s+overview/i,
    /^financial\s+review/i,
    /^financial\s+position\s+and\s+result\s+of\s+operations/i,
    /^risks\s+(and|&)\s+concerns/i,
    /^outlook(\s+for\s+\d{4}[-\d]*)?$/i,
    /^future\s+outlook/i,
    /^opportunities\s+(and|&)\s+threats/i,
    /^internal\s+control\s+systems/i,
    /^cautionary\s+statements/i,
    /^contents\s+theme/i,
    /^annual\s+report\s+\d{4}[-\d]*/i,
    /^exhibit\s+\d+/i,
  ];

  for (const p of headingPatterns) {
    if (p.test(t)) return true;
  }

  // Short strings (< 40 chars) without punctuation or verbs that look like headings/titles
  if (t.length < 40) {
    // If it lacks sentence-ending punctuation or has all uppercase/title structure
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length <= 5 && !/[.,;:!?]/.test(t)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes text for robust comparison (strips punctuation and excessive whitespace).
 */
function normalizeText(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Computes token-level Jaccard overlap between quoted and candidate strings.
 */
function computeTokenOverlap(quoted, candidate) {
  const qTokens = new Set(normalizeText(quoted).split(" ").filter(Boolean));
  const cTokens = new Set(normalizeText(candidate).split(" ").filter(Boolean));
  if (qTokens.size === 0 || cTokens.size === 0) return 0;

  let intersection = 0;
  for (const t of qTokens) {
    if (cTokens.has(t)) intersection++;
  }
  return intersection / qTokens.size;
}

/**
 * Slides a window roughly the length of quotedText across sourceText and
 * scores each window with Dice-coefficient similarity, returning the best.
 */
function findBestWindowMatch(quotedText, sourceText) {
  const windowSize = Math.max(quotedText.length, 20);
  const step = Math.max(Math.floor(windowSize / 3), 8);

  let bestMatch = null;
  let bestMatchScore = 0;

  for (let i = 0; i <= sourceText.length - windowSize; i += step) {
    const window = sourceText.slice(i, i + windowSize);
    const score = stringSimilarity.compareTwoStrings(quotedText, window);
    if (score > bestMatchScore) {
      bestMatchScore = score;
      bestMatch = window;
    }
  }

  return { bestMatch, bestMatchScore };
}

/**
 * Phase 2 Hardened Citation Verifier.
 *
 * @param {string} quotedText - what the extractor claims is a verbatim span
 * @param {string} sourceText - the actual section text the span should appear in
 * @returns {{ label: "EXACT"|"MINOR_MISMATCH"|"MAJOR_MISMATCH"|"UNVERIFIABLE"|"FABRICATED", similarityScore: number, tokenOverlap: number, matchedSpan: string|null, reason: string }}
 */
function verifyCitation(quotedText, sourceText) {
  if (!quotedText || quotedText.trim().length === 0) {
    return {
      label: "FABRICATED",
      similarityScore: 0,
      tokenOverlap: 0,
      matchedSpan: null,
      reason: "Quoted evidence text is empty or missing."
    };
  }
  if (!sourceText || sourceText.trim().length === 0) {
    return {
      label: "UNVERIFIABLE",
      similarityScore: 0,
      tokenOverlap: 0,
      matchedSpan: null,
      reason: "Source document section text is unavailable for verification."
    };
  }

  const trimmedQuote = quotedText.trim();

  // Stage 1: Exact literal containment
  if (sourceText.includes(trimmedQuote)) {
    return {
      label: "EXACT",
      similarityScore: 1.0,
      tokenOverlap: 1.0,
      matchedSpan: trimmedQuote,
      reason: "Exact literal substring found in source document."
    };
  }

  // Stage 1b: Normalized containment (handles punctuation/casing differences)
  const normSource = normalizeText(sourceText);
  const normQuote = normalizeText(trimmedQuote);
  if (normSource.includes(normQuote)) {
    return {
      label: "EXACT",
      similarityScore: 0.98,
      tokenOverlap: 1.0,
      matchedSpan: trimmedQuote,
      reason: "Normalized exact match found (casing/punctuation variation only)."
    };
  }

  // Stage 2: Sliding window candidate retrieval
  const { bestMatch, bestMatchScore } = findBestWindowMatch(trimmedQuote, sourceText);
  const tokenOverlap = bestMatch ? computeTokenOverlap(trimmedQuote, bestMatch) : 0;

  // Stage 3: Graded Labeling with token overlap reconciliation
  let label;
  let reason;

  if (bestMatchScore >= EXACT_THRESHOLD || tokenOverlap >= 0.95) {
    label = "EXACT";
    reason = `Strong fuzzy alignment (similarity: ${bestMatchScore.toFixed(2)}, token overlap: ${(tokenOverlap * 100).toFixed(0)}%).`;
  } else if (bestMatchScore >= MINOR_THRESHOLD || tokenOverlap >= 0.70) {
    label = "MINOR_MISMATCH";
    reason = `Minor rephrasing or boundary variance (similarity: ${bestMatchScore.toFixed(2)}, token overlap: ${(tokenOverlap * 100).toFixed(0)}%).`;
  } else if (bestMatchScore >= UNVERIFIABLE_THRESHOLD || tokenOverlap >= 0.35) {
    label = "MAJOR_MISMATCH";
    reason = `Significant distortion or loose paraphrase (similarity: ${bestMatchScore.toFixed(2)}, token overlap: ${(tokenOverlap * 100).toFixed(0)}%).`;
  } else {
    label = "UNVERIFIABLE";
    reason = `No plausible candidate span found in source section (similarity: ${bestMatchScore.toFixed(2)}).`;
  }

  return {
    label,
    similarityScore: bestMatchScore,
    tokenOverlap,
    matchedSpan: bestMatch,
    reason
  };
}

/**
 * Verifies citation specifically for an assertion field, enforcing that
 * headings/boilerplate are never accepted as evidence for operational assertions.
 */
function verifyAssertionCitation(field, quotedText, sourceText) {
  if (isHeadingOrBoilerplate(quotedText)) {
    return {
      label: "INSUFFICIENT_EVIDENCE_HEADING_ONLY",
      isValid: false,
      similarityScore: 0,
      tokenOverlap: 0,
      matchedSpan: null,
      reason: `MD&A heading or title found ('${quotedText.slice(0, 50).trim()}'), which is not sufficient evidence for operational assertion '${field}'. Assertion must have its own substantive supporting span.`
    };
  }

  const result = verifyCitation(quotedText, sourceText);
  return {
    ...result,
    isValid: result.label === "EXACT" || result.label === "MINOR_MISMATCH"
  };
}

module.exports = {
  verifyCitation,
  verifyAssertionCitation,
  isHeadingOrBoilerplate,
  normalizeText,
  computeTokenOverlap
};
