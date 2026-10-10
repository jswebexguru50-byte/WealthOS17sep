import { AcquisitionError, type ToolResult } from './types.js';

/** Provider reply after unwrapping the MCP envelope (status/message/data). */
export interface ProviderEnvelope {
  ok: boolean;
  /** Provider error code such as "1002", or MCP_TOOL_ERROR / RESPONSE_UNPARSEABLE. */
  errorCode?: string;
  message?: string;
  data?: unknown;
}

/** One company header line: id|name|symbol|bseCode|observationDate. */
export interface ParsedCompany {
  providerId: string;
  name: string;
  symbol: string;
  bseCode: string;
  /** Provider-reported observation date (YYYY-MM-DD). Not a fiscal period end. */
  observationDate: string | null;
}

/** One value cell. `value` is null for "None" or a non-numeric cell. */
export interface ParsedCell {
  raw: string;
  value: number | null;
}

/** One metric block: the provider label and a cell per symbol. */
export interface ParsedRow {
  label: string;
  cells: Record<string, ParsedCell>;
}

export interface ParsedParameterTable {
  companies: ParsedCompany[];
  rows: ParsedRow[];
}

const ERROR_CODE = /\[code:(\d+)\]/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function firstText(result: ToolResult): string | null {
  const part = result.content?.find(item => item?.type === 'text' && typeof item.text === 'string');
  return part?.text ?? null;
}

/**
 * Unwraps an MCP tool result. A provider error (status "error") arrives with isError=false, so the
 * status field is always inspected; error code 1002 means the weighted channel limit was exceeded.
 */
export function parseEnvelope(result: ToolResult): ProviderEnvelope {
  if (result.isError) {
    return { ok: false, errorCode: 'MCP_TOOL_ERROR', message: firstText(result) ?? 'MCP tool returned an error' };
  }
  const text = firstText(result);
  if (text === null) return { ok: false, errorCode: 'RESPONSE_UNPARSEABLE', message: 'no text content' };
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errorCode: 'RESPONSE_UNPARSEABLE', message: 'response text is not JSON' };
  }
  if (parsed?.status === 'error') {
    const message = String(parsed.message ?? 'provider error');
    return { ok: false, errorCode: ERROR_CODE.exec(message)?.[1] ?? 'PROVIDER_ERROR', message };
  }
  return { ok: true, data: parsed?.data ?? parsed };
}

const HEADER_PIPES = 4;

function parseHeader(line: string): ParsedCompany | null {
  const parts = line.split('|');
  if (parts.length <= HEADER_PIPES) return null;
  const [providerId, name, symbol, bseCode, date] = parts.map(p => p.trim());
  return { providerId, name, symbol, bseCode, observationDate: DATE.test(date) ? date : null };
}

function parseCell(raw: string): ParsedCell {
  const text = raw.trim();
  if (text === '' || /^none$/i.test(text) || /^(nan|null|n\/a|-)$/i.test(text)) return { raw: text, value: null };
  const value = Number(text.replace(/,/g, ''));
  return { raw: text, value: Number.isFinite(value) ? value : null };
}

/**
 * Parses the get_stock_parameter_values data string: company header lines, then metric blocks
 * separated by "---". Each block is a label line followed by SYMBOL:value lines. Provider order is
 * not request order, so rows are identified by label only.
 */
export function parseParameterData(data: unknown): ParsedParameterTable {
  if (typeof data !== 'string') throw new AcquisitionError('RESPONSE_UNPARSEABLE', 'parameter data is not text');
  const companies: ParsedCompany[] = [];
  const rows: ParsedRow[] = [];
  for (const block of data.split(/\n\s*---\s*\n/)) {
    let label: string | null = null;
    const cells: Record<string, ParsedCell> = {};
    for (const line of block.split('\n').map(l => l.trim()).filter(Boolean)) {
      const header = parseHeader(line);
      if (header) { companies.push(header); continue; }
      const colon = line.lastIndexOf(':');
      if (label !== null && colon > 0) cells[line.slice(0, colon).trim()] = parseCell(line.slice(colon + 1));
      else if (label === null) label = line;
    }
    if (label !== null) rows.push({ label, cells });
  }
  return { companies, rows };
}
