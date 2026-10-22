/**
 * XbrlFootnoteParser.ts (Tier 0: Zero LLM / Deterministic)
 * Pulls tagged XBRL elements for Ind AS 37 (Contingent Liabilities) and Ind AS 24 (Related Party Transactions)
 */
export interface XbrlFootnoteResult {
  contingentLiabilitiesCr: number;
  contingentLiabilitiesPctNetWorth?: number;
  relatedPartyTxnCr: number;
  relatedPartyTxnPctRevenue?: number;
  notesSummary: string;
  isFlaggedHighRisk: boolean;
}

export class XbrlFootnoteParser {
  /**
   * Deterministically parses structured XBRL XML / text disclosures
   */
  public static parseFootnotes(xmlOrText: string, netWorthCr: number = 1000, revenueCr: number = 1000): XbrlFootnoteResult {
    if (!xmlOrText || xmlOrText.trim().length === 0) {
      return {
        contingentLiabilitiesCr: 0,
        relatedPartyTxnCr: 0,
        notesSummary: 'No explicit XBRL footnotes found.',
        isFlaggedHighRisk: false
      };
    }

    let contingentCr = 0;
    let relatedPartyCr = 0;

    // 1. Check for XBRL XML tags
    const contingentMatches = xmlOrText.match(/<[^>]*ContingentLiabilit[^>]*>([\d,\.]+)<\/[^>]*>/gi);
    if (contingentMatches) {
      for (const m of contingentMatches) {
        const numStr = m.replace(/<[^>]+>/g, '').replace(/,/g, '').trim();
        const val = parseFloat(numStr);
        if (!isNaN(val) && val > contingentCr) {
          contingentCr = val;
        }
      }
    }

    // 2. Fallback regex for standard Indian Annual Report Footnotes: "Contingent liabilities ... ₹ X Cr"
    if (contingentCr === 0) {
      const regexCL = /(?:contingent\s+liabilit(?:y|ies)|claims\s+not\s+acknowledged)[\s\S]{0,120}?(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(?:cr(?:ore)?|lakh)?/i;
      const match = xmlOrText.match(regexCL);
      if (match && match[1]) {
        let val = parseFloat(match[1].replace(/,/g, ''));
        if (match[0].toLowerCase().includes('lakh')) val = val / 100;
        contingentCr = val;
      }
    }

    // 3. Check for Related Party Transactions
    const rptMatches = xmlOrText.match(/<[^>]*RelatedParty[^>]*>([\d,\.]+)<\/[^>]*>/gi);
    if (rptMatches) {
      for (const m of rptMatches) {
        const numStr = m.replace(/<[^>]+>/g, '').replace(/,/g, '').trim();
        const val = parseFloat(numStr);
        if (!isNaN(val) && val > relatedPartyCr) {
          relatedPartyCr = val;
        }
      }
    }

    if (relatedPartyCr === 0) {
      const regexRPT = /(?:related\s+party\s+transaction|transactions\s+with\s+related)[\s\S]{0,120}?(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(?:cr(?:ore)?|lakh)?/i;
      const match = xmlOrText.match(regexRPT);
      if (match && match[1]) {
        let val = parseFloat(match[1].replace(/,/g, ''));
        if (match[0].toLowerCase().includes('lakh')) val = val / 100;
        relatedPartyCr = val;
      }
    }

    const contingentPctNW = netWorthCr > 0 ? Number(((contingentCr / netWorthCr) * 100).toFixed(1)) : 0;
    const relatedPartyPctRev = revenueCr > 0 ? Number(((relatedPartyCr / revenueCr) * 100).toFixed(1)) : 0;

    // Red flag if Contingent Liabilities > 25% of Net Worth
    const isFlaggedHighRisk = contingentPctNW > 25 || relatedPartyPctRev > 20;

    const summaryParts: string[] = [];
    if (contingentCr > 0) {
      summaryParts.push(`Ind AS 37 Contingent Liabilities: ₹${contingentCr} Cr (${contingentPctNW}% of Net Worth)`);
    }
    if (relatedPartyCr > 0) {
      summaryParts.push(`Ind AS 24 Related Party Transactions: ₹${relatedPartyCr} Cr (${relatedPartyPctRev}% of Revenue)`);
    }

    return {
      contingentLiabilitiesCr: contingentCr,
      contingentLiabilitiesPctNetWorth: contingentPctNW,
      relatedPartyTxnCr: relatedPartyCr,
      relatedPartyTxnPctRevenue: relatedPartyPctRev,
      notesSummary: summaryParts.join(' | ') || 'Clean statutory footnotes without elevated contingent claims.',
      isFlaggedHighRisk
    };
  }
}
