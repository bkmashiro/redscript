# RedScript vNext Roadmap

> Source of truth for work after the 2026-06 release-readiness hardening pass. Keep implementation slices bounded, test-backed, and based on `main`.

## Current baseline

Verified on 2026-06-30:

- `main` is green against the local release-readiness gates.
- Latest CI for `test(release): validate compile-all mc commands` completed successfully.
- `compile-all` has zero `known-language-gap` entries in the typed skip manifest.
- All non-skipped `.mcrs` compile-all sources are now covered by static `.mcfunction` command validation.
- Core live Paper oracle has passed `25/25` descriptor-driven cases against the local TestHarness on 2026-06-30, including P1 world setblock, inventory equipment, bounded random range, entity spawn, and particle command smokes (local harness only).
- Existing production pipeline remains: Source → AST → TypeCheck → HIR → MIR → Optimizer → LIR → Emit datapack.

Evidence labels:

- `compile-only` — compiler accepts source and emits datapack artifacts.
- `static-mc-validation` — emitted commands pass RedScript's current static MC validator subset.
- `golden-artifact-shape` — emitted file/command shape is pinned by stable tests.
- `live-paper-oracle` — a running Paper/TestHarness returns structured runtime assertion results.

Only `live-paper-oracle` is runtime proof. Offline/static gates must not be described as live Minecraft proof.

## P0 — Release confidence and evidence chain

**Goal:** make release readiness auditable rather than anecdotal.

### P0.1 CI evidence separation — complete (maintenance)

- Completed with `live-mc-core.yml` checked in and configured for manual/nightly execution only when `MC_SERVER_DIR`/harness env is present.
- Keep unit/static gates mandatory on normal pushes; live-paper checks remain explicit and operator-gated.
- Maintenance check: ensure the workflow still skips with a clear reason when harness/server config is missing.

Release maintenance commands:

```bash
npm run build
npm test -- --selectProjects unit --runInBand
npm run validate-mc
npm run test:mc-core
# manual/nightly only, with real harness configured
MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live
```

### P0.2 Core oracle descriptors — complete (maintenance)

- Completed with descriptor-driven core cases under `tests/mc-cases/**` and structured assertions.
- Current baseline includes a controlled timer countdown descriptor path in `tests/mc-cases/core-oracle.mcrs` and `tests/mc-cases/core-oracle-cases.ts` with deterministic ticking.
- Maintenance rule: only add/adjust descriptors when there is a targeted bug, behavior regression, or coverage gap.

### P0.3 Release smoke checklist — complete (maintenance)

Before tagging or publishing a release, re-run:

- package tarball smoke:
  - `npm run smoke:package`
- browser IDE compiler-load smoke:
  - `npm run smoke:browser-ide -- --ide-dir /Users/yuzhe/projects/redscript-ide`
- static compile/validation gates (as already listed above) and README/docs drift checks.
- `npm run docs:check` only when docs outputs are intentionally edited.

Evidence labels in this track:

- `compile-only` / `static-mc-validation` / `golden-artifact-shape` remain offline/static gates.
- `live-paper-oracle` comes only from configured runs of `test:mc-core:live`.

Concrete checklist: [`redscript-release-evidence-checklist.md`](redscript-release-evidence-checklist.md).

## P1 — Selective live Paper oracle expansion

**Goal:** add small high-signal runtime proofs where Minecraft behavior is actually risky.

Priority modules/cases:

1. `timer` / `scheduler` — tick lifecycle, delayed execution, scoreboard slot ownership.
2. `events` — runtime asset merge, dispatcher tags, executor context.
3. `inventory` — minimal give/clear/assert path.
4. `world` — deterministic setblock/assert-block path.
5. `spawn` / `mobs` / `particles` / `bossbar` / `interactions` — only if the harness can create and clean deterministic fixtures.
6. `random` — bounded range smoke only; do not claim distribution proof.

Rules:

- Use structured harness assertions, not HTTP 200 alone.
- Avoid flaky wall-clock waits; prefer controlled ticks and isolated namespaces/objectives.
- Do not try to prove every stdlib function through Paper.

## P2 — Registry resources and `.d.mcrs` package surface

**Goal:** improve user-facing language/package DX without breaking existing string-based code.

Implementation order:

1. LSP-only registry catalog completion in existing string positions:
   - `particle("...")`, `effect(..., "...")`, `give(..., "...")`, selector `type=...`.
2. Registry metadata model with MC-version awareness and user/package extension hooks.
3. Parse/typecheck declarations such as:

   ```mcrs
   resource item create:glue
   resource particle mypack:blue_spark
   ```

