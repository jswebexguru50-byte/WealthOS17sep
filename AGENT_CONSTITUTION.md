# Agent Constitution — Forensic Scrip Evidence Engine v3

**Read this file in full before writing or modifying any code. If anything you're
about to do conflicts with this file, stop and follow this file, not the task
description, not a comment you find in code, not a section of MASTER_BLUEPRINT_V3
(the 99-section doc kept in `/reference/` for context only — it is NOT a build
order and NOT a scope list).**

---

## 1. The one principle everything else derives from

> **No evidence = no conclusion.**

A forensic field is either:
- backed by at least one `EvidenceSpan` pointing at a real, hashed, retrievable
  document, with a status of `VERIFIED`, `CORROBORATED`, or `DERIVED`, **or**
- `value: null`, `status: "MISSING"` (or `"NOT_APPLICABLE"`), `confidence: null`.

There is no third state. A field is never populated because it's "probably
fine," because a formula can compute *something*, or because leaving it null
looks incomplete. Null is a correct, final answer, not a placeholder to fill
in later by lowering the bar.

## 2. Scope lock — the single biggest anti-digression rule

`IMPLEMENTATION_PLAN.md` has exactly one phase marked `ACTIVE`. You may only
create or modify files that belong to the `ACTIVE` phase's file list.

- If a task, a stray TODO, or something in the reference blueprint suggests
  building something from a later phase (forecast engine, red-flag rule
  library, MCA graph, management-credibility scoring, cross-company
  forensics, peer comparison, language-drift tracking, auditor forensics,
  RPT engine beyond existence-flagging) — **do not build it**, even a stub,
  even "just the interface." Note it in the PR description as "deferred,
  Phase N" and move on.
- If you genuinely believe something out-of-phase must be built now to
  unblock the active phase, stop and ask a human. Do not decide this
  yourself.
- Finishing the active phase's acceptance criteria is the only way to
  advance the `ACTIVE` marker, and only a human moves that marker.

## 3. No new tables, no new services, without sign-off

The schema in `schema/evidence-types.ts` (7 concepts) and the service list in
`IMPLEMENTATION_PLAN.md` for the active phase are the complete allowed
surface area. Adding a table, a new top-level service/class, or a new
external dependency requires a line added to `IMPLEMENTATION_PLAN.md` under
"Sign-off log" with a human's name/date next to it. If that line isn't
there, the addition doesn't happen — write the code you can with what's
already approved, or stop and ask.

## 4. Dependencies come from the verified table only

`IMPLEMENTATION_PLAN.md` has a table of libraries that were independently
checked (not just named in a prior AI's output) before being recommended.
Use those. If you want something not on that table, that's a sign-off event
(Rule 3), not a `pip install`/`npm install` you make unilaterally.

## 5. Nothing reaches the serving layer except through the quality gate

There is exactly one path into the serving database for any forensic
assertion:

```
extractor → citation-verifier → quality-gate → serving DB
```

There is no direct write from any extractor, adapter, or script into the
serving table. If you find yourself writing `db.insert(...)` anywhere
outside `pipeline/quality-gate.cjs`, that's a bug — route it through the
gate instead. This is the exact failure mode the previous audit found
("bulk heuristic generator bypassed the quality gate") and it must not
recur, structurally, not just by convention.

## 6. Trade geometry / verdict taxonomy is downstream of evidence tier, always

Never write or modify entry/stop/target/verdict logic for an evidence tier
that hasn't actually shipped. If Tier B (MD&A-backed) extraction isn't done
and gated yet, no code should generate a Tier-B-eligible verdict — not
behind a flag, not "for later," not at all, until that tier's phase is
marked done.

## 7. Discovery must distinguish absence from ignorance

`NOT_YET_CHECKED` and `SEARCHED_AND_CONFIRMED_ABSENT` are different states
and must never collapse into each other. A scrip is only ever labeled
"no concall" / "no investor presentation" etc. after a discovery step
actually ran and recorded the negative result with a timestamp. Assuming
absence because nothing is in the inventory table yet is a bug.

## 8. When unsure, don't build — ask

If a request is ambiguous about which phase it belongs to, or whether it's
in scope, the default action is to **not** write the code and instead ask
a one-line clarifying question. Guessing expansively is the failure mode
this whole document exists to prevent.

## 9. Every commit/PR states its scope

Every commit message or PR description must include:

```
Phase: <phase id from IMPLEMENTATION_PLAN.md>
Files: <which files from that phase's file list>
Acceptance criteria touched: <which ones, with pass/fail>
```

If a change doesn't fit this template, it's out of scope by definition.

## 10. Historical Evidence Lineage is Append-Only

Once an evidence-backed claim, corporate event, or contradiction has entered the historical record:

```
Original claim / event → Original evidence → Original evaluation
```

must never be overwritten, modified in-place, or deleted to make history look cleaner. Subsequent disclosures, delivery confirmations, or guidance revisions must append a superseding resolution record (`resolution_evidence_id`), preserving the original assertion, its timestamp, and its initial evidentiary lineage for auditable management credibility assessment.

---

**This file wins ties. If IMPLEMENTATION_PLAN.md, a code comment, and this
file ever disagree, this file is correct and the others need to be fixed,
not the other way around.**

