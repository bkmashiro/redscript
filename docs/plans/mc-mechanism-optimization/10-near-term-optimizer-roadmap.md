# 10. Near-Term Optimizer Roadmap

Status: near-term execution roadmap for the TS optimizer infrastructure and thin VIR direction. This document turns [08](./08-ts-optimizer-infra.md) and [09](./09-vir-architecture-recommendation.md) into small implementation steps.

## Goal

Move from ad-hoc physical LIR peepholes toward reusable optimizer infrastructure, then validate a thin arithmetic-only VIR spike without committing to a broad compiler rewrite.

This roadmap keeps the VIR work explicitly in an **isolated experimental lane**:
- no production compile-path integration,
- no broad language-semantics changes,
- unsupported/fallback boundaries required,
- slot-planner (including full register-like allocation) still pending.

## Non-goals for this roadmap

- No MLIR/LLVM/Cranelift production migration.
- No production-default VIR path until a spike proves value.
- No storage/NBT/entity/macro/coroutine support in the first VIR spike.
- No new Minecraft mechanism promotion; live probes remain gated.
- No broad rewrite of MIR or current LIR.

Boundary reminder for this stage:

- Step 6/7/8 are now implemented as an isolated experimental skeleton under `src/optimizer/vir`.
- Step 9 is also experimental-only: it may be called by tests/probes, but production compile paths remain disconnected.
- Any unsupported case in lowering must fail clearly and preserve fallback behavior.
- Slot planner/allocator work is still a prototype until the benchmark decision gate proves net value.

## Step 1 — LIR liveness / next-use helpers

**Status:** Completed (Batch 19).

**Objective:** Extend the current LIR support stack from slot mention extraction to straight-line lifetime information.

**Why first:** The next useful optimizations need to know whether a slot is read later, whether a write kills an older value, and whether a destructive update can reuse a location.

**Files:**

- Modify: `src/optimizer/lir/analysis.ts`
- Add or modify: `src/__tests__/optimizer/lir/analysis.test.ts`
- Maybe add: `src/optimizer/lir/liveness.ts` if `analysis.ts` gets too large

**Expected API shape:**

```ts
interface LIRNextUseInfo {
  hasLaterRead(index: number, slot: Slot): boolean
  nextReadAfter(index: number, slot: Slot): number | null
  nextWriteAfter(index: number, slot: Slot): number | null
  isDeadAfter(index: number, slot: Slot): boolean
}

function analyzeStraightLineSlotLiveness(instrs: LIRInstr[]): LIRNextUseInfo
```

**Scope:** Straight-line function instruction arrays only. Treat calls, raw, macro, storage writes, and unknown effect instructions conservatively.

**Verification:** Targeted Jest tests for read/write/call/raw/macro barriers. No benchmark target yet.

## Step 2 — Shared rewrite window harness

**Status:** Completed (Batch 19).

**Objective:** Stop each LIR pass from hand-rolling multi-instruction window scanning and safety checks.

**Files:**

- Add: `src/optimizer/lir/rewrite.ts`
- Modify: `src/optimizer/lir/rmw.ts`
- Add or modify: `src/__tests__/optimizer/lir/rewrite.test.ts`

**Expected capability:**

- scan adjacent windows deterministically;
- expose local liveness info to a pattern;
- preserve source locations;
- return unchanged reference when no rewrite fires;
- provide common barrier helpers.

**Success criterion:** Current RMW patterns can be expressed using the shared harness without behavior changes.

## Step 3 — Property/fuzz tests for LIR analysis and local rewrites

**Status:** Completed (Batch 19). Added no-op idempotence property checks for self-copy plus rewrite harness determinism coverage.

**Objective:** Use `fast-check` beyond slot identity tests to catch unsafe optimizer assumptions.

**Files:**

- Modify: `src/__tests__/optimizer/lir/analysis.test.ts`
- Add or modify: `src/__tests__/optimizer/lir/rmw.test.ts`
- Maybe add: `src/__tests__/optimizer/lir/property.test.ts`

**Test ideas:**

- generated score-copy/self-copy programs preserve mention/read/write invariants;
- no-op rewrite removes only true self-copy, never same-player/different-objective copy;
- module reference index catches cross-function raw/macro/call-context mentions;
- applying local no-op rewrites twice is idempotent.

**Non-goal:** Full semantic interpreter for all LIR. That belongs later if needed.

## Step 4 — Copy-origin diagnostics in arithmetic probes

**Status:** Expanded in Batch 20.

**Objective:** Make copy pressure actionable before deciding on VIR scope.

**Files:**

- Modify: `benchmarks/arithmetic-probes.ts`
- Modify: `src/__tests__/arithmetic-probes.test.ts`
- Maybe modify: `docs/dev/README-benchmarks.md`

**Expected output fields:**

