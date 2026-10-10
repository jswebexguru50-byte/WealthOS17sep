import type { SubAnswer } from '../domain/index.js';
import { questionNumberOf, verdictOf, type CheckVerdict, type Defect } from './types.js';

/** Another scrip in the same run whose identity must not leak into this scrip's answers. */
export interface OtherScrip {
  symbol: string;
  isin: string;
  /** Company name and aliases (for example `Tata Technologies`, `TATATECH`). */
  names: string[];
}

/** Question numbers whose sub-questions may name peers. */
export const PEER_QUESTIONS: readonly number[] = [3, 17];

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive match that does not fire inside a longer alphanumeric word. */
function containsName(text: string, name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  return new RegExp(`(?<![A-Za-z0-9])${escapeRe(trimmed)}(?![A-Za-z0-9])`, 'i').test(text);
}

function answerText(answer: SubAnswer): string {
  return [
    answer.narrative,
    answer.gap ?? '',
    answer.nextAction ?? '',
    answer.premiseCheck?.note ?? '',
    ...(answer.sourcesSearched ?? []),
    ...answer.claims.map(c => c.text),
  ].join('\n');
}

function leaksIn(text: string, other: OtherScrip): string | null {
  if (other.isin && text.toUpperCase().includes(other.isin.toUpperCase())) return other.isin;
  const names = [other.symbol, ...other.names];
  return names.find(name => containsName(text, name)) ?? null;
}

/**
 * Leakage check (spec 11.4): names, aliases, symbols or ISINs of other scrips in the run must not appear outside
 * the peer sections (Q3 and Q17).
 * @param answers draft answers for one scrip
 * @param others every other scrip in the run (the scrip being written about must not be included)
 */
export function leakageCheck(answers: SubAnswer[], others: OtherScrip[]): CheckVerdict {
  const defects: Defect[] = [];
  for (const answer of answers) {
    const questionNumber = questionNumberOf(answer.subQuestionId);
    if (questionNumber !== null && PEER_QUESTIONS.includes(questionNumber)) continue;
    const text = answerText(answer);
    for (const other of others) {
      const hit = leaksIn(text, other);
      if (hit) {
        defects.push({
          code: 'CROSS_SCRIP_LEAKAGE',
          severity: 'BLOCKING',
          subQuestionId: answer.subQuestionId,
          message: `Mentions another scrip (${other.symbol}) outside the Q3/Q17 peer sections`,
          evidence: hit,
        });
      }
    }
  }
  return verdictOf(defects);
}
