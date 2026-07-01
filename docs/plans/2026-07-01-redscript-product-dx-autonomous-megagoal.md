# RedScript Product DX Autonomous Mega-Goal

> **For Hermes:** This is the long-running `/goal` handoff for the next RedScript phase. Read this file fully, then execute it in `/Users/yuzhe/projects/redscript` without stopping after one small slice. The previous 2026-06-30 mega-goal is effectively complete; treat it as historical evidence, not the active queue.

**Goal:** Advance RedScript from release-readiness hardening into product-grade language/package DX: typed registry resources, `.d.mcrs` declaration/package surfaces, LSP resource assistance, generated declaration artifacts, and release/docs evidence that remains honest about static vs live proof.

**Architecture:** Preserve the production compiler path: Source → AST → TypeCheck → HIR → MIR → Optimizer → LIR → Emit datapack. Add registry/declaration/package/LSP contracts around that path, not a rewrite. Behavior-changing runtime/compiler semantics must be test-pinned before implementation and kept out of broad unsafe rewrites.

**Tech Stack:** TypeScript, Jest, RedScript `.mcrs` / `.d.mcrs`, LSP helpers, existing compile pipeline, MC static validator, optional local Paper/TestHarness at `localhost:25561`, GitHub Actions, optional Spark/Codex-Spark bounded workers.

---

## User Intent

Yuzhe upgraded budget and wants a genuinely long autonomous goal, not repeated manual “继续”. Use the larger budget to continue through many safe, bounded, verified slices. Do not use budget as permission for low-return rewrites or risky default behavior changes.

Spark/Codex-Spark is allowed as implementation labor for bounded, file-scoped slices. The controller remains responsible for design scope, diff review, gates, signed commits, pushes, and CI/status follow-up.

## Repository and Source of Truth

- Project path: `/Users/yuzhe/projects/redscript`
- Branch/source of truth: `main`
- Project guidance: `AGENTS.md`
- This mega-goal: `docs/plans/2026-07-01-redscript-product-dx-autonomous-megagoal.md`
- Active language/package-DX roadmap: `docs/plans/mc-mechanism-optimization/37-registry-resource-and-declaration-surface.md`
- Current vNext/release baseline: `docs/plans/redscript-vnext-roadmap.md`
- Compiler hardening overview: `docs/plans/compiler-mc-hardening-roadmap.md`
- Coverage matrix: `docs/plans/redscript-coverage-matrix.md` and `.json`
- Live oracle candidate map: `docs/plans/redscript-live-oracle-candidate-map.md`
- Release checklist: `docs/plans/redscript-release-evidence-checklist.md`
- Historical completed mega-goal: `docs/plans/2026-06-30-redscript-autonomous-megagoal.md`

## Current Baseline Discovered

Verified during reset on 2026-07-01:

- `git status -sb`: `## main...origin/main` clean.
- Latest commit: `e6fe697 test(vnext): deepen visual evidence tranche`.
- Latest `main` CI for that commit completed successfully.
- Publish workflows after the successful CI also completed successfully for npm package and VSCode extension automation.
- Package evidence helper reports `redscript-mc@3.0.4`, git commit `e6fe697`, live baseline `26/26`, local/static command inventory, and smoke scripts `smoke:package` / `smoke:browser-ide`.
- Local Paper/TestHarness status at `localhost:25561` is online for MC `1.21.4`; use only when a slice explicitly needs live Paper proof.
- `COMPILE_ALL_SKIP_MANIFEST` has zero `known-language-gap` entries. Remaining skip categories are repo artifact, declaration-only, or test-fixture.
- Coverage matrix records compile-all product readiness as `zero known-language-gap`, `compile-all/static`, and `static-mc-validation` guarded by tests.
- Core live Paper oracle baseline is `26/26`, including scoreboard/function/storage/macro/load/tick/timer plus selected world/inventory/random/spawn/particle/visual-UI smokes.
- Optimizer/backend diagnostic roadmap `36` is complete; local-copy/RMW remains manual experimental opt-in only.
- Active unchecked roadmap work is now the registry resource / `.d.mcrs` declaration surface under roadmap `37`.

