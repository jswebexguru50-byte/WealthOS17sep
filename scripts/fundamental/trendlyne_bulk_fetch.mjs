/**
 * trendlyne_bulk_fetch.mjs — Bulk F1-F7 fundamental data fetch from Trendlyne MCP
 *
 * Fetches promoter%, pledge, FII, MF, institutional, ROCE, ROE, PAT, PE, MCap, D/E
 * for all NSE/BSE symbols in MasterTickers. Writes one JSONL line per symbol to
 * scripts/qa/out/trendlyne_bulk.jsonl. ZERO fabrication: None → null.
 *
 * Usage: node scripts/fundamental/trendlyne_bulk_fetch.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// ── Config ────────────────────────────────────────────────────────────────────
const ENV_PATH = path.join(ROOT, 'WealthOS04Oct', '.env');
const DB_PATH  = path.join(ROOT, 'portfolio.db');
const OUT_DIR  = path.join(ROOT, 'scripts', 'qa', 'out');
const OUT_PATH = path.join(OUT_DIR, 'trendlyne_bulk.jsonl');

const TOKENS = [
  'prompct', 'prompledge', 'fiihold', 'mfhold', 'instihold',
  'instipct1q', 'fiipct1q', 'rocea', 'roea', 'reportedpatq',
  'pettm', 'mcapq', 'debtcea',
];

const BATCH_SIZE   = 10;   // Trendlyne max stocks per call
const MAX_BATCHES  = 400;  // cap at 4000 symbols
const BATCH_DELAY  = 500;  // ms between batches
const RETRY_DELAY  = 5000; // ms before retry on error
const PROGRESS_EVERY = 50; // log every N symbols

// ── Parse .env ────────────────────────────────────────────────────────────────
function parseEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

// ── Parse plain-text MCP response ────────────────────────────────────────────
function parseParameterText(text, tokens, stockCodes) {
  const result = {};
  for (const sym of stockCodes) result[sym.toUpperCase()] = {};

  const sections = text.split(/\n\s*---\s*\n/);
  // First section is stock header metadata — skip it
  const dataSections = sections.slice(1).filter(s => s.trim());

  for (let i = 0; i < Math.min(tokens.length, dataSections.length); i++) {
    const token = tokens[i];
    const lines = dataSections[i].split('\n').map(l => l.trim()).filter(Boolean);
    // First non-empty line is the parameter description heading — skip
    for (const line of lines.slice(1)) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const sym = line.substring(0, colonIdx).trim().toUpperCase();
      const valStr = line.substring(colonIdx + 1).trim();
      if (!(sym in result)) continue;
      if (valStr === 'None' || valStr === '' || valStr === 'N/A' || valStr === 'null') {
        result[sym][token] = null;
      } else {
        const num = Number(valStr);
        result[sym][token] = isNaN(num) ? valStr : num;
      }
    }
  }
  return result;
}

// ── Load already-fetched symbols from existing JSONL ──────────────────────────
function loadExistingSymbols(outPath) {
  const done = new Set();
  if (!fs.existsSync(outPath)) return done;
  const lines = fs.readFileSync(outPath, 'utf-8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (!obj.symbol) continue;
      // Only mark as done if all tokens have non-undefined values (null is acceptable)
      const fields = obj.fields || {};
      const allPresent = TOKENS.every(t => t in fields);
      if (allPresent) done.add(obj.symbol.toUpperCase());
    } catch { /* skip malformed */ }
  }
  return done;
}

// ── MCP client ────────────────────────────────────────────────────────────────
let mcpClient = null;

