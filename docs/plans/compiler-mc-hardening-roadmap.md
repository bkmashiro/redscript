# RedScript Compiler + Minecraft Oracle Hardening Roadmap

> **For Hermes:** Use this as the working roadmap before taking implementation slices. Keep tasks incremental, test-backed, and based on `main`.

**Goal:** Make RedScript's core compiler logic provably correct against both static validators and a real Minecraft/Paper oracle, then refactor compiler boundaries safely.

**Architecture:** The current compiler pipeline is valid and should not be rewritten wholesale. First harden the generated command contract for `execute`, `scoreboard`, `function`, storage/NBT, and macro functions; then extract overloaded compiler stages into small modules with snapshot/golden tests protecting behavior.

**Tech Stack:** TypeScript, Jest/ts-jest, RedScript `.mcrs` fixtures, vanilla datapack files, Paper TestHarnessPlugin HTTP API.

---

## Current baseline

The project already compiles and has a real staged compiler:

```text
Source → Lexer → Parser/AST → TypeCheck → HIR → MIR → Optimizer → LIR → Emit datapack
```

The main risk is not “no architecture”; it is that generated datapacks can compile successfully but still fail or drift in real Minecraft behavior. The core validation target is the command logic that represents compiler semantics:

- `execute` chains and context changes
- `scoreboard` arithmetic, comparisons, fake players, objectives
- `function` calls and generated helper functions
- `function ... with storage` macro invocation
- `$...` macro function bodies
- storage/NBT reads and writes used by generated logic
- load/tick tags and entrypoint scheduling

Minecraft side-effect boundary commands such as `setblock`, `fill`, particles, title, sound, bossbar, and entity spawning still need coverage, but they are secondary after the core logic oracle is hard.

---

## Problem statement from the review report

The report flags two parallel tracks:

1. **Validation/oracle gap:** tests can be green while real Paper/Minecraft behavior is under-verified. Current integration tests are offline-friendly and often skip, so they are not a hard server oracle.
2. **Compiler boundary debt:** some files carry too many responsibilities and make behavior risky to change:
   - `src/typechecker/index.ts` — ~1811 lines; symbol collection, type validation, decorator validation, and semantic checks are mixed.
   - `src/emit/index.ts` — ~1056 lines; datapack file assembly, command rendering, runtime helper emission, tags, source maps, and path handling are mixed.
   - `src/cli.ts` — ~1051 lines; command parsing and command implementation logic are mixed.
   - `src/emit/compile.ts` — ~594 lines; orchestration spans import/preprocess, parsing, typing, lowering, optimization, runtime metadata, emission, and error handling.
   - `src/ast/types.ts` — ~452 lines; pure language AST, Minecraft-specific constructs, decorators, events, and type shapes are in one surface file.

Refactor only after behavior is pinned by tests. Do not move directories in one giant PR.

---

## Roadmap phases

### Phase 0 — Lock the working baseline

**Objective:** Keep `main` green and make future work reproducible.

- [x] Add `AGENTS.md` with branch/source-of-truth rules and report-derived guidance.
- [x] Integrate the safe subset of `codex/comp-harness-offline-hardening` into `main`.
- [x] Confirm `npm run build` passes.
- [x] Confirm `npm test -- --runInBand` passes locally, noting real MC integration skips when Paper is offline.
- [x] Keep the original `review-report.md` outside the repo as local reference only (`~/.hermes/context/redscript/review-report.md`).

**Verification:**

```bash
npm run build
npm test -- --runInBand
```

---

### Phase 1 — Core command logic static hardening

**Objective:** Ensure generated command text for compiler semantics is statically checked before involving Paper.

Focus on:

- `execute if/unless score ... run ...`
- nested `execute as/at/positioned/anchored/in`
- `scoreboard players set/add/remove/get/operation`
- `function ns:path`
- `function ns:path with storage ns:path`
- `$...` macro template lines
- storage/NBT commands used by generated macro/state paths

Tasks:

- [x] Centralize `mcVersionToPackFormat()` in `src/types/mc-version.ts` and use it from emit/publish paths.
- [x] Stop skipping `function ... with storage` in `mc-syntax` collection.
- [x] Add minimal validator support for `function ... with storage`.
- [x] Add explicit tests for macro template acceptance and malformed macro function calls.
- [x] Replace “accept all `$...` macro lines” with lightweight macro-template validation:
  - Strip leading `$`.
  - Replace `$(name)` placeholders with safe placeholder literals for validation.
  - Validate the resulting root command path where possible.
  - Keep unsupported or malformed templates as diagnostics, not silent pass.