## Non-Negotiable Boundaries

- Do not rewrite the compiler or replace the main pipeline.
- Do not create a new IR/VIR architecture or make optimizer infrastructure dependent on MLIR/Cranelift/Binaryen/regalloc/egg/Z3.
- Do not default-enable local-copy/RMW; it remains manual experimental opt-in unless a future ADR with stronger gates approves default behavior.
- Do not implement a raw/macro semantic parser.
- Do not implement broad call/return ABI cleanup as part of product-DX work.
- Do not implement general runtime string equality; current release path uses literal specialization and finite-choice rewrites.
- Do not model Minecraft registries as closed enums; registries are open and version/package/server dependent.
- Do not break existing string-compatible stdlib calls while adding typed resource APIs.
- Do not count static/offline validation as live Paper proof.
- Do not commit generated VSCode/package artifacts unless the slice specifically targets release packaging.
- Start each implementation slice with `git status -sb`; never overwrite unrelated uncommitted work.
- Use signed commits for verified coherent slices. Push unless the user says no-push; after pushing, query CI once rather than watching slow CI by default.

## Value Filter / Explicit Non-Goals

Prefer:

- high-product-value language/package DX;
- parser/typechecker/LSP/compile-contract slices with clear RED tests;
- preserving release gates and compile-all/static MC validation;
- small Spark lanes with disjoint files and exact allowed scope;
- docs/evidence updates that prevent future agents from reading stale roadmaps.

Exclude unless the user explicitly reopens the topic:

- broad optimizer behavior changes;
- full Paper proof for every stdlib function;
- broad gameplay/visual example redesigns;
- general runtime string object model;
- package-manager ecosystem design beyond `.d.mcrs` declaration/import/generation boundaries;
- risky syntax sugar without parser/typechecker negative tests.

## Desired Future State

### Product / DX

- Users get completions, hover, and advisory diagnostics for Minecraft registry IDs in existing string positions before adopting new syntax.
- Packages can publish `.d.mcrs` declaration surfaces so consumers can typecheck against external APIs without source implementations.
- Resource IDs can become typed values gradually (`resource<particle>`, `resource<item>`, etc.) while existing string calls stay valid.
- Contextual unquoted resource literals such as `minecraft:flame` are supported only in typed resource contexts, with ambiguity rejected clearly.
- Public docs distinguish compile/static/golden/live evidence and do not overclaim runtime proof.

### Architecture

- Registry metadata is version-aware and extensible by user/package declarations.
- Declaration-only files affect parser/typechecker/LSP/package metadata and do not emit datapack functions by default.
- The compile pipeline has a clear declaration/resource stage boundary if implementation needs one.
- `.d.mcrs` generation from exported APIs is opt-in and file-backed; it does not mutate source or generated docs silently.

### Gates / Evidence

- Compile-all remains zero `known-language-gap`.
- Static MC validation remains green for all non-skipped compile-all outputs.
- LSP/parser/typechecker tests pin new resource/declaration behavior.
- Browser/package/release smokes remain available for release-facing changes.
- Live Paper oracle is optional and only used for runtime-facing claims.

## Global Gates

For docs-only roadmap/reset slices:

```bash
git diff --check
git status -sb
```

For parser/AST slices:

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/parser-coverage.test.ts src/__tests__/parser*.test.ts --runInBand
npm run build
git diff --check
```

For typechecker/declaration/resource slices:

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/typechecker*.test.ts src/__tests__/typechecker/**/*.test.ts --runInBand
npm run build
git diff --check
```

For LSP slices:

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/lsp*.test.ts --runInBand
npm run build
git diff --check
```

For compile/import/emit declaration slices:

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/emit/compile.test.ts src/__tests__/compile-preprocess.test.ts src/__tests__/compile-all.test.ts --runInBand
npm run build
npm run validate-mc
git diff --check
```

