import { Router, Request, Response } from 'express';

export const MAX_BATCH_SYMBOLS = 50;
export const MAX_FIELDS = 50;
const CONCURRENCY = 3;
const SYMBOL_RE = /^[A-Za-z0-9&._-]{1,32}$/;
const FIELD_RE = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Maps WealthOS canonical field names → Trendlyne MCP parameter tokens.
 * Both WealthOS names and raw Trendlyne tokens are accepted; unmapped fields pass through unchanged.
 */
const WEALTHOS_TO_TRENDLYNE: Record<string, string> = {
  promoter_pct:       'prompct',
  pledge_pct:         'prompledge',
  pledge_change_qoq:  'prompledge1q',
  fii_pct:            'fiihold',
  fii_change_qoq:     'fiipct1q',
  fii_change_4q:      'fiipct4q',
  mf_pct:             'mfhold',
  institutional_pct:  'instihold',
  inst_change_qoq:    'instipct1q',
  roce:               'rocea',
  roce_annual:        'rocea',
  roce_3yr_avg:       'roceaave3',
  roe:                'roea',
  roe_annual:         'roea',
  pat_quarterly:      'reportedpatq',
  pat_annual:         'pata',
  cfo:                'cfoq',
  cfo_quarterly:      'cfoq',
  ebitda:             'ebitdaq',
  ebitda_quarterly:   'ebitdaq',
  ebitda_annual:      'ebitdaa',
  pe_ttm:             'pettm',
  market_cap_cr:      'mcapq',
  debt_equity:        'debtcea',
  net_debt_cr:        'netdebta',
  eps_ttm:            'epsttm',
  price_to_book:      'pbq',
  revenue_quarterly:  'salesq',
  revenue_annual:     'salesa',
};
const TRENDLYNE_TO_WEALTHOS = Object.fromEntries(Object.entries(WEALTHOS_TO_TRENDLYNE).map(([k, v]) => [v, k]));

function toTrendlyneToken(field: string): string {
  return WEALTHOS_TO_TRENDLYNE[field] ?? field; // unmapped: pass through (may already be a token)
}
function fromTrendlyneToken(token: string, originalField: string): string {
  // prefer the original WealthOS field name if it mapped to this token
  return originalField;
}

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

  // Translate WealthOS field names to Trendlyne tokens (deduplicated, preserving order)
  const tokens = [...new Set(fields.map(toTrendlyneToken))];
  // Map from token back to each original WealthOS field name(s) that requested it
  const tokenToFields: Record<string, string[]> = {};
  for (const f of fields) {
    const tok = toTrendlyneToken(f);
    if (!tokenToFields[tok]) tokenToFields[tok] = [];
    tokenToFields[tok].push(f);
  }

  const store = (sym: string, row: Record<string, any> | undefined) => {
    if (!row) { errors[sym] = 'no data returned'; return; }
    data[sym] = {};
    for (const f of fields) {
      const tok = toTrendlyneToken(f);
      const v = row[tok] ?? row[f]; // try token first, then original name as fallback
      data[sym][f] = v === undefined || v === null ? null : { value: v, as_of: asOf, source: 'trendlyne_mcp' };
    }
  };

  const runChunk = async (chunk: string[]) => {
    try {
      const res = await client.getStockParameterValues(chunk, tokens);
      for (const sym of chunk) store(sym, res.data?.[sym]);
    } catch {
      // Isolate: retry per symbol so one bad scrip does not sink the chunk.
      for (const sym of chunk) {
        try {
          const r = await client.getStockParameterValues([sym], tokens);
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
