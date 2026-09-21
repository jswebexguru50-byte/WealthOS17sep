# Phase 10R-M5.7 OHLC Forensic Classification

**Source**: PHASE10RM5_OHLC_FORENSICS.json
**Total anomalies**: 190 | **Accounted**: 190 | **UNACCOUNTED**: 0
**DB modifications applied**: NONE

> All root causes are forensic candidates based on available evidence.
> No value has been modified. Do not repair any row based solely on this classification.

## Root-Cause Summary

| Root Cause | Count | Notes |
|-----------|-------|-------|
| UNKNOWN_REQUIRES_REVIEW | 182 | |
| IDENTITY_UNRESOLVED | 8 | |

## Classification Approach

| Classification | Criterion |
|---------------|-----------|
| IDENTITY_UNRESOLVED | Symbol not in MasterTickers; no ISIN/provider_key available |
| FLOAT_PRECISION_ARTIFACT | Violation ≤ float32 epsilon (1.2e-6 of magnitude) AND MasterTicker resolvable. **Requires human confirmation.** |
| OHLC_RELATIONSHIP_VIOLATION | Substantive violation beyond float tolerance; identity may be resolvable |
| SPLIT_ADJUSTMENT_CANDIDATE | Open/high ratio near 2:1 — **low confidence, candidate only** |
| UNKNOWN_REQUIRES_REVIEW | Insufficient evidence for any other classification |

## Key Constraints

- No anomaly overlaps with the 18,244 promotion set (confirmed by prior M5 analysis)
- No row has been modified
- Production DB writes: **0**
