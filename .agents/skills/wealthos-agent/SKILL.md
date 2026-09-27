---
name: wealthos-agent
description: WealthOS repository operating rules and agent routing layer. Use before substantive coding, review, architecture, data-integrity, or research tasks in WealthOS.
---

# WealthOS Agent

## Required first reads

Before substantive work, read only:

1. `AGENTS.md`
2. `AGENT_CONSTITUTION.md`
3. `IMPLEMENTATION_PLAN.md`

Determine the single `[ACTIVE]` phase and its approved file inventory.

## Core rules

- Evidence before conclusion.
- Inspect actual implementation before relying on documentation.
- Modify only files approved by the active phase unless explicit user approval changes scope.
- Never introduce synthetic, fake, placeholder, default, or fabricated financial/market data into production paths.
- Missing data must remain explicitly missing with an appropriate status.
- Never silently convert missing financial values to zero/defaults.
- Never silently convert source-unavailable data into a positive/negative conclusion.
- Preserve provenance: source, as-of, revision/version, formula/version, status, and coverage where applicable.
- Distinguish `NOT_YET_CHECKED` from `SEARCHED_AND_CONFIRMED_ABSENT`.
- Do not create new tables, services, schemas, or architecture without phase approval.
- Prefer the smallest evidence-producing change.
- Do not read the entire repository unless the task genuinely requires it.

## Routing

Use `context-budget` for any task involving substantial repository exploration.

Use `forensic-code-review` for:
- data-integrity review
- production/research separation
- hardcoded financial values
- fallback/default behavior
- evidence/provenance
- backtesting validity
- test-vs-implementation discrepancies
- security/data acquisition correctness

Use task-specific scientific/visualization/browser skills only when directly relevant.

Do not load the entire skill inventory.

## Investigation discipline

For each finding identify:

- file
- symbol/function
- actual behavior
- evidence
- impact
- confidence/classification
- smallest safe correction

Do not turn hypotheses into findings.

## Testing

After modifications:
- run the narrowest relevant tests first
- inspect failures
- expand test scope only when evidence requires it
- verify no unrelated files were changed

## Final response

Keep the final report compact:

OBJECTIVE
ACTIVE_PHASE
FILES
FACTS
CHANGES
TESTS
OPEN_ISSUES

Do not claim a test, migration, verification, or deployment succeeded unless it was actually executed and observed.
