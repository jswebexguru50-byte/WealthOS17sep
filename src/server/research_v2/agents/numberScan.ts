/** A numeric token found in narrative text, with the unit marker written next to it (if any). */
export interface NumericToken {
  raw: string;
  value: number;
  /** Normalised marker: `INR`, `CR`, `LAKH`, `MN`, `BN`, `PCT`, `X`, `BPS`, `DAYS` or null. */
  marker: string | null;
  decimals: number;
}

const UNIT_MARKERS: Array<[RegExp, string]> = [
  [/^%$/, 'PCT'],
  [/^(x|×|times)$/i, 'X'],
  [/^(crores?|cr)$/i, 'CR'],
  [/^(lakhs?|lacs?)$/i, 'LAKH'],
  [/^(mn|million)$/i, 'MN'],
  [/^(bn|billion)$/i, 'BN'],
  [/^bps$/i, 'BPS'],
  [/^days?$/i, 'DAYS'],
];

/** Patterns that look numeric but are labels, ids or dates; they are blanked before scanning. */
const NON_CLAIM_PATTERNS: RegExp[] = [
  /\bQ\d{1,2}(?:\.[a-z])?\b/g,
  /\b(?:Q[1-4]|H[12]|\d{1,2}M)?\s*-?\s*FY\s*-?(?:20)?\d{2}(?:\s*-\s*\d{2})?\b/gi,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}[\s\-/.]*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/.,]*\d{2,4}\b/gi,
  /\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b/g,
  /\b\d+(?:st|nd|rd|th)\b/gi,
  /\bINE[0-9A-Z]{9}\d\b/g,
];

const NUMBER_RE =
  /(?<![\w.])(?:(₹|rs\.?|inr)\s*)?(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(%|×|x\b|crores?\b|cr\b|lakhs?\b|lacs?\b|mn\b|million\b|bn\b|billion\b|bps\b|days?\b|times\b))?/gi;

function blank(text: string, pattern: RegExp): string {
  return text.replace(pattern, m => ' '.repeat(m.length));
}

function markerOf(currency: string | undefined, unitWord: string | undefined): string | null {
  const found = unitWord ? UNIT_MARKERS.find(([re]) => re.test(unitWord)) : undefined;
  if (found) return found[1];
  return currency ? 'INR' : null;
}

function isIgnorable(raw: string, marker: string | null, decimals: number, value: number): boolean {
  if (marker !== null) return false;
  if (decimals > 0 || raw.includes(',')) return false;
  const digits = raw.replace(/\D/g, '').length;
  if (digits <= 2) return true;
  return digits === 4 && value >= 1900 && value <= 2100;
}

/** Finds the numeric tokens a reader would take as figures. Bare 1-2 digit integers and years are ignored. */
export function scanNumericTokens(text: string): NumericToken[] {
  let cleaned = text;
  for (const pattern of NON_CLAIM_PATTERNS) cleaned = blank(cleaned, pattern);
  const tokens: NumericToken[] = [];
  for (const match of cleaned.matchAll(NUMBER_RE)) {
    const numberText = match[2].replace(/,/g, '');
    const value = Number(numberText);
    const decimals = numberText.includes('.') ? numberText.split('.')[1].length : 0;
    const marker = markerOf(match[1], match[3]);
    if (!Number.isFinite(value) || isIgnorable(numberText, marker, decimals, value)) continue;
    tokens.push({ raw: match[0].trim(), value, marker, decimals });
  }
  return tokens;
}

/** Default numeric tolerance for claim values: 0.5 percent relative or 0.01 absolute. */
export const DEFAULT_TOLERANCE = { relative: 0.005, absolute: 0.01 } as const;

/** True when two numbers agree within the relative or the absolute tolerance. */
export function withinTolerance(
  a: number,
  b: number,
  tolerance: { relative: number; absolute: number } = DEFAULT_TOLERANCE,
): boolean {
  const diff = Math.abs(a - b);
  return diff <= tolerance.absolute || diff <= tolerance.relative * Math.max(Math.abs(a), Math.abs(b));
}

function tokenCandidates(token: NumericToken): number[] {
  switch (token.marker) {
    case 'LAKH': return [token.value, token.value / 100];
    case 'MN': return [token.value, token.value / 10];
    case 'BN': return [token.value, token.value * 100];
    case 'PCT': return [token.value, token.value / 100];
    default: return [token.value];
  }
}

function claimCandidates(value: number, token: NumericToken): number[] {
  return token.marker === 'PCT' ? [value, value * 100] : [value];
}

function roundsTo(claimValue: number, tokenValue: number, decimals: number): boolean {
  return Math.abs(claimValue - tokenValue) <= 0.5 * 10 ** -decimals + 1e-9;
}

/** True when a narrative token equals (to display rounding or the default tolerance) one of the claim values. */
export function tokenIsCovered(token: NumericToken, claimValues: number[]): boolean {
  return claimValues.some(value =>
    claimCandidates(value, token).some(candidate =>
      tokenCandidates(token).some(t =>
        withinTolerance(candidate, t, { relative: DEFAULT_TOLERANCE.relative, absolute: 0 }) ||
        roundsTo(candidate, t, token.decimals))));
}
