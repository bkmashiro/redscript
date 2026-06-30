# RedScript Autonomous Mega-Goal

> **For Hermes:** This is the long-running `/goal` handoff. Read this file fully, then execute it without stopping after one slice. The user is explicitly allocating a long budget (up to 20 rounds × 150 iterations/round) and permits Spark/Codex-Spark for bounded implementation workers, but low-return/high-risk work is intentionally excluded.

**Goal:** Turn RedScript from a well-tested experimental compiler/toolchain into a more product-ready compiler by closing visible language/example gaps, making stdlib coverage auditable, expanding high-value live MC oracle coverage, and continuing only safe typed optimizer work.

**Architecture:** Preserve the existing production path: Source → AST → TypeCheck → HIR → MIR → Optimizer → LIR → Emit datapack. Add tests, coverage manifests, diagnostics, small compiler fixes, and typed-only optimizer improvements around that path. Do not rewrite the compiler or replace project-owned TypeScript optimizer infrastructure with a new IR/toolchain.

**Tech Stack:** TypeScript, Jest, RedScript `.mcrs`, existing LIR/optimizer infrastructure, `MCRuntime`, MC static validator, optional Paper/TestHarness at `localhost:25561`, GitHub Actions, optional Spark/Codex-Spark workers for bounded slices.

---

## User Intent

Yuzhe wants a long autonomous goal that can keep progressing without repeated “继续” prompts. The run should use Spark where useful, but must avoid wasting budget on low-return/high-risk work. The target is practical project maturity: fewer skipped examples, clearer coverage, stronger semantic smoke, and safe optimizer gains only when evidence supports them.

## Repository and Source of Truth

- Project path: `/Users/yuzhe/projects/redscript`
- Git branch/source of truth: `main`
- Project guidance: `AGENTS.md`
- Package/gates: `package.json`
- Current optimizer plan index: `docs/plans/mc-mechanism-optimization/README.md`
- Recently completed optimizer boundary roadmap: `docs/plans/mc-mechanism-optimization/36-typed-boundary-and-diagnostic-roadmap.md`
- Compile-all smoke: `src/__tests__/compile-all.test.ts`
- Core live MC oracle: `src/__tests__/mc-core.test.ts`, `tests/mc-cases/core-oracle-cases.ts`, `tests/mc-cases/core-oracle.mcrs`
- Stdlib modules: `src/stdlib/*.mcrs`
- Stdlib tests: `src/__tests__/stdlib/*.test.ts`, `src/__tests__/e2e/stdlib-e2e.test.ts`, `src/__tests__/mc-integration/stdlib-coverage*.test.ts`
- Optimizer/LIR tests: `src/__tests__/optimizer/lir/*.test.ts`, `src/__tests__/arithmetic-probes.test.ts`

## Non-Negotiable Boundaries

- Do not rewrite the compiler or change the main pipeline architecture.
- Do not default-enable local-copy/RMW. It remains manual experimental opt-in unless a future ADR with stronger gates says otherwise.
- Do not parse arbitrary raw/macro command text as semantic proof. Raw/macro text remains opaque; string extraction is only a conservative debug/safety hint.
- Do not weaken `verifyLIR` strictness.
- Do not attempt broad ABI/call-convention cleanup in this mega-goal. `$ret`, `$ret_*`, and `$pN` stay protected unless a separate ADR and full negative fixture suite is created later.
- Do not spend time on low-return/high-risk tracks: VIR/new IR redesign, MLIR/Cranelift/Binaryen integration, default optimizer enablement, full Paper proof for every stdlib function, visual/gameplay example redesigns, or broad LSP/package/editor churn.
- Do not commit generated VSCode/package artifacts unless the slice explicitly targets packaging/release.
- Do not hide live-oracle skips as success. Offline/static gates are useful but not Paper semantic proof.
- Use signed commits for every verified coherent slice. Prefer local-first cadence: commit each slice locally, batch pushes occasionally after several verified commits or before stopping, and do not wait on slow CI unless a workflow/product decision specifically requires it.
- Preserve uncommitted work: start every slice with `git status -sb`.

## Current State Discovered

Verified on 2026-06-30:

