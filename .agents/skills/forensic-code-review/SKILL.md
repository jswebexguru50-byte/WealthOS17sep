---
name: forensic-code-review
description: Evidence-first forensic review for WealthOS production, data integrity, research, backtesting, provenance, and test alignment.
---

# Forensic Code Review

## Review order

1. Read governance and active phase.
2. Locate the exact symbol/path.
3. Inspect implementation.
4. Inspect callers/call chain.
5. Inspect relevant tests.
6. Check production vs research/test boundaries.
7. Classify the finding.

## Finding classes

Use exactly one:

- CONFIRMED
- HYPOTHESIS
- STALE_DOCUMENTATION
- TEST_MISALIGNED
- UNRESOLVED
- NOT_REPRODUCED

Never upgrade a hypothesis to confirmed without source evidence.

## High-risk WealthOS patterns

Flag for targeted investigation:

- hardcoded market prices
- hardcoded volumes/turnover
- default EPS/revenue/margin/ROCE/ROIC/debt
- default valuation multiples
- default bull/bear/regime probabilities
- fabricated technical targets
- synthetic historical dates
- fallback current dates for missing observations
- missing-data-to-zero coercion
- source-unavailable-to-valid-result conversion
- provider identity inference without authoritative mapping
- research fixtures reachable from production
- cached data presented as fresh without status
- silent exception handling in data-critical services
- tests that do not exercise the implementation they claim to verify

## Evidence requirements

For each finding report:

FILE:
SYMBOL:
BEHAVIOR:
EVIDENCE:
CALL_PATH:
TEST_EVIDENCE:
CLASSIFICATION:
IMPACT:
MINIMAL_FIX:

Quote only the minimum source needed to establish the behavior.

## Do not overclaim

A suspicious constant is not automatically a production defect.

A test name is not proof that the implementation is tested.

A migration function existing in source is not proof that it ran successfully.

A passing unit test is not proof of end-to-end production correctness.

A research output is not production-valid merely because it has plausible numbers.

## Data integrity rule

Missing evidence must remain missing.

Do not replace missing values with zero, average, fabricated defaults, or optimistic assumptions merely to make a pipeline complete.

## Completion

End with:

CONFIRMED:
HYPOTHESES:
TEST_GAPS:
OPEN_QUESTIONS:
NEXT_SMALLEST_STEP:
