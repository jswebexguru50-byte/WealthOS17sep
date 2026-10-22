/**
 * WealthOS Universal MCP — Local Inspector & Transport Verification Script
 * Validates stdio JSON-RPC and HTTP transport behavior, security fail-closed semantics,
 * and plane separation against local 127.0.0.1 endpoints.
 */

import { spawn } from 'child_process';
import http from 'http';
import { createMcpHttpServer } from '../../src/mcp/transports/http.js';

async function testStdioTransport(): Promise<boolean> {
  console.log('Testing Stdio JSON-RPC transport...');
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', 'src/mcp/transports/stdio.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, WEALTHOS_PRODUCT_KEY: 'test-product-key', WEALTHOS_DEV_KEY: 'test-dev-key' }
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (d) => {
      stdoutData += d.toString();
      // When initialize response received, send tools/list
      if (stdoutData.includes('"result"') && stdoutData.includes('protocolVersion') && !stdoutData.includes('"id":2')) {
        const toolsReq = JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {}
        }) + '\n';
        child.stdin.write(toolsReq);
      }
      if (stdoutData.includes('"tools"') && stdoutData.includes('search_securities')) {
        console.log('✓ Stdio JSON-RPC initialize and tools/list succeeded.');
        child.kill();
        resolve(true);
      }
    });

    child.stderr.on('data', (d) => {
      stderrData += d.toString();
    });

    child.on('error', (err) => {
      console.error('Stdio process error:', err);
      resolve(false);
    });

    // Send initialize request
    const initReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcp-inspector-local', version: '1.0.0' }
      }
    }) + '\n';

    child.stdin.write(initReq);

    setTimeout(() => {
      child.kill();
      if (!stdoutData.includes('search_securities')) {
        console.error('Stdio timeout. Output:', stdoutData, 'Stderr:', stderrData);
        resolve(false);
      }
    }, 12000);
  });
}

async function testHttpEndpoints(): Promise<boolean> {
  console.log('Testing HTTP Transport & Fail-Closed Plane Isolation on 127.0.0.1:8787...');
  process.env.WEALTHOS_PRODUCT_KEY = 'prod-secret-999';
  process.env.WEALTHOS_DEV_KEY = 'dev-secret-888';

  const server = createMcpHttpServer(8787, '127.0.0.1');

  await new Promise<void>((resolve) => {
    server.listen(8787, '127.0.0.1', () => resolve());
  });

  // Helper fetch function
  const query = async (path: string, method: string = 'GET', bodyObj?: any, token?: string) => {
    return new Promise<{ status: number; body: any }>((resolve, reject) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request({
        host: '127.0.0.1',
        port: 8787,
        path,
        method,
        headers
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      });
      req.on('error', reject);
      if (bodyObj) req.write(JSON.stringify(bodyObj));
      req.end();
    });
  };

  try {
    // 1. Health check (public GET)
    const health = await query('/health', 'GET');
    console.log('Health check status:', health.status);
    if (health.status !== 200 || health.body.status !== 'OK') return false;

    // 2. Missing token fail-closed (POST /mcp/product with no token)
    const noToken = await query('/mcp/product', 'POST', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    });
    console.log('Missing token check status:', noToken.status);
    if (noToken.status !== 401) return false;

    // 3. Product token accessing product tools
    const prodTools = await query('/mcp/product', 'POST', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }, 'prod-secret-999');
    console.log('Product tools response:', prodTools.status, 'tools count:', prodTools.body?.result?.tools?.length);
    if (prodTools.status !== 200 || !Array.isArray(prodTools.body?.result?.tools)) return false;

    // 4. Product token attempting to access Dev plane (Cross-plane authorization check)
    const crossPlane = await query('/mcp/dev', 'POST', {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: {}
    }, 'prod-secret-999');
    console.log('Cross-plane attack status:', crossPlane.status);
    if (crossPlane.status !== 403) return false;

    // 5. Dev token accessing dev plane
    const devTools = await query('/mcp/dev', 'POST', {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
      params: {}
    }, 'dev-secret-888');
    console.log('Dev tools response:', devTools.status, 'tools count:', devTools.body?.result?.tools?.length);
    if (devTools.status !== 200 || !Array.isArray(devTools.body?.result?.tools)) return false;

    console.log('✓ All HTTP fail-closed and plane isolation checks passed.');
    return true;
  } finally {
    server.close();
  }
}

async function main() {
  console.log('=== WEALTHOS UNIVERSAL MCP INSPECTOR RUNNER ===');
  const stdioOk = await testStdioTransport();
  const httpOk = await testHttpEndpoints();

  if (stdioOk && httpOk) {
    console.log('\n✓ MCP INSPECTOR PASSED: All local transports and security contracts operational.');
    process.exit(0);
  } else {
    console.error('\n× MCP INSPECTOR FAILED: Transports or isolation checks failed.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Inspector error:', err);
  process.exit(1);
});