```text
copyOrigins.twoAddressMaterialization
copyOrigins.callArg
copyOrigins.callResultPreservation
copyOrigins.returnMaterialization
copyOrigins.edgeOrWrapper
copyOrigins.opaqueBarrier
copyOrigins.unknown
copyRewriteOpportunities.currentlyOptimized
copyRewriteOpportunities.safeCandidate
copyRewriteOpportunities.blockedByBarrier
copyRewriteOpportunities.unknown
```

**Why:** The adjacent pattern counts now show both source and status: which copy shapes are already covered by optimizer behavior, which are safe candidates, and which are currently blocked by conservative barriers.

**Update:** Per-case/aggregated top rewrite opportunities are included in benchmark output to support triage without changing compiler behavior.

## Step 5 — VIR ADR / open-question closure

**Status:** Batch 20 closure.

**Objective:** Convert [09](./09-vir-architecture-recommendation.md)'s open questions into short answers before code starts.

**Files:**

- Add: `docs/plans/mc-mechanism-optimization/11-vir-adr.md` or equivalent
- Maybe read/update: `docs/compiler-pipeline-redesign.md` if it exists and is current

**Must answer first:**

1. Which copy-pressure cases does the current LIR harness already cover?
2. Which cases remain diagnostics-only or unsafe due barriers?
3. What are the minimum requirements for a contained VIR phase-0 experiment?
4. What is the complete `$pN/$ret` clobber set?
5. Are helpers allowed to read caller temporaries?
6. What is the recursion/reentrancy/coroutine safety policy?
7. How should `execute as @e[...] run function` interact with shared fake-player temps?
8. Which raw/macro cases can require effect annotations later?

### Batch-20 resolution

- **LIR-owned (production-safe):**
  - local copy chains with matching objectives
  - direct dead-temp overwrite elimination
  - source-loc-preserving local copy collapse and return-materialization
- **Diagnostics-only (for now):**
  - cases that cross `raw` / `macro_line` / `call*` / storage-visible barriers
  - copy chains that require non-local liveness or cross-function reasoning
  - ambiguous origin at present from conservative probe-level text analysis
- **VIR phase-0 acceptance criteria (experimental only):**
  - tiny arithmetic-only path behind a feature gate
  - no production compiler integration
  - no behavioral change in existing paths
  - benchmark command-shape deltas + allocation checks are stable or improved

**Success criterion:** A small ADR says exactly what the first VIR spike supports and what falls back.

## Step 6 — VIR core skeleton, no compiler integration

**Status:** Complete as experimental-only Batch 21/22 skeleton under `src/optimizer/vir`.

**Objective:** Build the minimum IR machinery in isolation.

**Files:**

```text
src/optimizer/vir/ids.ts
src/optimizer/vir/types.ts
src/optimizer/vir/builder.ts
src/optimizer/vir/location.ts
src/optimizer/vir/verifier.ts
src/optimizer/vir/printer.ts
src/__tests__/optimizer/vir/*.test.ts
```

**Technology:** TypeScript dense tables, branded numeric IDs, deterministic printer, mandatory locs, verifier.

**Scope:** Single function and simple blocks are enough. No production compiler path.

**Success criterion:** Tests can build, print, and verify a tiny arithmetic function; verifier negative cases fail clearly.

## Step 7 — Arithmetic-only VIR lowering experiment

**Status:** Complete for the isolated arithmetic-only subset. Unsupported operations fail explicitly and no production pipeline calls this path.

**Objective:** Lower a tiny MIR subset to VIR and back to current LIR behind an experimental/internal path.

**Files:**

```text
src/optimizer/vir/lower/mir-to-vir.ts
src/optimizer/vir/lower/vir-to-lir.ts
src/__tests__/optimizer/vir/lowering.test.ts
```

**Subset:**

```text
const
add/sub/mul/div/mod/min/max
compare
return
single-block leaf function
```

**Fallback:** Unsupported functions use the old path. Do not partial-lower mixed functions.

**Success criterion:** Old path and VIR path agree on arithmetic fixtures; default compiler behavior is unchanged.

## Step 8 — First VIR optimizer passes

**Status:** Complete for the isolated arithmetic-only prototype.

**Objective:** Prove the VIR layer can remove logical work before physical slot binding.

**Files:**

```text
src/optimizer/vir/passes/canonicalize.ts
src/optimizer/vir/passes/constant-fold.ts
src/optimizer/vir/passes/dce.ts
src/optimizer/vir/passes/local-cse.ts
src/__tests__/optimizer/vir/passes.test.ts
```

**Passes:**

- canonical identities;
- constant fold;
- unused pure op DCE;
- local CSE for pure/effect-free arithmetic.

**Success criterion:** Passes are verifier-backed, deterministic, idempotent where expected, and do not depend on physical scoreboard slots.

## Step 9 — Slot planner v1 for arithmetic-only VIR

**Status:** Experimental prototype implemented. It is available only through isolated VIR tests/probes and does not connect to the production compiler pipeline.

**Objective:** Convert VIR's value-level wins into fewer physical `score_copy` commands.

