---
name: context-budget
description: Token-efficient repository exploration for WealthOS. Use before broad code investigation or multi-file tasks.
---

# Context Budget

## Objective

Maximize useful evidence per token.

## Before reading

Record:

- OBJECTIVE
- ACTIVE_PHASE
- APPROVED_FILES
- LIKELY_SYMBOLS
- REQUIRED_EVIDENCE

Read governance first, then targeted code.

## Search strategy

Prefer:

1. exact symbol/function search
2. exact filename search
3. call-site search
4. narrow surrounding ranges
5. tests
6. adjacent implementation only when required

Avoid:

- full-repository dumps
- reading every file in a directory
- loading unrelated skills
- rereading unchanged material
- broad searches after sufficient evidence exists

## Stop conditions

Stop expanding context when you can answer:

- what the code actually does
- where the behavior originates
- whether the behavior is reachable
- what test proves/disproves it
- what smallest change is required

If evidence conflicts, expand only around the conflicting paths.

## State compression

Maintain a compact working state:

OBJECTIVE:
ACTIVE_PHASE:
FILES:
FACTS:
DECISIONS:
CHANGES:
TESTS:
OPEN_ISSUES:

Update this state instead of repeatedly rereading files.

## WealthOS special rule

Financial/data integrity claims require source-level evidence.

Hardcoded numbers, fallback values, default probabilities, fabricated prices/volumes, and silently substituted dates require targeted inspection of their production call path.

Do not assume a value is synthetic merely because it is hardcoded; trace whether it is a documented constant, test fixture, model parameter, or production fallback.
