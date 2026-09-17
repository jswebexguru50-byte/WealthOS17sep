/**
 * RatingActionParser.ts (Tier 0: Zero LLM / Deterministic)
 * Parses credit rating releases from Indian agencies (CRISIL, ICRA, CARE, India Ratings)
 */
export interface RatingActionResult {
  agency: 'CRISIL' | 'ICRA' | 'CARE' | 'INDIA_RATINGS' | 'BRICKWORK' | 'UNKNOWN';
  actionType: 'UPGRADE' | 'DOWNGRADE' | 'REAFFIRMED' | 'OUTLOOK_POSITIVE' | 'OUTLOOK_NEGATIVE' | 'WATCH_NEGATIVE';
  ratingGrade: string; // e.g. "CRISIL AAA", "ICRA AA+", "CARE A1+"
  instrument: string;  // e.g. "Long-Term Bank Facilities", "Commercial Paper"
  isCreditImpairmentRisk: boolean;
  headline: string;
}

export class RatingActionParser {
  public static parseRelease(headline: string, bodyText: string = ''): RatingActionResult | null {
    const combined = `${headline} ${bodyText}`.toUpperCase();

    // Check agency
    let agency: RatingActionResult['agency'] = 'UNKNOWN';
    if (combined.includes('CRISIL')) agency = 'CRISIL';
    else if (combined.includes('ICRA')) agency = 'ICRA';
    else if (combined.includes('CARE')) agency = 'CARE';
    else if (combined.includes('INDIA RATINGS') || combined.includes('IND-RA')) agency = 'INDIA_RATINGS';
    else if (combined.includes('BRICKWORK')) agency = 'BRICKWORK';

    // Must have rating indicators
    if (!combined.includes('RATING') && !combined.includes('CREDIT') && agency === 'UNKNOWN') {
      return null;
    }

    // Determine action type
    let actionType: RatingActionResult['actionType'] = 'REAFFIRMED';
    if (combined.includes('DOWNGRADE') || combined.includes('REVISED DOWN') || combined.includes('LOWERED')) {
      actionType = 'DOWNGRADE';
    } else if (combined.includes('UPGRADE') || combined.includes('REVISED UP') || combined.includes('RAISED')) {
      actionType = 'UPGRADE';
    } else if (combined.includes('WATCH NEGATIVE') || combined.includes('DEVELOPING IMPLICATIONS')) {
      actionType = 'WATCH_NEGATIVE';
    } else if (combined.includes('OUTLOOK TO POSITIVE')) {
      actionType = 'OUTLOOK_POSITIVE';
    } else if (combined.includes('OUTLOOK TO NEGATIVE')) {
      actionType = 'OUTLOOK_NEGATIVE';
    }

    // Extract rating grade
    const gradeMatch = combined.match(/\b(AAA|AA\+|AA|AA-|A\+|A|A-|BBB\+|BBB|BBB-|BB\+|BB|BB-|B\+|B|B-|D|A1\+|A1|A2\+|A2|A3\+|A3|A4)\b/);
    const ratingGrade = gradeMatch ? `${agency !== 'UNKNOWN' ? agency + ' ' : ''}${gradeMatch[1]}` : 'RATED';

    const isCreditImpairmentRisk = actionType === 'DOWNGRADE' || actionType === 'WATCH_NEGATIVE' || combined.includes(' DEFAULT') || combined.includes(' D RATING');

    return {
      agency,
      actionType,
      ratingGrade,
      instrument: combined.includes('COMMERCIAL PAPER') ? 'Commercial Paper' : 'Long-Term Bank Facilities / Debt',
      isCreditImpairmentRisk,
      headline: headline.trim()
    };
  }
}
