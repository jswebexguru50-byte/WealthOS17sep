# WealthOS — ChatGPT MCP Connection Instructions

Target MCP Server: `http://127.0.0.1:8787` (Running & Verified locally)

---

## Plan & Connection Mechanism Compatibility

| ChatGPT Plan | Connection Mechanism | Status |
|---|---|---|
| **ChatGPT Team / Enterprise / Edu** | **A. OpenAI Secure MCP Tunnel** (`tunnel-client`) | Supported via Workspace Settings |
| **ChatGPT Plus / Free (Personal)** | **B. Remote HTTPS Tunnel Gateway** (Bearer Auth) | Supported via Custom Action / MCP Connector |

---

## Option A: OpenAI Secure MCP Tunnel (Team / Enterprise / Edu)

1. In ChatGPT, navigate to **Settings** → **Connected Apps** (or **Developer Settings** → **MCP Connections**).
2. Click **Create New Connection** and copy your assigned **Tunnel ID**.
3. In a local terminal, start the OpenAI tunnel client:
   ```powershell
   .tools\tunnel-client.exe --tunnel_id <YOUR_TUNNEL_ID> --port 8787
   ```
4. In ChatGPT, enter your **Bearer Token**:
   - Provide your rotated `WEALTHOS_REVIEW_KEY` (located in `.env`).
5. Connection establishes automatically to `127.0.0.1:8787/mcp/review`.

---

## Option B: Remote HTTPS MCP Development Gateway (Plus / Personal Accounts)

1. Open PowerShell and launch the secure review gateway:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\mcp\start_review_gateway.ps1
   ```
2. The script displays your ephemeral public HTTPS URL:
   `https://<your-subdomain>.trycloudflare.com/mcp/review`
3. In ChatGPT:
   - Go to **Settings** → **Advanced / Connected Apps** or **Create a GPT** → **Actions**.
   - Set **Server URL** to: `https://<your-subdomain>.trycloudflare.com/mcp/review`
   - Set **Authentication** to **Bearer**.
   - Paste your `WEALTHOS_REVIEW_KEY` from `.env`.
4. Click **Save / Connect**.

---

## Next Step: External Reviewer Live Acceptance

Once connected, **do NOT copy or upload any files**. 

Instruct ChatGPT in the chat window:
> *"Perform the 10-step WealthOS Live Acceptance sequence directly through MCP."*

The independent ChatGPT reviewer will invoke the 10 required acceptance calls and declare:
`CHATGPT_DIRECT_MCP_ACCESS = PASS`.
