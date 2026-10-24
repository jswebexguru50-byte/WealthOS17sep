import sqlite3 from 'sqlite3';

export type FactRequest = { symbol: string; metric: string; asOf: string; periodTypes?: string[]; };
export type ResolvedFact = { factId: string; value: string | number | null; unit: string | null; periodEnd: string | null; scope: string | null; provider: string; sourceUrl: string | null; availableAt: string | null; };

/** Shared consumer read path for scanners, F1–F7, 29Q and ITAS.
 * It never fetches: acquisition is scheduled separately. */
export class UnifiedDataResolver {
  constructor(private readonly db: sqlite3.Database) {}
  async resolveFact(request: FactRequest): Promise<ResolvedFact | null> {
    const asOf = `${request.asOf}T23:59:59.999Z`;
    const periodFilter = request.periodTypes?.length ? ` AND periodType IN (${request.periodTypes.map(() => '?').join(',')})` : '';
    const params = [request.symbol.toUpperCase(), request.metric, asOf, ...(request.periodTypes ?? [])];
    return new Promise((resolve, reject) => this.db.get(`
      SELECT f.factId,f.value,f.unit,f.periodEnd,f.scope,f.provider,f.sourceUrl,f.availableAt
      FROM company_facts f
      LEFT JOIN source_metric_policy p ON p.metric=f.metric
        AND p.provider=f.provider
      WHERE upper(f.symbol)=? AND f.metric=? AND f.verificationStatus IN ('VERIFIED','VERIFIED_PARTIAL')
        AND f.availabilityStatus IN ('AVAILABLE','AVAILABLE_FROM_PROVIDER')
        AND (f.availableAt IS NULL OR f.availableAt <= ?) ${periodFilter}
      ORDER BY COALESCE(p.priority, CASE f.sourceType WHEN 'PRIMARY_FILING' THEN 1 WHEN 'EXCHANGE' THEN 2 WHEN 'STRUCTURED_SECONDARY' THEN 3 ELSE 9 END),
        CASE upper(f.scope) WHEN 'CONSOLIDATED' THEN 0 ELSE 1 END, f.periodEnd DESC, f.availableAt DESC
      LIMIT 1`, params, (error, row) => error ? reject(error) : resolve((row as ResolvedFact) ?? null)));
  }
  async markConsumed(factId: string, consumer: string): Promise<void> {
    await new Promise<void>((resolve, reject) => this.db.run(`UPDATE acquisition_jobs
      SET status='CONSUMED', consumed_by_json=json_insert(COALESCE(consumed_by_json,'[]'),'$[#]',?)
      WHERE payload_sha256 IN (SELECT json_extract(evidenceText,'$.filingHash') FROM company_facts WHERE factId=?)`, [consumer, factId], err => err ? reject(err) : resolve()));
  }
}
