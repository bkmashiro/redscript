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
- [ ] Replace “accept all `$...` macro lines” with lightweight macro-template validation:
  - Strip leading `$`.
  - Replace `$(name)` placeholders with safe placeholder literals for the command type.
  - Validate the resulting root command path where possible.
  - Keep unsupported templates as warning/diagnostic, not silent pass.
- [ ] Add static tests for generated `execute + scoreboard` combinations from small `.mcrs` programs.
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
  - Initial `src/__tests__/mc-core.test.ts` oracle now covers scoreboard arithmetic, execute/if-score branching, function helper calls, macro `function ... with storage`, and load/tick lifecycle via `npm run test:mc-core`.
  - Future work: split inline cases into descriptor files if the suite grows.
- [x] Use the live Paper oracle to catch and fix known core semantic bugs before extracting the runner:
  - LICM no longer hoists mutable MC state reads (`score_read`, NBT reads, list length).
  - `is_check` lowers to real selector type predicates.
  - array-param stdlib calls and NBT batch cache invalidation are covered by live heap/sort tests.
- [ ] Make the harness reload/command path return structured errors/log snippets; do not rely on “request succeeded” as semantic proof.
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

- [ ] Add a golden test helper that compiles `.mcrs` input and snapshots normalized files.
- [ ] Normalize volatile details in snapshots if necessary; do not snapshot generated docs or VSCode compiled output.
- [ ] Keep snapshots small; prefer one feature per case.
- [ ] Add review guidance: if a golden changes, the PR must explain whether the command shape changed intentionally.

Suggested files:

- new `src/__tests__/golden/` or `tests/golden/`
- `src/__tests__/emit/*.test.ts`

Verification:

```bash
npm test -- src/__tests__/golden --runInBand
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

- [ ] Add stage result types and keep existing `compile()` API stable.
- [ ] Extract import/preprocess stage first; verify spans/errors do not regress.
- [ ] Extract typecheck/decorator metadata handling next.
- [ ] Extract runtime helper metadata collection out of compile orchestration.
- [ ] Add dump/snapshot support for selected stages after the extraction points exist.

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

- [ ] Before each split, add focused tests around the behavior being moved.
- [ ] Move one responsibility per PR.
- [ ] Preserve public exports or add compatibility re-exports.
- [ ] Run full test suite after each split.

Verification:

```bash
npm run build
npm test -- --runInBand
```

---

### Phase 6 — Syntax sugar hardening

**Objective:** Fix sugar and high-level language constructs only after core command semantics are pinned.

Focus areas:

- `foreach` lowering over selectors and arrays
- `match` lowering, especially string/enum/Option paths
- `while let Some(...)`
- labeled break/continue
- decorators that generate runtime helpers: `@tick(rate)`, `@throttle`, `@retry`, `@memoize`, `@watch`, `@coroutine`
- f-string/string interpolation into commands
- raw/unsafe command diagnostics

Tasks:

- [ ] Add sugar-specific `.mcrs` golden cases.
- [ ] Add at least one real Paper oracle case for sugar that affects generated `execute`/`scoreboard` behavior.
- [ ] Mark weak/experimental sugar in docs if it cannot be fully verified yet.
- [ ] Prefer lowering tests over surface parser-only tests.

Verification:

```bash
npm test -- src/__tests__/hir src/__tests__/mir src/__tests__/e2e --runInBand
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

---

## Short next slice recommendation

The next implementation slice should be:

1. Add an artifact validator MVP for function/tag references and path legality.
2. Wire it into a focused test, not the default compile path yet.
3. Add two small generated datapack cases:
   - normal function call/reference resolves
   - broken/missing reference fails validator
4. Then decide whether to run validator by default or behind a CLI/check flag.

This is lower-risk than starting with a typechecker split, and it supports later refactors by catching generated artifact regressions.