For release-facing slices:

```bash
npm run build
npm test -- --selectProjects unit --runInBand
npm run validate-mc
npm run smoke:package
npm run smoke:browser-ide -- --ide-dir /Users/yuzhe/projects/redscript-ide
git diff --check
```

For optional live Paper proof only when needed and server is confirmed online:

```bash
curl -fsS --max-time 5 "http://${MC_HOST:-localhost}:${MC_PORT:-25561}/status"
MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live
```

## Autonomous Execution Queue

### Track A — Roadmap reset and stale-context cleanup

**Product promise:** Future goal sessions read one current source of truth instead of stale historical roadmaps.

**Primary files:**

- `docs/plans/2026-07-01-redscript-product-dx-autonomous-megagoal.md`
- `docs/plans/mc-mechanism-optimization/37-registry-resource-and-declaration-surface.md`
- `docs/plans/mc-mechanism-optimization/README.md`
- `docs/plans/compiler-mc-hardening-roadmap.md`
- `docs/plans/2026-06-30-redscript-autonomous-megagoal.md`

**Executable slices:**

- [x] A1. Create active roadmap `37` for registry resources and `.d.mcrs` declaration surface.
- [x] A2. Create this product-DX mega-goal with current baseline and short prompt.
- [x] A3. Update indices and old roadmap pointers so `37` is the active DX plan and the 2026-06-30 mega-goal is marked historical/superseded.
- [x] A4. Run docs-only verification and commit the reset.

**Gates:**

```bash
git diff --check
git status -sb
```

### Track B — LSP-only registry catalog and completions

**Product promise:** Existing string-based code gets useful registry ID assistance without compile behavior changes.

**Source of truth:** Track A in `docs/plans/mc-mechanism-optimization/37-registry-resource-and-declaration-surface.md`.

**Executable slices:**

- [x] B1. Add built-in registry catalog seed module.
- [x] B2. Complete known resource IDs in string positions for particles/effects/items/entity types.
- [x] B3. Add selector `type=` completion support.
- [x] B4. Add advisory hover/diagnostic hints without compiler rejection.

**Do not:** change parser syntax in this track.

### Track C — Parser/AST declaration and resource representation

**Product promise:** `declare fn`, `export declare fn`, and `resource <registry> <namespace:path>` have explicit AST representation.

**Executable slices:**

- [x] C1. AST/parser support for declaration-only functions.
- [x] C2. Parser tests for mixed `export declare fn`, normal `export fn`, and declaration-only files.
- [x] C3. Parser support for `resource` declarations.
- [ ] C4. Preserve doc/export metadata needed by later LSP/generation slices.

**Do not:** emit declaration-only functions.

### Track D — Typechecker declaration contracts and resource types

**Product promise:** Declaration-only functions and typed resources participate in typechecking and diagnostics.

**Executable slices:**

- [x] D1. Signature-only function symbol collection.
- [ ] D2. Call-checking against declaration-only signatures.
- [x] D3. Initial resource type representation and category mismatch diagnostics.
- [x] D4. String-literal compatibility migration tests.

**Do not:** broadly rewrite stdlib signatures before compatibility is pinned.

### Track E — Declaration import graph and non-emitting compile behavior

**Product promise:** Consumers can typecheck against `.d.mcrs` files without phantom datapack output.

**Executable slices:**

- [x] E1. Declaration-mode parse/typecheck for `.d.mcrs`.
- [x] E2. Import/preprocess or compile-stage handling for declaration-only dependencies.
- [x] E3. Non-emitting compile tests and stage snapshots if useful.
- [x] E4. Replace or refine compile-all skip reasons for declaration files only after a dedicated declaration smoke exists.

### Track F — Typed stdlib resource API migration

**Product promise:** Public stdlib APIs gradually expose typed resource IDs while preserving old string forms.

**Executable slices:**

