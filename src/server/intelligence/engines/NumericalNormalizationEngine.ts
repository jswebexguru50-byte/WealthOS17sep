/**
 * NumericalNormalizationEngine.ts
 *
 * FERE v3.2.1 Deterministic Financial Numerical Normalization Engine.
 * Replaces brittle literal substring matching with ontology-driven multi-scale normalization.
 *
 * v3.2.1 Critical Fix — Currency Semantic Preservation:
 * -------------------------------------------------------
 * BEFORE (v3.2): Currencies were STRIPPED before comparison.
 *   → ₹1,250 Cr and $1,250 Cr became numerically equivalent. UNACCEPTABLE.
 *
 * AFTER (v3.2.1): Currency is EXTRACTED and RETURNED as detectedCurrency.
 *   → Gate A compares detectedCurrency against candidateCurrency.
 *   → ₹1,250 Cr vs $1,250 Cr → currencies mismatch → Gate A rejects.
 *   → Currency is SEMANTIC (not formatting).
 *
 * Handles:
 * - Indian numbering: Crores (Cr, crore, cr), Lakhs (L, lakh, lac)
 * - Western numbering: Billions (B, bn, billion), Millions (M, mn, million), Thousands (k, thousand)
 * - Multi-scale: "1.25 thousand crore" → 12,500 Cr
 * - Currencies: ₹/Rs/INR, $/USD, €/EUR — detected and preserved, never stripped silently
 * - Epsilon-based numerical equivalence comparison (relative tolerance 0.5%, absolute 0.001)
 */

export interface NormalizedNumber {
  raw: string | number;
  baseValue: number;      // Normalized to absolute units (e.g. 1,250 Cr → 12,500,000,000)
  detectedUnit?: string;
  detectedCurrency?: string;  // v3.2.1: Now extracted and preserved (not stripped)
  scaleMultiplier: number;
}

export interface NumericalMatchResult {
  found: boolean;
  matchedExpression?: string;
  matchedBaseValue?: number;
  detectedCurrency?: string;
  matchIndex?: number;
  surroundingClause?: string;
}

/** Canonical currency symbol → ISO-3166 code mapping */
const CURRENCY_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /₹/,                   code: 'INR' },
  { pattern: /rs\.?\s*/i,           code: 'INR' },
  { pattern: /\binr\b/i,            code: 'INR' },
  { pattern: /\$/,                  code: 'USD' },
  { pattern: /\busd\b/i,            code: 'USD' },
  { pattern: /€/,                   code: 'EUR' },
  { pattern: /\beur\b/i,            code: 'EUR' },
  { pattern: /£/,                   code: 'GBP' },
  { pattern: /\bgbp\b/i,            code: 'GBP' },
];

export class NumericalNormalizationEngine {
  private static readonly SCALE_MULTIPLIERS: Record<string, number> = {
    // Indian Scales
    'crore': 1e7,
    'crores': 1e7,
    'cr': 1e7,
    'cr.': 1e7,
    'lakh': 1e5,
    'lakhs': 1e5,
    'lac': 1e5,
    'lacs': 1e5,
    'l': 1e5,

    // Western Scales
    'billion': 1e9,
    'billions': 1e9,
    'bn': 1e9,
    'b': 1e9,
    'million': 1e6,
    'millions': 1e6,
    'mn': 1e6,
    'm': 1e6,
    'thousand': 1e3,
    'thousands': 1e3,
    'k': 1e3
  };

  /**
   * Extracts the leading currency from a string (if present), returning both
   * the ISO code and the string with currency removed for numeric parsing.
   *
   * v3.2.1: Currency extraction is now EXPLICIT — we do NOT silently strip currencies.
   * The caller is responsible for comparing detected vs candidate currency.
   */
  public static extractCurrency(str: string): { currency?: string; stripped: string } {
    let stripped = str.trim();
    for (const { pattern, code } of CURRENCY_PATTERNS) {
      if (pattern.test(stripped)) {
        stripped = stripped.replace(pattern, '').trim();
        return { currency: code, stripped };
      }
    }
    return { currency: undefined, stripped };
  }

