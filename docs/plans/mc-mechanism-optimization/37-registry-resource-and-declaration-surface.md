# 37. Registry Resource and `.d.mcrs` Declaration Surface Roadmap

> **For Hermes/Codex:** This is the active language/package-DX roadmap after the release-readiness and backend diagnostic passes. Implement task-by-task on `main`. Do not stop after one small slice when a long-running goal says to continue: update this file, run the slice gates, signed commit, push/batch-push according to the active mega-goal, then continue until a real blocker appears.

**Goal:** Make Minecraft registry IDs and RedScript package APIs typed, discoverable, and declaration-friendly without breaking the current string-compatible compiler path.

**Architecture:** Keep the existing production pipeline: Source → AST → TypeCheck → HIR → MIR → Optimizer → LIR → Emit. Add registry/declaration metadata first as parser/typechecker/LSP/package-contract layers; do not change command lowering or runtime semantics until those contracts are pinned by tests.

**Tech Stack:** TypeScript, Jest, RedScript `.mcrs` / `.d.mcrs`, LSP helpers under `src/lsp/`, parser/typechecker/compile pipeline, existing static MC validator and optional Paper oracle only for later runtime-facing slices.

---

## Current Baseline

Verified during the 2026-07-01 roadmap reset:

- `main` is clean at commit `e6fe697` and synced with `origin/main`.
- Latest `main` CI is green for `test(vnext): deepen visual evidence tranche`.
- `COMPILE_ALL_SKIP_MANIFEST` has zero `known-language-gap` entries; remaining skips are repo artifacts, declaration-only inputs, or targeted test fixtures.
- Core live Paper oracle baseline is `26/26` local descriptor-driven cases.
- Release evidence helper reports package `redscript-mc@3.0.4`, git commit `e6fe697`, live baseline `26/26`, and available smoke scripts `smoke:package` / `smoke:browser-ide`.
- The previous optimizer diagnostic roadmap `36` is complete; local-copy/RMW remains manual experimental opt-in only.
- An older declaration-surface design note exists in `docs/plans/mc-mechanism-optimization/archive/2026-06-vir-arithmetic-spike/12-d-mcrs-declaration-surface.md`; treat it as reference, not active source of truth.

## Design Boundaries

- Do not model Minecraft registries as closed language enums. Registries are open across Minecraft versions, datapacks, mods, and server plugins.
- Keep string compatibility first. Calls like `particle("minecraft:flame", ...)`, `effect(p, "minecraft:speed")`, `give(p, "minecraft:stone")`, and selector text such as `@e[type=minecraft:zombie]` must continue to compile.
- Add LSP/catalog help before parser syntax. A typed catalog must not become a hard-coded semantic ceiling.
- `.d.mcrs` files are non-emitting by default: they affect typecheck, hover/completion, declaration import, and package API surfaces, not datapack output.
- Unquoted `namespace:path` resource literals are contextual typed literals, not arbitrary global identifiers. Add them only after parser/typechecker/LSP tests are pinned.
- Do not change Minecraft command semantics, raw/macro handling, local-copy/RMW defaults, or `fixed` numeric scale as part of this roadmap.
- Do not make every registry/resource helper a live Paper test. Use static/parser/type/LSP gates first; reserve Paper for runtime-facing behavior after a concrete risk exists.

## Desired Surface

### Registry resources

```mcrs
/// Create glue item used by contraption logic.
resource item create:glue

/// Custom particle from this datapack.
resource particle mypack:blue_spark

fn spawn_fx(p: Player) {
  particle(minecraft:flame, p.pos)
  effect(p, minecraft:speed)
  give(p, create:glue)
}
```

Later alias/import sugar can reduce repetition, but it is not the first slice:

```mcrs
use minecraft.particle.{flame, smoke}
use minecraft.effect.{speed}
use create.item.{glue}
```

### Declaration files