- [x] F1. Pick one low-risk resource family, likely particles or effects.
- [x] F2. Add typed signatures/aliases and compatibility tests.
- [x] F3. Extend coverage matrix/docs without overclaiming live proof.
- [x] F4. Repeat only for additional families after F1/F2 pass.

### Track G — Contextual unquoted resource literals

**Product promise:** `minecraft:flame`-style literals work in typed contexts and fail clearly elsewhere.

**Prerequisite:** Tracks B–F have stable parser/typechecker/LSP coverage.

**Executable slices:**

- [x] G1. RED parser/typechecker tests for valid and invalid contexts.
- [x] G2. Parser/typechecker implementation.
- [x] G3. LSP hover/completion integration.
- [x] G4. Minimal docs/examples smoke.

### Track H — `.d.mcrs` generation from package exports

**Product promise:** Packages can generate a declaration surface with exports and docs for collaborators.

**Executable slices:**

- [x] H1. CLI design and argument parsing tests.
- [x] H2. Exported function/resource declaration generator.
- [x] H3. JSDoc preservation or explicit follow-up if parser lacks doc capture.
- [x] H4. Golden output + consumer typecheck smoke.

### Track I — Release/docs/IDE evidence polish

**Product promise:** Release docs and smoke gates stay aligned with the stronger compiler/product-DX story.

**Executable slices:**

- [x] I1. Audit README/docs claims for static vs live proof language.
- [x] I2. Ensure README quick-start source compiles if touched.
- [x] I3. Keep `report:release-evidence` output aligned with new declaration/resource proof labels if they become release-relevant.
- [ ] I4. Run package/browser IDE smoke before release-facing commits.

### Track J — Optional arithmetic/optimizer exploration only after DX stabilizes

**Product promise:** Numeric/performance ideas remain report-first and isolated from product-DX correctness work.

**Source of truth:** `docs/plans/arithmetic-optimization-exploration.md`.

**Executable slices:**

- [ ] J1. Build or refine compile-time arithmetic probe tooling.
- [ ] J2. Run read-only cost audits before implementation.
- [ ] J3. Add Paper/mechanism probes only for a concrete hypothesis.
- [ ] J4. Promote helpers only after command-cost and live/static evidence exist.

**Do not:** default-enable local-copy/RMW or change language `fixed` scale.

## Spark / Budget Execution Rules

- Use Spark for bounded implementation slices with explicit allowed files and forbidden scope.
- Keep workers file-disjoint where possible.
- Workers must not commit, push, rebase, or merge.
- Treat worker tests as advisory; rerun gates in the main worktree.
- Controller must inspect diffs, fix tails, update roadmaps, commit signed, push, and query CI once.
- Prefer local-first cadence: verified coherent commits, batch pushes occasionally or before stopping.

Worker prompt shape:

```text
You are the Spark implementation worker for RedScript.
Repo: /Users/yuzhe/projects/redscript
Read docs/plans/2026-07-01-redscript-product-dx-autonomous-megagoal.md and docs/plans/mc-mechanism-optimization/37-registry-resource-and-declaration-surface.md.
Implement only Track <X> Slice <Y>.
Allowed files: <exact files>.
Forbidden: compiler rewrite, new IR/VIR, raw/macro semantic parser, default local-copy/RMW, broad ABI cleanup, commits/pushes.
Run: <focused commands>.
Return: changed files, summary, exact commands/results, blockers.
```

## Per-Slice Checklist

1. Inspect `git status -sb` and relevant roadmap sections.
2. Write a RED test or explicitly justify docs-only/design-only.
3. Implement the minimal bounded change.
4. Run focused gate.
5. Update this mega-goal and/or roadmap `37` checkboxes and completion log.
6. Run relevant global gate.
7. Commit with `git commit -S`.
8. Push unless forbidden; query CI once after push.
9. Verify `git status -sb` and `git log -1 --show-signature --oneline`.
10. Continue to the next highest-value unblocked slice.

## Bounded Rediscovery Before Stopping