- [x] Add static tests for generated `execute + scoreboard` combinations from small `.mcrs` programs.
- [x] Add function/tag reference validation: every generated function reference and tag value should resolve inside the datapack artifact (`src/testing/datapack-artifact-validator.ts`).

Suggested files:

- `src/mc-validator/index.ts`
- `src/__tests__/mc-syntax.test.ts`
- new `src/validate/artifact.ts` or `src/artifact/validate.ts`
- new `src/__tests__/artifact-validator.test.ts`

Verification:

```bash
npm run validate-mc
npm test -- src/__tests__/mc-syntax.test.ts --runInBand
```

---

### Phase 2 — Real Paper oracle for core compiler semantics

**Objective:** Build a small, deterministic real-Minecraft test suite that proves compiler logic runs, not just compiles.

Start with descriptor-driven cases focused on logic, not visual/side-effect-heavy commands:

```text
tests/mc-cases/
  scoreboard-arithmetic/
  execute-if-score/
  execute-as-selector-minimal/
  function-call-helper/
  load-tick-lifecycle/
  macro-with-storage/
  storage-read-write/
```

Each case should define:

- `.mcrs` source
- namespace
- compile options / target MC version
- setup commands
- entrypoint function(s)
- wait ticks if needed
- assertions against scoreboard/storage/block/entity state

Tasks:

- [x] Align `src/testing/runner.ts` live mode with harness primary endpoints:
  - `POST /command`
  - `GET /scoreboard?player=...&obj=...`
  - keep legacy `/run` + `/score` fallback.
- [x] Add offline fake-harness tests for endpoint selection and fallback behavior.
- [ ] Add a case descriptor schema and runner that compiles, installs, reloads, runs, and asserts.
  - Initial `src/__tests__/mc-core.test.ts` interaction-matrix coverage now includes execute/as/at/@s context + helper usage, branch+loop+function-return paths, objective/player isolation, storage+NBT read-after-call flow, and controlled tick lifecycle assertions.
  - Deepening coverage has also added deterministic loop+loop-return, storage/NBT read-write loop, foreach + is-check entity counting, macro-in-loop and storage/NBT read-after-call behavior.
  - Initial oracle coverage also includes arithmetic, execute/if-score branching, function helper, macro-with-storage, and load/tick lifecycle baseline checks via `npm run test:mc-core`.
  - Future work: split inline cases into descriptor files if the suite grows.
- [x] Use the live Paper oracle to catch and fix known core semantic bugs before extracting the runner:
  - LICM no longer hoists mutable MC state reads (`score_read`, NBT reads, list length).
  - `is_check` lowers to real selector type predicates.
  - array-param stdlib calls and NBT batch cache invalidation are covered by live heap/sort tests.
- [x] Make the harness reload/command path return structured errors/log snippets; do not rely on “request succeeded” as semantic proof.
- [x] Add a local/manual command to run only core MC oracle cases (`npm run test:mc-core`).
- [ ] Add CI separation:
  - unit/static always
  - offline integration allowed to skip
  - real Paper oracle explicit/manual or nightly first

Suggested files:

- `src/mc-test/client.ts`
- `src/mc-test/runner.ts`
- `src/testing/runner.ts`
- `src/__tests__/test-framework/runner.test.ts`
- `tests/mc-cases/**`
- GitHub workflow files only after local runner is stable

Verification:

```bash
npm test -- src/__tests__/test-framework/runner.test.ts --runInBand
# Later, with Paper harness online:
npm run test:mc-core
```

---

### Phase 3 — Golden outputs for compiler logic

**Objective:** Pin generated datapack artifacts for representative compiler semantics so refactors are safe.

Golden tests should be small and readable. Start with:

- hello/load function
- scoreboard arithmetic
- if/else lowered through scoreboard comparison
- execute context block
- function helper call
- macro-with-storage
- load/tick tags

Tasks:

- [x] Add a golden test helper that compiles `.mcrs` input and checks normalized command files (`src/__tests__/golden/core-command-golden.test.ts`).
- [x] Normalize volatile details in golden assertions; do not check generated docs or VSCode compiled output.
- [x] Keep snapshots small; prefer one feature per case.
- [x] Add review guidance: if a golden changes, the PR must explain whether the command shape changed intentionally.

Review guidance:

