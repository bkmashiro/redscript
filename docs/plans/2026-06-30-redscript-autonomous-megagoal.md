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

- Latest pushed commit before the release-readiness roadmap cleanup is `d3bd668` (`docs: classify remaining roadmap blockers`), pushed to `main`.
- Recent CI for the batched push should be treated as slow/background; query once when needed rather than watching.
- Local verified slices already landed: coverage matrix/skip manifest, stale skip reduction, bounded struct-return local tracking, live-oracle candidate map, typed optimizer opportunity report, static-array `foreach` lowering for `showcase_game.mcrs`, skip-manifest failure evidence, struct migration verification, and CI hygiene reconciliation.
- Latest known live oracle baseline: `MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live` passed 1 suite / 19 tests against live Paper/TestHarness on 2026-06-30.
- Stdlib:
  - 51 modules under `src/stdlib/*.mcrs`.
  - Coverage matrix and candidate map now exist: `docs/plans/redscript-coverage-matrix.json`, `docs/plans/redscript-coverage-matrix.md`, `docs/plans/redscript-live-oracle-candidate-map.md`.
- Known active gaps after latest slices:
  - Remaining compile-all skips are now represented in `src/__tests__/helpers/compile-all-skip-manifest.ts` with structured reason/nextAction fields.
  - Several old stale skips were removed after direct CLI proof; do not re-add them unless a fresh regression is reproduced.
  - `pvp_arena.mcrs`, `capture_the_flag.mcrs`, and `tutorial_07_random.mcrs` now fail with clear unsupported runtime string comparison diagnostics (`tagName`/`winner`/`item`) rather than generic MIR compiler-bug crashes.
  - `showcase_game.mcrs` now compiles after bounded static int-array `foreach` unrolling; template skips include external-objective verifier/design issues with clearer diagnostics.
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

## Completed Work Archive — Cleaned from Active Queue

The original mega-goal execution queue has been consumed. Do **not** restart these as active slices unless a fresh regression reopens them:

- Coverage matrix and typed skip manifest exist and are guarded by unit tests.
- Stale compile-all skips were removed after direct CLI proof.
- Static struct field/return tracking gaps were closed for the bounded common paths.
- Live oracle candidate map and live core baseline were recorded.
- Report-only typed optimizer evidence was recorded; local-copy/RMW remains manual experimental opt-in.
- Template external-objective failures now have actionable diagnostics.
- Dynamic string comparison failures now produce clear unsupported-language diagnostics.
- `showcase_game.mcrs` / static int-array `foreach` is fixed and back in compile-all.
- Skip-manifest failure evidence is guarded by targeted tests.
- Struct migration smoke and CI hygiene items were reconciled and closed.

This cleanup intentionally leaves the detailed historical evidence in the Completion Log below, but the active queue now starts from product/release decisions rather than already-completed implementation slices.

## Release Readiness Roadmap — Active Queue

### Priority 1 — Runtime String Equality Product Decision

**Question:** does Minecraft support runtime string comparison?

**Answer:** Minecraft has **NBT/SNBT string matching and data-command workarounds**, but it does **not** have a cheap/native scoreboard-style string comparison operator that RedScript can lower into the same scalar expression path as ints/bools.

Practical interpretation for RedScript:

- Literal NBT matching is supported by Minecraft command semantics, e.g. checking whether an entity/storage compound partially matches `{id:"minecraft:diamond"}` or whether an entity has a tag string in an NBT list.
- Two dynamic string-like NBT values can be compared indirectly with storage/data-command tricks, but that is a command-sequence protocol, not a normal expression primitive. It has storage layout, mutation, equality-vs-copy-success, and MC-version semantics that must be designed and tested.
- Scoreboard expressions cannot store or compare arbitrary strings. RedScript's current MIR/LIR scalar lowering is scoreboard-oriented, so lowering `winner == "red"`, `tagName == "red"`, or `item == "minecraft:diamond"` as ordinary runtime string equality would require a new string/NBT comparison lowering contract.