**Files:**

```text
src/optimizer/vir/lower/liveness.ts
src/optimizer/vir/lower/slot-planner.ts
src/optimizer/vir/lower/parallel-copies.ts
src/optimizer/vir/lower/allocation-checker.ts
src/__tests__/optimizer/vir/slot-planner.test.ts
```

**Techniques:**

- straight-line liveness;
- destructive-lhs affinity;
- commutative operand choice;
- `$ret` precoloring;
- parallel copy resolution;
- symbolic allocation checker.

**Success criterion:** At least one old LIR peephole becomes an architectural consequence, such as direct `$ret` materialization or overwriting a dead lhs.

## Step 10 — Benchmark decision gate

**Status:** Experimental prototype only. It remains in experimental mode for benchmarks/tests and is not connected to production compiler behavior.

**Objective:** Decide whether VIR continues beyond arithmetic-only.

**Inputs:**

- `bench:arithmetic` old path vs VIR path;
- copy-origin diagnostics;
- symbolic allocation checker results;
- compile-time overhead;
- command category deltas.

**Continue only if:**

```text
semantic mismatches: 0
allocation checker failures: 0
VIR path total commands: not worse on arithmetic subset
scoreCopy reduction: meaningful, target 20%+
score_arith -> score_copy -> score_arith reduction: meaningful, target 40%+
implementation did not force broad MIR/LIR churn
```

If these do not hold, stop after keeping the useful LIR infra.

## Step 11 — VIR arithmetic spike close decision dashboard

**Status:** Completed (Batch 23) for experimental reporting only.

### Objective

Produce a stable aggregate dashboard from arithmetic probe output so this step can decide whether the arithmetic-only VIR spike should continue, pause, or stay experimental-only.

### Outputs

`bench:arithmetic --case all --opt 1` now emits aggregate fields:

```ts
interface VirArithmeticDecisionAggregate {
  totalCaseCount: number
  totalFunctionCount: number
  plannedAcceptedFunctionCount: number
  directAcceptedFunctionCount: number
  directRejectedFunctionCount: number
  directSelectedFunctionCount: number
  plannedSelectedFunctionCount: number
  unsupportedFunctionCount: number
  unsupportedCaseCount: number
  rejectionCategoryTotals: Record<VirDecisionRejectionCategory, number>
  directCommandCount: number
  plannedCommandCount: number
  directScoreCopyCount: number
  plannedScoreCopyCount: number
  directVsPlannedCommandDelta: number
  directVsPlannedScoreCopyDelta: number
  directToPlannedScoreCopyReductionPercent: number
  goNoGoStatus: VirArithmeticDecisionStatus
}
```

`VirArithmeticDecision` remains compatible at a per-case level and adds `modeTotals` as a non-breaking optional extension.

### Current dashboard snapshot (run 2026-06-25T19:39:46.631Z)

- `totalCaseCount: 9`
- `totalFunctionCount: 2`
- `plannedAcceptedFunctionCount: 2`
- `directAcceptedFunctionCount: 0`
- `unsupportedCaseCount: 7`
- `directCommandCount: 22`
- `plannedCommandCount: 16`
- `directScoreCopyCount: 8`
- `plannedScoreCopyCount: 2`
- `directVsPlannedCommandDelta: -6`
- `directVsPlannedScoreCopyDelta: -6`
- `directToPlannedScoreCopyReductionPercent: 75`
- `goNoGoStatus: 'stay-experimental'`

### Decision

Keep **VIR in experimental-only** mode for now.

### Prerequisites before production integration

1. The benchmark gate reaches `goNoGoStatus === 'continue'` for a representative arithmetic corpus, not only probe shape.
2. Direct vs planned behavior is validated with deterministic Paper/TestHarnessPlugin checks (not offline/skipped runs).
3. Unsupported case ratio is materially reduced and/or explicitly bounded by policy.
4. No semantic/proto changes are made to production default pipeline outside the isolated experiment.

### Next (if continue)

1. Expand the Paper-backed oracle coverage for arithmetic-heavy helpers and helpers with call boundaries.
2. Raise VIR compatibility for currently rejected arithmetic-adjacent patterns under clear safety constraints.
3. Add a production-safe integration gate behind an explicit feature flag and staged rollout plan.

## Recommended execution order

```text
1. LIR liveness / next-use
2. Rewrite window harness
3. fast-check property expansion
4. Copy-origin diagnostics
5. VIR ADR / open-question closure
6. VIR core skeleton
7. Arithmetic-only VIR lowering
8. VIR optimizer passes
9. Slot planner v1
10. Benchmark decision gate
11. Step-11 decision dashboard + explicit close-review and recommendation
```

The first four steps are useful even if VIR is never built. Steps 5–10 should be treated as a bounded spike, not a permanent rewrite commitment.

Step-11 close decision details are captured in [13-vir-spike-close-report.md](13-vir-spike-close-report.md).