4. Introduce resource-typed stdlib signatures gradually: `ParticleId`, `EffectId`, `EntityTypeId`, `ItemId`, `BlockId`, etc.
5. Extend `.d.mcrs` with declaration-only external functions, `export`, package API surfaces, and JSDoc-preserving hover metadata.
6. Add contextual unquoted resource literals such as `minecraft:flame` only after parser/typechecker/LSP RED tests are pinned.

Acceptance:

```bash
npm test -- src/__tests__/parser*.test.ts src/__tests__/typechecker*.test.ts src/__tests__/lsp*.test.ts --runInBand
npm run build
npm run validate-mc
```

## P3 — Arithmetic and Minecraft mechanism optimization

**Goal:** optimize only with measurement and proof; keep language `fixed` at ×10000.

First build/maintain the cost lens:

- command count, file count, setup cost;
- counts by `scoreboard`, `execute`, `data`, `function`, `summon`, `tp`, `storage`, selector, macro;
- O0/O1/O2 comparison;
- deterministic JSON output.

Candidate tranches:

1. `sincos_hp` combined helper — likely shares one rotation/local-coordinate mechanism.
2. Direct scoreboard read-modify-write — prove alias/barrier safety before behavior change.
3. Single-use temp/copy-chain folding — prove command shrink with goldens.
4. Display-entity SVD/norm probe — Paper proof before helper promotion.
5. Quaternion normalization probe — speculative, probe-only until live behavior is stable.
6. Explicit sqrt/div/reciprocal tiers with range/error/cost metadata.

Acceptance:

```bash
npm run test:probe
npm run gate:lir-local-copy -- --output /tmp/redscript-lir.json
npm run build
npm run validate-mc
```

`local-copy/RMW` remains manual experimental opt-in unless a future ADR changes the default.

## P4 — Incremental compiler architecture cleanup

**Goal:** reduce responsibility concentration only after behavior is pinned.

Priority seams:

1. Typechecker deeper split: symbol collection, expression typing, statement typing, builtin/event checks.
2. `emit/index.ts` split: command rendering, datapack assembly, tag JSON, runtime helper emission, source-map/path handling.
3. `cli.ts` split: command handlers for compile/build, publish/package, docs/tune, config loading.
4. `ast/types.ts` split: core AST, MC-specific AST, decorators/events, type nodes.

Rules:

- Move one responsibility per PR-sized slice.
- Preserve public exports or add compatibility re-exports.
- Add focused tests before moving behavior.
- Run broad gates after each split.

## P5 — Static validator and artifact validator depth

**Goal:** expand static validation for emitted command families without pretending to be a full Minecraft parser.

High-value command families:

- `setblock`, `fill`;
- `title`, `sound`, `bossbar`;
- `summon`;
- common particle variants;
- macro function template lines generated by RedScript.

Artifact checks:

- function references resolve inside emitted datapack;
- tag values resolve where expected;
- load/tick tags are valid;
- namespace/path safety;
- `function ... with storage` targets are valid;
- macro files contain only accepted macro-template shapes.

Acceptance:

```bash
npm run validate-mc
npm test -- --selectProjects unit --runTestsByPath \
  src/__tests__/mc-syntax.test.ts \
  src/__tests__/mc-validator-extra.test.ts \
  src/__tests__/compile-all-static-mc-validation.test.ts \
  --runInBand
```

## P6 — Product docs and examples

**Goal:** make user-facing claims match actual proof levels and current language boundaries.

Tasks:

- Explain static validation vs live Paper proof in release/docs language.
- Document string strategy: literal specialization and finite-choice int/enum rewrites are supported; general runtime string equality remains deferred.
- Document external scoreboard objective interop and compiler-owned fake-player protection.
- Document numeric scale policy: language `fixed` is ×10000; stdlib helper families may use explicit alternate scales.
- Keep public examples compiling and statically validated; add behavior notes where useful.

## Non-goals for this roadmap

Do not spend vNext budget on:

- compiler rewrite or new default IR/VIR architecture;
- broad raw/macro semantic parser;
- default-enabling local-copy/RMW;
- general runtime string equality;
- broad call/return ABI cleanup without a separate ADR and negative fixture suite;
- live Paper proof for every stdlib function;
- large visual/gameplay demo rewrites;
- broad LSP/editor/package churn unrelated to compiler maturity.

## Recommended first tranche

P0 artifacts are in place, so start with P1:

1. add selective `timer`/`events`/`inventory` live core slices with controlled ticks and assertions;
2. keep/clean descriptor-driven core oracle cases where harness evidence is still bounded/risky;
3. keep release smoke gates (package + browser IDE) in the publish workflow.