- Golden diffs are command-shape diffs, not formatting noise by default.
- Any PR that updates `src/__tests__/golden/*.test.ts` snapshots should state whether the emitted command shape changed intentionally.
- If the change is intentional, mention the semantic reason and the corresponding live/static oracle that still covers behavior.
- If the change is incidental, prefer tightening normalization or splitting the snapshot before accepting broad churn.

Suggested files:

- new `src/__tests__/golden/` or `tests/golden/`
- `src/__tests__/emit/*.test.ts`

Verification:

```bash
npm test -- src/__tests__/golden --runInBand
```

---

### Phase 3.5 — Stdlib/runtime intrinsic hardening

**Objective:** Keep stdlib behavior green while clarifying which APIs are normal `.mcrs` library code and which APIs are compiler/runtime intrinsics.

Timer is the current priority because it is implemented through MIR lowering special cases and scoreboard resources, not through the apparent `src/stdlib/timer.mcrs` method bodies. Queue is currently lower priority: it is ugly but mostly a stdlib/NBT-array implementation on top of existing array/storage behavior, so track it for later cleanup rather than mixing it into Timer work.

Tasks:

- [x] Track queue cleanup separately; do not mix it into Timer v2:
  - Document current queue behavior as NBT-list + logical head pointer (`docs/plans/queue-runtime-cleanup.md`).
  - Later decide whether the public API needs multi-instance Queue support or only global FIFO helpers.
  - Add more queue tests only if behavior regresses or multi-instance support becomes a goal.
- [x] Timer v2 Phase 1: centralize timer objective/slot naming and command emission helpers in `src/mir/lower.ts`.
- [x] Timer v2 Phase 2: fail fast when a Timer method call cannot be statically tied to a `Timer::new()` allocation.
- [x] Timer v2 Phase 3: mark `src/stdlib/timer.mcrs` as compiler-intrinsic-backed API/stub documentation.
- [x] Timer v2 Phase 4: decide `setTimeout`/`setInterval` dynamic tick semantics explicitly instead of leaving a best-effort fallback.
- [x] Timer v2 Phase 5: run full Timer live oracle and update roadmap state.

Detailed plan: `docs/plans/timer-v2-intrinsic-plan.md`.

Verification:

```bash
npm test -- src/__tests__/mir/lower-extra4.test.ts --runInBand -t 'Timer'
npm test -- src/__tests__/mc-integration/stdlib-coverage-8.test.ts --runInBand --testTimeout=120000
npm run build
npm run validate-mc
MC_OFFLINE=true npm run test:mc-core
git diff --check
```

---

### Phase 4 — Extract compiler orchestration stages

**Objective:** Reduce responsibility concentration in `src/emit/compile.ts` without changing behavior.

Start by extracting pure orchestration helpers with tests around stage outputs. Do not reorganize the whole repo at once.

Target stage functions:

- `parseSource`
- `resolveImports`
- `mergeModules`
- `runTypecheck`
- `lowerToHIRStage`
- `lowerToMIRStage`
- `optimizeMIRStage`
- `lowerToLIRStage`
- `optimizeLIRStage`
- `collectRuntimeMetadata`
- `emitDatapack`
- `validateArtifacts`

Tasks:

- [x] Add first stage result type (`ParseSourceStageResult`) and keep existing `compile()` API stable.
- [x] Extract `parseSourceStage` as the first pure orchestration helper with targeted tests.
- [x] Extract import/preprocess stage first; verify spans/errors do not regress.
  - `preprocessSourceStage` now wraps import/preprocess metadata for compile orchestration and has focused tests for source ranges, library imports, and import diagnostic file/line preservation.
- [x] Extract typecheck/decorator metadata handling next.
  - `runTypecheckStage` now owns TypeChecker invocation, warning collection, lenient type-error warning coercion, and stop-after-check diagnostic bundling; focused tests pin float lint warnings and decorator-error source-file preservation.
- [x] Extract HIR/MIR/LIR lowering and optimization orchestration stages.
  - `lowerToHIRStage` now owns HIR lowering, monomorphization, library prune-path collection, and deprecated-call warnings; `lowerAndOptimizeStages` now owns MIR lowering, inline/no-inline wiring, MIR optimization, keep-in-output library pruning, coroutine transform, LIR lowering, and LIR optimization.
