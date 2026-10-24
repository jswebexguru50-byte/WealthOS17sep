/**
 * BSE XBRL Filing Parser Service
 * Parses BSE-provided XBRL XML documents and extracts standardized XBRL facts
 */

export interface XBRLFact {
  symbol: string;
  isin: string;
  metric_name: string;
  value: number | null;
  unit: string;
  period_end_date: string; // ISO YYYY-MM-DD
  filing_date: string; // ISO YYYY-MM-DD
  fy: string; // FY format: YYYY-YYYY
  source_filing_id: string;
  source_filing_url: string;
}

// Error codes for parser validation
export class XBRLParserError extends Error {
  constructor(
    public code: string,
    message: string,
    public filingId?: string,
    public lineNumber?: number
  ) {
    super(message);
    this.name = 'XBRLParserError';
  }
}

/**
 * Normalize date to ISO format YYYY-MM-DD
 */
function normalizeDate(dateStr: string): string {
  if (!dateStr) return dateStr;

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Indian format: DD-MMM-YYYY or DD/MM/YYYY
  const indianDateRegex = /^(\d{1,2})[-/]([A-Za-z]{3,}|\d{1,2})[-/](\d{4})$/;
  const match = dateStr.match(indianDateRegex);
  if (match) {
    const [, day, monthStr, year] = match;
    const monthMap: Record<string, number> = {
      'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
      'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
    };

    let month = parseInt(monthStr);
    if (isNaN(month)) {
      // Try to parse month name (case-insensitive)
      const lowerMonth = monthStr.toLowerCase();
      month = monthMap[lowerMonth] || monthMap[lowerMonth.substring(0, 3)];
    }

    if (!month) return dateStr; // Invalid month
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return dateStr;
}

/**
 * Derive financial year from period_end_date
 * If period_end_date is Mar 31, FY is (year-1)-(year)
 */
function deriveFY(periodEndDate: string): string {
  const normalized = normalizeDate(periodEndDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return ''; // Invalid date
  }

  const [yearStr, monthStr] = normalized.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);

  // If period is Mar 31 (month = 3), FY is previous year
  if (month === 3) {
    return `${year - 1}-${year}`;
  }

  // Otherwise, FY spans current year to next year
  return `${year}-${year + 1}`;
}

/**
 * Parse a BSE XBRL filing and extract facts using regex-based parsing
 * @param xmlContent Buffer or string containing XBRL XML
 * @param filingId Filing identifier for audit trail
 * @param filingUrl Filing URL for reference
 * @returns Array of extracted XBRL facts
 */
