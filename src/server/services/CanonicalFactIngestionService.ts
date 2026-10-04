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

    const rows = await this.all<{ fetched_at: string, response_json: string, endpoint: string }>(
      `SELECT fetched_at, response_json, endpoint FROM fundamental_endpoint_snapshots 
       WHERE provider='TRENDLYNE_MCP'
         AND symbol=?
         AND endpoint IN ('parameters', 'get_stock_parameter_values', 'statement_history_parameters', 'quarterly_profit_history')`,
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

    // Group by endpoint and get the latest for each
    const latestPerEndpoint = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      const existing = latestPerEndpoint.get(row.endpoint);
      if (!existing || new Date(row.fetched_at).getTime() > new Date(existing.fetched_at).getTime()) {
        latestPerEndpoint.set(row.endpoint, row);
      }
    }

    for (const latest of latestPerEndpoint.values()) {
      const payload = JSON.parse(latest.response_json);
      const directMetricPayload =
        payload && typeof payload === 'object' && !Array.isArray(payload) && !payload.content
          ? payload as Record<string, unknown>
          : null;
      
      let textContent = '';
      try {
          const parsedText = JSON.parse(payload.content[0].text);
          textContent = parsedText.data || '';
      } catch {
          textContent = typeof payload.content?.[0]?.text === 'string' ? payload.content[0].text : '';
      }
      const blocks = textContent.split('\n---\n');

      const firstLine = textContent.split(/\r?\n/).find((line: string) => line.trim()) || '';
      const directAsOf =
        typeof directMetricPayload?.asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(directMetricPayload.asOfDate)
          ? directMetricPayload.asOfDate
          : null;
      const observationDate = directAsOf || firstLine.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] || null;
      const availableAt = latest.fetched_at;
      const normalizedPeriodType = (periodType: string) => {
        if (periodType === 'QUARTER') return 'QUARTERLY';
        if (periodType === 'INSTANT') return 'POINT_IN_TIME';
        return periodType;
      };
      
      const extractedValues: Record<string, { status: string, value: number | null, exactLabel?: string }> = {};

      if (directMetricPayload) {
        for (const mapping of mappings) {
          const rawValue = directMetricPayload[mapping.provider_token];
          if (rawValue === null || rawValue === undefined || String(rawValue).toLowerCase() === 'none') {
            extractedValues[mapping.provider_token] = { status: 'UNAVAILABLE_FROM_PROVIDER', value: null };
            continue;
          }
          const val = Number(rawValue);
          extractedValues[mapping.provider_token] = Number.isFinite(val)
            ? { status: 'AVAILABLE', value: val, exactLabel: mapping.provider_label }
            : { status: 'UNAVAILABLE_FROM_PROVIDER', value: null };
        }
      } else {
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
      }

      for (const mapping of mappings) {
        const extracted = extractedValues[mapping.provider_token];
        // If not extracted in this snapshot, skip and let other snapshots provide it if they can.
        if (!extracted && mapping.provider_token && !directMetricPayload) {
            // Wait, we don't want to insert a MISSING if it just wasn't in this endpoint but could be in another.
            // If the provider_token wasn't found at all, we just don't insert a record for this specific mapping from THIS snapshot.
            continue; 
        }
        
        const periodType = normalizedPeriodType(mapping.period_type);
        let relativePeriod = 'LATEST';
        if (mapping.provider_token.match(/my\d$/)) {
            relativePeriod = 'LATEST_MY' + mapping.provider_token.slice(-1);
        } else if (mapping.provider_token.match(/mq\d$/)) {
            relativePeriod = 'LATEST_MQ' + mapping.provider_token.slice(-1);
        } else if (mapping.provider_token.match(/1q$/)) {
            relativePeriod = 'LATEST_1Q';
        }
        
        const factId = `${companyId}_${mapping.canonical_metric}_${relativePeriod}_${periodType}_${mapping.consolidated_or_standalone}_REPORTED`;
        
        const isMissing = !extracted;
        const factType = isMissing || extracted.value === null ? 'MISSING' : 'REPORTED';
        const availabilityStatus = isMissing ? 'REQUESTED_NOT_RETURNED' : extracted.status;
        const finalValue = isMissing ? null : extracted.value;
        
        const exactLabel = isMissing ? null : (extracted as any).exactLabel;
        const sourceDocumentId = `TRENDLYNE_MCP:${latest.endpoint}:${symbol}:${latest.fetched_at}`;

        await this.run(`
          INSERT OR REPLACE INTO company_facts (
            factId, companyId, symbol, isin, metric, value, unit, currency,
            periodType, periodEnd, asOfDate, factType, sourceType, scope,
            provider, verificationStatus, fetchedAt, availableAt, availabilityStatus,
            sourceDocumentId, providerToken, exactProviderLabel
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?
          )
        `, [
          factId, companyId, symbol, isin, mapping.canonical_metric, finalValue, mapping.unit, mapping.currency,
          periodType, relativePeriod, observationDate || latest.fetched_at.slice(0, 10), factType, 'STRUCTURED_SECONDARY', mapping.consolidated_or_standalone,
          mapping.provider, 'VERIFIED_PARTIAL', latest.fetched_at, availableAt, availabilityStatus,
          sourceDocumentId, mapping.provider_token, exactLabel || null
        ]);
        factsInserted++;
      }
    }

    return factsInserted;
  }
}