- [x] Extract runtime helper metadata collection out of compile orchestration.
  - `collectRuntimeMetadataStage` now owns decorator-derived runtime helper/tag metadata (`@tick`, `@load`, inline controls, coroutine/schedule/profile/benchmark/throttle/retry/memoize wrappers, legacy event handlers, and generic function tags) with focused tests that do not emit datapack files.
- [x] Extract final runtime LIR post-processing into a dedicated pure helper.
  - Added `finalizeRuntimeLIRStage` to own tick-budget checks, int32 overflow warnings, @singleton helper injection, and memoize/benchmark impl renaming with focused coverage in `compile.test.ts`.
- [x] Extract final emit/prune behavior into `emitDatapackStage`.
  - Added `emitDatapackStage` to own `emit(...)` wiring and library function pruning; compile still returns `{ files, warnings, success }` unchanged.
- [x] Add dump/snapshot support for selected stages after the extraction points exist.
  - `CompileOptions.snapshotStages` plus caller-owned `stageSnapshots` can now collect deterministic summaries for all extracted compile stages (`preprocess`, `parse`, `typecheck`, `lowerToHIR`, `runtimeMetadata`, `lowerAndOptimize`, `finalizeRuntimeLIR`, and `emitDatapack`) without changing `CompileResult` or emitting extra files.

Suggested files:

- `src/emit/compile.ts`
- new `src/pipeline/*.ts` or `src/compile-pipeline/*.ts`
- `src/__tests__/emit/compile*.test.ts`
- `src/__tests__/compile-preprocess.test.ts`

Verification:

```bash
npm run build
npm test -- src/__tests__/emit/compile.test.ts src/__tests__/compile-preprocess.test.ts --runInBand
npm test -- --runInBand
```

---

### Phase 5 — Split large responsibility-heavy modules

**Objective:** Make large files easier to reason about after stage behavior is pinned.

Prioritized splits:

1. `src/typechecker/index.ts`
   - symbol collection
   - expression typing
   - statement typing
   - decorator validation
   - event/builtin-specific checks
2. `src/emit/index.ts`
   - datapack file assembly
   - command rendering
   - tag JSON rendering
   - runtime helper emission
   - function path/name normalization
3. `src/cli.ts`
   - argument parsing
   - command handlers
   - publish/package helpers
   - config loading
4. `src/ast/types.ts`
   - core language AST
   - MC-specific AST nodes
   - decorator/event metadata
   - type nodes

Tasks:

- [x] Start typechecker split by extracting function decorator/event validation into `src/typechecker/decorators.ts` with focused pure-helper tests; `TypeChecker` delegates wrapper decorators and legacy `@on(...)` validation through that seam.
- [x] Finish Phase 5 helper seams with focused tests:
  - `src/typechecker/entities.ts` centralizes entity hierarchy, Minecraft entity-id mapping, selector-context inference, and subtype predicates.
  - `src/emit/paths.ts` centralizes function path/ref normalization and source-map header/source-marker helpers.
  - `src/cli/args.ts` centralizes CLI argument parsing plus namespace/project-name sanitizers.
  - `src/ast/decorators.ts` centralizes decorator names and the `DecoratorName` type consumed by `ast/types.ts`.
- [x] Before each split, add focused tests around the behavior being moved.
- [x] Move one responsibility per PR-sized slice; Phase 5 intentionally stops at low-risk seams instead of deep expression/statement checker moves.
- [x] Preserve public exports or add compatibility re-exports.
- [x] Run full test suite after each split.

Verification:

```bash
npm run build
npm test -- --runInBand
```

---

### Phase 6 — Syntax sugar hardening

**Objective:** Fix sugar and high-level language constructs only after core command semantics are pinned.

Event/runtime boundary note: gameplay decorators such as `@on(PlayerDeath)` should not keep growing as compiler-hardcoded event enums. Prefer generic datapack artifact primitives (`@function_tag("namespace:path")`) plus stdlib/runtime-owned event dispatch; `@function_tag("minecraft:tick")` and `@function_tag("minecraft:load")` merge through the same tag files as `@tick`/`@load`. Legacy `@on` tag ids and executor contexts are centralized in the event registry (`handlerTag`, `executorContext`), so emit no longer carries a separate event-to-tag table and the typechecker narrows `@s` from runtime-dispatch context rather than fake parameters. The old single `player: Player` handler form is now only a compatibility alias to `@s` during command lowering and does not allocate a `$p0` event argument slot. See `docs/plans/event-runtime-boundary.md`.

Focus areas:

