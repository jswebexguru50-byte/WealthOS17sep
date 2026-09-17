# WealthOS / ITAS v6.3: Complete End-To-End Empirical Research & PIT Pipeline

## Operational Status: R1 & R2 Passed, R3 Walk-Forward Executed
- **R1 PIT Engine**: 11/11 tests passing, 0 lookahead contamination, fail-closed data semantics.
- **R2 Execution Simulator**: Multi-bar execution, 25+ field Trade Identity Ledger, Indian delivery cost model.
- **R3 Empirical Research**: Arm A (Raw), Arm B (v6.2 Overlay), Arm C (Challengers), Arm D (Risk Oracle), Cumulative & Leave-One-Out Ablation, Rolling 36m/12m Walk-Forward OOS, 1000-iteration Bootstrap Expectancy, 5-tier Cost Sensitivity (0.75x to 2.00x), and Precommitted Promotion Gates.

## Quick Execution Commands
```bash
# 1. Run R1 Gate Tests
node scripts/run_r1_gate.mjs

# 2. Run Full End-To-End Empirical Research Pipeline
npx tsx scripts/execute_full_v6.3_research_pipeline.mjs

# 3. Create R1 Research Run Manifest
node scripts/create_r1_run_manifest.mjs
```

## Architecture Invariants
- `v6.2.0-FROZEN` production baseline remains strictly read-only.
- All research infrastructure resides in `src/server/services/research/`.
