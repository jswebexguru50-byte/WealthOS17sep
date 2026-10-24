---
name: awesome-freellm-apis
description: Use the vendored awesome-freellm-apis catalog to discover possible free-tier LLM providers for OmniRoute fallback when primary quota is exhausted.
---

# Awesome Free LLM APIs

The catalog is vendored at `vendor/awesome-freellm-apis` and is discovery data,
not an availability guarantee.

## Required workflow

1. Read the root `AGENTS.md`; WealthOS governance always takes precedence.
2. Search the vendored catalog for candidates matching the task's modality,
   context window, region, and privacy requirements.
3. Verify current provider terms, limits, data-retention policy, and endpoint from
   the provider's official documentation before configuring it.
4. Prefer OpenAI-compatible endpoints supported by OmniRoute. Add only providers
   whose credentials are already present in environment variables or supplied by
   the user through a secure interface.
5. Never scrape, generate, share, or commit API keys. Never route confidential or
   regulated data to a free service without explicit authorization.
6. Treat 401, 402, 403, 429, timeout, exhausted quota, or an open circuit breaker
   as a fallback condition. Preserve the original error in logs without secrets.
7. A fallback model may assist, but its output remains untrusted and cannot relax
   WealthOS evidence, PIT, or independent-review requirements.

Use `config/llm-fallbacks.yaml` as the project policy template.