- `foreach` lowering over selectors and arrays
- `match` lowering, especially string/enum/Option paths
- `while let Some(...)`
- labeled break/continue
- decorators that generate runtime helpers: `@tick(rate)`, `@throttle`, `@retry`, `@memoize`, `@watch`, `@coroutine`
- f-string/string interpolation into commands
- raw/unsafe command diagnostics

Tasks:

- [x] Add first Paper oracle for selector `foreach` binding context: loop variables used in command-argument positions lower to `@s` inside the helper, and live Paper confirms all selected entities are tagged.
- [x] Add Paper oracle for `while let Some(...)` option-loop sugar, including the regression where `opt = None` inside the loop must update the option struct's `has`/`val` fields so the loop exits.
- [x] Add broader sugar-specific `.mcrs` golden cases (`src/__tests__/fixtures/sugar-golden.mcrs`) for selector `foreach` and `while let Some(...)` command shape.
- [x] Add at least one real Paper oracle case for sugar that affects generated `execute`/`scoreboard` behavior.
- [x] Mark weak/experimental sugar in docs where relevant: gameplay event sugar is bounded by `docs/plans/event-runtime-boundary.md`, and unsupported future event behavior is kept out of compiler-owned enums.
- [x] Prefer lowering tests over surface parser-only tests: Phase 6 now has command-shape golden tests plus Paper coverage for the risky sugar paths.

Verification:

```bash
npm test -- src/__tests__/golden/core-command-golden.test.ts src/__tests__/compiler/option-extensions.test.ts src/__tests__/mc-integration/syntax-coverage.test.ts --runInBand --testTimeout=120000 --forceExit
npm run build
npm run validate-mc
```

Status: Phase 6 is closed for the current hardening pass. Phase 7 (event runtime manifest boundary) is now implemented, and Phase 8 (runtime-asset stage extraction) keeps event-runtime behavior isolated and test-driven.

## Phase 7 — Event runtime manifest boundary

Status: ✅ Implemented in code, with focused tests and runtime asset validation/consumption.

- [x] Add a small manifest seam in `src/events/manifest.ts` with event metadata including `handlerTag`, `executorContext`, and optional `runtimeAssets`.
- [x] Derive `EVENT_TYPES` in `src/events/types.ts` from manifest records via helper functions.
- [x] Preserve existing public event API behavior and decorator/emit behavior through the same `@function_tag`-based artifact mechanism.
- [x] Add event manifest-focused coverage in `src/__tests__/events-manifest.test.ts`.
- [x] Add runtime asset validation helpers: manifest assets must be safe relative paths under `src/stdlib/`, reject traversal/absolute/backslash paths, and can enforce existence via injected predicates.
- [x] Consume runtime asset declarations in `compile(...)`: legacy `@on(...)` decorators auto-include the required stdlib runtime asset (`src/stdlib/events.mcrs`) before typecheck/emit, while deduping shared assets across events.
- [x] Keep new gameplay events constrained to manifest + runtime assets in `src/stdlib/events.mcrs`; do not add compiler-only event enums.

Verification for Phase 7: `npm test -- src/__tests__/events-manifest.test.ts src/__tests__/events-types.test.ts src/__tests__/events-types-extra.test.ts src/__tests__/e2e/events-stdlib.test.ts --runInBand --testTimeout=120000`

Future sugar work should open a new phase/slice with a specific behavior oracle instead of adding more parser-only coverage.

---

## Phase 8 — Runtime asset planner/merge stage extraction

Status: ✅ Implemented in code, with focused coverage and `compile()` wired through the extracted helpers.

- [x] Extract runtime event planning from `compile()` into `planEventRuntimeAssets(program, options)`.
- [x] Add `mergeRuntimeAssetsStage(ast, options)` to resolve runtime asset paths, parse+merge runtime sources, and report event/asset metadata.
- [x] Preserve safe path resolution order (package-owned compiler assets before cwd), with a clear diagnostic if a required runtime asset is missing.
- [x] Update the compile pipeline to consume the extracted stage and preserve behavior.
- [x] Add focused helper coverage for planner determinism, merge behavior, and no-op/no-handler cases.

Verification for Phase 8:

```bash
npm test -- src/__tests__/emit/compile.test.ts src/__tests__/events-manifest.test.ts src/__tests__/e2e/events-stdlib.test.ts --runInBand --testTimeout=120000
```

---

## Phase 9 — Runtime asset compile snapshot coverage

