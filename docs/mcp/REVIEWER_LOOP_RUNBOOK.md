# WealthOS — Reviewer Loop Runbook
## ChatGPT ↔ WealthOS MCP — Direct Connection Guide

> **STATUS: OPERATIONAL**  
> Transport: MCP 2024-11-05 Streamable HTTP  
> Tools available: 66 (Product Plane)  
> Gateway: Cloudflare Quick Tunnel (ephemeral HTTPS, no account required)

---

## Architecture

```
USER
  ↓ (objectives / approvals only)
CHATGPT REVIEWER
  ↓ MCP Streamable HTTP (Bearer auth)
  ↓ HTTPS via Cloudflare Quick Tunnel
WEALTHOS MCP GATEWAY (your laptop)
  ↓ localhost only
WealthOS Universal MCP  127.0.0.1:8787
  ├── Product Plane  /mcp        (read-only product tools)
  └── Dev/Review Plane  /mcp/dev  (repo + tests + review artifacts)
```

---

## Step 1 — Start MCP server

```powershell
npx tsx scripts/mcp/supervisor.ts
```

Verify: `Invoke-RestMethod http://127.0.0.1:8787/health`

---

## Step 2 — Open the Gateway (one command)

```powershell
.\scripts\mcp\start_review_gateway.ps1
```

The script prints the public HTTPS URL and exact ChatGPT config to paste.  
**Press Ctrl+C to immediately close all remote access.**

---

## Step 3 — Connect ChatGPT

In ChatGPT → Settings → Connected apps → Add MCP server:

- **Name:** `WealthOS Review MCP`
- **Server URL:** `<tunnel URL>/mcp` (printed by gateway script)
- **Authentication:** Bearer token (value printed by gateway script)

For Dev/Review plane (full repo + test + verdict access):
- URL: `<tunnel URL>/mcp/dev`
- Token: `wos-dev-uB7Hsj7iLmyezyOJVpcwYHhwnjxfS4GYpm0Lwxkivp4`

---

## Step 4 — Reviewer Workflow

The reviewer (ChatGPT) can directly call:

| Tool | Purpose |
|------|---------|
| `get_stock_identity` | List analyzed companies |
| `read_file` | Read any source/review file |
| `get_fundamental_analysis` | Inspect live interpretation |
| `get_canonical_facts` | Read raw verified facts |
| `verify_financial_metric` | Independent oracle recompute |
| `verify_xirr` | Independent XIRR oracle |
| `run_tests` | Run allowlisted test suites |
| `get_file_diff` | Inspect candidate code changes |
| `submit_review_verdict` | Submit structured verdict |
| `get_pending_review_tasks` | Read open developer tasks |

### Reviewer system prompt (paste into ChatGPT once connected):

```
You are the independent semantic reviewer for WealthOS fundamental 
interpretation calibration.

You have direct MCP access. DO NOT ask the user to paste files.
Use MCP tools to read everything directly.

Constraints:
- Do NOT read FundamentalModuleAdapter.ts before forming your own verdict
- Do NOT read PILOT_RUN_001 verdicts before reviewing
- Do NOT receive developer remediation suggestions first

Start: call tools/list, then read_file on 
reports/fundamental-review/PILOT_RUN_002_INPUTS/ to see packages.
```

---

## Security

| Control | Status |
|---------|--------|
| Ephemeral tunnel URL | ✅ Changes every session |
| Bearer auth on all tools | ✅ Enforced at MCP layer |
| Plane separation | ✅ Product key cannot access Dev plane |
| Secret redaction | ✅ All output sanitized |
| No arbitrary shell execution | ✅ Only allowlisted test suites |
| No file writes from reviewer | ✅ All reviewer tools are read-only |
| Kill switch | ✅ Ctrl+C = immediate tunnel closure |

### Auth Keys (in `.env`)

| Key | Plane |
|-----|-------|
| `WEALTHOS_PRODUCT_KEY` | Product (read-only) — safe for reviewer |
| `WEALTHOS_DEV_KEY` | Dev/Review (full repo + tests) |
| `WEALTHOS_REVIEW_KEY` | Alias for `WEALTHOS_DEV_KEY` — used by gateway |

---

## Files Changed

| File | Change |
|------|--------|
| `src/mcp/transports/http.ts` | Upgraded to MCP 2024-11-05 Streamable HTTP |
| `scripts/mcp/start_review_gateway.ps1` | NEW — one-command gateway launcher |
| `.tools/cloudflared.exe` | Downloaded — Cloudflare tunnel binary |
| `.env` | Added `WEALTHOS_PRODUCT_KEY`, `WEALTHOS_DEV_KEY`, `WEALTHOS_REVIEW_KEY` |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "connection refused" | Gateway script not running — start it |
| 401 Unauthorized | Wrong token — use key printed by gateway |
| 403 Insufficient privileges | Used Product key on `/mcp/dev` — use Dev key |
| Tunnel URL not found | Check `$env:TEMP\wealthos_cf_tunnel.log` |
| MCP server not running | `npx tsx scripts/mcp/supervisor.ts` first |
