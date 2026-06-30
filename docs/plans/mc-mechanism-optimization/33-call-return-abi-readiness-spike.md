# P14 Call/Return ABI Cleanup Readiness Spike

Date: 2026-06-30
Status: Done — read-only diagnostic spike

## Scope

This spike inventories the current MIR → LIR → emit call/return ABI shapes and decides whether a small cleanup is safe now. It intentionally does not rewrite ABI/call paths.

Constraints followed:

- Keep the existing Source → AST → TypeCheck → HIR → MIR → Optimizer → LIR → Emit pipeline.
- Do not weaken `verifyLIR` default strictness.
- Do not infer typed semantics from `raw` or `macro_line` text.
- Prefer diagnostics/docs/tests over risky call/return implementation changes.

## Inventory

### LIR ABI slots

Current ABI-visible scoreboard slots are defined in `src/optimizer/lir/analysis.ts`:

- `$ret` — scalar return value slot.
- `$ret_*` — aggregate/field return slots, including tuple/struct-like returns.
- `$pN` — parameter passing slots.

`isProtectedSlot()` preserves those ABI slots for dead-slot elimination. Compiler-owned const/temp slots are deliberately not ABI-protected by default.

### Parameter passing

`src/lir/lower.ts` lowers MIR calls by writing arguments to shared parameter slots before the call:

1. For each argument, write/copy into `$p0`, `$p1`, ... under the module objective.
2. Emit `call`, `call_macro`, or `call_context` depending on MIR shape.
3. If the call has a destination, copy `$ret` into the caller temp slot after the call.

Callees copy `$pN` into function-prefixed local temps at function entry. That means `$pN` slots are cross-function ABI state and must remain globally protected until the ABI is redesigned.

### Scalar return

A MIR `return value` lowers to LIR `return_value`, which emits a scoreboard operation assigning the returned slot into `$ret <objective>`. Call sites that need the value copy `$ret` into a caller-local temp.

Relevant files:

- `src/lir/types.ts` — `return_value`, `call`, `call_macro`, `call_context` instruction shapes.
- `src/lir/lower.ts` — call parameter setup and `$ret` copyback.
- `src/emit/command.ts` — command rendering for calls and `return_value`.

### Aggregate/field returns

Return-field temps named `__rf_*` map to `$ret_*` in `LoweringContext.slot()`. Existing tests such as `src/__tests__/compiler/tuple-type.test.ts` already assert `$ret_0` / `$ret_1` output shape.

### Macro and dynamic storage call shapes

Macro calls and dynamic NBT helpers use `rs:macro_args` plus `call_macro`/`store_cmd_to_score`:

- `nbt_read_dynamic` stores `arr_idx`, then captures a macro helper call result with `store_cmd_to_score`.
- `nbt_write_dynamic` stores `arr_idx`/`arr_val`, then calls the helper macro as an opaque side-effect.
- `call_macro` remains an optimizer barrier and is version-gated at emit time.

### Context calls / branch calls

`call_context` emits `execute ... run function ...`; branch lowering also emits raw `execute ... run return run function ...` strings for fallthrough control. These paths intentionally act as conservative barriers in LIR optimizer analysis.

## Existing coverage relevant to P14

- P13 added negative fixtures for `$ret_*`, `$pN`, raw/macro/call/storage barriers, and cross-function mentions.
- `src/__tests__/optimizer/lir/equivalence.test.ts` checks dead-slot ABI preservation against the LIR interpreter for representative cases.
- `src/__tests__/compiler/tuple-type.test.ts` checks tuple return slots.
- `src/__tests__/compiler/throttle-retry.test.ts` covers `$ret` in generated dispatcher control flow.
- `src/__tests__/double.test.ts` covers mixed storage/scoreboard return/argument paths for double helpers.

## Readiness assessment

No production ABI cleanup is safe as an isolated P14 change yet.

Reasons:

1. `$pN` and `$ret*` are shared cross-function scoreboard slots, not local temps. Narrow cleanup can easily break callers/callees unless it has whole-module call graph and calling-convention proof.
2. `call`, `call_macro`, `call_context`, `raw`, and storage/NBT instructions are already treated as barriers. This is correct but limits safe local reasoning.
3. Some control-flow correctness is encoded in raw branch commands (`return run function`). A cleanup should first make that shape typed or explicitly validated, not regex-optimized.
4. Aggregate return fields (`$ret_*`) and dynamic storage macro helpers use multiple ABI channels at once; a broad rewrite would couple P14 to storage/NBT and macro semantics.

## Decision

P14 is complete as a diagnostic/readiness spike. Keep current ABI behavior and do not implement a production cleanup in this tranche.

Safe next steps for a future tranche:

1. Add a typed branch-return LIR node or validator coverage for the existing raw `execute ... return run function ...` shape.
2. Add compile-level golden tests for scalar return, tuple/field return, macro call return, and dynamic NBT helper return in one fixture family.
3. Only after that, consider a tiny cleanup that is explicitly scoped to compiler-owned local temps and leaves `$pN`/`$ret*` untouched.

## Gates run

- `npm run build`
- `git diff --check`
