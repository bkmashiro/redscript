# 11. Pro 20x /goal Brief: Optimizer + Thin VIR Program

Status: controller brief for a future high-capacity `/goal` run. Use this as the top-level coordination document when Pro 20x is available.

## One-line goal

Build a safe, measured path from today's physical LIR peepholes to reusable TypeScript optimizer infrastructure and a bounded thin-VIR spike, without rewriting the compiler wholesale or changing RedScript language semantics.

## What success looks like

The program is successful only if we can show all of the following:

1. Current LIR optimizer logic is less ad-hoc: shared liveness, rewrite, and safety helpers replace duplicated slot/barrier checks.
2. `bench:arithmetic` explains **why** score copies exist, not only how many exist.
3. A thin arithmetic-only VIR path can be built behind an experimental path with default compilation unchanged.
4. Old path and VIR path are semantically equivalent on the supported arithmetic subset.
5. Slot planning turns at least one old LIR peephole family into an architectural result: direct `$ret`, overwrite dead lhs, or no logical copy in VIR.
6. We have a clear stop/continue decision before expanding to CFG, calls, storage, macros, or Minecraft mechanism tricks.

## Hard non-goals

- No MLIR/LLVM/Cranelift production dependency.
- No broad MIR rewrite.
- No production-default VIR path until measured.
- No storage/NBT/entity/macro/coroutine support in the first VIR spike.
- No language-level `fixed` semantic change.
- No speculative Minecraft mechanism promotion without live Paper/TestHarness proof.
- No deletion of existing LIR peepholes until trigger counts and benchmarks prove redundancy.

## Current context snapshot

Core docs:

- [08 — TS optimizer infrastructure stack](./08-ts-optimizer-infra.md)
- [09 — VIR architecture recommendation](./09-vir-architecture-recommendation.md)
- [10 — Near-term optimizer roadmap](./10-near-term-optimizer-roadmap.md)

Current code state at the time this brief was written:

- `src/optimizer/lir/analysis.ts` exists and centralizes slot identity, read/write extraction, raw/macro/call-context slot mention detection, and module reference indexing.
- `src/optimizer/lir/rmw.ts` and `src/optimizer/lir/dead_slot.ts` already use the shared analysis helpers.
- `fast-check` is already available for property-style optimizer tests.
- `benchmarks/arithmetic-probes.ts` already reports command categories and score-copy patterns.
- Current branch was ahead of origin and intentionally not pushed during these planning commits.

## Recommended top-level `/goal` instruction

Use something close to this:

```text
Goal: Execute docs/plans/mc-mechanism-optimization/11-pro-20x-goal-brief.md.

Work incrementally. Do not rewrite the compiler wholesale. Start with the LIR infrastructure steps from docs/plans/mc-mechanism-optimization/10-near-term-optimizer-roadmap.md, then stop at decision gates before starting the VIR spike.

For each implementation slice:
1. Inspect current code first; do not assume docs are perfectly fresh.
2. Write or update targeted tests before/with implementation.
3. Keep file scope narrow.
4. Run targeted tests for the slice.
5. Request/read a review if using subagents.
6. Commit signed, no push.

Do not run expensive full gates for documentation-only changes. For code changes, run the relevant targeted tests and the configured full gate before final summary.

Default non-goals: no production MLIR/LLVM/Cranelift, no full VIR rollout, no storage/NBT/entity/macro/coroutine in the first VIR spike, no language fixed semantic changes.
```

## Program structure

Treat the work as three sequential bands. Do not open all lanes at once.

```text
Band A — LIR infrastructure hardening
  A1. LIR liveness / next-use
  A2. rewrite window harness
  A3. property/fuzz expansion
  A4. copy-origin diagnostics

Decision Gate A
  If infra is cleaner and diagnostics identify high-value copy sources, continue.
  Otherwise stop after documenting why VIR is not justified yet.

Band B — Thin VIR spike preparation and core
  B1. VIR ADR / open-question closure
  B2. VIR core skeleton
  B3. arithmetic-only MIR -> VIR -> LIR path
  B4. first VIR optimizer passes

Decision Gate B
  If semantic differential is clean and default pipeline is untouched, continue to slot planning.
  Otherwise keep only useful docs/core and stop.

Band C — Slot planner proof
  C1. machine constraints
  C2. straight-line slot planner
  C3. parallel copy resolver
  C4. allocation checker
  C5. benchmark comparison

Decision Gate C
  Continue beyond arithmetic only only if command count/copy-origin metrics justify it.
```

## Band A — LIR infrastructure hardening

