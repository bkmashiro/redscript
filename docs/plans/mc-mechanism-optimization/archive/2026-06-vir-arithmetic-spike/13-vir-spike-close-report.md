# 13. VIR Arithmetic Spike Close Report

Date: 2026-06-25

Scope: experimental-only VIR spike only. No production compiler pipeline changes.

## Step 11 objective

Turn per-function/per-case VIR decisions into an aggregate, action-oriented dashboard:
- count coverage and acceptance/rejection
- classify rejection causes
- compute command and score-copy deltas
- emit a deterministic go/no-go signal from thresholds

## What has been completed

### Phase 0–5 achievements

1. Benchmark/probe infrastructure captures richer per-function and per-case command metadata.
2. LIR copy-origin diagnostics are present for planning/tracing before any production rewrite.
3. `bench:arithmetic` now includes an explicit VIR decision gate payload on each case (`selectedMode`, direct/planned counts, rejection category counts).
4. Step-6 to Step-10 VIR artifacts remain isolated under `src/optimizer/vir`:
   - core skeleton
   - arithmetic-only lowering
   - first-pass canonicalization/folding/DCE/CSE
   - slot planner/parallel-copy handling
   - benchmark gate and fallback semantics

### Steps 6–10 checkpoint summary

- Step 6: `src/optimizer/vir` core skeleton complete.
- Step 7: arithmetic-only MIR→VIR→LIR lowering complete.
- Step 8: initial VIR passes complete.
- Step 9: slot planner v1 complete.
- Step 10: benchmark decision gate (`chooseVirLoweringPlan`, compare/auto modes) complete.
- Step 11: aggregate dashboard/reporting complete.

## Current dashboard (latest captured run)

`npm run bench:arithmetic -- --case all --opt 1 --output /Users/yuzhe/.hermes/tmp/redscript-vir-step11-arithmetic-probe.json` on 2026-06-25 produced:

```json
{
  "totalCaseCount": 9,
  "totalFunctionCount": 2,
  "plannedAcceptedFunctionCount": 2,
  "directAcceptedFunctionCount": 0,
  "directRejectedFunctionCount": 0,
  "directSelectedFunctionCount": 0,
  "plannedSelectedFunctionCount": 2,
  "unsupportedFunctionCount": 0,
  "unsupportedCaseCount": 7,
  "directCommandCount": 22,
  "plannedCommandCount": 16,
  "directScoreCopyCount": 8,
  "plannedScoreCopyCount": 2,
  "directVsPlannedCommandDelta": -6,
  "directVsPlannedScoreCopyDelta": -6,
  "directToPlannedScoreCopyReductionPercent": 75,
  "goNoGoStatus": "stay-experimental"
}
```

## Recommendation

### Decision: **Stay experimental** (not continue-to-production now).

- This run shows substantial score-copy reduction where VIR is applicable.
- It also shows unsupported coverage (`unsupportedCaseCount: 7`) that is too high for production confidence.
- Semantic proof is still probe-shaped; no new production pipeline or integration path was introduced.

## Must be true before production rollout

1. Deterministic `goNoGoStatus === 'continue'` on a broader arithmetic corpus.
2. High-confidence parity checks on Paper/TestHarnessPlugin oracle (not offline-skipped validation).
3. Rejection/unsupported profile reduced enough to justify planner complexity.
4. No production path changes: only explicit feature-flagged hooks.

## If VIR continues immediately

1. Extend benchmark + probe corpus with representative arithmetic helpers that cover current unsupported categories.
2. Add direct semantic assertions for macro/call/storage boundary compatibility before any pipeline hook.
3. Add a feature flag + staged rollout checklist in compiler planning docs before default compiler path changes.

## Explicitly unchanged assumptions

- Production compiler pipeline untouched:
  - no compile entrypoint, CLI default, or language-semantic behavior changes
  - no parser/typechecker/LSP/registry semantics changes
- This is a hard gated report for an experimental lane only.