- Latest pushed commit for this mega-goal is `dbb0d97` (`docs: add typed optimizer opportunity report`), pushed to `main`.
- Recent CI run for `dbb0d97` was triggered after the batched push; CI may still be slow and should be queried once rather than watched unless explicitly needed.
- Local verified slices already landed: coverage matrix/skip manifest, stale skip reduction, bounded struct-return local tracking, live-oracle candidate map, and typed optimizer opportunity report.
- Latest known live oracle baseline: `MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live` passed 1 suite / 19 tests against live Paper/TestHarness on 2026-06-30.
- Stdlib:
  - 51 modules under `src/stdlib/*.mcrs`.
  - Coverage matrix and candidate map now exist: `docs/plans/redscript-coverage-matrix.json`, `docs/plans/redscript-coverage-matrix.md`, `docs/plans/redscript-live-oracle-candidate-map.md`.
- Known active gaps after latest slices:
  - Remaining compile-all skips are now represented in `src/__tests__/helpers/compile-all-skip-manifest.ts` with structured reason/nextAction fields.
  - Several old stale skips were removed after direct CLI proof; do not re-add them unless a fresh regression is reproduced.
  - `pvp_arena.mcrs` and `showcase_game.mcrs` advanced past the old unresolved `state` failure and now fail on narrower `tagName`/`lane` paths.
  - `capture_the_flag.mcrs` still reaches unresolved `winner`; `tutorial_07_random.mcrs` still reaches unresolved `item`; template skips include external-objective verifier/design issues.
  - Track E report concluded that no new optimizer peephole should be implemented until there is a bounded typed-local RED equivalence candidate; local-copy/RMW remains manual experimental opt-in only.

## Desired Future State

### Product / User-facing

- Most shipped examples/tutorials compile in `compile-all`; any remaining skip has a clear manifest entry with reason, owner, and safest next action.
- Language features used by examples are either implemented and tested or rejected with clear diagnostics, not silent stubs or broad skip comments.
- High-risk stdlib behavior has targeted live MC semantic smoke where it matters.

### Architecture / Compiler

- Source → AST → TypeCheck → HIR → MIR → Optimizer → LIR → Emit remains intact.
- Known MIR stubs around struct field access/assignment are either implemented for the common static cases or converted into explicit diagnostics and documented as unsupported.
- `compile-all` becomes a product-readiness gate with an auditable skip manifest rather than a hard-coded unexplained list.

### Coverage / Gates

- A generated or maintained coverage matrix maps language features and stdlib modules to proof levels:
  - parser/typechecker
  - MIR/LIR/emit
  - compile-all/static MC
  - MCRuntime semantic
  - Paper/TestHarness live
  - known blocker/skip reason
- Adding a stdlib module or feature without a coverage entry should be detectable by a cheap test/script.
- Live Paper gates remain optional/manual or focused, not mandatory on every push unless already configured.

### Optimizer

- Optimizer work continues only where typed, local, and measurable.
- Safe candidates: diagnostic residual reports, typed peepholes, compiler-temp dead writes/lifetime cleanup.
- Local-copy/RMW remains opt-in; default enablement is out of scope.

## Explicitly Out of Scope for This Mega-Goal

These are excluded because they are low-return/high-risk for the allocated autonomous budget:

- New VIR/new IR architecture or wholesale optimizer redesign.
- MLIR/Cranelift/Binaryen/regalloc/egg/Z3 as production dependencies.
- Default enabling local-copy/RMW.
- ABI/call convention cleanup beyond fixtures/diagnostics.
- Full Paper semantic proof for every stdlib function.
- Large visual/gameplay rewrite of examples just to make demos nicer.
- Broad LSP/editor/package workflow refactors unrelated to compiler maturity.
- Chasing every TODO/FIXME; only actionable compiler/product gaps count.

## Stop Conditions

Continue automatically after each verified slice. Stop only when:

1. all executable work in this roadmap is done;
2. a product/resource/permission decision is required;
3. gates repeatedly fail in a way that needs human choice after at least two realistic fix attempts;
4. continuing would require an unsafe broad rewrite or an excluded low-return/high-risk track;
5. Spark/Codex worker output clearly touched forbidden scope and cannot be safely salvaged;
6. a live Paper/TestHarness endpoint is required for the current slice and is unavailable, and there is no useful offline/static fallback.

If blocked, report:

- blocker and evidence;
- modified files;
- tests/gates run and outputs;
- `git status -sb`;
- safest next step.

## Global Gates

Run relevant focused gates per slice. Before each commit, at minimum:

```bash
git diff --check
npm run build
```

For compiler/language changes, also run targeted tests plus:

```bash
npm test -- --selectProjects unit --runTestsByPath <touched-test-files> --runInBand
npm run validate-mc
```

For broad language/std/e2e changes, run:

```bash
npm test -- --selectProjects unit --runInBand
npm run validate-mc
```

For optimizer/LIR changes, run:

```bash
npm run test:lir
npm run test:probe
npm run gate:lir-local-copy -- --output /tmp/redscript-megagoal-lir-local-copy.json
npm run build
git diff --check
```

For live MC smoke when endpoint is confirmed online:

```bash
curl -fsS --max-time 2 http://localhost:25561/status
MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live
```

Do not run full `docs:check` unless documentation generation/reference docs are touched.

## Spark / Budget Execution Rules

The user permits Spark. Use it as implementation hands, not final authority.

- Prefer Spark for bounded code/test/doc slices with explicit allowed files, forbidden scope, and commands.
- Controller must inspect diff and run gates before accepting.
- Do not dispatch parallel Spark workers touching overlapping files.
- If a Spark worker stalls or returns partial diff, salvage only after controller review; report that the final result is controller-verified.
- Suggested cadence: one coherent Spark tranche per track/slice, then controller review/gate/local commit before the next tranche. Batch pushes occasionally; after pushing, query CI once but do not wait/watch slow CI by default.
- The 20 × 150 budget is permission to continue deeply, not permission to do excluded broad rewrites.

Suggested Spark worker prompt shape:

```text
You are the Spark implementation worker for RedScript.
Repo: /Users/yuzhe/projects/redscript
Read docs/plans/2026-06-30-redscript-autonomous-megagoal.md and implement only Track <X> Slice <Y>.
Allowed files: <list>
Forbidden: compiler rewrite, default local-copy/RMW enablement, raw/macro semantic parser, unrelated LSP/editor/package churn, commits/pushes.
Run: <focused commands>
Return: changed files, exact summary, commands/results, blockers.
Do not commit or push.
```

## Long-Run Loop / Bounded Rediscovery

This roadmap should consume a large plan budget by repeatedly finding and executing **high-value bounded work**, not by attempting broad risky rewrites.

After each verified slice and local signed commit:

1. Re-read `git status -sb` and the updated roadmap.
2. Pick the highest-value remaining executable item, preferring this order unless fresh evidence says otherwise:
   1. compile-all skip reduction and stale skip deletion;
   2. clearer diagnostics for remaining unsupported language/example gaps;
   3. coverage matrix and stdlib proof-level hardening;
   4. deterministic MCRuntime/Paper semantic smoke for high-risk stdlib only;
   5. report-first typed optimizer opportunities, with implementation only after a bounded RED equivalence candidate exists.
3. If the visible queue appears exhausted, perform bounded rediscovery before stopping:
   - inspect `src/__tests__/helpers/compile-all-skip-manifest.ts`;
   - run or sample direct CLI compile probes for skipped `.mcrs` files;
   - search active TODO/FIXME only in touched compiler/test areas;
   - compare `docs/plans/redscript-coverage-matrix.json` against `src/stdlib/*.mcrs` and relevant tests;
   - inspect stale roadmap claims and examples that are not compiled.
4. Add any newly discovered high-value bounded findings back to this roadmap before implementing them.
5. Do not let rediscovery expand into excluded work. If the only remaining path needs a compiler rewrite, new IR, raw/macro semantic parser, default optimizer enablement, or broad ABI cleanup, mark it blocked/deferred and stop.

## Autonomous Execution Queue

### Track A — Coverage Matrix and Skip Manifest

**Product promise:** The project can answer which language features and stdlib modules are covered at which proof level, and every compile-all skip has a clear reason.

**Primary files to inspect:**

- `src/__tests__/compile-all.test.ts`
- `src/stdlib/*.mcrs`
- `src/__tests__/stdlib/*.test.ts`
- `src/__tests__/e2e/stdlib-e2e.test.ts`
- `src/__tests__/mc-integration/stdlib-coverage*.test.ts`
- `package.json`

**Current gap:** Stdlib modules all have some coverage, but there is no maintained proof-level matrix. Compile-all skips are hard-coded strings with comments, not an auditable manifest.

**Desired end state:** A checked-in coverage matrix plus a small manifest/test that prevents adding modules/skips silently.

**Executable slices:**