### A1. LIR liveness / next-use

Primary files:

- `src/optimizer/lir/analysis.ts`
- `src/__tests__/optimizer/lir/analysis.test.ts`
- maybe `src/optimizer/lir/liveness.ts`

Deliverable:

- Straight-line next-use/liveness API for physical LIR slots.
- Conservative handling for calls, raw, macro, `call_context`, and unknown effects.

Suggested API:

```ts
interface LIRNextUseInfo {
  hasLaterRead(index: number, slot: Slot): boolean
  nextReadAfter(index: number, slot: Slot): number | null
  nextWriteAfter(index: number, slot: Slot): number | null
  isDeadAfter(index: number, slot: Slot): boolean
}
```

Verification:

- Targeted tests for reads, writes, self-copy, overwrite, raw/macro barrier, call-context slot mention.

### A2. Rewrite window harness

Primary files:

- `src/optimizer/lir/rewrite.ts`
- `src/optimizer/lir/rmw.ts`
- `src/__tests__/optimizer/lir/rewrite.test.ts`
- existing RMW tests

Deliverable:

- Shared deterministic window scanner.
- Common helpers for unchanged output, local liveness lookup, and barrier checks.
- RMW pass can express at least one existing pattern through the harness.

Verification:

- Existing RMW and LIR pipeline tests remain stable.
- New tests prove no rewrite across raw/macro/unknown barrier.

### A3. Property/fuzz expansion

Primary files:

- `src/__tests__/optimizer/lir/analysis.test.ts`
- maybe `src/__tests__/optimizer/lir/property.test.ts`

Deliverable:

- `fast-check` tests for analysis invariants and local no-op rewrite safety.

Useful properties:

- `sameSlot(a,b) === (slotKey(a) === slotKey(b))`.
- Self-copy removal never removes same-player/different-objective copies.
- Module reference index detects raw/macro/call-context mentions.
- Applying no-op cleanup twice is idempotent.

### A4. Copy-origin diagnostics

Primary files:

- `benchmarks/arithmetic-probes.ts`
- `src/__tests__/arithmetic-probes.test.ts`
- maybe `docs/dev/README-benchmarks.md`

Deliverable:

- `bench:arithmetic` reports score-copy origins, not just adjacent patterns.

Initial origin buckets:

```text
twoAddressMaterialization
callArg
callResultPreservation
returnMaterialization
edgeOrWrapper
opaqueBarrier
selfCopyOrNoop
unknown
```

Verification:

- Targeted arithmetic probe tests.
- One sample generated JSON inspected for stable field names.

## Decision Gate A

Before starting VIR code, answer:

1. Did shared infrastructure reduce duplicated safety logic?
2. Do copy-origin diagnostics show enough high-value copies that slot planning is worth testing?
3. Are the top copy origins structural, not just one-off peephole residue?
4. Is the current LIR infra still useful even if VIR is abandoned?

If no, pause. Do not build VIR just because it is planned.

## Band B — Thin VIR spike preparation and core

### B1. VIR ADR / open-question closure

Primary files:

- `docs/plans/mc-mechanism-optimization/11-vir-adr.md` or equivalent
- maybe updates to [09](./09-vir-architecture-recommendation.md)

Deliverable:

- Short ADR answering the open questions from [09](./09-vir-architecture-recommendation.md), especially:
  - MIR SSA/CFG shape;
  - `$pN/$ret` ABI and clobbers;
  - helper access to caller temporaries;
  - recursion/reentrancy/coroutine policy;
  - `execute as @e[...] run function` shared-temp safety;
  - raw/macro effect annotation path.

### B2. VIR core skeleton

Primary files:

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

Deliverable:

- Table-backed branded IDs.
- Mandatory locations.
- SSA value definitions and use lists.
- Deterministic textual printer.
- Structural verifier with negative tests.

Scope:

- Single function and simple blocks are enough.
- No production compiler integration.

### B3. Arithmetic-only MIR → VIR → LIR path

Primary files:

```text
src/vir/lower/mir-to-vir.ts
src/vir/lower/vir-to-lir.ts
src/vir/interpreter.ts
src/__tests__/vir/lowering.test.ts
```

Subset:

```text
const
add/sub/mul/div/mod/min/max
compare
return
single-block leaf function
```

Rules:

- Unsupported function falls back to old path.
- No partial function mixing.
- Default compiler path unchanged.

Deliverable:

- VIR interpreter or symbolic evaluator for the supported arithmetic subset.
- Old/new arithmetic fixture equivalence.

### B4. First VIR optimizer passes

