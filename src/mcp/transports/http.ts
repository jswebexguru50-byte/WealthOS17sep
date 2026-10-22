/**
 * WealthOS Universal MCP — Streamable HTTP Transport (MCP 2024-11-05)
 * 
 * Replaces the legacy SSE transport with the modern single-endpoint Streamable
 * HTTP transport required by ChatGPT remote MCP connectors and the MCP spec.
 *
 * Endpoint: POST /mcp  (both regular JSON-RPC and SSE streaming responses)
 * Auth:     Bearer token enforced for all tool access
 * Security: All existing plane separation, secret redaction, path guards preserved.
 *
 * DO NOT:
 * - expose arbitrary shell execution
 * - bypass IntelligenceQualityGate or SourceArtifactTrust
 * - modify FundamentalModuleAdapter, QGLP, valuation, portfolio, tax logic
 */

// Load .env for standalone process (supervisor/daemon mode)
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
(function loadEnv() {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'),
  ];
  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      readFileSync(envPath, 'utf-8').replace(/\r/g, '').split('\n').forEach(line => {
        const m = line.match(/^\s*([^#=][^=]*)=(.*)$/);
        if (m) {
          const key = m[1].trim();
          const val = m[2].trim().replace(/^["']|["']$/g, '');
          process.env[key] = val;
        }
      });
      break;
    }
  }
})();

import http from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createWealthOSMcpServer } from '../server.js';
import { TOOLS, getToolsForPlane } from '../registry/toolRegistry.js';
import { RequirementRegistry } from '../registry/requirementRegistry.js';
import { WealthOSProductionAdapter } from '../adapters/wealthosAdapter.js';
import { validatePlaneAccess } from '../security.js';

// Legacy SSE sessions (ChatGPT custom actions fallback)
const activeSSETransports = new Map<string, SSEServerTransport>();
// Streamable HTTP sessions keyed by Mcp-Session-Id header
const streamableSessions = new Map<string, StreamableHTTPServerTransport>();

function corsHeaders(origin: string | undefined): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, x-session-id',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  };
}