Status: ✅ Implemented in code, with a RED→GREEN snapshot test.

- [x] Extend `CompileStageName` with `runtimeAssets` so selected compile snapshots can include event runtime asset planning/merge.
- [x] Add a deterministic snapshot summary for `mergeRuntimeAssetsStage`: `runtimeEventTypes`, `runtimeAssetPaths`, and warning count.
- [x] Record the `runtimeAssets` snapshot after runtime asset merge and before config/typecheck/lowering, matching the actual pipeline boundary.
- [x] Add focused coverage that `@on(PlayerJoin)` snapshots `['PlayerJoin']` and `['src/stdlib/events.mcrs']` without changing compile output shape.

Verification for Phase 9:

```bash
npm test -- src/__tests__/emit/compile.test.ts --runInBand -t "runtime asset merge stage"
```

---

## Phase 10 — CLI compile stage snapshot export

Status: ✅ Implemented in code, with CLI-level coverage.

- [x] Expose selected compile stage snapshots through `redscript compile --snapshot-stages <stages|all> --snapshot-output <path>`.
- [x] Keep snapshots opt-in and file-backed so normal human compile output remains stable.
- [x] Validate snapshot stage names before compiling, with a clear error listing valid stages.
- [x] Add CLI coverage proving selected snapshots include runtime asset and emit summaries for an `@on(PlayerJoin)` program.

Verification for Phase 10:

```bash
npm test -- src/__tests__/cli.test.ts src/__tests__/cli/args.test.ts --runInBand -t "stage snapshots|arg helpers"
```

---

## Phase 11 — Numeric scale and precision policy hardening

Status: ✅ Complete. Phase 11 establishes the numeric policy baseline: mixed numeric arithmetic fails loudly, language `fixed` remains ×10000 and is test-pinned through lowering, stdlib scale families are documented without forced migration, legacy ×1000 helpers have explicit aliases, and double helper precision tiers are recorded.

Context from the numeric audit:

| Area | Current representation | Notes |
|---|---:|---|
| Compiler `fixed` / decimal literals | ×10000 | Lowering stores decimal literals as `Math.round(value * 10000)`; fixed casts use `0.0001` / `10000.0`. |
| `double` | NBT-backed Java double | Arithmetic is helper-specific: add/div use entity tricks, mul uses the macro-scale double path, casts round-trip through ×10000 when converted to scoreboards. |
| `src/stdlib/math.mcrs` legacy fixed helpers | ×1000 | `sqrt_fixed`, `sin_fixed`, `cos_fixed`, `lerp` document/use ×1000-era conventions. |
| `src/stdlib/math_hp.mcrs` | mostly ×10000 | High-precision trig/div/log helpers document ×10000; some helpers rely on entity rotation/SVD tricks. |
| `src/stdlib/signal.mcrs` | mostly ×10000 | Probability/statistics/DFT helpers use explicit `_fx`-style integer scale conventions. |
| `src/stdlib/geometry.mcrs` | mixed ×100 / ×10000 | Coordinates and angles intentionally trade precision against overflow risk; do not blindly migrate. |

Design constraints:

- Minecraft scoreboard values are signed int32; every extra decimal digit materially increases overflow risk.
- ×100, ×1000, and ×10000 each have valid gameplay/use-case tradeoffs. The goal is **not** to force one global scale everywhere.
- `fixed` as a language type must have a single, well-documented representation, but stdlib APIs may expose scale-specific integer helper families when that is clearer and safer.
- `double` should remain a separate NBT-backed type; do not promise full IEEE semantics for every operation unless the helper path actually provides it.
- Precision-sensitive stdlib helpers should make scale explicit in names/docs when they are not operating on language `fixed` directly.

Numeric conversion DX policy:

- Do **not** use C-style casts such as `(fx3)a` as the primary surface. They are compact but hide rounding/overflow semantics and make grep/LSP/code actions harder.
- Prefer explicit postfix conversions with visible target and policy, starting with existing `expr as fixed` / `expr as int` / `expr as double`; future scale-specific forms should make rounding explicit, e.g. `expr as fx3 round`, `expr as fx3 trunc`, or stdlib helpers named around the scale/policy.
- Allow target/contextual typing only where the target is already syntactically declared (`let x: fx3 = 1.2`, function args, returns, struct fields, array literals). Context can choose literal representation, but must not silently convert arbitrary runtime expressions across numeric families.
- For dense math blocks, consider a future opt-in block annotation such as `numeric fx4 { ... }` only as syntax sugar over explicit target typing/checking. It should reject ambiguous mixed-scale expressions instead of inserting hidden conversions.
- First implementation slice remains conservative: reject unsafe mixed numeric binary expressions; add ergonomic conversion helpers later once the failure mode is safe and documented.

