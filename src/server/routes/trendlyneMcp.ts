import { Router, Request, Response } from 'express';

export const MAX_BATCH_SYMBOLS = 50;
export const MAX_FIELDS = 50;
const CONCURRENCY = 3;
const SYMBOL_RE = /^[A-Za-z0-9&._-]{1,32}$/;
const FIELD_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export interface FieldValue { value: unknown; as_of: string; source: 'trendlyne_mcp'; }
export interface FetchClient {
  getMaxScrips(): number;
  getStockParameterValues(codes: string[], params: string[]): Promise<{ data: Record<string, Record<string, any>> }>;
}

export function validateBatchBody(body: any): { symbols: string[]; fields: string[] } | string {
  if (!body || !Array.isArray(body.symbols) || !Array.isArray(body.fields)) return 'symbols and fields must be arrays';
  if (!body.symbols.length || !body.fields.length) return 'symbols and fields must be non-empty';
  if (body.symbols.length > MAX_BATCH_SYMBOLS) return `symbols exceeds cap of ${MAX_BATCH_SYMBOLS}`;
  if (body.fields.length > MAX_FIELDS) return `fields exceeds cap of ${MAX_FIELDS}`;
  if (!body.symbols.every((s: unknown) => typeof s === 'string' && SYMBOL_RE.test(s))) return 'invalid symbol';
  if (!body.fields.every((f: unknown) => typeof f === 'string' && FIELD_RE.test(f))) return 'invalid field';
  const symbols = [...new Set<string>(body.symbols.map((s: string) => s.toUpperCase()))];
  return { symbols, fields: [...new Set<string>(body.fields)] };
}

export async function batchFetch(client: FetchClient, symbols: string[], fields: string[]) {
  const asOf = new Date().toISOString().slice(0, 10);
  const data: Record<string, Record<string, FieldValue | null>> = {};
  const errors: Record<string, string> = {};
  const chunkSize = Math.max(1, client.getMaxScrips());
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += chunkSize) chunks.push(symbols.slice(i, i + chunkSize));

  const store = (sym: string, row: Record<string, any> | undefined) => {
    if (!row) { errors[sym] = 'no data returned'; return; }
    data[sym] = {};
    for (const f of fields) {
      const v = row[f];
      data[sym][f] = v === undefined || v === null ? null : { value: v, as_of: asOf, source: 'trendlyne_mcp' };
    }
  };

  const runChunk = async (chunk: string[]) => {
    try {
      const res = await client.getStockParameterValues(chunk, fields);
      for (const sym of chunk) store(sym, res.data?.[sym]);
    } catch {
      // Isolate: retry per symbol so one bad scrip does not sink the chunk.
      for (const sym of chunk) {
        try {
          const r = await client.getStockParameterValues([sym], fields);
          store(sym, r.data?.[sym]);
        } catch (e: any) {
          errors[sym] = String(e?.message || 'fetch failed').slice(0, 200);
        }
      }
    }
  };

  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
    while (next < chunks.length) await runChunk(chunks[next++]);
  }));
  return { data, errors };
}

export const trendlyneMcpRouter = Router();

trendlyneMcpRouter.post('/trendlyne-mcp/batch-fetch', async (req: Request, res: Response) => {
  const parsed = validateBatchBody(req.body);
  if (typeof parsed === 'string') return res.status(400).json({ success: false, message: parsed, data: null });
  try {
    const { TrendlyneMcpClient, TrendlyneNotConfiguredError } = await import('../services/enrichment/trendlyne/TrendlyneMcpClient.js');
    const client = TrendlyneMcpClient.getInstance();
    try {
      client.assertTransport('get_stock_parameter_values');
    } catch (e) {
      if (e instanceof TrendlyneNotConfiguredError) {
        return res.status(503).json({ success: false, message: e.message, status: 'source_unavailable', data: null });
      }
      throw e;
    }
    const { data, errors } = await batchFetch(client, parsed.symbols, parsed.fields);
    res.json({ success: true, message: 'ok', data, errors });
  } catch {
    res.status(500).json({ success: false, message: 'batch fetch failed', data: null });
  }
});

export default trendlyneMcpRouter;