```mcrs
/// Adds a fixed-point value through an external datapack function.
export declare fn add(x: fixed, y: fixed): fixed @runtime("mypack:add");

/// Type-only package API.
export fn integrate(pos: int, vel: int, dt: fixed): int;
```

A `.d.mcrs` file contributes signature/resource/doc metadata; it should not emit runtime functions unless a future explicitly designed runtime-asset mechanism says so.

## Value Filter

Prefer slices that:

1. preserve existing compile-all and release gates;
2. add user-visible DX without changing runtime semantics;
3. create durable package/API boundaries;
4. keep each Spark lane file-disjoint and reviewable;
5. prove behavior with parser/typechecker/LSP/compile tests before docs claims.

Defer slices that require:

- unquoted resource literals before typed contexts exist;
- arbitrary raw-command parsing;
- package-manager design unrelated to declaration semantics;
- broad stdlib signature migrations before compatibility shims are pinned;
- command emission for declaration-only functions without a separate runtime ABI ADR.

## Tracks

### Track A — Registry catalog and string-position LSP completion

**Product promise:** Existing string-based code gets resource completions and diagnostics hints without parser or compile behavior changes.

**Primary files to inspect:**

- `src/lsp/server.ts`
- `src/lsp/*.ts`
- existing LSP completion/hover tests under `src/__tests__/lsp*`
- stdlib call sites for `particle`, `effect`, `give`, selector strings

**Executable slices:**

- [x] A1. Add a small built-in registry catalog module with versioned metadata for a minimal seed set: particles, effects, entity types, items, blocks, sounds.
- [x] A2. Add LSP completion in known string positions: `particle("...")`, `effect(..., "...")`, `give(..., "...")`, and selector `type=` fragments.
- [x] A3. Add hover/diagnostic hints for unknown built-in IDs as advisory only; do not reject compilation.
- [x] A4. Add package/user extension hook shape for catalogs, but keep loading inert until Track C/D needs it.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/lsp*.test.ts --runInBand
npm run build
git diff --check
```

**Do not:** alter parser syntax or typechecker semantics in Track A.

### Track B — Parser/AST representation for declarations and resources

**Product promise:** `declare fn`, `export declare fn`, and `resource <registry> <namespace:path>` are represented explicitly instead of being dropped or treated as runtime definitions.

**Primary files to inspect:**

- `src/ast/types.ts`
- `src/parser/index.ts`
- `src/parser/decl-parser.ts`
- `src/__tests__/parser-coverage.test.ts`

**Executable slices:**

- [x] B1. Represent declaration-only functions in AST with enough signature/doc/export metadata for typechecker/LSP, but do not wire emit behavior yet.
- [x] B2. Parse `export declare fn ...;` and mixed declaration/source files, preserving existing `export fn` behavior.
- [x] B3. Parse `resource <registry> <namespace:path>` declarations and preserve leading doc comments if doc plumbing already exists; otherwise store a stable placeholder for later LSP docs.
- [ ] B4. Keep `.d.mcrs` compile-all excluded until Track D adds declaration-mode checking.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/parser-coverage.test.ts --runInBand
npm run build
git diff --check
```

**Do not:** make declaration nodes emit functions in Track B.

### Track C — Typechecker declaration contracts and registry resource types

**Product promise:** Source files can call declaration-only signatures and receive useful type errors; resource declarations become typed values without closing registries.

**Primary files to inspect:**

- `src/typechecker/index.ts`
- existing `src/typechecker/*` helper seams
- `src/__tests__/typechecker*.test.ts`
- `src/__tests__/typechecker/**/*.test.ts`

**Executable slices:**