async function getMcpClient(url) {
  if (mcpClient) return mcpClient;
  const client = new Client({ name: 'wealthos-bulk-fetcher', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  mcpClient = client;
  return client;
}

async function callTool(url, toolName, args) {
  const client = await getMcpClient(url);
  const result = await client.callTool({ name: toolName, arguments: args });
  if (result?.isError) throw new Error(`MCP_TOOL_ERROR:${toolName}`);
  const content = Array.isArray(result?.content) ? result.content : [];
  const text = content.find(item => item?.type === 'text' && typeof item.text === 'string')?.text;
  if (text) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return result?.structuredContent || result;
}

// ── Coverage summary ──────────────────────────────────────────────────────────
function printCoverage(outPath) {
  if (!fs.existsSync(outPath)) return;
  const lines = fs.readFileSync(outPath, 'utf-8').split('\n').filter(Boolean);
  const counts = {};
  for (const t of TOKENS) counts[t] = { filled: 0, null_: 0 };
  let total = 0;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const fields = obj.fields || {};
      total++;
      for (const t of TOKENS) {
        if (t in fields) {
          if (fields[t] !== null) counts[t].filled++;
          else counts[t].null_++;
        }
      }
    } catch { /* skip */ }
  }
  console.log(`\n=== Coverage Summary (${total} symbols) ===`);
  for (const t of TOKENS) {
    const { filled, null_ } = counts[t];
    const pct = total > 0 ? ((filled / total) * 100).toFixed(1) : '0.0';
    console.log(`  ${t.padEnd(15)} filled=${filled}  null=${null_}  coverage=${pct}%`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Parse env
  const env = parseEnv(ENV_PATH);
  const mcpUrl = env.TRENDLYNE_MCP_URL;
  if (!mcpUrl) {
    console.error(`ERROR: TRENDLYNE_MCP_URL not found in ${ENV_PATH}`);
    process.exit(1);
  }
  console.log(`MCP URL: ${mcpUrl.replace(/token=[^&]+/, 'token=***')}`);

  // 2. Read symbols from DB (read-only)
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db.prepare(
    `SELECT DISTINCT symbol FROM MasterTickers
     WHERE exchange IN ('NSE','BSE') AND symbol IS NOT NULL AND symbol != ''
     ORDER BY symbol`
  ).all();
  db.close();
  const allSymbols = rows.map(r => r.symbol.trim().toUpperCase()).filter(Boolean);
  console.log(`Total symbols in MasterTickers: ${allSymbols.length}`);

  // 3. Load already-processed symbols
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const existingDone = loadExistingSymbols(OUT_PATH);
  console.log(`Already done (all tokens present): ${existingDone.size}`);

  const pending = allSymbols.filter(s => !existingDone.has(s));
  console.log(`Pending: ${pending.length}`);

  // 4. Open output JSONL for appending
  const outStream = fs.createWriteStream(OUT_PATH, { flags: 'a' });

  // 5. Process in batches
  const maxSymbols = MAX_BATCHES * BATCH_SIZE;
  const todo = pending.slice(0, maxSymbols);
  let processed = 0;
  let batchNum = 0;
  const startTime = Date.now();

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    batchNum++;

    let responseObj = null;
    let lastErr = null;

    // Try once, then retry on failure
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        responseObj = await callTool(mcpUrl, 'get_stock_parameter_values', {
          stock_codes: batch,
          parameters: TOKENS,
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        // Reset client so a fresh connection is made on retry
        mcpClient = null;
        if (attempt === 0) {
          console.warn(`  Batch ${batchNum} error: ${err.message} — retrying in ${RETRY_DELAY}ms`);
          await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
      }
    }

    const fetchedAt = new Date().toISOString();

    if (lastErr) {
      console.error(`  Batch ${batchNum} failed after retry: ${lastErr.message} — skipping`);
      // Write null records for this batch so we don't re-attempt them
      for (const sym of batch) {
        const nullFields = {};
        for (const t of TOKENS) nullFields[t] = null;
        const record = { symbol: sym, fetched_at: fetchedAt, source: 'trendlyne_mcp', error: lastErr.message, fields: nullFields };
        outStream.write(JSON.stringify(record) + '\n');
      }
      processed += batch.length;
    } else {
      // Parse response
      let parsed;
      if (typeof responseObj === 'string') {
        parsed = parseParameterText(responseObj, TOKENS, batch);
      } else if (responseObj && typeof responseObj === 'object') {
        // Could be structured JSON or nested text
        const maybeText = responseObj?.content?.find?.((c) => c?.type === 'text')?.text
          || responseObj?.text
          || (responseObj?.result ? null : null);
        if (typeof maybeText === 'string') {
          parsed = parseParameterText(maybeText, TOKENS, batch);
        } else {
          // Assume it's directly the parsed data keyed by symbol
          parsed = responseObj;
        }
      } else {
        parsed = {};
      }

      for (const sym of batch) {
        const symData = parsed[sym.toUpperCase()] || parsed[sym] || {};
        // Build fields with explicit null for any missing token
        const fields = {};
        for (const t of TOKENS) {
          const val = symData[t];
          fields[t] = (val === undefined) ? null : val;
        }
        const record = { symbol: sym, fetched_at: fetchedAt, source: 'trendlyne_mcp', fields };
        outStream.write(JSON.stringify(record) + '\n');
      }
      processed += batch.length;
    }

    // Progress log every PROGRESS_EVERY symbols
    if (processed % PROGRESS_EVERY < BATCH_SIZE || processed >= todo.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = processed > 0 ? (processed / ((Date.now() - startTime) / 1000)).toFixed(1) : '?';
      const remaining = todo.length - processed;
      const eta = rate > 0 ? Math.round(remaining / rate) : '?';
      console.log(`[${new Date().toISOString()}] Progress: ${processed}/${todo.length} symbols | ${elapsed}s elapsed | ${rate} sym/s | ETA ~${eta}s`);
    }

    // Rate limit delay between batches (skip on last batch)
    if (i + BATCH_SIZE < todo.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  outStream.end();
  console.log(`\nDone. ${processed} symbols processed. Output: ${OUT_PATH}`);

  printCoverage(OUT_PATH);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
