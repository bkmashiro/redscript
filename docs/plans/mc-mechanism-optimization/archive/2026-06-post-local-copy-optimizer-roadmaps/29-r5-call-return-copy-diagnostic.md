# R5 — Call/return materialization diagnostic (copy-pressure inventory)

## Purpose

Diagnostic-only inventory for ABI/copy-pressure behavior and safe-versus-unsafe rewrite candidates in the call/return path. No compiler behavior changes are intended in this tranche.

## Current ABI map (code-grounded)

### Function boundaries and parameter entry ABI

- Entry lowering copies caller-visible parameter slots into callee-owned temps:
  - `src/lir/lower.ts:223-228` loops `i=0..n`, writes `score_copy dst: ctx.slot(paramName)` from `src: $p{i}`.
  - This means params are materialized in LIR as `$p0/$p1/...` on the wire and remapped to `$${fnName}_${param}` inside the callee body.
- Function temps are still globally prefixed by ABI owner:
  - `src/lir/lower.ts:63-72` (`ctx.slot`) maps non-`__rf_` temps to `${currentFnName}_` names.
- Return temps for tuple/struct-likes are already converted at slot level:
  - `src/lir/lower.ts:65-67` maps `__rf_*` to `$ret_*`.
  - E2E coverage confirms tuple codegen emits `$ret_0`, `$ret_1`, etc.
    - `src/__tests__/tuple.test.ts:107-118`

### Call lowering

- MIR `call` lowers with arg staging first:
  - `src/lir/lower.ts:547-553`: argument values are copied into `$p0`, `$p1`, ... before invocation.
- Non-raw call target lowers to typed `call`:
  - `src/lir/lower.ts:554-565`.
- Return capture is explicit when `instr.dst` exists:
  - `src/lir/lower.ts:567-571` adds `score_copy <dst> <- $ret`.
  - Unit lock-in: `src/__tests__/lir/lower.test.ts:351-387`.
- `call_macro` lowers by writing each named arg into `rs:macro_args` then `call_macro`:
  - `src/lir/lower.ts:575-589`.
  - It also applies the same `instr.dst ? score_copy(dst,$ret) : no copy` pattern:
    - `src/lir/lower.ts:591-595`.

### Return lowering

- MIR `return value` always emits `return_value` carrying the selected slot:
  - `src/lir/lower.ts:637-642`.
- `return_value` semantics are the ABI writeback point:
  - `src/lir/types.ts:85-87` (`kind: 'return_value'; slot: Slot` comment: `$ret = slot`).
  - Unit lock-in:
    - `src/__tests__/lir/lower.test.ts:496-510`.
- In MIR→LIR tests and the type shape, this creates a dedicated `score_copy` shape from source slot into `$ret` before returning control.

### Boundaries that look opaque in current optimizer analysis

- Raw calls (`__raw:*`) are lowered to direct `raw`/`macro_line` commands:
  - `src/lir/lower.ts:554-563`.
- `call_context` and macro/execute contexts are treated as slot-referencing barriers by LIR analysis tests:
  - `src/lir/lower.ts:599-605` (instruction form)
  - `src/__tests__/optimizer/lir/analysis.test.ts:63-76` (raw/macro/call_context conservatively mentions slots).

## Candidate families (R5 diagnostic split)

### Diagnostic-only / maybe future-safe after proof

- A1 — Intra-function `call` result materialization rewrite:
  - Candidate shape: `score_copy dst <- $ret` right after `call`.
  - Why currently not safe by default:
    - `$ret` is the shared return ABI slot and is explicitly guarded as protected in local-copy evidence docs (`src`-level rewrites refuse protected `$ret` classes in existing track decisions).
    - Existing rewrite tests already block `$ret` source/target alias corners and later references:
      - `src/__tests__/optimizer/lir/rmw.test.ts:437-447`, `449-460`, `488-497`.
  - Requires proof:
    - no post-call slot reads before clobber,
    - no cross-function slot mentions of the destination temp,
    - no raw/macro/execute-context barrier in the observed window.

- A2 — Arg-slot copy elision into callee temps (`$pN -> $callee_*`) when fully unused:
  - Candidate shape: remove/shorten entry `score_copy dst: callee_param <- $pN`.
  - Requires proof:
    - callee params not needed beyond the copied point,
    - no nested call path that mutates `$pN` visibility,
    - no raw/macro paths inside callee that mention the same slot names.

### Explicitly unsafe until ABI policy changes

- B1 — Any cross-function/cross-module rewrite that moves `$pN` or `$ret` across function boundaries.
  - Current evidence treats `external-or-protected` as blockers and does not permit this rewrite class without new ABI guarantees.
- B2 — Rewrites that treat `call_macro` as pure/function-equivalent.
  - They are currently emitted as `store_score_to_nbt + call_macro` and are not proven pure in current tiers.
- B3 — Rewrites that treat `raw` calls (`__raw:*`) as reorderable.
  - Current lowering emits literal command lines with no typed contract.
- B4 — Rewrites that change execute-context semantics of `call_context`.
  - `call_context` carries explicit execute-subcommand context and is already observed as a slot-reference boundary in analysis tests.

### Require benchmark/probe evidence first

- C1 — Nested/helper calls: parameter copy/return behavior with at least 2-level call chains.
- C2 — Argument slot clobbering:
  - Callers writing `$pN` and callee mutating/reading it in ways that interact with `return run function`.
- C3 — `$ret` clobbering after call:
  - Any case where `$ret` is modified by instructions following a function call before the caller materializes the destination.
- C4 — Macro/raw boundaries:
  - Mixed `call` + `__raw:*` + `call_macro` sequences in one function.
- C5 — execute-context calls:
  - `call_context` around conditionally executed helpers or branch lowering.
- C6 — `__rf`/`$ret_*` multi-return flows:
  - Tuple-return shape depends on `__rf_*` mapping and may interact with copy-pressure rewrites.

## Minimal proof gates to close before any implementation

- Keep this tranche docs-only until all above fixtures exist and fail/pass as expected.
- No default enablement or pipeline wiring changes in this tranche.

## Required negative fixture inventory before any rewrite

`src/__tests__/lir/lower.test.ts` and optimizer barrier fixtures already show the boundary behavior, but dedicated negative fixtures for R5 should include:

1. nested calls / helper-call chains,
2. arg-slot mutation before/after nested call, including `$pN` clobbering,
3. `$ret` redefinition after call before destination capture,
4. raw and macro call boundaries,
5. `call_context` boundaries,
6. tuple/struct-return capture (`$ret_*`) and mixed return-slot reads.

## Fixture tranche added

- `src/__tests__/lir/lower.test.ts`
  - `nested helper calls keep per-frame $pN and $ret materialization explicit`
  - `call destination capture stays before later $ret clobber`
  - `call_macro capture stays explicit before a raw $ret clobber`
  - `call_context wrapper remains context-only and does not introduce ABI temp copy plumbing`
  - `return with __rf_0 aliases to $ret_0`
  - `return with __rf_1 aliases to $ret_1`
- `src/__tests__/optimizer/lir/analysis.test.ts`
  - `keeps conservative liveness across explicit call and call_macro barriers`
  - `keeps conservative liveness across raw and execute-context barriers`