- [x] C1. Add signature-only functions to symbol collection and call checking.
- [ ] C2. Ensure declaration-only functions cannot require bodies and cannot be lowered/emitted accidentally.
- [x] C3. Add initial resource type representation: `resource<particle>`, `resource<effect>`, `resource<entity_type>`, `resource<item>`, `resource<block>`, `resource<sound>`.
- [x] C4. Accept compatible string literals where existing stdlib signatures still use `string`, and add migration tests so current examples keep compiling.
- [x] C5. Add typechecker diagnostics for resource category mismatch only in typed contexts.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/typechecker*.test.ts src/__tests__/typechecker/**/*.test.ts --runInBand
npm run build
git diff --check
```

**Do not:** rewrite stdlib signatures broadly until compatibility tests prove migration is safe.

### Track D — Declaration import graph and non-emitting compile behavior

**Product promise:** A package or source file can typecheck against `.d.mcrs` declarations without emitting phantom datapack functions.

**Primary files to inspect:**

- `src/compile.ts`
- `src/emit/compile.ts`
- compile stage snapshot helpers
- `src/__tests__/emit/compile.test.ts`
- `src/__tests__/compile-all.test.ts`

**Executable slices:**

- [x] D1. Add declaration-mode parsing/typechecking for `.d.mcrs` files without changing normal `.mcrs` behavior.
- [x] D2. Resolve declaration-only imports through the existing import/preprocess boundary or a small explicit declaration graph stage.
- [x] D3. Prove declaration-only inputs typecheck but emit zero runtime functions unless paired with executable source.
- [ ] D4. Add compile-stage snapshot coverage for declaration graph metadata if it clarifies the pipeline boundary.
- [x] D5. Keep `builtins.d.mcrs` and editor copy excluded from compile-all executable smoke until a dedicated declaration smoke replaces the skip reason.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/emit/compile.test.ts src/__tests__/compile-preprocess.test.ts src/__tests__/compile-all.test.ts --runInBand
npm run build
npm run validate-mc
git diff --check
```

**Do not:** add package-manager semantics unrelated to declaration resolution.

### Track E — Gradual stdlib/resource signature migration

**Product promise:** High-value stdlib APIs expose typed resource IDs while preserving existing string-based calls.

**Primary files to inspect:**

- `src/stdlib/*.mcrs`
- `src/__tests__/stdlib/*.test.ts`
- `src/__tests__/mc-integration/stdlib-coverage*.test.ts`
- coverage matrix docs/tests

**Executable slices:**

