# 30. Backend Contract Hardening Roadmap

> **For Hermes/Spark:** This is the active roadmap for RedScript backend optimizer work after the local-copy/R1/R2/R4/R5 tranches. Implement one tranche at a time. Use Spark only for bounded audit/implementation slices with explicit allowed files, forbidden scope, exact commands, and controller review. Do not resume archived roadmaps except as reference.

**Goal:** Turn the current working compiler backend into a safer extensible optimizer backend by hardening LIR contracts, verifier integration, effect modeling, raw/macro boundaries, and correctness gates before adding higher-risk optimizations.

**Architecture:** Keep the existing Source → AST → TypeCheck → HIR → MIR → MIR optimizer → LIR → LIR optimizer → Emit datapack pipeline. Do not rewrite the compiler. Make hidden backend assumptions explicit: LIR verification, typed effects, opaque barriers, ScoreInt/immediate validation, pass-manager stats, and artifact/version validation.

**Tech Stack:** TypeScript, Jest, existing RedScript MIR/LIR/optimizer pipeline, `verifyLIR`, Minecraft static validation, optional future `fast-check` property tests and offline proof/search sidecars only.

---

## Source inputs and current posture

This roadmap integrates:

1. Oracle code-review guidance delivered 2026-06-29.
2. Completed local-copy proof-to-release work archived under `archive/2026-06-post-local-copy-optimizer-roadmaps/`.
3. Completed low-risk production-adjacent tranches:
   - R1 conservative dead-temp overwrite elimination.
   - R2 conservative min/max no-op and const-driven min/max folds.
   - R4 adjacent same-slot `score_set` overwrite canonicalization.
   - R4 typed `score_copy(dst,dst)` no-op removal.
   - R5 diagnostic call/return ABI inventory and fixture locks.
4. Existing project guidance in `AGENTS.md`: no wholesale rewrite; harden compiler/stage contracts and Minecraft validation loop incrementally.

**Decision:** The compiler is not a toy and should not be replaced. The next useful work is backend contract hardening. Optimizer feature expansion is secondary until the contracts below are stronger.

## Non-goals

- No wholesale compiler rewrite.
- No LLVM/MLIR/Cranelift/Binaryen production dependency.
- No VIR production promotion.
- No default enablement of experimental optimizer flags based only on benchmark deltas.
- No optimizer rewrite that reasons through `raw`/`macro_line` text as semantic proof.
- No ABI/call/return materialization cleanup until dedicated negative fixtures and effect barriers are in place.

## Active order of work

```text
P0. Archive/reset and source-of-truth docs       — this document
P1. LIR effect model                             — typed reads/writes/barriers/opaque
P2. verifyLIR in compile pipeline                — fail bad LIR at stage boundaries
P3. typed immediate scoreboard LIR + ScoreInt    — const_imm stops generating raw
P4. raw/macro opaque policy + const folding guard — regex becomes diagnostics only
P5. protected vs compiler-owned slot split       — safer DCE for const/temp materialization
P6. LIR pass manager cleanup/idempotence         — bounded cleanup and stats
P7. macro/version hard errors                    — no silent semantic fallback
P8. artifact/function path validation            — normalized path collision/ref checks
P9. emit/compile decomposition                   — only after behavior is pinned
P10. semantic equivalence/property tests         — expand confidence gates
```

---

## P1 — Shared LIR effect model

**Product promise:** Every optimizer pass uses the same explicit contract for semantic reads, source operands, writes, opaque reads/writes, and barriers.

**Why first:** Current analysis helpers conflate source-use counts with semantic liveness. Destructive scoreboard ops such as `score_add` semantically read both `dst` old value and `src`; const folding may only want source operands. A single API cannot safely serve both.

**Primary files:**

- Create: `src/optimizer/lir/effects.ts`
- Modify: `src/optimizer/lir/analysis.ts`
- Modify: `src/optimizer/lir/const_imm.ts`
- Modify: `src/optimizer/lir/dead_slot.ts`
- Modify: `src/optimizer/lir/rmw.ts` only if needed by effect migration
- Tests: `src/__tests__/optimizer/lir/analysis.test.ts`, `const_imm.test.ts`, `dead_slot.test.ts`, `rmw.test.ts`