- [x] A1. Create `docs/plans/redscript-coverage-matrix.md` listing all 51 stdlib modules and major language features with current proof level.
- [x] A2. Move compile-all skip data into a typed manifest/helper or at least a structured table in `src/__tests__/compile-all.test.ts`, preserving current behavior first.
- [x] A3. Add a cheap test that every `src/stdlib/*.mcrs` module is represented in the matrix or a machine-readable coverage manifest.
- [x] A4. Add a completion log entry here with gate outputs and commit hash.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/compile-all.test.ts --runInBand
npm run build
git diff --check
```

**Do not:** claim Paper proof for a module unless a live test actually ran.

### Track B — Compile-All Skip Reduction

**Product promise:** Shipped examples/tutorials become real compile-smoke assets rather than hidden broken examples.

**Primary files to inspect:**

- `src/__tests__/compile-all.test.ts`
- skipped `.mcrs` files named in its skip list
- `src/mir/lower.ts`
- parser/typechecker/HIR/MIR tests relevant to the skipped pattern

**Current gap:** The skip list names unsupported patterns: `foreach + module-level const`, array-return-call patterns, and multiple examples with array-passing-to-array-returning-fn issues.

**Desired end state:** The skip list shrinks materially. Remaining skips have manifest entries and are either blocked by a real design decision or out of scope.

**Executable slices:**

- [x] B1. Reproduce one skipped file failure directly with CLI/build output and add a focused RED test for the smallest language pattern.
- [x] B2. Fix `interactions.mcrs` / `foreach + module-level const` if it is a bounded MIR/typecheck/import issue; otherwise convert to clear diagnostic and mark blocked.
- [ ] B3. Fix the smallest array-return-call pattern blocking `src/templates/` or one example, with RED/GREEN tests.
- [x] B4. Remove fixed files from compile-all skip manifest and prove compile-all still passes.
- [ ] B5. Repeat for high-value tutorial/example skips until remaining items require broad language design.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/compile-all.test.ts <new-focused-test> --runInBand
npm run build
npm run validate-mc
git diff --check
```

**Do not:** rewrite examples to avoid real compiler bugs unless the example is genuinely invalid or low-value. Do not redesign arrays broadly without a failing minimal test and bounded plan.

### Track C — Struct Field Access / Assignment Closure

**Product promise:** Struct field access/assignment is no longer a silent MIR stub for common static cases, or unsupported cases fail clearly.

**Primary files to inspect:**

- `src/mir/lower.ts`
- `src/__tests__/e2e/migrate.test.ts`
- `src/__tests__/compiler/struct-extends.test.ts`
- `src/__tests__/typechecker*.test.ts`
- parser/AST/HIR struct-related files as needed

**Current gap:** Tests contain TODOs stating struct field access/assignment is stubbed at MIR level and struct impl methods depend on that stubbed capability. Audit result from this run: simple static struct literals, field reads, and field writes already had MIR support through `FnContext.structVars`; the bounded missing path was returning a local struct variable via `return state` and then assigning an unannotated local from a struct-returning regular function (`let state = snapshot_fighter()`). That path lost struct tracking because return fields were not copied to `__rf_<field>` slots and unannotated call results were not registered in `structVars`. Remaining example failures after the bounded fix are not the original `state` failures: `pvp_arena.mcrs` now reaches unresolved `tagName`, `showcase_game.mcrs` now reaches unresolved `lane`, `capture_the_flag.mcrs` still reaches unresolved `winner`, and several skips are external-objective verifier/design issues.

**Desired end state:** Static struct field read/write and impl-method access either work through compile/emit tests or produce explicit diagnostics for unsupported dynamic cases.

**Executable slices:**

