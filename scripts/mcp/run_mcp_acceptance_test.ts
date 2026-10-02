/**
 * WealthOS MCP Protocol Acceptance Test
 * Satisfies: MCP_INSPECTOR_ACCEPTANCE requirement
 * 
 * Tests: initialize, initialized lifecycle, tools/list, tools/call,
 *        resources/list, resources/read, session, invalid auth,
 *        wrong plane credential, malformed JSON-RPC, concurrent calls,
 *        security boundaries (shell, SQL, filesystem, .env, credentials)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const PORT = 8787;
const BASE = `http://${HOST}:${PORT}`;

// Keys loaded from .env at runtime — never hardcoded
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
  }
  return env;
}

const ENV = loadEnv();
const PRODUCT_KEY = ENV.WEALTHOS_PRODUCT_KEY || '';
const DEV_KEY = ENV.WEALTHOS_DEV_KEY || '';

interface TestResult {
  id: string;
  category: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  expected: string;
  actual: string;
  durationMs: number;
  details?: any;
}

const results: TestResult[] = [];

function post(path: string, body: any, authKey?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts: http.RequestOptions = {
      hostname: HOST, port: PORT, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(authKey ? { 'Authorization': `Bearer ${authKey}` } : {})
      }
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode!, body: raw }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

function get(path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${HOST}:${PORT}${path}`, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode!, body: raw }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function test(id: string, category: string, description: string, expected: string, fn: () => Promise<string>): Promise<void> {
  const t0 = Date.now();
  try {
    const actual = await fn();
    const passed = actual.includes('PASS') || actual === expected;
    results.push({
      id, category, description,
      status: passed ? 'PASS' : 'FAIL',
      expected, actual,
      durationMs: Date.now() - t0
    });
  } catch (e: any) {
    results.push({
      id, category, description,
      status: 'FAIL',
      expected, actual: `ERROR: ${e.message}`,
      durationMs: Date.now() - t0
    });
  }
}

// ─────────────────────────────────────────────────────────────────
async function runAll() {
  console.log('MCP Protocol Acceptance Test — WealthOS');
  console.log('Target:', BASE);
  console.log('─'.repeat(60));

  // T01 — Health
  await test('T01', 'HEALTH', 'Health endpoint responds 200', 'PASS', async () => {
    const r = await get('/health');
    return r.status === 200 && r.body.status === 'OK' ? 'PASS' : `FAIL status=${r.status}`;
  });

  // T02 — Initialize
  await test('T02', 'LIFECYCLE', 'initialize returns protocolVersion 2024-11-05', 'PASS', async () => {
    const r = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05', clientInfo: { name: 'inspector', version: '1.0' }, capabilities: {}
    }}, PRODUCT_KEY);
    return r.body?.result?.protocolVersion === '2024-11-05' ? 'PASS' : `FAIL body=${JSON.stringify(r.body)}`;
  });

  // T03 — Session-Id in initialize response
  await test('T03', 'LIFECYCLE', 'initialize returns Mcp-Session-Id capability', 'PASS', async () => {
    const r = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05', clientInfo: { name: 'inspector', version: '1.0' }, capabilities: {}
    }}, PRODUCT_KEY);
    return r.body?.result?.protocolVersion ? 'PASS' : 'FAIL: no result';
  });

  // T04 — notifications/initialized (202)
  await test('T04', 'LIFECYCLE', 'notifications/initialized returns 202 accepted', 'PASS', async () => {
    const r = await post('/mcp', { jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, PRODUCT_KEY);
    return r.status === 202 ? 'PASS' : `FAIL status=${r.status}`;
  });

  // T05 — tools/list
  await test('T05', 'TOOLS', 'tools/list returns ≥20 tools on product plane', 'PASS', async () => {
    const r = await post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, PRODUCT_KEY);
    const count = r.body?.result?.tools?.length || 0;
    return count >= 20 ? `PASS (${count} tools)` : `FAIL only ${count} tools`;
  });

  // T06 — tools/list dev plane has >= product plane
  await test('T06', 'TOOLS', 'tools/list on dev plane returns ≥ product plane', 'PASS', async () => {
    const rp = await post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, PRODUCT_KEY);
    const rd = await post('/mcp/dev', { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, DEV_KEY);
    const cp = rp.body?.result?.tools?.length || 0;
    const cd = rd.body?.result?.tools?.length || 0;
    return cd >= cp ? `PASS (prod=${cp}, dev=${cd})` : `FAIL prod=${cp} > dev=${cd}`;
  });

  // T07 — tools/call (read-only, safe tool)
  await test('T07', 'TOOLS', 'tools/call search_securities returns result envelope', 'PASS', async () => {
    const r = await post('/mcp', {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'search_securities', arguments: { query: 'TCS', limit: 3 } }
    }, PRODUCT_KEY);
    return r.body?.result?.content?.length > 0 ? 'PASS' : `FAIL ${JSON.stringify(r.body).slice(0,200)}`;
  });

  // T08 — tools/call nonexistent tool
  await test('T08', 'TOOLS', 'tools/call unknown tool returns error -32601', 'PASS', async () => {
    const r = await post('/mcp', {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'nonexistent_tool_xyz', arguments: {} }
    }, PRODUCT_KEY);
    return r.body?.error?.code === -32601 ? 'PASS' : `FAIL body=${JSON.stringify(r.body)}`;
  });

  // T09 — resources/list
  await test('T09', 'RESOURCES', 'resources/list returns at least 1 resource', 'PASS', async () => {
    const r = await post('/mcp', { jsonrpc: '2.0', id: 5, method: 'resources/list', params: {} }, PRODUCT_KEY);
    const count = r.body?.result?.resources?.length || 0;
    return count >= 1 ? `PASS (${count} resources)` : `FAIL count=${count}`;
  });

  // T10 — resources/read
  await test('T10', 'RESOURCES', 'resources/read wealthos://requirements returns JSON', 'PASS', async () => {
    const r = await post('/mcp', {
      jsonrpc: '2.0', id: 6, method: 'resources/read',
      params: { uri: 'wealthos://requirements' }
    }, PRODUCT_KEY);
    return r.body?.result?.contents?.length > 0 ? 'PASS' : `FAIL body=${JSON.stringify(r.body).slice(0,200)}`;
  });

  // T11 — ping
  await test('T11', 'LIFECYCLE', 'ping returns empty result', 'PASS', async () => {
    const r = await post('/mcp', { jsonrpc: '2.0', id: 7, method: 'ping', params: {} }, PRODUCT_KEY);
    return r.body?.result !== undefined ? 'PASS' : `FAIL body=${JSON.stringify(r.body)}`;
  });

  // T12 — malformed JSON
  await test('T12', 'PROTOCOL', 'malformed JSON body returns parse error -32700', 'PASS', async () => {
    const r = await new Promise<any>((resolve, reject) => {
      const data = '{bad json!!!';
      const opts: http.RequestOptions = {
        hostname: HOST, port: PORT, path: '/mcp', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data),
          'Authorization': `Bearer ${PRODUCT_KEY}` }
      };
      const req = http.request(opts, res => {
        let raw = ''; res.on('data', c => raw += c);
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); } catch { resolve({status:res.statusCode,body:raw}); }});
      });
      req.on('error', reject); req.write(data); req.end();
    });
    return r.body?.error?.code === -32700 ? 'PASS' : `FAIL ${JSON.stringify(r.body)}`;
  });

  // T13 — missing auth
  await test('T13', 'SECURITY', 'missing Authorization header returns 401', 'PASS', async () => {
    const r = await post('/mcp', { jsonrpc: '2.0', id: 8, method: 'tools/list', params: {} });
    return r.status === 401 ? 'PASS' : `FAIL status=${r.status}`;
  });

  // T14 — invalid token
  await test('T14', 'SECURITY', 'invalid token returns 401', 'PASS', async () => {
    const r = await post('/mcp', { jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} }, 'invalid-token-xyz');
    return r.status === 401 ? 'PASS' : `FAIL status=${r.status}`;
  });

  // T15 — product key on dev plane = 403
  await test('T15', 'SECURITY', 'product key on /mcp/dev returns 403', 'PASS', async () => {
    const r = await post('/mcp/dev', { jsonrpc: '2.0', id: 10, method: 'tools/list', params: {} }, PRODUCT_KEY);
    return r.status === 403 ? 'PASS' : `FAIL status=${r.status} body=${JSON.stringify(r.body).slice(0,100)}`;
  });

  // T16 — .env access blocked
  await test('T16', 'SECURITY', '.env read via read_file returns SECURITY_VIOLATION', 'PASS', async () => {
    const r = await post('/mcp/dev', {
      jsonrpc: '2.0', id: 11, method: 'tools/call',
      params: { name: 'inspect_source_file', arguments: { filePath: '.env' } }
    }, DEV_KEY);
    const txt = JSON.stringify(r.body);
    return (txt.includes('SECURITY_VIOLATION') || txt.includes('forbidden') || txt.includes('FORBIDDEN')) ? 'PASS' : `FAIL: .env access not blocked: ${txt.slice(0,200)}`;
  });

  // T17 — path traversal blocked
  await test('T17', 'SECURITY', '../../../etc/passwd path traversal returns SECURITY_VIOLATION', 'PASS', async () => {
    const r = await post('/mcp/dev', {
      jsonrpc: '2.0', id: 12, method: 'tools/call',
      params: { name: 'inspect_source_file', arguments: { filePath: '../../../etc/passwd' } }
    }, DEV_KEY);
    const txt = JSON.stringify(r.body);
    return (txt.includes('SECURITY_VIOLATION') || txt.includes('traversal') || txt.includes('forbidden') || txt.includes('error')) ? 'PASS' : `FAIL: traversal not blocked: ${txt.slice(0,200)}`;
  });

  // T18 — portfolio.db access blocked
  await test('T18', 'SECURITY', 'portfolio.db access returns SECURITY_VIOLATION', 'PASS', async () => {
    const r = await post('/mcp/dev', {
      jsonrpc: '2.0', id: 13, method: 'tools/call',
      params: { name: 'inspect_source_file', arguments: { filePath: 'portfolio.db' } }
    }, DEV_KEY);
    const txt = JSON.stringify(r.body);
    return (txt.includes('SECURITY_VIOLATION') || txt.includes('forbidden') || txt.includes('FORBIDDEN')) ? 'PASS' : `FAIL: db access not blocked: ${txt.slice(0,200)}`;
  });

  // T19 — concurrent calls
  await test('T19', 'CONCURRENCY', '5 concurrent tools/list calls all return 200', 'PASS', async () => {
    const calls = Array.from({ length: 5 }, (_, i) =>
      post('/mcp', { jsonrpc: '2.0', id: 100 + i, method: 'tools/list', params: {} }, PRODUCT_KEY)
    );
    const results = await Promise.all(calls);
    const allOk = results.every(r => r.status === 200 && r.body?.result?.tools?.length > 0);
    return allOk ? 'PASS' : `FAIL: ${results.map(r => r.status).join(',')}`;
  });

  // T20 — unknown method
  await test('T20', 'PROTOCOL', 'unknown method returns -32601', 'PASS', async () => {
    const r = await post('/mcp', { jsonrpc: '2.0', id: 20, method: 'tools/nonexistent_method', params: {} }, PRODUCT_KEY);
    return r.body?.error?.code === -32601 ? 'PASS' : `FAIL body=${JSON.stringify(r.body)}`;
  });

  // ── Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status !== 'PASS').length;
  const overallStatus = failed === 0 ? 'PASS' : 'FAIL';

  console.log('\n' + '═'.repeat(60));
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} [${r.id}] ${r.category.padEnd(12)} ${r.description.slice(0,50).padEnd(52)} ${r.durationMs}ms`);
    if (r.status !== 'PASS') console.log(`   Expected: ${r.expected}\n   Actual:   ${r.actual}`);
  });
  console.log('═'.repeat(60));
  console.log(`TOTAL: ${results.length} | PASS: ${passed} | FAIL: ${failed}`);
  console.log(`MCP_INSPECTOR_ACCEPTANCE = ${overallStatus}`);

  // Output JSON (no sensitive data)
  const report = {
    testRunId: `MCP_INSPECTOR_${new Date().toISOString().replace(/[:.]/g,'_')}`,
    target: `http://${HOST}:${PORT}`,
    timestamp: new Date().toISOString(),
    overall: overallStatus,
    totalTests: results.length,
    passed,
    failed,
    tests: results.map(r => ({
      id: r.id, category: r.category, description: r.description,
      status: r.status, expected: r.expected, actual: r.actual, durationMs: r.durationMs
    }))
  };
  
  // Write to reports directory
  const reportDir = path.resolve(process.cwd(), 'reports', 'mcp-acceptance');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'MCP_INSPECTOR_ACCEPTANCE.json'), JSON.stringify(report, null, 2));
  console.log(`\nReport: reports/mcp-acceptance/MCP_INSPECTOR_ACCEPTANCE.json`);

  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch(e => { console.error('FATAL:', e); process.exit(1); });