**Required API shape:**

```ts
type SlotEffect = {
  sourceOperands: Slot[]
  semanticReads: Slot[]
  writes: Slot[]
  opaqueReads: boolean
  opaqueWrites: boolean
  barrier: boolean
}
```

**Acceptance:**

- `score_add/sub/mul/div/mod/min/max` semantic reads include `dst` and `src`.
- `sourceOperands` for those ops remains `src` only for const-use counting.
- `score_set` writes `dst`, no reads.
- `score_copy` reads `src`, writes `dst`.
- `store_cmd_to_score` composes nested command effects plus writes `dst`; barrier policy is explicit.
- `raw` and `macro_line` are opaque barriers by default.
- `call`, `call_macro`, `call_context` are barriers; slot mention handling is conservative.

**Forbidden:**

- Do not change emitted datapack behavior.
- Do not add new optimizer rewrites in this tranche.
- Do not move parser/typechecker/HIR/MIR/emit code.

**Controller gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath \
  src/__tests__/optimizer/lir/analysis.test.ts \
  src/__tests__/optimizer/lir/const_imm.test.ts \
  src/__tests__/optimizer/lir/dead_slot.test.ts \
  src/__tests__/optimizer/lir/rmw.test.ts \
  --runInBand
npm run test:lir
npm run test:probe
npm run build
npm run validate-mc
git diff --check
npm run gate:lir-local-copy -- --output /tmp/redscript-p1-lir-effects.json
```

---

## P2 — Wire `verifyLIR` into real compile stages

**Status:** ✅ Done

**Product promise:** Illegal LIR cannot silently continue through optimize/finalize/emit.

**Primary files:**

- `src/emit/compile.ts` or current compile stage file containing `lowerAndOptimizeStages`
- `src/lir/verify.ts`
- tests near compile/LIR validation paths

**Required verification points:**

1. Immediately after `lowerToLIR(mirFinal)`.
2. Immediately after `lirOptimizeModule(lir, options)`.
3. Immediately after `finalizeRuntimeLIRStage(...)`.

**Acceptance:**

- Verifier failures become `DiagnosticError` or the repository-standard compile diagnostic shape.
- Tests prove compile fails on:
  - illegal objective mismatch generated before/after optimization;
  - undefined function references;
  - invalid macro-line placement if already covered by verifier.
- No behavior change for valid programs.

**Forbidden:**

- Do not weaken existing verifier checks.
- Do not convert verifier errors to warnings in compile/gate mode.

**Controller gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath <new/affected compile verifier tests> --runInBand
npm run build
npm run validate-mc
npm run test:lir
git diff --check
```

---

## P3 — Typed immediate scoreboard LIR and ScoreInt guard

**Product promise:** Const-immediate optimization stops emitting opaque raw scoreboard text and becomes verifiable/analysable typed LIR.

**Primary files:**

- `src/lir/types.ts`
- LIR emitter instruction renderer, likely `src/emit/index.ts` before later extraction
- `src/optimizer/lir/const_imm.ts`
- `src/lir/verify.ts`
- tests: `src/__tests__/optimizer/lir/const_imm.test.ts`, emitter/LIR lower tests as needed

**Recommended type:**

Prefer one normalized instruction:

```ts
| { kind: 'score_delta'; dst: Slot; value: ScoreInt }
```

Emitter mapping:

```text
score_delta +N -> scoreboard players add <dst> N
score_delta -N -> scoreboard players remove <dst> N
score_delta 0  -> no-op / removed by no-op pass
```

Alternative acceptable shape: `score_add_imm` / `score_remove_imm`.

**ScoreInt requirements:**

- Central helper for Minecraft scoreboard int32 range:
  - min `-2147483648`
  - max `2147483647`
- Reject `NaN`, `Infinity`, non-integers, and out-of-range values before/inside `verifyLIR`.
- `-2147483648` negation for add/remove folding must not overflow into `2147483648`; either do not fold or use a safe typed fallback.