If visible checklist items appear exhausted:

- search active roadmaps for unchecked boxes;
- inspect `COMPILE_ALL_SKIP_MANIFEST` for stale declaration/test-fixture notes;
- compare coverage matrix and active proof labels against current tests;
- inspect LSP/parser/typechecker TODOs only near touched declaration/resource code;
- inspect release docs for stale static/live proof claims;
- do not invent new work outside the stated product-DX and safe evidence boundaries.

## Stop Conditions

Continue automatically after each verified slice. Stop only when:

1. all executable work in this mega-goal and roadmap `37` is done;
2. a product syntax/API decision is required;
3. a resource/credential/environment dependency is unavailable and no useful fallback exists;
4. gates repeatedly fail after realistic fix attempts and need human choice;
5. continuing would require an unsafe broad rewrite or an explicit non-goal.

If blocked, report:

- blocker and evidence;
- modified files;
- tests/gates run and results;
- `git status -sb`;
- last commit(s);
- safest next step.

## Completion Log

- 2026-07-01: Created product-DX mega-goal reset from live repository state. Baseline: clean `main` at `e6fe697`, latest main CI green, release evidence helper reports `redscript-mc@3.0.4` and live baseline `26/26`, compile-all has zero `known-language-gap`, optimizer diagnostic roadmap `36` is complete and local-copy/RMW remains manual experimental opt-in. Created active roadmap `37` for registry resources and `.d.mcrs` declaration surface. Docs-only reset; no code behavior changed.
- 2026-07-01: Reconciled mega-goal progress after the first product-DX run. Completed LSP registry catalog/completion/advisory diagnostics, parser declaration/resource representation through roadmap 37 Track B1-B3, resource type representation, and string/resource typed-context compatibility. Latest relevant commits include `b554403`, `d2cfe29`, `c14c685`, and `a0436ba`; CI for the latest pushed implementation commit passed. Remaining immediate work starts at roadmap 37 C2/C5 and Track D declaration-mode/non-emitting compile behavior.
- 2026-07-01: Completed roadmap 37 C5 resource mismatch diagnostics. Built-in resource catalog data is now shared between LSP and typechecker; known built-in IDs used in the wrong typed `resource<...>` context report category-specific errors, while unknown datapack/mod IDs remain open. Gates: typechecker unit subset (`137` tests), LSP unit subset (`133` tests), `npm run build`, `git diff --check`.
- 2026-07-01: Completed roadmap 37 D1-D3 declaration-mode/non-emitting compile behavior. Direct `.d.mcrs` compilation now typechecks and returns zero runtime files; declaration imports still inline type signatures for executable consumers without emitting declaration bodies. Gates: compile declaration/preprocess/compile-all subset (`159` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.
- 2026-07-01: Completed roadmap 37 D5 / mega-goal E4 skip-manifest reconciliation. Declaration-only compile-all skips now point to the dedicated declaration-mode smoke and stay out of executable compile-all rather than representing known language gaps. Gates: compile-all skip manifest + declaration compile + compile-all subset (`134` tests), `npm run build`, `git diff --check`.
- 2026-07-01: Completed roadmap 37 E1-E2 / mega-goal F1-F2 first typed resource command surface. Built-in resource argument positions now get typed `resource<...>` expectations for category diagnostics while preserving existing string-compatible calls and unknown datapack/mod IDs. Gates: typechecker subset (`139` tests), compile-all + coverage matrix (`123` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.
- 2026-07-01: Completed roadmap 37 E3 / mega-goal F3 coverage-matrix proof labeling. Added `typed-resource-api-unit` and a language-feature row for typed resource API diagnostics so the new typechecker/static evidence is explicit but not promoted to live Paper proof. Gates: coverage matrix (`10` tests), typechecker + compile-all subset (`126` tests), `npm run build`, `git diff --check`.
- 2026-07-01: Completed roadmap 37 E4 public docs examples. Language reference now shows typed `resource<particle>` / `resource<effect>` declaration forms side by side with existing string-compatible command calls and explicitly marks this as compile/typechecker evidence, not live Paper proof. Gates: resource docs + coverage matrix (`11` tests), `npm run build`, `git diff --check`.
- 2026-07-01: Completed roadmap 37 F1-F2 / mega-goal G1-G2 contextual unquoted resource literals. Parser recognizes `namespace:path` expressions as resource-literal nodes; typechecker accepts them only in typed `resource<...>` contexts and reports a clear ambiguity error elsewhere. Gates: parser/resource typechecker RED slice (`86` tests), parser + typechecker subset (`233` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.
- 2026-07-01: Completed roadmap 37 F3 / mega-goal G3 LSP integration for contextual unquoted resource literals. Completion now offers catalog IDs after `namespace:` in typed built-in resource argument positions, and hover reports `resource<...>` metadata for known and open datapack/mod IDs. Gates: focused LSP slice (`70` tests), full LSP subset (`232` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.
- 2026-07-01: Completed roadmap 37 F4 / mega-goal G4 docs/examples smoke. The language reference now documents `particle(minecraft:flame, ...)` alongside string-compatible calls and states that unquoted `namespace:path` literals are accepted only in typed resource contexts. Gates: resource docs + LSP completion slice (`66` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.
- 2026-07-01: Completed roadmap 37 G1-G4 / mega-goal H1-H4 declaration generation CLI surface. Added `redscript declarations <file> --out <file.d.mcrs>` and `--out` alias parsing; generated surfaces include exported functions, exported declare stubs, resource declarations, and immediately preceding `/** ... */` / `/// ...` docs without mutating source. CLI tests assert output and typecheck the generated `.d.mcrs`. Gates: CLI + lexer/parser + declaration compile tests (`157` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.
- 2026-07-01: Completed mega-goal I1-I3 release/docs proof-language audit. README now lists `redscript declarations <file> --out <file.d.mcrs>`, marks typed resource checks as static diagnostics rather than live Paper proof, and replaces the stale `redscript build` quick-start/CLI wording with the implemented `redscript compile` command. Verified the README quick-start source compiles and emits a datapack via `node dist/src/cli.js compile`; `report:release-evidence -- --pretty` still reports the canonical four evidence labels and live baseline `26/26` without promoting declaration/resource static proof to live evidence. Gates: resource docs + coverage matrix (`12` tests), `npm run build`, quick-start compile smoke, `npm --silent run report:release-evidence -- --pretty`, `git diff --check`.

## Reporting Format When Finally Stopping

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
Read docs/plans/2026-07-01-redscript-product-dx-autonomous-megagoal.md fully, then execute it in /Users/yuzhe/projects/redscript as a long-running local-first autonomous loop.

Do not stop after one slice. Repeatedly pick the highest-value executable slice from the mega-goal and docs/plans/mc-mechanism-optimization/37-registry-resource-and-declaration-surface.md, then: inspect current state, write a focused RED test or justify docs-only, implement the minimal bounded change, run focused and relevant global gates, update roadmap checkboxes/completion logs, make a signed commit, push or batch-push, query CI once, and continue.

Respect all non-goals: no compiler rewrite, no new IR/VIR, no raw/macro semantic parser, no default local-copy/RMW, no broad ABI cleanup, no general runtime string equality, no closed-enum registry model, and no breaking existing string-compatible APIs.

Prefer tracks in this order: roadmap reset cleanup; LSP-only registry catalog/completion; parser/AST declaration/resource representation; typechecker declaration contracts/resource types; declaration import graph and non-emitting compile behavior; gradual typed stdlib resource migration; contextual resource literals; `.d.mcrs` generation; release/docs/IDE evidence polish. Use Spark only for bounded file-scoped slices and controller-verify all diffs/gates.

Continue until blocked by a real product/resource/risk decision, repeated gate failure requiring human choice, or all executable work is done. When stopping, report commits, gates, remaining blockers, git status, and safest next slice.
```