- [x] C1. Add a focused audit note to this roadmap identifying the exact AST/HIR/MIR representation and current stub path.
- [x] C2. Write RED tests for simple struct field read and write through compile output or runtime where feasible.
- [x] C3. Implement minimal static-field lowering if bounded.
- [ ] C4. Add negative tests for unsupported dynamic paths with clear diagnostic text.
- [ ] C5. Re-enable any migration/e2e tests that were only blocked by the stub.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/e2e/migrate.test.ts src/__tests__/compiler/struct-extends.test.ts <new-tests> --runInBand
npm run build
npm run validate-mc
git diff --check
```

**Do not:** introduce heap/object-model redesign, dynamic references, or broad data-layout rewrite. If static struct lowering is not bounded, mark this track blocked with evidence.

### Track D — High-Value Paper/TestHarness Stdlib Smoke

**Product promise:** The stdlib functions that depend on real Minecraft semantics get focused live smoke tests, while pure math/string helpers stay on cheaper MCRuntime/unit gates.

**Primary files to inspect:**

- `src/__tests__/mc-core.test.ts`
- `src/__tests__/mc-integration/stdlib-coverage*.test.ts`
- `src/mc-test/client.ts`
- `src/mc-test/case-runner.ts`
- high-risk stdlib modules: `events`, `timer`, `scheduler`, `bossbar`, `inventory`, `world`, `spawn`, `mobs`, `particles`, `interactions`, storage/NBT helpers

**Current gap:** Live core oracle exists and passed, but high-risk stdlib live coverage is not summarized or systematically selected.

**Desired end state:** A small focused set of high-value live cases covers real-MC-only stdlib boundaries without making every push depend on Paper.

**Executable slices:**

- [x] D1. Use Track A matrix to pick 3–5 high-risk stdlib APIs lacking live proof.
- [x] D2. Add or extend descriptor-driven live cases where possible.
- [x] D3. Keep live tests skippable unless `MC_CORE_REQUIRE_ONLINE=true` or the relevant live env is set.
- [x] D4. When `localhost:25561` is online, run live smoke and record exact evidence in the matrix.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath <new-live-test-or-core-test> --runInBand
curl -fsS --max-time 2 http://localhost:25561/status && MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live
npm run build
git diff --check
```

**Do not:** require live Paper on normal CI unless an explicit workflow decision is made. Do not attempt live proof for every pure helper.

### Track E — Safe Typed Optimizer Improvements

**Product promise:** Continue optimizer gains only in typed, local, measurable places with no change to risky defaults.

**Primary files to inspect:**

- `src/optimizer/lir/*`
- `src/__tests__/optimizer/lir/*.test.ts`
- `benchmarks/arithmetic-probes.ts`
- `scripts/check-lir-local-copy-gate.ts`
- `docs/plans/mc-mechanism-optimization/36-typed-boundary-and-diagnostic-roadmap.md`

**Current gap:** The diagnostic sidecar and evidence gate now exist; local-copy/RMW still stays manual. There may be low-risk typed peepholes/dead-temp improvements left.

**Desired end state:** A small number of safe typed optimizer improvements land with equivalence tests and benchmark/evidence output, or a clear diagnostic report says the remaining gains need broader pass design and are out of scope.

**Executable slices:**

- [x] E1. Add a residual optimizer opportunity report using `deriveBoundarySidecar()` labels if the existing gate does not already expose enough actionable buckets.
- [ ] E2. Pick one typed-only peephole with obvious local semantics, e.g. adjacent overwrite or self-copy no-op, only if existing tests show a gap.
- [ ] E3. Add RED equivalence/interpreter tests before implementing.
- [x] E4. Run local-copy evidence gate and record command/score-copy deltas.
- [x] E5. If candidate requires non-local dataflow, mark blocked/deferred rather than implementing.

**Gates:**

```bash
npm run test:lir
npm run test:probe
npm run gate:lir-local-copy -- --output /tmp/redscript-megagoal-lir-local-copy.json
npm run build
git diff --check
```

**Do not:** default-enable local-copy/RMW, alter `$ret/$pN` ABI cleanup, parse raw/macro text as proof, or introduce a new IR.

### Track F — CI / Gate Hygiene for Product Readiness

**Product promise:** The project’s gates communicate maturity and blockers clearly without making ordinary pushes flaky or too expensive.

**Primary files to inspect:**

- `.github/workflows/*`
- `package.json`
- `src/__tests__/compile-all.test.ts`
- any new coverage matrix/manifest files from Track A

**Current gap:** CI is green and includes build/unit/static/local-copy evidence. Live Paper is manual/local. Coverage/skip information is not yet a first-class gate.

**Desired end state:** Cheap CI catches missing coverage metadata and compile-all regressions; expensive live gates stay explicit/manual.

**Executable slices:**

- [ ] F1. Add a cheap coverage/skip manifest check to unit tests if Track A produced one.
- [ ] F2. Ensure CI logs stay concise; avoid dumping huge benchmark JSON.
- [ ] F3. If adding workflow changes, use current official action versions and verify with one CI run.

**Gates:**

```bash
npm run build
npm test -- --selectProjects unit --runTestsByPath <new-manifest-test> --runInBand
npm run validate-mc
git diff --check
```

