/**
 * BSE Processor Service
 * Orchestrates end-to-end XBRL filing processing pipeline
 */

import { Database } from 'sqlite3';
import { parseXBRLFiling } from './BseXbrlParserService.js';
import { promoteXBRLFacts } from './BseCanonicalPromotionService.js';
import { insertPromotedFacts } from './BseStorageService.js';

export interface ProcessResult {
  successful: number;
  failed: number;
  details: Array<{
    filingId: string;
    status: 'OK' | 'ERROR';
    error?: string;
  }>;
}

/**
 * Process multiple BSE XBRL filings end-to-end
 * @param db Database instance
 * @param filings Array of {filingId, xmlContent, filingUrl}
 * @returns Processing result with success/failure breakdown
 */
export async function processBseFilings(
  db: Database,
  filings: Array<{
    filingId: string;
    xmlContent: Buffer | string;
    filingUrl: string;
  }>
): Promise<ProcessResult> {
  const result: ProcessResult = {
    successful: 0,
    failed: 0,
    details: []
  };

  // Process each filing
  for (const filing of filings) {
    try {
      // Step 1: Parse XBRL
      const xbrlFacts = await parseXBRLFiling(
        filing.xmlContent,
        filing.filingId,
        filing.filingUrl
      );

      // Step 2: Promote to canonical metrics
      const canonicalFacts = await promoteXBRLFacts(db, xbrlFacts);

      // Step 3: Store in database
      const insertResult = await insertPromotedFacts(db, canonicalFacts);

      if (insertResult.successful > 0) {
        result.successful++;
        result.details.push({
          filingId: filing.filingId,
          status: 'OK'
        });
      } else {
        result.failed++;
        result.details.push({
          filingId: filing.filingId,
          status: 'ERROR',
          error: 'No facts inserted'
        });
      }
    } catch (err: any) {
      result.failed++;
      result.details.push({
        filingId: filing.filingId,
        status: 'ERROR',
        error: err.message
      });
    }
  }

  return result;
}