Planned tasks:

- [x] Add failing typechecker tests for numeric binary mismatches:
  - `fixed + int`, `int + fixed`, `double + fixed`, `fixed + double`, `double + int`, and `int + double` should require explicit casts.
  - Preserve valid same-family operations: `int + int`, `fixed + fixed`, `double + double`, and `float`/`fixed` compatibility while `float` remains a deprecated alias.
- [x] Fix `checkExpr(binary)` to reject mixed numeric families before lowering, preventing silent wrong scoreboard math such as `1.5 + 2 -> 15002`.
- [x] Add lowering/golden tests that pin language `fixed` arithmetic scale:
  - decimal literal lowering (`1.5 -> 15000`),
  - `fixed * fixed` correction (`/ 10000`),
  - `fixed / fixed` correction (`* 10000` before divide),
  - explicit `as int`, `as fixed`, and `as double` conversions.
- [x] Write a numeric scale policy document, likely `docs/plans/numeric-scale-policy.md`, that separates:
  - language-level `fixed`,
  - NBT-backed `double`,
  - scale-specific stdlib integer helper APIs (`*_fx`, `*_hp`, or explicit suffixes),
  - overflow envelopes and recommended ranges.
- [x] Audit stdlib docs/comments for scale labels without changing semantics first:
  - `src/stdlib/math.mcrs` ×1000 helpers,
  - `src/stdlib/math_hp.mcrs` ×10000 helpers,
  - `src/stdlib/signal.mcrs` ×10000 helpers,
  - `src/stdlib/geometry.mcrs` ×100 / ×10000 split.
- [x] Decide naming/deprecation strategy for legacy ×1000 helpers:
  - keep old names as compatibility wrappers,
  - introduce explicit additive aliases such as `sqrt_fx1000`, `sin_fx1000`, `cos_fx1000`, `lerp_t1000`, `mul_fx1000`, `div_fx1000`, `smoothstep_t1000`, and `smootherstep_t1000` for new code/docs.
- [x] Keep compiler `fixed` at ×10000 for this policy baseline:
  - changing it would be a major semantic migration with broad golden/runtime tests,
  - no opportunistic scale migration is planned for Phase 11.
- [x] Document double helper precision tiers:
  - `double_add` and `double_div` are NBT/entity-backed high-precision paths,
  - `double_sub` includes a ×10000 negation round-trip,
  - `double_mul` uses the macro-scale double path and avoids the old int32 scoreboard product,
  - `double_mul_fixed` uses a macro scale trick and has different precision/overflow characteristics.

Verification for Phase 11 slices:

```bash
npm test -- src/__tests__/typechecker.test.ts src/__tests__/typechecker/**/*.test.ts src/__tests__/double.test.ts src/__tests__/mir/lower-extra*.test.ts --runInBand
npm run build
npm run validate-mc
npm test -- --runInBand
npm run docs:check
```

---

## Phase 12 — Helper-level numeric tuner infrastructure

Status: Complete. Phase 12 keeps language `fixed` frozen at ×10000 and focuses on reviewable helper-level tuning for stdlib numeric approximations. The first production target is an explicit `sqrt_fx10000` helper generated/reviewed through the tuner path, not a migration of legacy `sqrt_fixed` / `sqrt_fx1000` behavior.

Design boundary:

- The tuner may optimize coefficients, thresholds, iteration counts, lookup-table contents, or approximation variants for a named helper adapter.
- The tuner must not introduce a compiler option that changes language `fixed` scale or ABI.
- Generated code is a review artifact: `.mcrs` overlay/function output with an `AUTO-GENERATED by redscript tune` header, metrics, adapter name, budget, and regeneration command. A `.tune.json` sidecar records the machine-readable contract when `--manifest-out` is provided.
- Checked-in stdlib changes should still go through normal review, tests, and docs. `redscript tune --out ...` should not silently mutate `src/stdlib/*.mcrs`.
- Adapters should simulate Minecraft scoreboard int32 behavior when the generated helper uses scoreboard math.
- Stdlib gets pre-tuned, reviewed, checked-in helper implementations. Users can use `redscript tune` to generate their own overlay helpers and manifests, but compilation does not auto-tune or rewrite user code.
- Standard-library numeric helpers should be tested on the stdlib ladder:
  1. compile/unit coverage for importability, public names, and generated code shape,
  2. offline/golden checks for scale/overflow-sensitive command shape where useful,
  3. small Paper oracle samples for production-grade helper behavior.

