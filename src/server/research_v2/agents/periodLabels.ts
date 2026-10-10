import type { Fact } from '../domain/index.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Indian fiscal-year label digits (`26` for the year ending 31-Mar-2026) for a period-end ISO date. */
export function fiscalYearLabel(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const fyEnd = month >= 4 ? year + 1 : year;
  return pad2(fyEnd % 100);
}

/** Fiscal quarter 1..4 (Apr-Jun = 1) containing the period-end ISO date. */
export function fiscalQuarterOf(isoDate: string): number {
  const month = Number(isoDate.slice(5, 7));
  return Math.floor(((month + 8) % 12) / 3) + 1;
}

function isoFromParts(day: number, monthIndex: number, year: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

/** Parses ISO, `31 Mar 2026`, `31-March-2026` and `31/03/2026` into ISO; null if not a date. */
export function parseDateLabel(label: string): string | null {
  const text = label.trim().toUpperCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const named = /^(\d{1,2})[\s\-/.]*([A-Z]{3,9})[\s\-/.,]*(\d{4})$/.exec(text);
  if (named) {
    const idx = MONTHS.indexOf(named[2].slice(0, 3));
    return idx >= 0 ? isoFromParts(Number(named[1]), idx, Number(named[3])) : null;
  }
  const numeric = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
  return numeric ? isoFromParts(Number(numeric[1]), Number(numeric[2]) - 1, Number(numeric[3])) : null;
}

/**
 * Canonical form of a period label so that `Q3 FY26`, `Q3FY2026` and `Q3-FY26` compare equal and any
 * recognisable date becomes ISO. Unknown labels are only upper-cased and stripped of separators.
 */
export function normalizePeriodLabel(label: string): string {
  const iso = parseDateLabel(label);
  if (iso) return iso;
  let text = label.toUpperCase().replace(/[\s_\-'.,()]/g, '');
  text = text.replace(/FY(?:20)?(\d{2})(\d{2})(?!\d)/, (whole: string, a: string, b: string) => {
    const secondIsNext = Number(b) === (Number(a) + 1) % 100;
    return a === '20' || secondIsNext ? `FY${b}` : whole;
  });
  text = text.replace(/FY20(\d{2})(?!\d)/, 'FY$1');
  return text;
}

function dateVariants(iso: string): string[] {
  const [y, m, d] = iso.split('-').map(Number);
  const mon = MONTHS[m - 1];
  return [iso, `${d}${mon}${y}`, `ASAT${iso}`, `ASAT${d}${mon}${y}`];
}

/** All labels (already normalised) that correctly describe a fact's period. */
export function acceptableFactLabels(fact: Pick<Fact, 'periodType' | 'periodEnd'>): Set<string> {
  const end = fact.periodEnd;
  const fy = `FY${fiscalYearLabel(end)}`;
  const q = `Q${fiscalQuarterOf(end)}${fy}`;
  const labels: string[] = [...dateVariants(end)];
  switch (fact.periodType) {
    case 'ANNUAL':
    case 'YTD_12M':
      labels.push(fy, `${fy}END`);
      break;
    case 'DISCRETE_Q':
    case 'YTD_3M':
      labels.push(q);
      if (fact.periodType === 'YTD_3M') labels.push(`3M${fy}`, `YTD3M${fy}`);
      break;
    case 'YTD_6M':
      labels.push(`H1${fy}`, `6M${fy}`, `YTD6M${fy}`, `${q}YTD`);
      break;
    case 'YTD_9M':
      labels.push(`9M${fy}`, `YTD9M${fy}`, `${q}YTD`);
      break;
    case 'TTM':
      labels.push(`TTM${q}`, ...dateVariants(end).map(v => `TTM${v}`));
      break;
    case 'POINT_IN_TIME':
      labels.push(`${q}END`, `${fy}END`);
      break;
    default:
      break;
  }
  return new Set(labels.map(normalizePeriodLabel));
}

/** True when the claim's period label is a correct description of the fact's period. */
export function periodLabelMatchesFact(label: string, fact: Pick<Fact, 'periodType' | 'periodEnd'>): boolean {
  return acceptableFactLabels(fact).has(normalizePeriodLabel(label));
}

/** True when two free-form period labels (claim vs calc) denote the same period. */
export function periodLabelsEqual(a: string, b: string): boolean {
  return normalizePeriodLabel(a) === normalizePeriodLabel(b);
}

/** Fiscal labels such as `FY26`, `FY2026` and `Q3 FY26` appearing in free text, normalised. */
export function fiscalLabelsIn(text: string): string[] {
  const found = text.match(/\b(?:Q[1-4]\s*[-]?\s*)?FY\s*-?(?:20)?\d{2}\b/gi) ?? [];
  return found.map(normalizePeriodLabel);
}