**Acceptance:**

- `const_imm.ts` no longer generates `raw` for add/remove immediates.
- `verifyLIR` validates immediate range.
- Tests include `-2147483648`, `-1`, `0`, `1`, `2147483647`, and out-of-range rejection.
- Existing local-copy gate remains pass.

**Forbidden:**

- Do not introduce raw regex as proof for these instructions.
- Do not change public language semantics.

---

## P4 — Raw/macro opaque policy and const folding guard

**Status:** ✅ Done (validated by required unit/integration/build/probe/gate commands)

**Product promise:** Optimizers treat raw/macro as opaque safety boundaries unless a future typed command IR represents the operation exactly.

**Primary files:**

- `src/optimizer/lir/effects.ts`
- `src/optimizer/lir/analysis.ts`
- `src/optimizer/lir/const_imm.ts`
- `src/lir/types.ts` comments
- tests in optimizer LIR suite

**Acceptance:**

- `raw` and `macro_line` set `opaqueReads=true`, `opaqueWrites=true`, `barrier=true`.
- Const slot folding does not classify a const as definitely single-use across raw/macro.
- Regex slot extraction, if retained, is named and documented as diagnostic/debug hint only.
- Tests prove raw/macro that contains or merely resembles a slot string does not allow stronger optimization.

**Forbidden:**

- Do not parse arbitrary raw commands for correctness proof.
- Do not optimize across `function ... with storage`, `tellraw`, `execute store`, or `data modify` raw text.

---

## P5 — Split ABI-visible and compiler-owned slots

**Product promise:** DCE can remove unused compiler-owned materialization while still protecting ABI/runtime-visible slots.

**Primary files:**

- `src/optimizer/lir/analysis.ts` or new slot-classification helper
- `src/optimizer/lir/dead_slot.ts`
- tests: `src/__tests__/optimizer/lir/dead_slot.test.ts`, `analysis.test.ts`

**Target concepts:**

```text
ABI-visible slots:
  $ret, $ret_*, $p0, $p1, ...
  externally mentioned slots

Compiler-owned slots:
  $__const_*
  function-prefixed temps such as $<fn>_t*
  future $__opt_* only if introduced deliberately
```

**Acceptance:**

- `$__const_*` is not protected merely because it is a const slot.
- Unused `$__const_*` materialization can be deleted when no opaque barrier can mention it.
- Raw/macro/call barriers continue to protect uncertain references.
- Existing ABI slots remain non-deletable unless a future ABI-specific proof says otherwise.

**Forbidden:**

- No `$pN`/`$ret` cleanup rewrite in this tranche.
- No cross-function slot reuse.

---

## P6 — LIR pass manager cleanup and idempotence

**Product promise:** LIR optimization becomes observable, bounded, and easier to reason about when passes expose changed/stats and cleanup has a safe order.

**Primary files:**

- `src/optimizer/lir/pipeline.ts`
- each LIR pass return shape if needed
- tests: `src/__tests__/optimizer/lir/pipeline.test.ts`

**Acceptance:**

- Pass manager can record per-pass `changed` and small stats.
- Add idempotence test: `lirOptimizeModule(lirOptimizeModule(m))` is stable for representative fixtures.
- Add a bounded cleanup sequence or safe local fixpoint; example:

```text
deadSlotElimModule
execStorePeephole
constImmFold
removeNoOps
deadSlotElimModule
```

- If using run-until-stable, cap iterations and report which pass caused instability.

**Forbidden:**

- Do not use `JSON.stringify` as the long-term pass fixpoint mechanism for new pass manager work.
- Do not hide pass instability.

---

## P7 — Macro/version hard errors

**Product promise:** Targeting a Minecraft version without macro support does not silently emit semantically wrong datapacks.

**Primary files:**

- LIR verifier or emit preflight
- current emitter macro/call_macro rendering path
- version mapping helpers
- tests for old/new MC versions

**Acceptance:**