Current baseline:

- `src/tuner/*` already contains a search engine, MC int32 simulator, metrics, and existing `ln-polynomial` / `sqrt-newton` adapters.
- Initial Phase 12 slice exposes that existing infrastructure through the main `redscript tune` CLI, preserving standalone `src/tuner/cli.ts` usage.

Planned tasks:

- [x] Wire existing tuner infrastructure into the main CLI as `redscript tune --adapter <name> [--budget N] [--strategy nm|sa] [--out path]`.
- [x] Add a stable metadata sidecar or machine-readable manifest for generated tuner artifacts.
- [x] Audit current adapters against Phase 11 scale policy:
  - `ln-polynomial` is a ×10000 integer helper and should remain helper-level.
  - `sqrt-newton` should not be confused with legacy `sqrt_fixed` ×1000.
- [x] Decide the first production-grade tuning target before changing stdlib code: explicit `sqrt_fx10000`.
- [x] Add an overflow/range report to tuner manifests, sourced from adapter simulation over declared samples/range.
- [x] Add `sqrt_fx10000` as a reviewed stdlib helper without changing legacy `sqrt_fixed` / `sqrt_fx1000` semantics.
- [x] Add runtime/golden tests for `sqrt_fx10000` before treating it as a production tuned helper.

Verification for Phase 12 slices:

```bash
npm test -- src/__tests__/tuner src/__tests__/cli.test.ts --runInBand
npm run build
npm run validate-mc
npm test -- --runInBand
```

---

## Decision rules for future agents

- Prefer test/oracle hardening before broad refactors.
- Prefer compiler-semantics commands (`execute`, `scoreboard`, `function`, macro/storage) before MC visual/world side effects.
- Do not count offline integration skips as real Paper validation.
- Do not commit generated docs or `redscript-docs/`; docs are generated from code into the separate docs repo.
- Do not commit VSCode compiled output unless the task is specifically extension packaging/release.
- If touching `src/emit/compile.ts`, explain which stage boundary is being clarified.
- If touching syntax sugar, add tests at the lowering/codegen level, not just parser tests.
- If touching numeric code, do not blindly normalize ×100/×1000/×10000 scales. First state the target representation, overflow envelope, affected stdlib APIs, and explicit cast/typechecker behavior.

---

## Phase 13 — `double_mul` precision/overflow audit

Status: Complete for the macro-scale tier. Phase 13 replaces the old `double_mul` int32 scoreboard product with the shared macro-scale path used by `double_mul_fixed`, while keeping language-level `fixed` frozen at ×10000. Live Paper oracle coverage now pins a fractional representative case and a larger-value case that would have overflowed the old product; a future true IEEE multiplication helper remains a separate design question.

Scope:

- [x] Add RED coverage proving `double_mul` no longer emits `$dmul_a *= $dmul_b` scoreboard multiplication.
- [x] Route `double_mul(a, b)` through `__dmul_apply_scale` by reading `b` through a ×10000 score into a macro-safe scale argument.
- [x] Update stdlib and numeric policy docs to describe the macro-scale tier, `b` rounding/envelope, and NaN/Infinity non-goal.
- [x] Add a Paper runtime oracle for representative `double_mul` values and a larger-value regression that would have overflowed the old scoreboard product.
- [ ] Decide whether a future true IEEE multiplication path needs a separate helper or can replace this macro tier after live validation.

Verification for the first Phase 13 slice:

```bash
npm test -- src/__tests__/double.test.ts --runInBand -t "double_mul uses macro-scale"
npm test -- src/__tests__/double.test.ts --runInBand
npm run build
npm run validate-mc
npm test -- --runInBand
```

---

## Short next slice recommendation

Continue Phase 13 by adding Paper/runtime oracle coverage for `double_mul` rather than changing language-level numeric scale. If improving DX instead, design explicit conversion helpers or scale-specific syntax (`as fx3 round/trunc`, target typing, or `numeric fx4 { ... }`) with RED parser/typechecker tests first.

This keeps compiler-owned numeric behavior safe while acknowledging that Minecraft precision and int32 overflow tradeoffs require multiple explicit scale families.