- [x] E1. Pick one low-risk resource family, likely particles or effects, and add typed aliases/signatures with string compatibility tests.
- [x] E2. Extend to item/entity/block/sound only after E1 gates pass.
- [x] E3. Update coverage matrix labels to distinguish typed resource API proof from live Paper proof.
- [x] E4. Add docs examples that show typed and string-compatible forms side by side.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/stdlib/*.test.ts src/__tests__/coverage-matrix.test.ts --runInBand
npm run build
npm run validate-mc
git diff --check
```

**Do not:** migrate every stdlib module by rote or break existing public examples.

### Track F — Contextual unquoted resource literals

**Product promise:** Users can write `minecraft:flame` or `create:glue` in typed resource contexts after the registry/typechecker path is safe.

**Prerequisites:** Tracks B–E have parser/typechecker/LSP coverage and current examples still compile.

**Executable slices:**

- [x] F1. Add RED parser tests for `namespace:path` only in typed/resource contexts, plus negative tests in ambiguous/general expression positions.
- [x] F2. Add parser and typechecker support for contextual resource literals.
- [x] F3. Add LSP hover/completion integration for literal tokens.
- [x] F4. Add example/docs smoke without rewriting old string examples wholesale.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/parser*.test.ts src/__tests__/typechecker*.test.ts src/__tests__/lsp*.test.ts --runInBand
npm run build
npm run validate-mc
git diff --check
```

**Do not:** treat `namespace:path` as a global identifier outside typed contexts.

### Track G — `.d.mcrs` generation from package exports

**Product promise:** A package can emit a declaration surface with exports and JSDoc for collaborators and LSP tooling.

**Primary files to inspect:**

- `src/cli.ts`
- CLI arg helpers under `src/cli/`
- emit/package helpers
- docs generation commands
- `src/__tests__/cli.test.ts`

**Executable slices:**

- [x] G1. Design CLI surface, e.g. `redscript declarations --out <path>` or an explicit compile option, with no implicit source mutation.
- [x] G2. Generate declaration output for exported functions/resources only.
- [x] G3. Preserve JSDoc/doc comments where parser metadata supports it; otherwise add a follow-up doc-comment capture slice.
- [x] G4. Add golden tests for generated `.d.mcrs` output and a consumer typecheck smoke.

**Gates:**

```bash
npm test -- --selectProjects unit --runTestsByPath src/__tests__/cli.test.ts src/__tests__/emit/compile.test.ts --runInBand
npm run build
git diff --check
```

**Do not:** silently mutate `src/stdlib/*.mcrs` or generated docs.

## Spark / Worker Rules

Use Spark/Codex-Spark only for bounded, file-scoped slices. Each worker prompt must include:

```text
Repo: /Users/yuzhe/projects/redscript
Read docs/plans/mc-mechanism-optimization/37-registry-resource-and-declaration-surface.md.
Implement only Track <X> Slice <Y>.
Allowed files: <exact list>.
Forbidden: compiler rewrite, raw/macro semantic parser, default local-copy/RMW enablement, broad package-manager design, commits/pushes.
Run: <focused commands>.
Return: changed files, summary, commands/results, blockers.
```

Controller must inspect diffs, run gates in the main worktree, update this roadmap, commit, push/batch-push, and query CI once after pushing.

## Per-Slice Checklist

1. `git status -sb`.
2. Read relevant files and this roadmap section.
3. Write a RED test or explain why the slice is docs-only/design-only.
4. Implement the minimal change.
5. Run focused gate.
6. Update checkboxes and completion log.
7. Run relevant global gates.
8. Signed commit and push/batch-push according to the active mega-goal.
9. Verify `git status -sb` and `git log -1 --show-signature --oneline`.
10. Continue unless blocked by product/resource/risk decision.

## Completion Log

- 2026-07-01: Created as the active registry-resource / `.d.mcrs` declaration-surface roadmap during the product-DX mega-goal reset. It supersedes the archived `12-d-mcrs-declaration-surface.md` note as the implementation source of truth. No code behavior changed in this docs-only reset.
- 2026-07-01: Completed Track A. Verified the existing built-in registry catalog/completion coverage for particles, effects, items, blocks, sounds, entity types, builtin string argument positions, and selector `type=` fragments. Added advisory-only LSP resource diagnostics for unknown built-in IDs plus an inert catalog-extension hook shape for future package/user catalogs. Gates: LSP unit suite (`133` tests), `npm run build`, `git diff --check`.
- 2026-07-01: Completed Track B parser representation slices B1-B3. Verified existing `declare fn` / `export declare fn` AST coverage and added `resource <registry> <namespace:path>;` parsing into non-emitting `Program.resourceDeclarations` metadata with a stable empty doc placeholder until doc-comment plumbing exists. Gates: `src/__tests__/parser-coverage.test.ts` (`70` tests), `npm run build`, `git diff --check`.
- 2026-07-01: Completed Track C1/C3 representation slice. Verified existing declaration-only function call checking and added first-class `resource<registry>` type nodes, parser support, typechecker display/matching by registry, and MIR diagnostic formatting. Gates: parser + typechecker unit subset (`205` tests), `npm run build`, `git diff --check`.
- 2026-07-01: Completed Track C4 compatibility slice. String and MC-name literals now adopt the expected `resource<registry>` type in typed contexts, preserving string-compatible call surfaces while allowing typed declaration signatures. Gate: focused declared-function resource tests, then parser + typechecker subset, `npm run build`, `git diff --check`.
- 2026-07-01: Completed Track C5 resource mismatch diagnostics. The typechecker now reuses the shared built-in registry seed to reject known built-in resource literals used in the wrong typed resource context, while keeping unknown datapack/mod IDs open. Gates: typechecker unit subset (`137` tests), LSP unit subset (`133` tests), `npm run build`, `git diff --check`.
- 2026-07-01: Completed Track D1-D3 declaration-mode/non-emitting compile behavior. Direct `.d.mcrs` file compilation now parses and typechecks declaration-only inputs but returns zero datapack files; existing `.d.mcrs` import/preprocess tests continue to prove declaration signatures remain callable from executable source without emitting declaration bodies. Gates: compile declaration/preprocess/compile-all subset (`159` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.
- 2026-07-01: Completed Track D5 skip-manifest reconciliation. Declaration-only skip entries now explicitly remain outside executable compile-all while pointing to the dedicated declaration-mode smoke instead of implying an unresolved language gap. Gates: compile-all skip manifest + declaration compile + compile-all subset (`134` tests), `npm run build`, `git diff --check`.
- 2026-07-01: Completed Track E1-E2 first typed resource command surface. Built-in resource argument positions for particle/effect/effect_clear/give/clear/playsound/setblock/fill/summon now receive typed `resource<...>` expectations for category diagnostics while preserving string-compatible APIs and open datapack/mod IDs. Gates: typechecker subset (`139` tests), compile-all + coverage matrix (`123` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.
- 2026-07-01: Completed Track E3 coverage-matrix proof labeling. Added `typed-resource-api-unit` and a language-feature row for typed resource API diagnostics so static/typechecker evidence is visible without being counted as live Paper proof. Gates: coverage matrix (`10` tests), typechecker + compile-all subset (`126` tests), `npm run build`, `git diff --check`.
- 2026-07-01: Completed Track E4 public docs examples. `docs/LANGUAGE_REFERENCE.md` now shows existing string-compatible resource command calls beside typed declaration/package API signatures and explicitly labels typed resource checks as compile/typechecker diagnostics, not live Paper proof. Gates: resource docs + coverage matrix (`11` tests), `npm run build`, `git diff --check`.
- 2026-07-01: Completed Track F1-F2 contextual unquoted resource literals. The parser now recognizes `namespace:path` expressions as resource-literal `mc_name` nodes; the typechecker accepts them in typed `resource<...>` contexts and reports a clear error in general/ambiguous expression positions. Gates: parser/resource typechecker RED slice (`86` tests), parser + typechecker subset (`233` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.
- 2026-07-01: Completed Track F3 LSP support for contextual unquoted resource literals. LSP resource completions now work for `namespace:` prefixes in typed built-in resource arguments, and hover shows `resource<...>` metadata for known and open datapack/mod IDs. Gates: focused LSP slice (`70` tests), full LSP subset (`232` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.
- 2026-07-01: Completed Track F4 docs/examples smoke for contextual unquoted resource literals. The language reference now documents `particle(minecraft:flame, ...)` alongside existing string-compatible forms and states that unquoted `namespace:path` is limited to typed resource contexts. Gates: resource docs + LSP completion slice (`66` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.
- 2026-07-01: Completed Track G1-G4 declaration generation CLI surface. Added `redscript declarations <file> --out <file.d.mcrs>` and `--out` alias parsing; it writes a non-mutating `.d.mcrs` surface for exported functions, exported declare stubs, and resource declarations. Lexer/parser now retain immediately preceding `/** ... */` and `/// ...` doc comments on declaration-surface nodes; CLI tests assert generated docs/output and a consumer `check` smoke. Gates: CLI + lexer/parser + declaration compile tests (`157` tests), `npm run build`, `npm run validate-mc`, `git diff --check`.

## Stop Conditions

Stop only when:

- all executable tracks are complete;
- a product syntax/API decision is required;
- a required LSP/compile/package boundary needs user choice;
- gates repeatedly fail in a way that needs human direction;
- continuing would require an excluded broad rewrite or runtime semantic change.

If blocked, report modified files, exact gates, `git status -sb`, blocker evidence, and safest next step.
