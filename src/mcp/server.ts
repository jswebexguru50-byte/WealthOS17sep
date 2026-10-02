/**
 * WealthOS Universal MCP Server
 * Master Developer Specification — Section D, E, AQ
 *
 * Implements the standards-compliant MCP Server with Zero LLM vendor dependencies.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './registry/toolRegistry.js';
import { RequirementRegistry } from './registry/requirementRegistry.js';
import { WealthOSProductionAdapter } from './adapters/wealthosAdapter.js';

export function createWealthOSMcpServer(): Server {
  const server = new Server(
    {
      name: 'wealthos-universal-mcp',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // ── 1. Tools Handlers ───────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: {
          readOnlyHint: t.readOnly,
          idempotentHint: t.readOnly,
        }
      }))
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `TOOL_NOT_FOUND: Tool '${name}' is not registered on WealthOS Universal MCP.`,
              availableTools: TOOLS.map(t => t.name)
            }, null, 2)
          }
        ]
      };
    }

    try {
      const response = await tool.handler(args || {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'ERROR',
              error: err.message || String(err),
              code: err.code || 'TOOL_EXECUTION_ERROR',
              details: err.details || null
            }, null, 2)
          }
        ]
      };
    }
  });

  // ── 2. Resources Handlers ───────────────────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'wealthos://requirements',
          name: 'WealthOS Product Requirements & V2 Acceptance Criteria',
          mimeType: 'application/json',
          description: 'Official registry of WealthOS product requirements, acceptance criteria, and suite mappings'
        },
        {
          uri: 'wealthos://portfolios',
          name: 'Active WealthOS Portfolios',
          mimeType: 'application/json',
          description: 'List of all active family office and investor portfolios'
        }
      ]
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === 'wealthos://requirements') {
      const reqs = RequirementRegistry.listRequirements();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(reqs, null, 2)
          }
        ]
      };
    }

    if (uri === 'wealthos://portfolios') {
      const portfolios = await WealthOSProductionAdapter.listPortfolios();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(portfolios, null, 2)
          }
        ]
      };
    }

    throw new Error(`RESOURCE_NOT_FOUND: Unknown resource URI '${uri}'`);
  });

  return server;
}