  /**
   * FERE v3.2.1+
   * Canonical financial-unit ontology.
   *
   * IMPORTANT:
   * Currency is NOT part of numerical dimensionality.
   * INR_CRORE therefore resolves to the same numerical multiplier
   * as CRORE, while currency is validated separately.
   */
  public static canonicalizeNumericUnit(unit?: string): string {
    if (!unit) return '';

    const normalized = unit
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');

    const aliases: Record<string, string> = {
      'INR_CRORE': 'CRORE',
      'INR_CRORES': 'CRORE',
      'INR_CR': 'CRORE',
      'INR_LAKH': 'LAKH',
      'INR_LAKHS': 'LAKH',
      'INR_LAC': 'LAKH',

      'USD_MILLION': 'MILLION',
      'USD_MILLIONS': 'MILLION',
      'USD_BILLION': 'BILLION',
      'USD_BILLIONS': 'BILLION',

      'EUR_MILLION': 'MILLION',
      'EUR_BILLION': 'BILLION',

      'GBP_MILLION': 'MILLION',
      'GBP_BILLION': 'BILLION',

      'PERCENT': 'PERCENT',
      'PCT': 'PERCENT',
      '%': 'PERCENT',

      'CRORES': 'CRORE',
      'CR': 'CRORE',
      'LAKHS': 'LAKH',
      'LACS': 'LAKH',

      'BN': 'BILLION',
      'B': 'BILLION',
      'MN': 'MILLION',
      'M': 'MILLION',
      'K': 'THOUSAND',
    };

    return aliases[normalized] || normalized;
  }

  /**
   * Normalizes a numeric value with its associated unit string into a standard base number.
   * Does NOT strip currencies — they must be extracted separately via extractCurrency().
   *
   * Example: normalize(1250, "crore") → 12,500,000,000
   * Example: normalize(1.25, "thousand crore") → 12,500,000,000
   */
  public static normalize(value: number | string, unitContext?: string): number {
    const canonicalUnit = this.canonicalizeNumericUnit(unitContext);

    if (typeof value === 'number') {
      const multiplier = canonicalUnit ? this.resolveUnitMultiplier(canonicalUnit) : 1;
      return value * multiplier;
    }

    const { stripped } = this.extractCurrency(String(value).trim().toLowerCase());

    let totalMultiplier = 1;
    if (canonicalUnit) {
      totalMultiplier *= this.resolveUnitMultiplier(canonicalUnit);
    }

    // Check for inline scale words in string (after currency is removed)
    for (const [scaleKey, multiplier] of Object.entries(this.SCALE_MULTIPLIERS)) {
      const regex = new RegExp(`\\b${scaleKey}\\b`, 'i');
      if (regex.test(stripped)) {
        totalMultiplier *= multiplier;
      }
    }

    const numMatch = stripped.replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
    if (!numMatch) {
      return NaN;
    }

    const parsedNum = parseFloat(numMatch[0]);
    return parsedNum * (totalMultiplier || 1);
  }

  /**
   * Resolves scale multiplier from unit context string.
   */
  public static resolveUnitMultiplier(unitStr: string): number {
    const canonical = this.canonicalizeNumericUnit(unitStr);
    const tokens = canonical.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    let mult = 1;
    let foundScale = false;

    for (const token of tokens) {
      if (this.SCALE_MULTIPLIERS[token]) {
        mult *= this.SCALE_MULTIPLIERS[token];
        foundScale = true;
      }
    }

    return foundScale ? mult : 1;
  }

  /**
   * Deterministically checks whether two numbers are numerically equivalent within epsilon tolerance.
   */
  public static isNumericallyEquivalent(
    a: number,
    b: number,
    relativeTolerance: number = 0.001,
    absoluteTolerance: number = 0.001
  ): boolean {
    if (isNaN(a) || isNaN(b)) return false;
    if (a === b) return true;

    const diff = Math.abs(a - b);
    if (diff <= absoluteTolerance) return true;

    const maxAbs = Math.max(Math.abs(a), Math.abs(b));
    return (diff / maxAbs) <= relativeTolerance;
  }

