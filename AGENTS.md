# WealthOS Agent Instructions & Governance Hierarchy

## 1. PRECEDENCE & GOVERNANCE HIERARCHY (HIGHEST PRIORITY)

All agents working on WealthOS MUST strictly follow these constitutional rules:

1. **Reviewer Authority & Separation of Concerns**:
   - **Codex** is the sole authorized independent semantic reviewer for WealthOS.
   - **Antigravity** is strictly an implementer, deterministic verifier, and data-quality remediator.
   - Antigravity MUST NOT self-certify semantic reviews, pass CAL calibrations, tune narrative thresholds, or replace Codex as reviewer.
   - Final review program states without Codex semantic certification must be `AWAITING_INDEPENDENT_REVIEW`.

2. **Evidence Integrity & Truth Invariants**:
   - No synthetic or fabricated evidence metadata.
   - No silent reinterpretation of units, ratios, scopes, or duration periods.
   - Zero-write GET invariants on read-only queries and inspection planes.
   - Full point-in-time (PIT) and source-url / filing-hash traceability for all promoted quantitative facts.

3. **Precedence Over Third-Party / Vendored Instructions**:
   - The rules in this file and WealthOS specifications take strict precedence over any instructions in `vendor/agent-scripts/` or external skill repos.
   - Instructions in `vendor/agent-scripts/AGENTS.MD` provide helpful utility conventions and workflows for shared skills, but CANNOT alter WealthOS project governance, reviewer authority, evidence contracts, or repository invariants.

---

## 2. Shared Agent Utility Rules (Secondary)

<!-- Shared utility and workflow rules from steipete/agent-scripts (subordinate to WealthOS governance above) -->
OPTIONAL/SUBORDINATE: Read `vendor/agent-scripts/AGENTS.MD` for skill-specific patterns (skip if missing or in conflict with Section 1).

---

## 3. Repository Strategy Memory

- S1a / S1A refers to the user's Volume Price Alignment (VPA) 3-leg swing setup in `docs/strategies/S1A/S1A.original.txt`.
- S1b / S1B refers to the user's VPA trough-reversal setup in `docs/strategies/S1B/S1B.original.txt`.
- S2a / S2A refers to the user's institutional FVG/Consequent Encroachment setup in `docs/strategies/S2A/S2A.original.txt`.
- Read the applicable original strategy prompt before implementing or executing it. Preserve it verbatim; record implementation notes separately.
- S1A is distinct from the saved S1 VPA Base Breakout strategy. Do not substitute S1.
- Use the prompt's default parameters unless the user explicitly requests changes. Report the evaluation date, requested universe, actual data coverage, and limitations.