export async function parseXBRLFiling(
  xmlContent: Buffer | string,
  filingId: string,
  filingUrl: string
): Promise<XBRLFact[]> {
  const xmlString = typeof xmlContent === 'string' ? xmlContent : xmlContent.toString('utf8');

  // Basic XML validation
  if (!xmlString.includes('<xbrli:xbrl') && !xmlString.includes('<xbrl')) {
    throw new XBRLParserError('INVALID_XML', 'Document is not valid XBRL', filingId);
  }

  if (!xmlString.includes('</xbrli:xbrl>') && !xmlString.includes('</xbrl>') && !xmlString.match(/<[^>]+\/>/)) {
    throw new XBRLParserError('INVALID_XML', 'Malformed XML document (unclosed tags)', filingId);
  }

  // Parse contexts with identifiers
  const contexts = new Map<string, { period: string; identifier: string }>();
  const contextRegex = /<xbrli:context\s+id="([^"]+)"[^>]*>[\s\S]*?<xbrli:identifier[^>]*>([^<]*)<\/xbrli:identifier>[\s\S]*?<xbrli:instant>([^<]+)<\/xbrli:instant>[\s\S]*?<\/xbrli:context>/g;
  let contextMatch;

  while ((contextMatch = contextRegex.exec(xmlString)) !== null) {
    const [, contextId, identifier, period] = contextMatch;
    contexts.set(contextId, { period: period.trim(), identifier: identifier.trim() });
  }

  // Also try simplified context parsing
  if (contexts.size === 0) {
    const simpleContextRegex = /<context\s+id="([^"]+)"[^>]*>[\s\S]*?<identifier[^>]*>([^<]*)<\/identifier>[\s\S]*?<instant>([^<]+)<\/instant>[\s\S]*?<\/context>/g;
    while ((contextMatch = simpleContextRegex.exec(xmlString)) !== null) {
      const [, contextId, identifier, period] = contextMatch;
      contexts.set(contextId, { period: period.trim(), identifier: identifier.trim() });
    }
  }

  // Check if contexts were found
  if (contexts.size === 0) {
    throw new XBRLParserError('MISSING_CONTEXT', 'No XBRL contexts found in filing', filingId);
  }

  // Parse units (optional - some metrics may not have units)
  const units = new Map<string, string>();
  const unitRegex = /<xbrli:unit\s+id="([^"]+)"[^>]*>[\s\S]*?<xbrli:measure>([^<]+)<\/xbrli:measure>[\s\S]*?<\/xbrli:unit>/g;
  let unitMatch;

  while ((unitMatch = unitRegex.exec(xmlString)) !== null) {
    const [, unitId, measure] = unitMatch;
    units.set(unitId, measure.trim());
  }

  // Also try simplified unit parsing
  if (units.size === 0) {
    const simpleUnitRegex = /<unit\s+id="([^"]+)"[^>]*>[\s\S]*?<measure>([^<]+)<\/measure>[\s\S]*?<\/unit>/g;
    while ((unitMatch = simpleUnitRegex.exec(xmlString)) !== null) {
      const [, unitId, measure] = unitMatch;
      units.set(unitId, measure.trim());
    }
  }

  // Extract facts
  const facts: XBRLFact[] = [];

  // Match fact elements with contextRef attribute (unitRef is optional)
  // Match both with and without unitRef
  const factRegex = /<(ind|ifrs|us-gaap|[a-z]+):([A-Za-z0-9]+)(?:\s+[^>]*)?contextRef="([^"]+)"[^>]*>([^<]*)<\/\1:\2>/g;
  let factMatch;

  while ((factMatch = factRegex.exec(xmlString)) !== null) {
    const [fullMatch, , metricName, contextRef, textValue] = factMatch;

    // Extract unitRef if present
    const unitRefMatch = fullMatch.match(/unitRef="([^"]*)"/);
    const unitRef = unitRefMatch ? unitRefMatch[1] : null;

    // Skip whitespace-only values
    const trimmedValue = textValue.trim();
    if (!trimmedValue) {
      continue;
    }

    // Check context exists
    const contextData = contexts.get(contextRef);
    if (!contextData) {
      throw new XBRLParserError('MISSING_CONTEXT', `Context ${contextRef} not found`, filingId);
    }

    // Check unit exists if unitRef is specified
    if (unitRef && !units.has(unitRef)) {
      // Only throw if unitRef is explicitly provided but not found
      if (unitRef !== '') {
        throw new XBRLParserError('MISSING_UNIT', `Unit ${unitRef} not found`, filingId);
      }
    }

    const normalizedDate = normalizeDate(contextData.period);
    const fy = deriveFY(normalizedDate);

    const fact: XBRLFact = {
      symbol: contextData.identifier, // Use identifier as symbol; mapper will resolve ISIN
      isin: contextData.identifier, // Use identifier; mapper will normalize
      metric_name: metricName,
      value: isNaN(parseFloat(trimmedValue)) ? null : parseFloat(trimmedValue),
      unit: (unitRef && units.has(unitRef)) ? units.get(unitRef)! : 'pure',
      period_end_date: normalizedDate,
      filing_date: new Date().toISOString().split('T')[0],
      fy: fy,
      source_filing_id: filingId,
      source_filing_url: filingUrl
    };

    facts.push(fact);
  }

  return facts;
}