  /**
   * Verifies if a candidate numerical fact (value + unit) is supported by a cited verbatim quote.
   *
   * v3.2.1 Changes:
   * - detectedCurrency is NOW RETURNED so Gate A can enforce currency semantic equality.
   * - candidateCurrency parameter added — if provided and quote has a DIFFERENT currency, match fails.
   * - Currency symbols are NO LONGER silently stripped before comparison.
   *
   * Example:
   *   candidateValue: 1250, candidateUnit: "crore", candidateCurrency: "INR"
   *   quote: "Revenue stood at Rs. 1,250 crore." → found=true, detectedCurrency="INR"
   *
   *   candidateValue: 1250, candidateUnit: "crore", candidateCurrency: "INR"
   *   quote: "Revenue stood at $1,250 crore." → found=false (USD ≠ INR — currency mismatch)
   */
  public static isValuePresentInQuote(
    candidateValue: number | string,
    candidateUnit: string,
    quote: string,
    candidateCurrency?: string,
    relativeTolerance: number = 0.005
  ): NumericalMatchResult {
    if (!quote || quote.trim().length === 0) {
      return { found: false };
    }

    const candidateBase = this.normalize(candidateValue, candidateUnit);

    // Pattern captures: optional currency prefix (with optional leading negative sign) + number (including negative and accounting parentheses) + optional scale unit
    // v3.2.1: Captures currency symbol (-₹45 Cr, ₹182.4), negative parentheses e.g. (182.4), and full spectrum of unit aliases
    const phraseRegex =
      /(-?₹|-?Rs\.?|-?INR|-?\$|-?USD|-?€|-?EUR|-?£|-?GBP|₹|Rs\.?|INR|\$|USD|€|EUR|£|GBP)?\s*(\(?\s*-?\d[\d,]*\.?\d*)\s*(thousand\s+crore|lakh\s+crore|crores?|cr\.?|lakhs?|lacs?|billions?|bn|millions?|mn|thousands?|k|%|percent|pct|basis_points?|bps|x|times|multiple)?(\)?)/gi;

    let match: RegExpExecArray | null;
    while ((match = phraseRegex.exec(quote)) !== null) {
      const matchIndex = match.index;
      let rawCurrencySymbol = match[1];
      let rawNum = match[2]?.replace(/,/g, '')?.trim();
      const unitPart = match[3] || candidateUnit || '';
      const hasCloseParen = match[4];

      if (!rawNum) continue;
      let isNeg = false;
      if (rawCurrencySymbol && rawCurrencySymbol.startsWith('-')) {
        isNeg = true;
        rawCurrencySymbol = rawCurrencySymbol.replace('-', '');
      }
      if (rawNum.includes('(') || hasCloseParen === ')' || rawNum.startsWith('-')) {
        isNeg = true;
      }
      // Check if preceded by decline/fell/drop/loss/contracted keywords when candidate is negative
      const prefixWords = quote.substring(Math.max(0, matchIndex - 30), matchIndex).toLowerCase();
      const hasDeclineWord = /\b(declined|fell|drop|dropped|down|loss|contracted)\s*(?:by\s*|to\s*)?$/i.test(prefixWords.trim());
      if (hasDeclineWord && candidateBase < 0) {
        isNeg = true;
      }

      rawNum = rawNum.replace(/[()\-]/g, '').trim();
      const parsedVal = parseFloat(rawNum);
      if (isNaN(parsedVal)) continue;
      const numPart = isNeg && parsedVal > 0 ? -parsedVal : parsedVal;

      // v3.2.1: Semantic unit compatibility
      // If the matched phrase in the quote contains an explicit surface unit (e.g. %, cr, lakh, bps, x),
      // its canonical form MUST be dimensionally compatible with the candidate's canonical unit.
      if (match[3]) {
        const canonicalExtractedUnit = canonicalizeUnit(match[3]);
        const canonicalCandidateUnit = canonicalizeUnit(candidateUnit);
        if (canonicalExtractedUnit && canonicalCandidateUnit && !areUnitsDimensionallyCompatible(canonicalExtractedUnit, canonicalCandidateUnit)) {
          // Dimensional mismatch — e.g. candidate asks for 1000 PERCENT but quote contains ₹1,000 Cr
          continue;
        }
      }

      const foundBase = this.normalize(numPart, unitPart);
      if (!this.isNumericallyEquivalent(candidateBase, foundBase, relativeTolerance)) continue;

      // Numerically matched. Now check currency.
      const detectedCurrency = rawCurrencySymbol
        ? this.extractCurrency(rawCurrencySymbol).currency
        : undefined;

      // v3.2.1: If both candidate and quote have declared currencies, they MUST match.
      if (candidateCurrency && detectedCurrency) {
        const normalizedCandidate = normalizeCurrencyCode(candidateCurrency);
        const normalizedDetected = normalizeCurrencyCode(detectedCurrency);
        if (normalizedCandidate !== normalizedDetected) {
          // Currency mismatch — this numerical match is REJECTED as semantically invalid.
          continue;
        }
      }

      // Compute surrounding clause bounded by punctuation or major conjunctions (O(1) fast, zero backtracking)
      const prevDot = quote.lastIndexOf('.', matchIndex);
      const prevSemi = quote.lastIndexOf(';', matchIndex);
      const startPos = Math.max(0, prevDot, prevSemi);

      const nextDot = quote.indexOf('.', matchIndex + match[0].length);
      const nextSemi = quote.indexOf(';', matchIndex + match[0].length);
      const positiveEnds = [nextDot, nextSemi].filter(x => x !== -1);
      const endPos = positiveEnds.length > 0 ? Math.min(...positiveEnds) : quote.length;
      const surroundingClause = quote.substring(startPos === 0 ? 0 : startPos + 1, endPos).trim();

      return {
        found: true,
        matchedExpression: match[0].trim(),
        matchedBaseValue: foundBase,
        detectedCurrency,
        matchIndex,
        surroundingClause
      };
    }

    return { found: false };
  }
}

