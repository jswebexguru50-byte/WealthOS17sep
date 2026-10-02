/**
 * WealthOS Universal MCP Express Router
 * Master Developer Specification — Section D
 * Exposes /mcp and /mcp/sse directly through the main WealthOS Express server.
 */

import { Router } from 'express';
import { TOOLS } from '../../mcp/registry/toolRegistry.js';
import { RequirementRegistry } from '../../mcp/registry/requirementRegistry.js';
import { WealthOSProductionAdapter } from '../../mcp/adapters/wealthosAdapter.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'wealthos-universal-mcp',
    transport: 'Express HTTP & SSE',
    registeredToolsCount: TOOLS.length,
    version: '2.0.0'
  });
});

router.post('/', async (req, res) => {
  try {
    const { id, method, params } = req.body || {};

    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'wealthos-universal-mcp', version: '2.0.0' },
          capabilities: { tools: {}, resources: {} }
        }
      });
    }

    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { readOnlyHint: t.readOnly }
          }))
        }
      });
    }

    if (method === 'tools/call') {
      const tool = TOOLS.find(t => t.name === params?.name);
      if (!tool) {
        return res.status(404).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool '${params?.name}' not found.` }
        });
      }

      try {
        const toolResult = await tool.handler(params?.arguments || {});
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }]
          }
        });
      } catch (toolErr: any) {
        return res.status(500).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: toolErr.message || String(toolErr) }
        });
      }
    }

    if (method === 'resources/list') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          resources: [
            { uri: 'wealthos://requirements', name: 'Product Requirements', mimeType: 'application/json' },
            { uri: 'wealthos://portfolios', name: 'Active Portfolios', mimeType: 'application/json' }
          ]
        }
      });
    }

    if (method === 'resources/read') {
      const uri = params?.uri;
      if (uri === 'wealthos://requirements') {
        const reqs = RequirementRegistry.listRequirements();
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(reqs, null, 2) }]
          }
        });
      }
      if (uri === 'wealthos://portfolios') {
        const portfolios = await WealthOSProductionAdapter.listPortfolios();
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(portfolios, null, 2) }]
          }
        });
      }
      return res.status(404).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32002, message: `Resource '${uri}' not found.` }
      });
    }

    return res.status(400).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method '${method}' is not implemented.` }
    });
  } catch (err: any) {
    return res.status(500).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: err.message || 'Internal server error.' }
    });
  }
});

export default router;
