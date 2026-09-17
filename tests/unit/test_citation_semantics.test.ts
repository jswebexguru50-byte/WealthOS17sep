import { describe, it, expect } from 'vitest';
const {
  verifyCitation,
  verifyAssertionCitation,
  isHeadingOrBoilerplate,
} = require('../../pipeline/citation-verifier.cjs');

describe('Step 2: Citation Semantics Hardening — Heading Found is Not Operational Evidence', () => {
  const sampleSectionText = `
MANAGEMENT DISCUSSION & ANALYSIS
OVERVIEW
In 2023, India's economy was on an upward trajectory, closing the year with a GDP of USD 3.73 Trn and a GDP per capita of USD 2,610, outpacing the global average growth rate of 3.2%.
The manufacturing sector saw robust growth, aided by initiatives like the Production-Linked Incentive (PLI) scheme.
OUTLOOK FOR 2024-25
The prospects of rising investment activity remain bright owing to upturn in the private capex cycle becoming steadily broad-based.
`;

  it('proves headings and titles are identified as non-substantive boilerplate', () => {
    const headings = [
      'Management Discussion and Analysis',
      'MANAGEMENT DISCUSSION & ANALYSIS',
      "Directors' Report",
      "Board's Report",
      'OVERVIEW',
      'GLOBAL ECONOMIC OVERVIEW',
      'Macroeconomic Overview',
      'INDUSTRY STRUCTURE AND DEVELOPMENTS',
      'Outlook for 2024-25',
      'Future Outlook',
      'Financial Review',
      'Cautionary Statements',
      'Annual Report 2023-24',
    ];

    for (const h of headings) {
      expect(isHeadingOrBoilerplate(h)).toBe(true);
    }
  });

  it('strictly rejects heading-only quotes as INSUFFICIENT_EVIDENCE for operational assertions', () => {
    const headingCandidate = 'MANAGEMENT DISCUSSION & ANALYSIS';

    // Even though the heading literally exists in the section, it must be REJECTED as assertion evidence!
    const result = verifyAssertionCitation('managementOutlook', headingCandidate, sampleSectionText);

    expect(result.isValid).toBe(false);
    expect(result.label).toBe('INSUFFICIENT_EVIDENCE_HEADING_ONLY');
    expect(result.reason).toContain('not sufficient evidence for operational assertion');
  });

  it('strictly rejects section title "Outlook for 2024-25" as assertion evidence without substantive body text', () => {
    const titleOnly = 'OUTLOOK FOR 2024-25';
    const result = verifyAssertionCitation('demandTone', titleOnly, sampleSectionText);

    expect(result.isValid).toBe(false);
    expect(result.label).toBe('INSUFFICIENT_EVIDENCE_HEADING_ONLY');
  });

  it('successfully validates genuine, substantive supporting operational spans', () => {
    const substantiveSpan =
      "In 2023, India's economy was on an upward trajectory, closing the year with a GDP of USD 3.73 Trn and a GDP per capita of USD 2,610, outpacing the global average growth rate of 3.2%.";

    const result = verifyAssertionCitation('demandTone', substantiveSpan, sampleSectionText);

    expect(result.isValid).toBe(true);
    expect(result.label).toBe('EXACT');
    expect(result.similarityScore).toBeGreaterThanOrEqual(0.95);
  });
});
