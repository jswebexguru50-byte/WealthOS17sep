/**
 * WealthOS Universal MCP — Stdio Transport
 * Master Developer Specification — Section D, AQ
 *
 * Runs the MCP server over standard input/output (stdio) for command-line clients.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createWealthOSMcpServer } from '../server.js';

async function main() {
  const server = createWealthOSMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  // Stdio transport uses stderr for informational logging to preserve stdout for JSON-RPC
  console.error('WealthOS Universal MCP Server connected via stdio transport.');
}

main().catch((err) => {
  console.error('Fatal error starting WealthOS MCP stdio transport:', err);
  process.exit(1);
});
