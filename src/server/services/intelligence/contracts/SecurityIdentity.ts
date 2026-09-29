/**
 * SecurityIdentity.ts — Constitution Article C4
 *
 * Canonical entity identification.
 * Primary key is ISIN / securityId. Tickers and exchange codes are mutable aliases.
 */

export interface SecurityIdentity {
  securityId: string;          // Primary internal key (typically ISIN or normalized ID)
  isin: string;                // Canonical national securities identifier (e.g. INE600Y01019)
  nseSymbol?: string | null;   // Primary NSE symbol alias (e.g. DYCL)
  bseCode?: string | null;     // BSE scrip code alias (e.g. 540795)
  companyName: string;         // Official legal company name
  sector?: string | null;      // Industry sector
  industry?: string | null;    // Specific sub-industry
  cin?: string | null;         // Corporate Identification Number
}
