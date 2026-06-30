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
- Use signed commits and push after each verified coherent slice unless blocked.
- Preserve uncommitted work: start every slice with `git status -sb`.

## Current State Discovered

Verified on 2026-06-30:

- Git working tree was clean on `main...origin/main` after latest work.
- Latest CI for commit `1f24338` succeeded: build, unit, static MC syntax, evidence-only local-copy gate.
- Local full unit previously passed: 282 suites / 5264 tests.
- `MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live` passed 19/19 against live Paper/TestHarness.
- Codebase size by `uvx pygount` excluding dependencies/build artifacts:
  - TypeScript: 432 files, ~83,866 code lines.
  - Markdown: 117 files.
  - MCFunction fixtures/artifacts: 167 files.
  - Total scanned: 940 files, ~133,064 code lines.
- Tests:
  - 297 `.test.ts` files under `src/__tests__`.
  - Test buckets include root, stdlib, optimizer, emit, compiler, MIR, mc-integration, e2e, HIR, LSP, tuner, lint, LIR, etc.
- Stdlib:
  - 51 modules under `src/stdlib/*.mcrs`.
  - All 51 modules are directly referenced by tests or have own test files.
  - `src/__tests__/stdlib/` contains 54 stdlib-focused test files.
- Known active gaps:
  - `src/__tests__/compile-all.test.ts` has an explicit skip list for unsupported patterns/examples.
  - Skip reasons include `interactions.mcrs` using `foreach + module-level const`, templates using unsupported array-return-call patterns, and multiple examples using unsupported array-passing-to-array-returning-fn patterns.
  - Tests mention struct field access/assignment is stubbed at MIR level; struct impl methods depend on that stubbed capability.
  - Some live probes are intentionally gated/skipped unless env flags are set: enchantment-level ALU, item-modifier ALU, display-decomposition.
  - Stdlib has module-level coverage, but not every high-risk stdlib API has Paper-level semantic proof.

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
- Suggested cadence: one coherent Spark tranche per track/slice, then controller review/gate/commit/push before the next tranche.
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

- [ ] A1. Create `docs/plans/redscript-coverage-matrix.md` listing all 51 stdlib modules and major language features with current proof level.
- [ ] A2. Move compile-all skip data into a typed manifest/helper or at least a structured table in `src/__tests__/compile-all.test.ts`, preserving current behavior first.
- [ ] A3. Add a cheap test that every `src/stdlib/*.mcrs` module is represented in the matrix or a machine-readable coverage manifest.
- [ ] A4. Add a completion log entry here with gate outputs and commit hash.

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

- [ ] B1. Reproduce one skipped file failure directly with CLI/build output and add a focused RED test for the smallest language pattern.
- [ ] B2. Fix `interactions.mcrs` / `foreach + module-level const` if it is a bounded MIR/typecheck/import issue; otherwise convert to clear diagnostic and mark blocked.
- [ ] B3. Fix the smallest array-return-call pattern blocking `src/templates/` or one example, with RED/GREEN tests.
- [ ] B4. Remove fixed files from compile-all skip manifest and prove compile-all still passes.
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

**Current gap:** Tests contain TODOs stating struct field access/assignment is stubbed at MIR level and struct impl methods depend on it.

**Desired end state:** Static struct field read/write and impl-method access either work through compile/emit tests or produce explicit diagnostics for unsupported dynamic cases.

**Executable slices:**

- [ ] C1. Add a focused audit note to this roadmap identifying the exact AST/HIR/MIR representation and current stub path.
- [ ] C2. Write RED tests for simple struct field read and write through compile output or runtime where feasible.
- [ ] C3. Implement minimal static-field lowering if bounded.
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

- [ ] D1. Use Track A matrix to pick 3–5 high-risk stdlib APIs lacking live proof.
- [ ] D2. Add or extend descriptor-driven live cases where possible.
- [ ] D3. Keep live tests skippable unless `MC_CORE_REQUIRE_ONLINE=true` or the relevant live env is set.
- [ ] D4. When `localhost:25561` is online, run live smoke and record exact evidence in the matrix.

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

- [ ] E1. Add a residual optimizer opportunity report using `deriveBoundarySidecar()` labels if the existing gate does not already expose enough actionable buckets.
- [ ] E2. Pick one typed-only peephole with obvious local semantics, e.g. adjacent overwrite or self-copy no-op, only if existing tests show a gap.
- [ ] E3. Add RED equivalence/interpreter tests before implementing.
- [ ] E4. Run local-copy evidence gate and record command/score-copy deltas.
- [ ] E5. If candidate requires non-local dataflow, mark blocked/deferred rather than implementing.

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
7. Commit with `git commit -S` and push unless forbidden.
8. Verify `git log -1 --show-signature --oneline`, `git status -sb`, and one-shot CI status if a push triggered CI.
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
Read docs/plans/2026-06-30-redscript-autonomous-megagoal.md fully, then execute it in /Users/yuzhe/projects/redscript. Do not stop after one slice. Continue through multiple verified slices: update the roadmap, run gates, signed commit, push, then continue until blocked by a real product/resource/risk decision or all executable work is done. You may use Spark/Codex-Spark for bounded implementation workers, but skip excluded low-return/high-risk work: no compiler rewrite, no new IR/VIR redesign, no default local-copy/RMW enablement, no raw/macro semantic parser, no broad ABI cleanup.
```
