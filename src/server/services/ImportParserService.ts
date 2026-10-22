export interface LineAccountingSummary {
  totalLinesRead: number;
  headerLinesSkipped: number;
  parsedRowsCount: number;
  skippedRowsCount: number;
  unmappedEntitiesCount: number;
  committedRowsCount: number;
  skippedDetails: Array<{ lineIndex: number; content: string; reason: string }>;
  unmappedEntities: Array<{ name: string; type: 'SYMBOL' | 'ISIN' | 'FOLIO' }>;
}

export class ImportParserService {
  /**
   * Universal Line Accounting Validator
   * Ensures that totalLinesRead === headerLinesSkipped + parsedRowsCount + skippedRowsCount
   */
  public static validateLineAccounting(summary: LineAccountingSummary): boolean {
    const calculatedTotal = summary.headerLinesSkipped + summary.parsedRowsCount + summary.skippedRowsCount;
    const isBalanced = summary.totalLinesRead === calculatedTotal;
    if (!isBalanced) {
      console.warn(
        `[ImportParserService] Line accounting imbalance: Read (${summary.totalLinesRead}) vs Sum (${calculatedTotal})`
      );
    }
    return isBalanced;
  }

  /**
   * Helper to parse CSV string into structured lines with line accounting metadata
   */
  public static parseCsvLines(rawText: string): { lines: string[]; summary: LineAccountingSummary } {
    const rawLines = rawText.split(/\r?\n/).map((l) => l.trim());
    const nonOnlyWhitespaceLines = rawLines.filter((l) => l.length > 0);

    const summary: LineAccountingSummary = {
      totalLinesRead: nonOnlyWhitespaceLines.length,
      headerLinesSkipped: 0,
      parsedRowsCount: 0,
      skippedRowsCount: 0,
      unmappedEntitiesCount: 0,
      committedRowsCount: 0,
      skippedDetails: [],
      unmappedEntities: []
    };

    return { lines: nonOnlyWhitespaceLines, summary };
  }
}
