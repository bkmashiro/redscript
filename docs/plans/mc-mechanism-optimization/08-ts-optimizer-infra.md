# 8. TS Optimizer Infrastructure Stack

Status: initial wrapper landed. Keep this lane focused on reusable compiler infrastructure, not one-off peepholes.

## Decision

Stay in the TypeScript toolchain for the production compiler. Do **not** migrate the compiler to MLIR/LLVM now.

Use a small project-owned optimizer core, with external packages only where they are cheap and test-friendly:

| Area | Choice | Role |
| --- | --- | --- |
| IR representation | TypeScript discriminated unions | Main source of truth for MIR/VIR/LIR nodes. |
| Shared LIR analysis | `src/optimizer/lir/analysis.ts` | Slot identity, read/write sets, raw/macro/execute mention detection, module reference indexes. |
| Property/fuzz testing | `fast-check` | Generate small optimizer inputs and pin invariants that example tests miss. |
| Pattern ergonomics | optional `ts-pattern` later | Only introduce if rewrite code becomes repetitive; not required for the first wrapper. |
| Equivalence oracle | optional `z3-solver` later | Offline proof/checker for small scoreboard rewrite rules; not production pipeline. |
| External optimizer spike | optional `binaryen` later | Pure arithmetic-only experiment; not a whole-program RedScript optimizer. |
| E-graphs | optional Rust `egg` subprocess later | Helper/math rewrite exploration only. |

## What landed first

`src/optimizer/lir/analysis.ts` is the first reusable layer extracted from ad-hoc LIR passes. It centralizes:

- `slotKey` / `sameSlot`;
- protected ABI/compiler slot classification;
- explicit read/write slot extraction;
- conservative raw and macro text slot scanning;
- execute `call_context` slot mention detection;
- module-level cross-function reference indexing.

Current users:

- `src/optimizer/lir/dead_slot.ts`;
- `src/optimizer/lir/rmw.ts`.

Test coverage:

- `src/__tests__/optimizer/lir/analysis.test.ts`;
- `src/__tests__/optimizer/lir/rmw.test.ts`;
- `src/__tests__/optimizer/lir/rewrite.test.ts`;
- existing LIR pipeline tests.

Batch 19 added:
- straight-line next-read/write/dead-after analysis in `analyzeStraightLineSlotLiveness`;
- `src/optimizer/lir/rewrite.ts` window harness with deterministic local pattern matching.
- conservative barrier helpers for raw/macro/call/storage boundaries.

## Near-term migration rule

Before adding another LIR peephole, first ask whether it needs one of these shared analyses:

```text
slot identity
read/write set
barrier/effect classification
module-level reference index
local liveness
rewrite safety predicate
```

If yes, extend `analysis.ts` or add a sibling support module first, then write the optimizer rule on top of that API.

Batch 20 update: continue conservative by default.

- keep optimizer rewrites in the existing `src/optimizer/lir/*` path while they are proven;
- keep `raw`/`macro`/call/storage barriers hard in rewrite matching;
- keep protected slots out of unsafe copy forwarding;
- leave full VIR implementation out of production until a spike proves measurable benefit and safety.

## What not to do yet

Do not add a full VIR/SSA production layer until the TS support stack proves it can remove duplication and protect correctness in the current LIR optimizer. The intended shape, if the spike is justified, is documented in [09 — VIR architecture recommendation](./09-vir-architecture-recommendation.md): thin SSA value layer, Minecraft-aware semantics, target-independent locations, then MC legalization and slot planning.

This roadmap phase keeps VIR to a prototype, experimental lane only. No production compiler integration is in scope, and all unsupported or mixed forms must remain explicit fallback points.

Do not add Binaryen, Z3, or egg to the production dependency graph until each has a narrow spike with measurable value.

## Next slices

1. ✅ Add local liveness / next-use helpers for straight-line LIR windows. [Done]
2. ✅ Add a tiny rewrite-rule harness so multi-instruction patterns can share window matching and safety checks. [Done]
3. ✅ Use `fast-check` to fuzz small LIR programs for analysis invariants and no-op rewrite equivalence. [Done]
4. ✅ Prototype arithmetic-only VIR behind an experimental path: core skeleton, arithmetic lowering, first passes, and slot-planner v1 now live under `src/optimizer/vir`. [Experimental only]

Production VIR/LIR handoff is still pending and out of this phase’s scope. The slot planner can be exercised by tests/probes, but it is not wired into the compiler pipeline.

Step-10 status in this roadmap is an experimental decision gate prototype:
- `chooseVirLoweringPlan(...)` compares direct vs planned per function in `auto`/`compare` mode.
- planned selection currently requires simple non-worse cost criteria (`commands`, then `score_copy`) and allocation-check pass.
- the gate itself is prototype-only; production handoff is still pending until the outcome supports a broader rollout.