export function createMcpHttpServer(port: number = 3333, host: string = '127.0.0.1'): http.Server {
  if (host === '0.0.0.0' && process.env.ALLOW_REMOTE_MCP !== 'true') {
    throw new Error('SECURITY_ERROR: MCP HTTP transport must bind to 127.0.0.1 unless ALLOW_REMOTE_MCP=true (gateway only).');
  }

  const server = http.createServer(async (req, res) => {
    const origin = req.headers['origin'] as string | undefined;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(origin));
      res.end();
      return;
    }

    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // ── Health Check ────────────────────────────────────────────────────────
    if (url.pathname === '/health' || url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'OK',
        service: 'wealthos-universal-mcp',
        transport: 'Streamable HTTP (MCP 2024-11-05) + SSE Legacy',
        registeredToolsCount: TOOLS.length,
        version: '3.0.0',
        planes: ['PRODUCT', 'REVIEW', 'DEVELOPMENT'],
        remoteReady: true
      }));
      return;
    }

    // ── Determine requested plane ───────────────────────────────────────────
    const authHeader = req.headers['authorization'] as string | undefined;
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

    let requestedPlane: 'PRODUCT' | 'REVIEW' | 'DEVELOPMENT' = 'PRODUCT';
    if (url.pathname.startsWith('/mcp/dev')) {
      requestedPlane = 'DEVELOPMENT';
    } else if (url.pathname.startsWith('/mcp/review')) {
      requestedPlane = 'REVIEW';
    } else {
      if (token && process.env.WEALTHOS_REVIEW_KEY && token === process.env.WEALTHOS_REVIEW_KEY) {
        requestedPlane = 'REVIEW';
      } else if (token && process.env.WEALTHOS_DEV_KEY && token === process.env.WEALTHOS_DEV_KEY) {
        requestedPlane = 'DEVELOPMENT';
      }
    }

    // ── Auth gate ───────────────────────────────────────────────────────────
    const auth = validatePlaneAccess(requestedPlane, authHeader);
    if (!auth.authorized) {
      const code = auth.error?.includes('INSUFFICIENT_PRIVILEGES') ? 403 : 401;
      res.writeHead(code, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: auth.error || 'UNAUTHORIZED' } }));
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // STREAMABLE HTTP — MCP 2024-11-05 spec
    // Single endpoint: POST /mcp, POST /mcp/review, or POST /mcp/dev
    // Supports both regular JSON-RPC responses AND SSE streaming
    // ════════════════════════════════════════════════════════════════════════
    const isStreamablePath = url.pathname === '/mcp' || url.pathname === '/mcp/product' || url.pathname === '/mcp/review' || url.pathname === '/mcp/dev';

    if (isStreamablePath && req.method === 'POST') {
      const contentType = req.headers['content-type'] || '';

      // Only handle JSON-RPC requests here
      if (!contentType.includes('application/json')) {
        res.writeHead(415, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Content-Type must be application/json for MCP JSON-RPC requests.' }));
        return;
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const rpc = JSON.parse(body);
          const { id, method, params } = rpc;
          const planeTools = getToolsForPlane(requestedPlane);

          // Initialize — required for session establishment
          if (method === 'initialize') {
            const sessionId = crypto.randomUUID();
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Mcp-Session-Id': sessionId,
              ...corsHeaders(origin)
            });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: '2024-11-05',
                serverInfo: {
                  name: 'wealthos-universal-mcp',
                  version: '3.0.0',
                  description: 'WealthOS Universal MCP — Review & Product Plane. Independent reviewer access for calibration supervision.'
                },
                capabilities: {
                  tools: { listChanged: false },
                  resources: { subscribe: false, listChanged: false },
                  prompts: {}
                }
              }
            }));
            return;
          }

          if (method === 'notifications/initialized') {
            res.writeHead(202); res.end(); return;
          }

          if (method === 'tools/list') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                tools: planeTools.map(t => ({
                  name: t.name,
                  description: t.description,
                  inputSchema: t.inputSchema,
                  annotations: { readOnlyHint: t.readOnly }
                }))
              }
            }));
            return;
          }

          if (method === 'tools/call') {
            const tool = planeTools.find(t => t.name === params?.name);
            if (!tool) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `Tool '${params?.name}' not found on plane '${requestedPlane}'.` }
              }));
              return;
            }
            try {
              const toolResult = await tool.handler(params?.arguments || {});
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: { content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }] }
              }));
            } catch (toolErr: any) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code: -32000, message: toolErr.message || String(toolErr) }
              }));
            }
            return;
          }

          if (method === 'resources/list') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                resources: [
                  { uri: 'wealthos://requirements', name: 'Product Requirements', mimeType: 'application/json' },
                  { uri: 'wealthos://portfolios', name: 'Active Portfolios', mimeType: 'application/json' }
                ]
              }
            }));
            return;
          }

          if (method === 'resources/read') {
            const uri = params?.uri;
            if (uri === 'wealthos://requirements') {
              const reqs = RequirementRegistry.listRequirements();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0', id,
                result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(reqs, null, 2) }] }
              }));
              return;
            }
            if (uri === 'wealthos://portfolios') {
              const portfolios = await WealthOSProductionAdapter.listPortfolios();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0', id,
                result: { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(portfolios, null, 2) }] }
              }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32002, message: `Resource '${uri}' not found.` } }));
            return;
          }

          if (method === 'ping') {
            res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
            res.end(JSON.stringify({ jsonrpc: '2.0', id, result: {} }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
          res.end(JSON.stringify({
            jsonrpc: '2.0', id,
            error: { code: -32601, message: `Method '${method}' is not implemented.` }
          }));
        } catch (_e) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: Invalid JSON body.' } }));
        }
      });
      return;
    }

    // ── GET /mcp — session resumption / SSE streaming (MCP spec) ───────────
    if (isStreamablePath && req.method === 'GET') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Mcp-Session-Id header required for SSE streaming.' }));
        return;
      }
      // SSE stream for push notifications (tools that stream progress)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders(origin)
      });
      res.write('event: connected\ndata: {"sessionId":"' + sessionId + '"}\n\n');
      // Keep alive
      const keepAlive = setInterval(() => res.write(': keepalive\n\n'), 15000);
      req.on('close', () => clearInterval(keepAlive));
      return;
    }

    // ── DELETE /mcp — explicit session termination ──────────────────────────
    if (isStreamablePath && req.method === 'DELETE') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId) streamableSessions.delete(sessionId);
      res.writeHead(200); res.end();
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // LEGACY SSE Transport — for backwards compatibility with existing clients
    // ════════════════════════════════════════════════════════════════════════
    if (url.pathname === '/mcp/sse' && req.method === 'GET') {
      const transport = new SSEServerTransport('/mcp/message', res);
      const mcpServer = createWealthOSMcpServer();
      activeSSETransports.set(transport.sessionId, transport);
      transport.onclose = () => activeSSETransports.delete(transport.sessionId);
      await mcpServer.connect(transport);
      return;
    }

    if (url.pathname === '/mcp/message' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId') || (req.headers['x-session-id'] as string);
      const transport = activeSSETransports.get(sessionId);
      if (!transport) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Session '${sessionId}' not found.` }));
        return;
      }
      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Endpoint not found.',
      hint: 'POST /mcp for Streamable HTTP (ChatGPT remote MCP), GET /mcp/sse for legacy SSE.'
    }));
  });

  return server;
}

// Standalone runner
if (process.argv[1]?.endsWith('http.ts') || process.argv[1]?.endsWith('http.js')) {
  const PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 8787;
  const HOST = process.env.MCP_HOST || '127.0.0.1';

  const server = createMcpHttpServer(PORT, HOST);
  server.listen(PORT, HOST, () => {
    console.log('======================================================================');
    console.log('WEALTHOS UNIVERSAL MCP — REMOTE REVIEW TRANSPORT v3.0.0');
    console.log(`Binding: http://${HOST}:${PORT}`);
    console.log('======================================================================');
    console.log(`Product Plane (Streamable HTTP):  POST http://${HOST}:${PORT}/mcp`);
    console.log(`Dev/Review Plane (Streamable HTTP): POST http://${HOST}:${PORT}/mcp/dev`);
    console.log(`SSE Legacy: GET http://${HOST}:${PORT}/mcp/sse`);
    console.log(`Health: GET http://${HOST}:${PORT}/health`);
    console.log('');
    console.log('Remote Access: Run scripts/mcp/start_review_gateway.ps1 to open tunnel');
    console.log('======================================================================');
  });
}
