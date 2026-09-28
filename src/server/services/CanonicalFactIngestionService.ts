import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface CanonicalMapping {
  provider: string;
  provider_token: string;
  provider_label: string;
  canonical_metric: string;
  statement_type: string;
  period_type: string;
  unit: string;
  currency: string;
  scale: string;
  consolidated_or_standalone: string;
}

export class CanonicalFactIngestionService {
  constructor(private db: sqlite3.Database) {}

  private async run(sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => err ? reject(err) : resolve());
    });
  }

  private async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[]));
    });
  }

  async loadMappings(provider: string): Promise<CanonicalMapping[]> {
    return this.all<CanonicalMapping>(
      `SELECT * FROM field_mapping_catalog WHERE provider = ? AND mapping_status = 'VERIFIED'`,
      [provider]
    );
  }

  async ingestForSymbol(symbol: string): Promise<number> {
    const mappings = await this.loadMappings('TRENDLYNE_MCP');
    if (mappings.length === 0) return 0;

    const rows = await this.all<{ fetched_at: string, response_json: string }>(
      `SELECT fetched_at, response_json FROM fundamental_endpoint_snapshots 
       WHERE provider='TRENDLYNE_MCP' AND symbol=? AND endpoint='parameters'`,
      [symbol]
    );

    if (rows.length === 0) return 0;

    // Resolve companyId
    const companyRows = await this.all<{ id: string, isin: string }>(
      `SELECT id, isin FROM MasterTickers WHERE symbol=?`, [symbol]
    );
    const companyId = companyRows.length > 0 ? companyRows[0].id : symbol;
    const isin = companyRows.length > 0 ? companyRows[0].isin : null;

    let factsInserted = 0;

    // Latest snapshot
    const latest = rows.sort((a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime())[0];
    const payload = JSON.parse(latest.response_json);
    
    let textContent = '';
    try {
        const parsedText = JSON.parse(payload.content[0].text);
        textContent = parsedText.data || '';
    } catch {
        textContent = typeof payload.content?.[0]?.text === 'string' ? payload.content[0].text : '';
    }
    const blocks = textContent.split('\n---\n');
    
    const extractedValues: Record<string, { status: string, value: number | null, exactLabel?: string }> = {};

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;
      const title = lines[0].trim(); 
      
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(':');
        if (parts.length === 2) {
           const parsedSymbol = parts[0].trim();
           if (parsedSymbol === symbol) {
             const valueStr = parts[1].trim();
             const match = mappings.find(m => title === m.provider_label.trim());
             
             if (match) {
                 if (valueStr.toLowerCase() === 'none' || valueStr === '-' || valueStr === 'n/a') {
                     extractedValues[match.provider_token] = { status: 'UNAVAILABLE_FROM_PROVIDER', value: null };
                 } else {
                     const val = parseFloat(valueStr);
                     if (!isNaN(val)) {
                         let finalVal = val;
                         extractedValues[match.provider_token] = { status: 'AVAILABLE', value: finalVal, exactLabel: title };
                     } else {
                         extractedValues[match.provider_token] = { status: 'UNAVAILABLE_FROM_PROVIDER', value: null };
                     }
                 }
             }
           }
        }
      }
    }

    for (const mapping of mappings) {
      const extracted = extractedValues[mapping.provider_token];
      const factId = `${companyId}_${mapping.canonical_metric}_LATEST_${mapping.period_type}_${mapping.consolidated_or_standalone}_REPORTED`;
      
      const isMissing = !extracted;
      const factType = isMissing || extracted.value === null ? 'MISSING' : 'REPORTED';
      const availabilityStatus = isMissing ? 'REQUESTED_NOT_RETURNED' : extracted.status;
      const finalValue = isMissing ? null : extracted.value;
      
      const exactLabel = isMissing ? null : (extracted as any).exactLabel;
      const sourceDocumentId = `TRENDLYNE_MCP:parameters:${symbol}:${latest.fetched_at}`;

      await this.run(`
        INSERT OR REPLACE INTO company_facts (
          factId, companyId, symbol, isin, metric, value, unit, currency,
          periodType, periodEnd, asOfDate, factType, sourceType, scope,
          provider, verificationStatus, fetchedAt, availabilityStatus,
          sourceDocumentId, providerToken, exactProviderLabel
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?
        )
      `, [
        factId, companyId, symbol, isin, mapping.canonical_metric, finalValue, mapping.unit, mapping.currency,
        mapping.period_type, 'LATEST', new Date().toISOString().split('T')[0], factType, 'STRUCTURED_SECONDARY', mapping.consolidated_or_standalone,
        mapping.provider, 'SECONDARY_VERIFIED', latest.fetched_at, availabilityStatus,
        sourceDocumentId, mapping.provider_token, exactLabel || null
      ]);
      factsInserted++;
    }

    return factsInserted;
  }
}
