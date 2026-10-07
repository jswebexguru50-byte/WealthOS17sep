# Agent runtime setup

Project agents discover applicable workflows through `using-agent-skills`. The
root `AGENTS.md` activates Ponytail, Graphify, OmniRoute, TradingAgents, and the
free-LLM catalog under WealthOS governance.

## Installed runtimes

- OmniRoute: global CLI (`omniroute`)
- Graphify: isolated uv tool (`graphify` and `graphify-mcp`)
- TradingAgents: `.venvs/tradingagents`
- Free-provider catalog: `vendor/awesome-freellm-apis`

Start the local router with `scripts/start-omniroute.ps1`. It binds only to
`127.0.0.1:20128` and stores runtime state in the ignored `.omniroute-data`
directory. Set `OMNIROUTE_BASE_URL=http://127.0.0.1:20128` in clients.

## Quota fallback

`config/llm-fallbacks.yaml` defines the repository policy. It contains no active
providers because provider accounts and API keys are user-specific. To enable a
fallback, verify the provider's current official terms, set its key in the host
environment, configure the same provider in OmniRoute, and add only non-secret
metadata to the YAML file.

Free tiers have quotas and can change or disappear. The fallback chain therefore
depends on health checks and configured credentials; it is not unlimited access.

## TradingAgents

Run the project-local CLI with:

```powershell
.venvs\tradingagents\Scripts\tradingagents.exe --help
```

TradingAgents is research-only by default. It must not execute trades or replace
Codex independent semantic review.
