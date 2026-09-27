import sqlite3 from 'sqlite3';
import { FinancialMetricRegistry } from './FinancialMetricRegistry.js';
import { v4 as uuidv4 } from 'uuid';

export class FinancialHistoryService {
  constructor(private db: sqlite3.Database) {}

  private async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[]));
    });
  }

  private async run(sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => err ? reject(err) : resolve());
    });
  }

  /**
   * Retrieves canonical facts for a company.
   */
  async getCanonicalFacts(companyId: string, metric?: string, periodType?: string, scope?: string) {
    let sql = `SELECT * FROM company_facts WHERE companyId = ?`;
    const params: unknown[] = [companyId];

    if (metric) { sql += ` AND metric = ?`; params.push(metric); }
    if (periodType) { sql += ` AND periodType = ?`; params.push(periodType); }
    if (scope) { sql += ` AND scope = ?`; params.push(scope); }

    return this.all<any>(sql, params);
  }

  /**
   * Calculates derived metrics and saves them to company_facts if not already present.
   */
  async computeAndStoreDerivedMetrics(companyId: string, periodType: string, scope: string) {
    const rawFacts = await this.getCanonicalFacts(companyId, undefined, periodType, scope);
    
    // Group by periodEnd (to ensure we combine facts from the exact same period)
    const groupedByPeriod: Record<string, Record<string, { value: number | null, factId: string }>> = {};
    for (const f of rawFacts) {
      if (f.factType === 'REPORTED' || f.factType === 'MISSING') {
        if (!groupedByPeriod[f.periodEnd]) {
          groupedByPeriod[f.periodEnd] = {};
        }
        groupedByPeriod[f.periodEnd][f.metric] = {
           value: f.factType === 'MISSING' ? null : parseFloat(f.value),
           factId: f.factId
        };
      }
    }

    let newlyDerived = 0;

    for (const [periodEnd, facts] of Object.entries(groupedByPeriod)) {
      const valMap: Record<string, number | null> = {};
      for (const k of Object.keys(facts)) valMap[k] = facts[k].value;

      for (const [metricKey, definition] of Object.entries(FinancialMetricRegistry)) {
        if (!definition.compatible_periods.includes(periodType)) continue;
        if (!definition.compatible_scopes.includes(scope)) continue;

        // Ensure all required inputs are present in the period
        let hasAllInputs = true;
        const parentIds: string[] = [];
        for (const req of definition.required_inputs) {
           if (facts[req] === undefined) {
              hasAllInputs = false;
              break;
           }
           parentIds.push(facts[req].factId);
        }

        // If we don't even have the facts requested, we can't derive anything safely
        // Alternatively, we could record a MISSING derived metric.
        if (!hasAllInputs) continue;

        const result = definition.formula(valMap);
        
        const factId = uuidv4();
        const isMissing = result === 'MISSING' || result === 'NOT_MEANINGFUL' || result === null;
        
        let finalValue = isMissing ? null : result;

        // Insert into company_facts
        await this.run(`
          INSERT OR REPLACE INTO company_facts (
            factId, companyId, symbol, metric, value, unit, currency,
            periodType, periodEnd, asOfDate, factType, sourceType, scope,
            verificationStatus, fetchedAt, parentFactIds, calculationMethod, availabilityStatus
          ) VALUES (
            ?, ?, (SELECT symbol FROM MasterTickers WHERE id=?), ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          )
        `, [
          factId, companyId, companyId, metricKey, finalValue, definition.unit, 'INR',
          periodType, periodEnd, new Date().toISOString().split('T')[0], 'DERIVED', 'DERIVED', scope,
          'WEALTHOS_DERIVED', new Date().toISOString(), JSON.stringify(parentIds), definition.version,
          isMissing ? 'UNAVAILABLE' : 'AVAILABLE'
        ]);
        
        newlyDerived++;
      }
    }
    
    return newlyDerived;
  }

  async getAnnualHistory(companyId: string) {
    return this.getCanonicalFacts(companyId, undefined, 'ANNUAL', 'CONSOLIDATED');
  }

  async getQuarterlyHistory(companyId: string) {
    return this.getCanonicalFacts(companyId, undefined, 'QUARTER', 'CONSOLIDATED');
  }

}
