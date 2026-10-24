/**
 * BSE Storage Service
 * Handles database insertion and audit trail for promoted XBRL facts
 */

import { Database } from 'sqlite3';
import type { CanonicalFact } from './BseCanonicalPromotionService.js';

export interface InsertResult {
  successful: number;
  failed: number;
  duplicates: number;
  details: Array<{
    filingId: string;
    status: 'OK' | 'DUPLICATE' | 'CONSTRAINT_VIOLATION' | 'ERROR';
    error?: string;
  }>;
}

/**
 * Insert promoted facts into database with transaction semantics
 * @param db Database instance
 * @param facts Array of canonical facts to insert
 * @returns Insert result with success/failure counts
 */
export async function insertPromotedFacts(
  db: Database,
  facts: CanonicalFact[]
): Promise<InsertResult> {
  return new Promise((resolve) => {
    const result: InsertResult = {
      successful: 0,
      failed: 0,
      duplicates: 0,
      details: []
    };

    // Validate facts before transaction
    for (const fact of facts) {
      if (!fact.symbol || !fact.isin || !fact.metric_name || fact.value === undefined || !fact.fy) {
        result.failed++;
        result.details.push({
          filingId: fact.source_filing_id,
          status: 'CONSTRAINT_VIOLATION',
          error: 'Missing required fields'
        });
      }
    }

    // Begin transaction
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        result.failed += facts.length;
        resolve(result);
        return;
      }

      let processed = 0;
      let success = 0;
      let failed = 0;

      // Insert each fact
      facts.forEach((fact) => {
        // Check for existing fact (deduplication)
        const checkSql = `
          SELECT id FROM canonical_facts
          WHERE symbol = ? AND fy = ? AND period_type = ?
          AND metric_name = ? AND source_filing_ref = ?
        `;

        db.get(
          checkSql,
          [fact.symbol, fact.fy, fact.period_type, fact.metric_name, fact.source_filing_id],
          (err: any, row: any) => {
            if (err || row) {
              result.duplicates++;
              result.details.push({
                filingId: fact.source_filing_id,
                status: 'DUPLICATE',
                error: 'Fact already exists'
              });
            } else {
              // Insert new fact
              const insertSql = `
                INSERT INTO canonical_facts (
                  symbol, isin, metric_name, value, value_inr, unit, currency,
                  period_end_date, filing_date, fy, period_type,
                  source_filing_id, source_filing_url, promotion_quality,
                  currency_quality, xbrl_key, warnings
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `;

              db.run(
                insertSql,
                [
                  fact.symbol, fact.isin, fact.metric_name, fact.value, fact.value_inr,
                  fact.unit, fact.currency, fact.period_end_date, fact.filing_date, fact.fy,
                  fact.period_type, fact.source_filing_id, fact.source_filing_url,
                  fact.promotion_quality, fact.currency_quality, fact.xbrl_key,
                  (fact.warnings || []).join(',')
                ],
                (err) => {
                  if (err) {
                    result.failed++;
                    result.details.push({
                      filingId: fact.source_filing_id,
                      status: 'ERROR',
                      error: err.message
                    });
                  } else {
                    result.successful++;
                    result.details.push({
                      filingId: fact.source_filing_id,
                      status: 'OK'
                    });
                    success++;
                  }

                  processed++;
                  if (processed === facts.length) {
                    // End transaction
                    if (success === facts.length - result.duplicates - result.failed) {
                      db.run('COMMIT', () => {
                        resolve(result);
                      });
                    } else {
                      db.run('ROLLBACK', () => {
                        result.failed = facts.length;
                        result.successful = 0;
                        resolve(result);
                      });
                    }
                  }
                }
              );
            }

            processed++;
            if (processed === facts.length && success + result.duplicates + result.failed === facts.length) {
              // All processed
              if (result.successful > 0) {
                db.run('COMMIT', () => {
                  resolve(result);
                });
              } else {
                db.run('ROLLBACK', () => {
                  resolve(result);
                });
              }
            }
          }
        );
      });
    });
  });
}

/**
 * Rollback a filing by ID
 * @param db Database instance
 * @param filingId Filing ID to rollback
 * @returns Number of rows deleted
 */
export async function rollbackFiling(
  db: Database,
  filingId: string
): Promise<number> {
  return new Promise((resolve) => {
    const sql = 'DELETE FROM canonical_facts WHERE source_filing_ref = ?';
    db.run(sql, [filingId], function (err: any) {
      if (err) {
        resolve(0);
      } else {
        resolve(this.changes || 0);
      }
    });
  });
}