Primary files:

```text
src/vir/pass-manager.ts
src/vir/passes/canonicalize.ts
src/vir/passes/constant-fold.ts
src/vir/passes/dce.ts
src/vir/passes/local-cse.ts
src/__tests__/vir/passes/*.test.ts
```

Deliverable:

- Verifier-backed pass manager.
- Constant folding, DCE, local CSE, and canonical arithmetic identities.
- Pass idempotence tests where applicable.

## Decision Gate B

Before slot planner work, require:

1. VIR core has deterministic dump and verifier.
2. Arithmetic subset old/new semantics match.
3. Default compiler path unchanged.
4. No broad MIR/LIR churn.
5. No hidden physical slot references in normal VIR ops.

If not, stop and keep the useful IR skeleton/tests only.

## Band C — Slot planner proof

### C1. Machine constraints

Primary files:

```text
src/vir/lower/machine.ts
src/__tests__/vir/machine.test.ts
```

Deliverable:

- Ephemeral machine op representation for arithmetic lowering.
- Operand constraints: use, def, reuse, fixed, clobber.

### C2. Straight-line slot planner

Primary files:

```text
src/vir/lower/slot-planner.ts
src/__tests__/vir/slot-planner.test.ts
```

Deliverable:

- Straight-line liveness.
- Dead-lhs overwrite.
- Commutative operand choice.
- `$ret` precoloring for returns.

### C3. Parallel copy resolver

Primary files:

```text
src/vir/lower/parallel-copies.ts
src/__tests__/vir/parallel-copies.test.ts
```

Deliverable:

- Parallel move resolution with scratch/swap handling as appropriate for scoreboard slots.
- Tests for cycles and overwrite hazards.

### C4. Allocation checker

Primary files:

```text
src/vir/lower/allocation-checker.ts
src/__tests__/vir/allocation-checker.test.ts
```

Deliverable:

- Symbolic checker that confirms each physical slot contains the required value at every use.
- Clobber and return-location assertions.

### C5. Benchmark comparison

Primary files:

- `benchmarks/arithmetic-probes.ts`
- maybe `src/__tests__/arithmetic-probes.test.ts`

Deliverable:

- Old vs VIR arithmetic benchmark output.
- Copy-origin deltas.
- Compile-time overhead noted.

## Decision Gate C

Continue beyond arithmetic-only only if:

```text
semantic mismatches: 0
allocation checker failures: 0
VIR path total commands: not worse on arithmetic subset
scoreCopy reduction: meaningful, target 20%+
score_arith -> score_copy -> score_arith reduction: meaningful, target 40%+
implementation did not force broad MIR/LIR churn
```

If the gate fails, stop. Keep reusable LIR infra and any useful verifier/printer pieces.

## How to use Pro 20x effectively

Use Pro 20x for orchestration/review, not for giant blind edits.

Recommended pattern:

1. Controller asks one agent to inspect current code and produce stale-assumption notes.
2. Controller assigns one implementation lane at a time.
3. A separate read-only review checks the diff.
4. Controller runs the targeted tests and commits.
5. Only after a band decision gate does the next band start.

Good subagent tasks:

- “Read current LIR types/RMW/dead-slot and propose exact liveness API; no edits.”
- “Implement A1 only; touch analysis tests and one support file.”
- “Review A1 diff for barrier/call-context unsoundness; no edits.”
- “Implement B2 VIR printer/verifier only; no compiler path.”
- “Review B2 for ID determinism and stale use-list bugs.”

Bad subagent tasks:

- “Implement VIR.”
- “Refactor optimizer.”
- “Make the compiler use VIR.”
- “Optimize all arithmetic.”

## Commit and verification discipline

Documentation-only slices:

```text
git diff --check
git status --short --branch
```

Code slices:

- Run targeted tests for the edited area.
- Run `bench:arithmetic` only for benchmark/optimizer behavior changes.
- Run full project gate before finalizing a band or changing compiler behavior:

```bash
npm run build
npm run validate-mc
npm test -- --runInBand
npm run docs:check
git diff --check
```

No push by default.

## Final expansion roadmaps after this brief

If Band C succeeds, write the next roadmap files before implementation:

```text
12-vir-cfg-block-args-roadmap.md
13-vir-calls-abi-roadmap.md
14-vir-resources-effects-roadmap.md
15-mc-legalization-slot-planner-roadmap.md
16-vir-rollout-peephole-retirement-roadmap.md
```

Do not pre-implement those areas in the first `/goal` run. The first run should reach at most the arithmetic-only slot-planner decision gate.