**Decision for the current release-readiness track:** do **not** implement general runtime string equality yet. Treat it as a future language ADR. But do exploit the safe subset before rewriting examples: compile-time string literal specialization and, later, explicitly storage-backed NBT literal predicates. For product readiness, only rewrite examples to int/enum state when the value is genuinely dynamic finite choice and cannot be eliminated by specialization.

**Useful half-support slices:**

- Compile-time string literal specialization: if a string parameter is only called with literals, clone/specialize the callee or constant-fold the branch. This should fix `end_game("red"|"blue")` and `count_team("red"|"blue")` without any Minecraft runtime string compare.
- Explicit NBT/storage literal predicate support: future bounded helper/syntax may lower `storage.path == "literal"` into `execute if data storage ... {path:"literal"}`-style predicates. This is not the same as ordinary `string == string`.
- Dynamic finite choices: if a function returns one of several string literals and the result is later used as a command argument, prefer int/enum lowering or a finite-choice branch expansion unless a string-storage ABI is explicitly designed.

**Active executable slices:**

- [x] P1.1. Add a short language-design note documenting the above Minecraft capability boundary and RedScript decision: runtime string equality is not a scalar expression in this release; finite-choice examples should use specialization or int/enum state. See `docs/plans/redscript-runtime-string-equality-note.md`.
- [x] P1.2. Try compile-time literal string specialization for `capture_the_flag.mcrs` (`end_game("red"|"blue")`) and `pvp_arena.mcrs` (`count_team("red"|"blue")`) with focused tests; only rewrite examples if specialization is not bounded. Implemented in MIR call-site specialization and both examples now compile directly.
- [x] P1.3. For `tutorial_07_random.mcrs`, choose between finite-choice branch expansion and int/enum item codes; avoid general string runtime. Rewritten to integer loot codes with literal `give`/`tell` branch helpers.
- [x] P1.4. Remove the remaining fixed string-comparison entries from `COMPILE_ALL_SKIP_MANIFEST`, update coverage expectations, and prove compile-all/build/validate-mc.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/compile-all.test.ts src/__tests__/compile-all-skip-manifest.test.ts src/__tests__/coverage-matrix.test.ts --runInBand
npm run build
npm run validate-mc
git diff --check
```

**Do not:** implement a broad string object model, a general NBT string runtime, or a raw-command parser in this track.

### Priority 2 — External Scoreboard Objective ABI Decision

Remaining compile-all skips after Priority 1 are expected to be external scoreboard objective issues:

- `src/templates/combat.mcrs` (`health`)
- `src/templates/economy.mcrs` (`coins`)
- `src/templates/quest.mcrs` (`quest_id`)
- `parkour_race.mcrs` (`pk_checkpoint`)
- `zombie_survival.mcrs` (`zs_display`)

**Decision still needed:** whether external scoreboard objectives are a supported template/example ABI and, if yes, what explicit syntax/helper declares that boundary.

**Preferred next design:** add a small ADR and a minimal explicit interop mechanism. Do not globally relax `verifyLIR` just to make examples pass.

**Active executable slices after Priority 1:**

- [ ] P2.1. Write ADR: compiler-owned objectives vs external/vanilla scoreboard objectives.
- [ ] P2.2. Choose and implement a minimal explicit declaration/helper or diagnostic-only policy.
- [ ] P2.3. Update affected templates/examples and remove fixed skip-manifest entries.

### Priority 3 — Golden Examples Gate

After compile-all product skips are reduced by explicit decisions, add a small golden examples gate for representative public examples/tutorials:

- compile;
- static MC validation;
- selective generated command-shape assertions;
- optional live Paper smoke only for core semantic cases.

**Do not:** make every example a live Paper test.

### Priority 4 — Optimizer Design Track, Deferred

Optimizer implementation remains deferred unless the user explicitly opens a new optimizer design track. The current evidence says the remaining obvious mass is raw/opaque/lowering-compat, not a bounded typed-local peephole.

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
- 2026-06-30: Updated this roadmap for long-run budget consumption after user discussion. Added local-first/batched-push cadence, bounded rediscovery loop, refreshed current-state notes, and strengthened the short prompt so future goal sessions continue through high-value executable work instead of stopping after visible checkboxes. Gates: `git diff --check` passed; `npm run build` passed. Commit `0b5601a`.
- 2026-06-30: Completed Track B template skip split. RED: updated `src/__tests__/coverage-matrix.test.ts` to reject the broad `src/templates/` skip and require specific template skip entries; it failed while the directory skip remained. Direct CLI probe showed `src/templates/mini-game-framework.mcrs` compiles, while `combat`, `economy`, and `quest` fail on external scoreboard objective LIR verifier errors. GREEN: replaced the directory skip with specific template file entries in `src/__tests__/helpers/compile-all-skip-manifest.ts`; `npm test -- --selectProjects unit --runTestsByPath src/__tests__/coverage-matrix.test.ts src/__tests__/compile-all.test.ts --runInBand` passed 2 suites / 112 tests; direct CLI compile for `mini-game-framework` passed; `npm run build` passed; `npm run validate-mc` passed; `git diff --check` passed. Commit `d7febb6`; next recommended slice is B6 external-objective diagnostic/product-decision hardening.
- 2026-06-30: Completed Track B6 external-objective diagnostic hardening. RED: `src/__tests__/lir/verify.test.ts` required actionable compiler-owned fake-player wording for `$...` slots using external objectives and failed against the old terse `slot '$x' uses objective...` message. GREEN: `src/lir/verify.ts` now keeps the same strict rejection but reports `compiler-owned fake-player slot '<player> <objective>'`, the required module objective, and the safe external-interop hint (`use a non-$ player name` or typed helper). Focused gate `npm test -- --selectProjects unit --runTestsByPath src/__tests__/lir/verify.test.ts --runInBand` passed 31 tests; after `npm run build`, direct CLI compile of `src/templates/combat.mcrs` shows the clearer diagnostic. Commit `425c935`; next recommended slice is B7 unresolved dynamic identifiers.
- 2026-06-30: Completed Track C4 dynamic string comparison diagnostic hardening. RED: added `src/__tests__/compiler/string-advanced.test.ts` coverage requiring `tagName == "red"` to throw a `LoweringError` that does not say `compiler bug`; added `src/__tests__/mir/unresolved-ident.test.ts` coverage requiring unresolved-identifier diagnostics to preserve expression span when available. GREEN: `src/mir/lower.ts` now detects string variables in scalar lowering and reports `String value '<name>' cannot be lowered to a scoreboard expression; ... runtime string comparison is not yet supported`, and generic unresolved-identifier diagnostics use expression span instead of always pointing at `1:1`. Direct CLI probes now show clearer string diagnostics for `pvp_arena.mcrs` (`tagName`), `tutorial_07_random.mcrs` (`item`), and `capture_the_flag.mcrs` (`winner`); `showcase_game.mcrs` still had a separate unresolved `lane` issue but pointed into the generated/inline path (`342:16`) rather than file start. Updated skip manifest reasons/next actions accordingly. Gates: `npm test -- --selectProjects unit --runTestsByPath src/__tests__/mir/unresolved-ident.test.ts src/__tests__/compiler/string-advanced.test.ts src/__tests__/compile-all.test.ts --runInBand` passed 3 suites / 138 tests; `npm run build` passed; `npm run validate-mc` passed; `git diff --check` passed. Commits `a29003a` and `98dce61`; next recommended slice is the `showcase_game.mcrs` lane issue or another stale skip rediscovery pass.
- 2026-06-30: Completed Track B7 `showcase_game.mcrs` lane fix. RED: `src/__tests__/compiler/foreach-static-array.test.ts` proved `foreach (lane in lanes)` over a pure int literal array failed with `Unresolved identifier 'lane'` inside the generated helper. GREEN: `src/mir/lower.ts` now records pure int array literal values and boundedly unrolls `foreach` over those static arrays in-place, preserving selector-based `foreach` lowering. Removed `showcase_game.mcrs` from the compile-all skip manifest after direct CLI proof. Gates: `npm test -- --selectProjects unit --runTestsByPath src/__tests__/compiler/foreach-static-array.test.ts --runInBand` passed 1 test; `npm test -- --selectProjects unit --runTestsByPath src/__tests__/compiler/foreach-static-array.test.ts src/__tests__/mir/unresolved-ident.test.ts src/__tests__/compile-all.test.ts --runInBand` passed 3 suites / 115 tests; `npm run build` passed; `node dist/src/cli.js compile src/examples/showcase_game.mcrs -o /tmp/redscript-showcase-game` passed with 169 files; `npm run validate-mc` passed 15 tests; `git diff --check` passed. Commit `f73d883`; next recommended slice is remaining string-comparison product-decision skips or bounded rediscovery for any newly stale skip entries.
- 2026-06-30: Completed Track F1 skip-manifest failure-evidence guard. RED: `src/__tests__/compile-all-skip-manifest.test.ts` required every `known-language-gap` skip to carry current expected compiler-output substrings and failed while entries lacked them. GREEN: added `expectedFailureSubstrings` to the typed skip manifest and a focused unit test that matches each known gap to exactly one `.mcrs` file, proves direct CLI compile still fails, and checks the diagnostic substring. Also tightened the coverage-matrix skip count after `showcase_game.mcrs` rejoined compile-all. Gates: `npm test -- --selectProjects unit --runTestsByPath src/__tests__/compile-all-skip-manifest.test.ts --runInBand` passed 1 test; `npm test -- --selectProjects unit --runTestsByPath src/__tests__/compile-all-skip-manifest.test.ts src/__tests__/coverage-matrix.test.ts src/__tests__/compile-all.test.ts --runInBand` passed 3 suites / 114 tests; `npm run build` passed; `npm run validate-mc` passed 15 tests; `git diff --check` passed. Commit `71fa4bb`; next recommended slice is reassessing whether remaining skips are all product decisions, then bounded rediscovery outside compile-all if they are.
- 2026-06-30: Closed Track C5 verification-only. No RED production test was needed because this was a roadmap reconciliation slice: `src/__tests__/e2e/migrate.test.ts` already contains enabled struct declaration/literal/access/assignment/static-method smoke coverage. Gate `npm test -- --selectProjects unit --runTestsByPath src/__tests__/e2e/migrate.test.ts src/__tests__/compiler/struct-extends.test.ts --runInBand` passed 2 suites / 254 tests, so no disabled migration/e2e test remained to re-enable for the bounded struct stub. Commit `4074092`; next recommended slice is to classify remaining B7 skips as product decisions or continue bounded rediscovery.
- 2026-06-30: Closed Track F2/F3 CI hygiene reconciliation. No RED production test was needed because this was a CI-roadmap inspection slice. Inspected `.github/workflows/ci.yml`, `.github/workflows/docs-check.yml`, and `package.json`: default CI runs build, serial unit tests, `validate-mc`, and report-only `gate:lir-local-copy`; docs check is manual/scheduled; no workflow currently dumps benchmark JSON or adds live Paper to default push. F2 marked complete; F3 marked blocked/no-op until a concrete workflow change is justified. Gates: `git diff --check` and `npm run build` passed. Commit `547d181`; next recommended slice is B7 product-decision classification.
- 2026-06-30: Classified remaining open roadmap items as blocked/deferred after bounded rediscovery. B7: `showcase_game.mcrs`/`lane` is fixed and compile-all covered; remaining `winner`/`tagName`/`item` failures are runtime string comparison semantics and require a product choice (implement runtime string equality vs rewrite examples to int/enum state). E2/E3: previous typed optimizer report found no bounded typed-local RED candidate; remaining opportunity mass is raw/opaque/lowering-compat and excluded from this mega-goal. No RED production test was needed for this classification slice; direct CLI probes and prior `gate:lir-local-copy` evidence are the blocker evidence. Commit `d3bd668`; safest next step is release-readiness decision work.
- 2026-06-30: Cleaned the active roadmap after user direction. Archived the consumed Track A–F queue into a compact completed-work list, promoted a release-readiness active queue, and recorded the Minecraft runtime-string boundary: MC supports NBT/SNBT string matching and data-command workarounds, but not a cheap/native scoreboard string comparison expression. Current decision for Priority 1 is to avoid general runtime string equality for this release and rewrite finite-choice examples/tutorials to int/enum state first. Gates: `git diff --check` passed. Commit `be718a6`.
- 2026-06-30: Refined Priority 1 after user asked whether Minecraft's partial string support can be exploited. Updated the active queue and `docs/plans/redscript-runtime-string-equality-note.md`: use compile-time string literal specialization first for literal-argument patterns (`end_game("red"|"blue")`, `count_team("red"|"blue")`), reserve explicit storage/NBT literal predicates for a later opt-in semantic, and only rewrite to int/enum for genuinely dynamic finite choices such as `pick_loot_item(seed)`. Gates: `git diff --check` passed; `npm run build` passed. Commit `4220710`.
- 2026-06-30: Completed Priority 1.2 compile-time string literal specialization. Added MIR call-site specialization for string parameters called with literal arguments, constant-folded specialized string literal comparisons, kept dynamic string calls rejected, and removed `capture_the_flag.mcrs` plus `pvp_arena.mcrs` from compile-all skip manifest after direct CLI proof. Gates: `npm test -- --selectProjects unit --runTestsByPath src/__tests__/compiler/string-advanced.test.ts src/__tests__/compile-all.test.ts src/__tests__/compile-all-skip-manifest.test.ts src/__tests__/coverage-matrix.test.ts --runInBand` passed 4 suites / 144 tests; `npm run build` passed; direct CLI compiles for `src/examples/capture_the_flag.mcrs` and `src/examples/pvp_arena.mcrs` passed; `npm run validate-mc` passed 15 tests; `git diff --check` passed. Commit `8ecb8d2` includes this slice.
- 2026-06-30: Completed Priority 1.3/P1.4 finite-choice tutorial cleanup. Rewrote `src/examples/tutorial_07_random.mcrs` to return integer loot codes and branch to literal `tell`/`give` commands, avoiding a general string runtime for dynamic loot choices. Removed all remaining runtime-string-comparison entries from the skip manifest and tightened coverage expectations to five external-objective gaps. Gates: same 4-suite compile-all/manifest/coverage/string gate passed 144 tests; direct CLI compile for `src/examples/tutorial_07_random.mcrs` passed with existing `random`/`noise` import warnings; `npm run build` passed; `npm run validate-mc` passed 15 tests; `git diff --check` passed. Commit `8ecb8d2` includes this slice.
- 2026-06-30: Completed a robustness/CI maintenance slice after the pushed CI exposed full-unit failures missed by focused gates. Fixed Jest unit discovery so helper modules under `src/__tests__/helpers/` are not executed as empty test suites, constrained string literal specialization to non-stdlib/non-macro functions, preserved macro callees during specialization analysis, constant-folded static string matches only after validating all string-match patterns, and updated macro-stdlib tests to assert emitted call-site command shape rather than nonexistent macro callee files. Gates: focused regression gate passed 6 suites / 42 tests; CI-equivalent local gate passed `npm run build`, `MC_OFFLINE=true npx jest --selectProjects unit --runInBand` (285 suites / 5291 tests), `npm run validate-mc` (15 tests), `npm run gate:lir-local-copy`, and `git diff --check`. Commit recorded in this entry's containing commit.

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
