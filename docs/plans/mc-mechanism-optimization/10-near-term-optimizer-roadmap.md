# 10. Near-Term Optimizer Roadmap

Status: near-term execution roadmap for the TS optimizer infrastructure and thin VIR direction. This document turns [08](./08-ts-optimizer-infra.md) and [09](./09-vir-architecture-recommendation.md) into small implementation steps.

## Goal

Move from ad-hoc physical LIR peepholes toward reusable optimizer infrastructure, then validate a thin arithmetic-only VIR spike without committing to a broad compiler rewrite.

## Non-goals for this roadmap

- No MLIR/LLVM/Cranelift production migration.
- No production-default VIR path until a spike proves value.
- No storage/NBT/entity/macro/coroutine support in the first VIR spike.
- No new Minecraft mechanism promotion; live probes remain gated.
- No broad rewrite of MIR or current LIR.

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

**Status:** Completed (Batch 19) with conservative `copyOrigins` buckets in probe output and aggregations.

**Objective:** Make copy pressure actionable before building VIR.

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
```

**Why:** The current adjacent pattern counts show where `score_copy` occurs but not why it exists. VIR/slot-planning work should be judged by reducing the high-value origins, not by shaving arbitrary copies.

## Step 5 — VIR ADR / open-question closure

**Status:** Not started.

**Objective:** Convert [09](./09-vir-architecture-recommendation.md)'s open questions into short answers before code starts.

**Files:**

- Add: `docs/plans/mc-mechanism-optimization/11-vir-adr.md` or equivalent
- Maybe read/update: `docs/compiler-pipeline-redesign.md` if it exists and is current

**Must answer first:**

1. Is current MIR SSA-like enough to lower cleanly?
2. What is the complete `$pN/$ret` clobber set?
3. Are helpers allowed to read caller temporaries?
4. What is the recursion/reentrancy/coroutine safety policy?
5. How should `execute as @e[...] run function` interact with shared fake-player temps?
6. Which raw/macro cases can require effect annotations later?

**Success criterion:** A small ADR says exactly what the first VIR spike supports and what falls back.

## Step 6 — VIR core skeleton, no compiler integration

**Objective:** Build the minimum IR machinery in isolation.

**Files:**

```text
src/vir/ids.ts
src/vir/types.ts
src/vir/ir.ts
src/vir/builder.ts
src/vir/location.ts
src/vir/effects.ts
src/vir/verifier.ts
src/vir/printer.ts
src/__tests__/vir/*.test.ts
```

**Technology:** TypeScript dense tables, branded numeric IDs, deterministic printer, mandatory locs, verifier.

**Scope:** Single function and simple blocks are enough. No production compiler path.

**Success criterion:** Tests can build, print, and verify a tiny arithmetic function; verifier negative cases fail clearly.

## Step 7 — Arithmetic-only VIR lowering experiment

**Objective:** Lower a tiny MIR subset to VIR and back to current LIR behind an experimental/internal path.

**Files:**

```text
src/vir/lower/mir-to-vir.ts
src/vir/lower/vir-to-lir.ts
src/vir/interpreter.ts
src/__tests__/vir/lowering.test.ts
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

**Objective:** Prove the VIR layer can remove logical work before physical slot binding.

**Files:**

```text
src/vir/pass-manager.ts
src/vir/passes/canonicalize.ts
src/vir/passes/constant-fold.ts
src/vir/passes/dce.ts
src/vir/passes/local-cse.ts
src/__tests__/vir/passes/*.test.ts
```

**Passes:**

- canonical identities;
- constant fold;
- unused pure op DCE;
- local CSE for pure/effect-free arithmetic.

**Success criterion:** Passes are verifier-backed, deterministic, idempotent where expected, and do not depend on physical scoreboard slots.

## Step 9 — Slot planner v1 for arithmetic-only VIR

**Objective:** Convert VIR's value-level wins into fewer physical `score_copy` commands.

**Files:**

```text
src/vir/lower/machine.ts
src/vir/lower/slot-planner.ts
src/vir/lower/parallel-copies.ts
src/vir/lower/allocation-checker.ts
src/__tests__/vir/slot-planner.test.ts
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
```

The first four steps are useful even if VIR is never built. Steps 5–10 should be treated as a bounded spike, not a permanent rewrite commitment.
