# WealthOS Universal MCP — Client Connection Guide
**Master Developer Specification — Section D, AW, AY**

WealthOS Universal MCP is vendor-neutral and requires **zero LLM vendor SDKs or API keys**. It communicates over standard Model Context Protocol transports:

1. **Stdio (Command Line)**
2. **Streamable HTTP & Server-Sent Events (SSE)**

---

## 1. Stdio Configuration (Cursor / Claude Desktop / CLI)

Add the following configuration to your MCP client configuration file:

### For Cursor (`.cursor/mcp.json` or Global Settings):
```json
{
  "mcpServers": {
    "wealthos": {
      "command": "node",
      "args": [
        "--require=./scripts/node_userinfo_fallback.cjs",
        "--import=tsx",
        "src/mcp/transports/stdio.ts"
      ],
      "cwd": "C:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release"
    }
  }
}
```

### For Claude Desktop (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "wealthos": {
      "command": "cmd.exe",
      "args": [
        "/c",
        "npm run mcp:stdio"
      ],
      "cwd": "C:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release"
    }
  }
}
```

---

## 2. Streamable HTTP & SSE Configuration

Start the standalone HTTP transport or run with the main dev server:
```bash
npm run mcp:http
```

Default HTTP endpoints:
- **Direct JSON-RPC:** `http://localhost:3333/mcp` (or `http://localhost:3000/mcp`)
- **SSE Stream:** `http://localhost:3333/mcp/sse`
- **Health Check:** `http://localhost:3333/health`

### Example JSON-RPC Request:
```bash
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "resolve_security",
      "arguments": { "symbolOrIsin": "TCS" }
    }
  }'
```

---

## 3. Official MCP Inspector

To test the server interactively with the official MCP Inspector:
```bash
npx @modelcontextprotocol/inspector npm run mcp:stdio
```
Or connect the inspector to the HTTP SSE transport:
```
http://localhost:3333/mcp/sse
```
