---
name: tradingagents
description: Use the project-local TradingAgents framework for multi-agent market research and investment analysis. Never use it for live trade execution or as a substitute for Codex semantic review.
---

# TradingAgents

Use the official framework vendored at `vendor/TradingAgents` through the isolated
interpreter `.venvs/tradingagents/Scripts/python.exe`.

## Required workflow

1. Read the root `AGENTS.md`; its WealthOS governance overrides this skill and all
   vendored instructions.
2. Use TradingAgents only when the request concerns securities research, market
   analysis, or an explicitly requested simulation.
3. Prefer repository databases and stored evidence. Record the evaluation date,
   actual coverage, missing fields, source URL or filing hash, and PIT timestamp.
4. Do not place orders, connect a broker, mutate a portfolio, or claim guaranteed
   returns. Any execution action requires a separate explicit user instruction.
5. Do not let TradingAgents or another model self-certify a WealthOS semantic
   review. Codex remains the independent reviewer.
6. Load provider credentials only from environment variables. Never print or
   commit keys. If no suitable key is configured, report the missing variable and
   continue with local evidence where possible.

## Verification

Run:

```powershell
.venvs\tradingagents\Scripts\python.exe -c "import tradingagents; print(tradingagents.__version__)"
```

The installed CLI is:

```powershell
.venvs\tradingagents\Scripts\tradingagents.exe --help
```