export const UNIT_ALIASES: Record<string, string> = {
  '%': 'PERCENT',
  'percent': 'PERCENT',
  'pct': 'PERCENT',
  'percentage': 'PERCENT',

  'cr': 'INR_CRORE',
  'crore': 'INR_CRORE',
  'crores': 'INR_CRORE',
  'inr_crore': 'INR_CRORE',
  'inr_cr': 'INR_CRORE',

  'lakh': 'INR_LAKH',
  'lakhs': 'INR_LAKH',
  'lac': 'INR_LAKH',
  'lacs': 'INR_LAKH',
  'inr_lakh': 'INR_LAKH',

  'thousand_crore': 'INR_THOUSAND_CRORE',
  'lakh_crore': 'INR_LAKH_CRORE',

  'bps': 'BPS',
  'basis_points': 'BPS',
  'basis_point': 'BPS',

  'x': 'X',
  'times': 'X',
  'multiple': 'X',
  'ratio': 'RATIO',

  'mw': 'MW',
  'gw': 'GW',
  'mwh': 'MWH',
  'gwh': 'GWH',
  'mt': 'MT',
  'mtpa': 'MTPA',
  'tonnes': 'TONNES',
  'units': 'UNITS',

  'inr_per_share': 'INR_PER_SHARE',
  'rs_per_share': 'INR_PER_SHARE',
  'per_share': 'INR_PER_SHARE',

  'usd_million': 'USD_MILLION',
  'usd_billion': 'USD_BILLION',
  'million': 'MILLION',
  'billion': 'BILLION',
  'thousand': 'THOUSAND',
};

export function canonicalizeUnit(rawUnit?: string): string {
  if (!rawUnit) return '';
  const cleaned = rawUnit.trim().toLowerCase().replace(/[\s\.\-]+/g, '_').replace(/^_+|_+$/g, '');
  return UNIT_ALIASES[cleaned] || cleaned.toUpperCase();
}

const CURRENCY_INR_UNITS = new Set([
  'INR_CRORE', 'INR_LAKH', 'INR_THOUSAND_CRORE', 'INR_LAKH_CRORE', 'CRORE', 'LAKH', 'THOUSAND_CRORE'
]);

const CURRENCY_USD_UNITS = new Set([
  'USD_MILLION', 'USD_BILLION', 'MILLION', 'BILLION', 'THOUSAND'
]);

export function areUnitsDimensionallyCompatible(extractedUnit: string, candidateUnit: string): boolean {
  if (extractedUnit === candidateUnit) return true;
  if (CURRENCY_INR_UNITS.has(extractedUnit) && CURRENCY_INR_UNITS.has(candidateUnit)) return true;
  if (CURRENCY_USD_UNITS.has(extractedUnit) && CURRENCY_USD_UNITS.has(candidateUnit)) return true;
  return false;
}

export function normalizeCurrencyCode(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (s === '₹' || s === 'RS' || s === 'RS.' || s === 'INR') return 'INR';
  if (s === '$' || s === 'USD') return 'USD';
  if (s === '€' || s === 'EUR') return 'EUR';
  if (s === '£' || s === 'GBP') return 'GBP';
  return s;
}