**Do not:** add live Paper to default push CI without explicit approval. Do not add heavyweight benchmark matrices to every push.

## Per-Slice Checklist

For every executable slice:

1. Inspect current state: `git status -sb`, read relevant files, and verify no uncommitted work belongs to someone else.
2. Write a RED test or state in the roadmap why a RED test is not practical.
3. Implement minimal code/docs.
4. Run the focused gate.
5. Update this roadmap checkboxes and add a completion log entry.
6. Run the global gate appropriate to the touched area.
7. Commit locally with `git commit -S`; push only when batching several verified commits, before stopping, or when remote CI/status is specifically needed.
8. Verify `git log -1 --show-signature --oneline`, `git status -sb`, and, after a push, do one-shot CI status query without waiting/watching slow CI by default.
9. Continue to the next highest-priority unblocked slice.

## Roadmap Tracking Rules

- This file is the source of truth during the mega-goal.
- After every verified slice, change relevant `[ ]` to `[x]`.
- If blocked, write `[blocked]` with evidence and safest next step.
- Add a completion log line with date, slice, tests/gates, and commit hash.
- Do not mark a code slice complete without actual gate output.
- Keep stale or deferred items visible until verified obsolete.
- If discovery changes priorities, update the execution queue before continuing.

## Completion Log

- 2026-06-30: Roadmap created from current repo discovery. Baseline: clean `main`, latest CI success for `1f24338`, full unit/local gates recently green, 51 stdlib modules all directly covered at some level, compile-all skip list and struct MIR stubs identified as highest-value next gaps.
- 2026-06-30: Completed Track A coverage matrix and skip manifest bootstrap. Added `docs/plans/redscript-coverage-matrix.md`, machine-readable `docs/plans/redscript-coverage-matrix.json`, typed compile-all skip helper, and `src/__tests__/coverage-matrix.test.ts`. Gates: `npm test -- --selectProjects unit --runTestsByPath src/__tests__/coverage-matrix.test.ts src/__tests__/compile-all.test.ts --runInBand` passed 2 suites / 103 tests; `npm run build` passed; `git diff --check` passed. Commit `ebe59db`. Next recommended slice is Track B1 reproducing the first compile-all language skip.
- 2026-06-30: Completed Track B stale-skip reduction pass. Direct CLI probes showed `src/stdlib/interactions.mcrs`, `examples/game/racing.mcrs`, `examples/game/tower_defense.mcrs`, `examples/math/physics_sim.mcrs`, `src/examples/hunger_games.mcrs`, `src/examples/tutorial_04_selectors.mcrs`, and `src/examples/tutorial_10_kill_race.mcrs` now compile, so they were removed from the compile-all skip manifest. Remaining skip reasons were updated from stale array-return wording to direct observed failures: unresolved `winner`/`state`/`item` MIR lowering or external-objective LIR verifier errors. Gates: `npm test -- --selectProjects unit --runTestsByPath src/__tests__/coverage-matrix.test.ts src/__tests__/compile-all.test.ts --runInBand` passed 2 suites / 110 tests; `npm run build` passed; `npm run validate-mc` passed 15 tests; `git diff --check` passed. Commit `a1da89b`; next recommended slice is Track C audit/minimal struct-field lowering, because most remaining skips are struct/state-field shaped rather than array-return shaped.
- 2026-06-30: Completed Track C bounded struct-return tracking slice. Audit found static struct field read/write already supported, but `return state` for a local struct variable and `let state = snapshot_fighter()` from a regular struct-returning function lost `structVars` metadata. Added compile regressions in `src/__tests__/compiler/struct-extends.test.ts`, copied local struct returns into `__rf_<field>` slots, and inferred unannotated struct-return call locals from `ctx.hirFunctions`. Gates: `npm test -- --selectProjects unit --runTestsByPath src/__tests__/compiler/struct-extends.test.ts --runInBand` passed 10 tests; combined `struct-extends` + coverage + compile-all gate passed 3 suites / 120 tests; `npm run build` passed; `npm run validate-mc` passed 15 tests; `git diff --check` passed. Direct CLI probes after build showed `pvp_arena.mcrs` and `showcase_game.mcrs` advanced past the old `state` failure to `tagName`/`lane`, so remaining skips are narrower diagnostics/design issues. Commit `c5c5c09`; next recommended slice is C4 clear diagnostics for unsupported unresolved dynamic identifiers or Track D live-candidate selection.
- 2026-06-30: Completed Track D live-candidate selection and live baseline refresh. Added `docs/plans/redscript-live-oracle-candidate-map.md`, augmented `docs/plans/redscript-coverage-matrix.json` with bounded `liveOracleCandidate` priorities and `liveOracleBaseline`, and extended the coverage-matrix unit test to guard the candidate map. Did not add rote live tests for every stdlib module; candidates are selective (`events`, `math`, `random`, `timer`; storage remains covered as a core lowering/runtime boundary rather than a stdlib module) and lower-priority modules stay static until a deterministic harness fixture/bug exists. Gates: `curl -fsS --max-time 2 http://localhost:25561/status` returned online Paper 1.21.4 / ~20 TPS; `MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live` passed 1 suite / 19 tests in 47.5s; `npm test -- --selectProjects unit --runTestsByPath src/__tests__/coverage-matrix.test.ts --runInBand` passed 1 suite / 7 tests; `npm run build` passed; `git diff --check` passed. Commit `241cd94`; next recommended slice is Track E report-only optimizer opportunity audit before any peephole implementation.
- 2026-06-30: Completed Track E report-only optimizer opportunity audit and stopped before risky optimizer work. Added `docs/plans/redscript-typed-optimizer-opportunity-report.md` from `npm run gate:lir-local-copy -- --output /tmp/redscript-megagoal-e-local-copy.json`. Gate passed with rollout recommendation still `manual-experimental-opt-in-only`; command delta `-497`, score-copy delta `-497`, command/score-copy regressions `0`; offline equivalence pack passed 31/31. Boundary sidecar mix: total 3446 instructions, exact 2211, conservative 355, opaque 880; typed-lir 2211, lowering-compat 351, macro-helper 5, raw-user-command 879; opaque storage 1235. Decision: no default enablement and no new peephole yet, because the obvious remaining mass is raw/opaque/lowering-compat rather than a clearly safe typed-local transform; E2/E3 remain deferred pending a minimized RED equivalence candidate. Commit `dbb0d97`; this is a real risk/product decision stop for optimizer implementation.
- 2026-06-30: Updated this roadmap for long-run budget consumption after user discussion. Added local-first/batched-push cadence, bounded rediscovery loop, refreshed current-state notes, and strengthened the short prompt so future goal sessions continue through high-value executable work instead of stopping after visible checkboxes. Gates: documentation-only update; `git diff --check` and `npm run build` should be run before commit.

