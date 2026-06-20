# 7. Lane 6 — Scoreboard RMW Optimizer Design

Status: first conservative implementation landed. This document remains the design baseline for future, more aggressive RMW/liveness work.

This lane replaces another speculative Minecraft mechanism probe with a lower-risk compiler/backend optimization: reduce redundant scoreboard copy/temporary traffic before emitting `.mcfunction` lines.

## Why this is the next practical lane

Minecraft-mechanism probes are useful only after live validation. In contrast, scoreboard copy/temp reduction is:

- version-stable;
- independent of Paper configuration;
- measurable with static command output;
- broadly applicable across generated code;
- safer to roll out behind LIR optimizer tests.

The goal is not to invent new arithmetic semantics. It is to avoid emitting avoidable `scoreboard players operation ... = ...` copies around operations that are already destructive in Minecraft's scoreboard model.

## Recommended insertion point

Use the **LIR optimizer**, not the emitter and not the MIR optimizer.

Recommended file:

```text
src/optimizer/lir/rmw.ts
```

Pipeline integration target:

```text
src/optimizer/lir/pipeline.ts
```

Reasoning:

- MIR is still a three-address IR; destructive two-address scoreboard semantics are not yet explicit enough there.
- The emitter should stay a renderer from LIR to command text, not a semantic optimizer.
- Existing LIR passes already handle command-shape rewrites:
  - `src/optimizer/lir/dead_slot.ts`
  - `src/optimizer/lir/const_imm.ts`
  - `src/optimizer/lir/peephole.ts`

## First pattern family

Start with only local, adjacent, single-function patterns.

### Pattern A — dead copy into temp followed by operation

Before:

```text
score_copy tmp <- src
score_add  tmp <- rhs
```

Possible output when safe:

```text
score_add src <- rhs
```

Only legal if the old value of `src` is dead after the operation and `tmp` is only the copy target consumed by the following op.

Apply to these operations first:

```text
score_add
score_sub
score_mul
score_div
score_mod
score_min
score_max
```

Do **not** include `score_swap` in the first slice.

### Pattern B — output copy collapse

Before:

```text
score_copy tmp <- src
score_add  tmp <- rhs
score_copy out <- tmp
```

Possible output when safe:

```text
score_copy out <- src
score_add  out <- rhs
```

This does not mutate `src`, so it is often safer than Pattern A. It still removes a temporary slot and can reduce command count if a later pass deletes the now-unused temp copy.

This may be the safest first implementation if liveness is not yet strong enough for destructive source updates.

## Safety conditions

A first implementation should be conservative.

Required checks:

1. Stay within one LIR function.
2. Stay within a straight-line instruction window.
3. Do not cross barriers.
4. Do not rewrite protected slots.
5. Do not change objective names.
6. Do not assume raw/macro command side effects are transparent.

Suggested protected slots / names:

```text
$ret
$ret_*
$p0..$pN
__rf_*
__const_*
macro argument temps
```

Re-use protection logic from `dead_slot.ts` where possible.

## Barriers / non-goals

Do not optimize across:

```text
call
call_macro
call_context
call_if_*
call_unless_*
return
branch / jump boundaries
raw
macro_line
store_score_to_nbt
store_nbt_to_score
```

Do not attempt in the first slice:

- cross-function analysis;
- CFG-wide liveness;
- raw command scoreboard regex inference;
- macro body optimization;
- global fake-player register allocation;
- scoreboard objective rewriting.

## RED test plan

Add a focused test file:

```text
src/__tests__/optimizer/lir/rmw.test.ts
```

Test cases:

1. Adjacent `score_copy + score_add` with provably dead temp/source rewrites.
2. Same for `score_sub`, `score_mul`, `score_div`, `score_mod`.
3. Source slot used later: no rewrite.
4. RHS slot used later: still okay if only destination changes are legal.
5. Protected const slot or return slot: no rewrite.
6. `raw` or `macro_line` between copy and op: no rewrite.
7. `call` / `call_macro` / `call_context` nearby: no rewrite across the barrier.
8. Objective mismatch should never be introduced; `verifyLIR` should still pass.

Pipeline-level tests:

```text
src/__tests__/optimizer/lir/pipeline.test.ts
```

Check that the new pass composes with:

- `deadSlotElimModule`
- `execStorePeephole`
- `constImmFold`

Compile-output shape test:

- Use a small inline RedScript source with a chain like `x = x + y; x = x * z;`.
- Compare command count/category output before/after only if the shape is stable enough.
- Prefer an LIR unit test for exact instruction shape.

Behavioral regression:

- Keep existing MC/integration RMW behavior tests as equivalence anchors.
- Offline MC skips are not live proof; this pass should still be primarily proven by unit and emitted-command shape tests.

## Minimal implementation slice

Implemented first slice:

1. `src/optimizer/lir/rmw.ts` adds `scoreboardRmwPass`.
2. It implements four adjacent conservative patterns:

   Copy forwarding:

   ```text
   score_copy tmp <- src
   score_copy out <- tmp
   ```

   becomes:

   ```text
   score_copy out <- src
   ```

   Return-copy forwarding:

   ```text
   score_copy tmp <- src
   return_value tmp
   ```

   becomes:

   ```text
   score_copy $ret <- src
   ```

   Output-copy RMW collapse:

   ```text
   score_copy tmp <- src
   score_<op> tmp <- rhs
   score_copy out <- tmp
   ```

   becomes:

   ```text
   score_copy out <- src
   score_<op> out <- rhs
   ```

   Return collapse:

   ```text
   score_copy tmp <- src
   score_<op> tmp <- rhs
   return_value tmp
   ```

   becomes:

   ```text
   score_copy $ret <- src
   score_<op> $ret <- rhs
   ```

   Both patterns require the temporary to be unprotected and unused outside the local window.

3. It is integrated into `src/optimizer/lir/pipeline.ts` after module-level dead-slot cleanup and before peephole/const-immediate folding.
4. `benchmarks/arithmetic-probes.ts` now reports `commands.scoreCopy` so future runs can track copy-pressure changes. After module-safe copy-forwarding, current O1 arithmetic probes dropped from 1266 to 1139 total `scoreCopy` commands.

## Future implementation criteria

Promote a more aggressive next slice only if:

- the first pass is local and conservative;
- tests prove non-rewrite cases as strongly as rewrite cases;
- command count improves on at least one realistic arithmetic probe;
- `npm run bench:arithmetic -- --case all --opt 1` shows no pathological regressions;
- full test suite remains green.

## Open questions for implementation

- Whether Pattern A requires full local liveness before it is safe enough.
- Whether protected slot detection should become a shared helper across LIR passes.
- Whether Pattern B's command-count improvement appears in larger real arithmetic probes or mainly in targeted compiler shapes.
