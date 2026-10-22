# WealthOS Universal MCP — Antigravity Integration Specification
**Document Classification:** Technical Architecture & Integration Evidence  
**Status:** FROZEN  
**Date:** 2026-09-30  

---

## 1. Executive Summary & Classification

As mandated by Section 7 of the Master Specification, Antigravity integration interfaces have been forensically investigated against the active host environment (`C:\Users\gopal\.gemini\antigravity-ide`).

| Interface Path | Classification | Evidence & Mechanism | Support Status |
|---|---|---|---|
| **MCP Server Config** | `SUPPORTED_VIA_MCP` | Antigravity connects directly to MCP servers declared via stdio commands or Streamable HTTP in `mcp_config.json` or IDE server manifests. Both `/mcp/product` and `/mcp/dev` are exposed as standards-compliant MCP servers. | **FULLY SUPPORTED** |
| **Local Stdio Command** | `SUPPORTED_VIA_CLI` | Antigravity executes `node dist/mcp/transports/stdio.js` directly as a subprocess with JSON-RPC stdio pipes. | **FULLY SUPPORTED** |
| **Streamable HTTP API** | `SUPPORTED_VIA_API` | Antigravity connects to `http://127.0.0.1:8787/mcp/product` and `http://127.0.0.1:8787/mcp/dev` with Bearer tokens over standard HTTP POST/SSE streams. | **FULLY SUPPORTED** |
| **Autonomous IDE Window / GUI Automation** | `MANUAL_HANDOFF_ONLY` | Antigravity IDE does not expose a public programmatic RPC socket to silently inject UI keystrokes or manipulate arbitrary IDE tabs without user oversight. Any workflow requiring GUI action must be handled via human handoff or bounded file updates. | **PROHIBITED / MANUAL ONLY** |
| **Direct Host Subprocess Automation** | `MANUAL_HANDOFF_ONLY` | As mandated by Section 6, the Development MCP strictly forbids arbitrary shell/PowerShell/CMD or raw script execution. All developer agent remediations are dispatched via structured, purpose-specific MCP tool calls (`submit_remediation_request`). | **GOVERNED VIA MCP** |

---

## 2. Antigravity MCP Configuration (`mcp_config.json`)

To register the WealthOS Universal MCP within Antigravity IDE or Claude/Cursor clients:

### Stdio Transport (Direct Process)
```json
{
  "mcpServers": {
    "wealthos-product": {
      "command": "node",
      "args": ["c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/dist/mcp/transports/stdio.js"],
      "env": {
        "WEALTHOS_MCP_MODE": "PRODUCT",
        "WEALTHOS_PRODUCT_KEY": "${WEALTHOS_PRODUCT_KEY}",
        "NODE_ENV": "production"
      }
    },
    "wealthos-dev": {
      "command": "node",
      "args": ["c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release/dist/mcp/transports/stdio.js"],
      "env": {
        "WEALTHOS_MCP_MODE": "DEVELOPMENT",
        "WEALTHOS_DEV_KEY": "${WEALTHOS_DEV_KEY}",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Streamable HTTP Transport (Local Daemon)
```json
{
  "mcpServers": {
    "wealthos-product-http": {
      "url": "http://127.0.0.1:8787/mcp/product",
      "headers": {
        "Authorization": "Bearer ${WEALTHOS_PRODUCT_KEY}"
      }
    },
    "wealthos-dev-http": {
      "url": "http://127.0.0.1:8787/mcp/dev",
      "headers": {
        "Authorization": "Bearer ${WEALTHOS_DEV_KEY}"
      }
    }
  }
}
```

---

## 3. Threat Boundary & Authorization Separation

1. **Localhost Binding:** All HTTP listeners bind strictly to `127.0.0.1`. Binding to `0.0.0.0` is strictly rejected by the server initialization logic.
2. **Distinct Bearer Tokens & Fail-Closed Behavior:**
   - Product plane requires `WEALTHOS_PRODUCT_KEY`. If unconfigured, the server fails closed (`500/401`).
   - Dev plane requires `WEALTHOS_DEV_KEY`. If unconfigured, the server fails closed.
   - Presenting a Product key to `/mcp/dev` returns `403 Forbidden` (`INSUFFICIENT_PRIVILEGES_FOR_DEV_PLANE`).
3. **No Shell / No Arbitrary Execution:** Dev MCP exposes only purpose-specific tools (`get_repository_status`, `run_tests`, `get_development_session`, `submit_remediation_request`). No shell commands, arbitrary Python, arbitrary Node, or arbitrary file system writes are accepted.