## Reporting Format When Finally Stopping

When stopping, report concisely:

```text
Status: complete | blocked | paused
Last commit(s): <hashes>
Tracks completed: ...
Tracks blocked/deferred: ...
Gates run: ...
Current git status: ...
Next safest action: ...
```

## Short Prompt to Start This Mega-Goal

```text
Read docs/plans/2026-06-30-redscript-autonomous-megagoal.md fully, then execute it in /Users/yuzhe/projects/redscript as a long-running local-first autonomous loop.

Do not stop after one slice. Repeatedly pick the highest-value executable slice from the roadmap or from newly discovered roadmap-consistent gaps, then: inspect current state, write a focused RED test or justify why not practical, implement the minimal bounded change, run focused gates and relevant global gates, update the roadmap checkboxes/completion log, make a signed local commit, and continue.

Batch pushes occasionally after several verified commits or before stopping, but do not wait for slow CI; after pushing, only do a one-shot CI status query.

Respect all explicit non-goals: no compiler rewrite, no new IR/VIR redesign, no default local-copy/RMW enablement, no raw/macro semantic parser, no broad ABI cleanup, no low-return/high-risk churn.

Prefer these tracks in order unless current evidence suggests otherwise: compile-all skip reduction and stale skip deletion; clearer diagnostics for remaining unsupported language/example gaps; coverage matrix and stdlib proof-level hardening; deterministic MCRuntime/Paper semantic smoke for high-risk stdlib only; report-first typed optimizer opportunities, with implementation only after a bounded RED equivalence test exists.

If a track appears exhausted, perform bounded rediscovery: search the skip manifest, TODO/FIXME in touched compiler/test areas, failing or skipped tests, stale roadmap claims, examples that are not compiled, and coverage matrix gaps; add any high-value executable findings back to the roadmap and continue.

Continue until blocked by a real product/resource/risk decision, repeated gate failure requiring human choice, or all executable work is done. When stopping, report commits, gates, remaining blockers, git status, and safest next slice.
```