- If a function has `macroParams` or a `call_macro` requires `function ... with storage`, target MC `< 1.20.2` fails unless an explicit future `allowUnsafeMacroCompat` option exists.
- Best-effort compatibility is opt-in and documented as unsafe.
- Golden/static validation tests cover the failure.

**Forbidden:**

- Do not silently downgrade `call_macro` to ordinary `function` when args would be ignored.

---

## P8 — Function path/reference/collision validation

**Product promise:** Emitted function paths and references are unique and resolvable after lowercasing/path normalization.

**Primary files:**

- emit path helpers such as `fnNameToPath` / `qualifiedFunctionRef`
- artifact/datapack validator or `verifyLIR`
- tests around emit/artifact validation

**Acceptance:**

- Detect collisions such as `Foo::bar`, `foo::bar`, `foo/bar`, `FOO::BAR` if they normalize to the same output path.
- Generated helper names are checked for uniqueness.
- Function references and tag values resolve to emitted files.
- Tests cover normalized collision and missing function references.

---

## P9 — Emit/compile decomposition after behavior is pinned

**Product promise:** Reduce maintenance cost without semantic churn.

**Order:**

1. Extract `emit/command.ts` for `emitInstr`, `emitSubcmd`, slot rendering, score conditions.
2. Extract runtime helper wrappers only after command rendering is stable.
3. Extract tags/source-map/datapack assembly in small moves.
4. Split compile stages such as `resolveImportsAndMergeStage` and `applyConfigGlobalsStage` later.

**Acceptance:**

- Public exports and generated datapack output remain unchanged.
- Use golden/static tests for each extraction.
- No optimizer logic changes in these refactors.

---

## P10 — Semantic equivalence and property tests

**Product promise:** Optimizer correctness is tested by behavior, not just output shape.

**Primary files:**

- New LIR mini-interpreter test helper under `src/__tests__/optimizer/lir/` or `src/optimizer/lir/testing/`
- Existing rewrite equivalence fixtures
- `fast-check` property tests if acceptable under current test time budget

**Acceptance:**

- Interpreter supports typed scoreboard subset:
  - `score_set`, `score_copy`, `score_add/sub/mul/div/mod/min/max`, `score_swap`, future `score_delta`.
- Raw/macro/call/store are barriers/unsupported in random equivalence tests.
- Each local LIR pass has before/after equivalence fixtures.
- Each pass has idempotence tests.
- Boundary fuzz includes `-2147483648`, `-1`, `0`, `1`, `2147483647`.

---

## Spark tranche template

Use this for future worker prompts:

```text
You are the Spark implementation worker for RedScript.
Repo: /Users/yuzhe/projects/redscript
Task: <one tranche from docs/plans/mc-mechanism-optimization/30-backend-contract-hardening-roadmap.md>

Allowed files:
- <exact files>

Forbidden:
- Do not edit parser/typechecker/HIR/MIR unless listed.
- Do not edit src/optimizer/vir/**.
- Do not change CLI/default flags unless listed.
- Do not commit or push.

Acceptance:
- <specific bullets>

Commands:
- <targeted tests>
- npm run test:lir
- npm run test:probe (when optimizer behavior/evidence touched)
- npm run build
- npm run validate-mc
- git diff --check
- npm run gate:lir-local-copy -- --output /tmp/<tranche>.json (when LIR optimizer behavior touched)

Return:
1. Actual model/provider if known.
2. Changed files.
3. What changed.
4. Exact commands and pass/fail results.
5. Blockers/uncertainties.
```

## Roadmap status

- [x] Archive previous post-local-copy roadmaps.
- [x] Create this integrated contract-hardening roadmap.
- [x] P1 shared LIR effect model.
- [x] P2 compile-stage LIR verification.
- [x] P3 typed immediate LIR and ScoreInt guard.
- [x] P4 raw/macro opaque policy.
- [ ] P5 slot-classification split.
- [ ] P6 LIR pass manager/idempotence.
- [ ] P7 macro/version hard errors.
- [ ] P8 function path/reference validation.
- [ ] P9 emit/compile decomposition.
- [ ] P10 semantic equivalence/property tests.
