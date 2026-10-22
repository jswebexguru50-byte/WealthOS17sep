/**
 * InsiderTradingParser.ts (Tier 0: Zero LLM / Deterministic)
 * Parses SEBI PIT Regulation 7(2) and SAST promoter transaction tables
 */
export interface InsiderTransactionResult {
  insiderName: string;
  category: 'PROMOTER' | 'PROMOTER_GROUP' | 'DIRECTOR' | 'KMP' | 'EMPLOYEE' | 'OTHER';
  transactionType: 'MARKET_PURCHASE' | 'MARKET_SALE' | 'PLEDGE_CREATION' | 'PLEDGE_REVOCATION' | 'ESOP_ALLOTMENT';
  quantity: number;
  valueCr: number;
  signalPolarity: 'POSITIVE_INSIDER_BUY' | 'NEGATIVE_INSIDER_SELL' | 'NEUTRAL_PLEDGE_RELEASE' | 'ALERT_PLEDGE_INVOCATION';
  summary: string;
}

export class InsiderTradingParser {
  public static parseDisclosures(tableOrText: string): InsiderTransactionResult[] {
    const results: InsiderTransactionResult[] = [];
    if (!tableOrText || tableOrText.trim().length === 0) return results;

    const lower = tableOrText.toLowerCase();

    // Check purchase vs sale
    const isBuy = lower.includes('purchase') || lower.includes('acquisition') || lower.includes('bought');
    const isSell = lower.includes('sale') || lower.includes('disposal') || lower.includes('sold');
    const isPledge = lower.includes('pledge creation') || lower.includes('encumbrance');
    const isPledgeRelease = lower.includes('revocation of pledge') || lower.includes('pledge release');

    const isPromoter = lower.includes('promoter') || lower.includes('promoter group');
    const isDirector = lower.includes('director') || lower.includes('managing director') || lower.includes('kmp');

    // Extract value in Cr if mentioned
    const valMatch = tableOrText.match(/(?:value|amount)[\s\S]{0,40}?(?:₹|rs\.?)?\s*([\d,]+(?:\.\d+)?)\s*(?:cr(?:ore)?|lakh)?/i);
    let valueCr = 0;
    if (valMatch && valMatch[1]) {
      valueCr = parseFloat(valMatch[1].replace(/,/g, ''));
      if (valMatch[0].toLowerCase().includes('lakh')) valueCr = valueCr / 100;
    }

    if (isBuy && (isPromoter || isDirector)) {
      results.push({
        insiderName: isPromoter ? 'Promoter Group' : 'Director / KMP',
        category: isPromoter ? 'PROMOTER' : 'DIRECTOR',
        transactionType: 'MARKET_PURCHASE',
        quantity: 0,
        valueCr,
        signalPolarity: 'POSITIVE_INSIDER_BUY',
        summary: `Promoter / Key Insider open market accumulation${valueCr > 0 ? ' of ₹' + valueCr + ' Cr' : ''}. Strong conviction signal.`
      });
    } else if (isSell && (isPromoter || isDirector)) {
      results.push({
        insiderName: isPromoter ? 'Promoter Group' : 'Director / KMP',
        category: isPromoter ? 'PROMOTER' : 'DIRECTOR',
        transactionType: 'MARKET_SALE',
        quantity: 0,
        valueCr,
        signalPolarity: 'NEGATIVE_INSIDER_SELL',
        summary: `Insider open market stake trimming${valueCr > 0 ? ' of ₹' + valueCr + ' Cr' : ''}.`
      });
    } else if (isPledgeRelease) {
      results.push({
        insiderName: 'Promoter Group',
        category: 'PROMOTER',
        transactionType: 'PLEDGE_REVOCATION',
        quantity: 0,
        valueCr,
        signalPolarity: 'NEUTRAL_PLEDGE_RELEASE',
        summary: 'Encumbrance released: Promoter revoked share pledge, deleveraging promoter balance sheet.'
      });
    }

    return results;
  }
}
