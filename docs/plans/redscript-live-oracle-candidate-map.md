# RedScript Live Oracle Candidate Map

Generated from `docs/plans/redscript-coverage-matrix.json` as the Track D bounded-candidate selection. This is intentionally selective: live cases should prove semantics only where Minecraft runtime behavior is a real risk, not duplicate every static stdlib compile test.

## Evidence labels (for candidate inclusion)

- `compile-only`: compiler accepts source and emits datapack files, but no runtime verification.
- `static-mc-validation`: static checker accepts command strings and references under the current validator subset.
- `golden-artifact-shape`: stable emitted command/file artifacts are asserted by golden checks.
- `live-paper-oracle`: only this label means runtime proof from a running Paper harness with structured assertion results.

Scope rule: only promote a claim to `live-paper-oracle` when a live run is executed; do not reclassify offline, compile, or static-validator signals as runtime proof.

Cross-reference: release-level intent and gating policy are tracked in the [coverage matrix](redscript-coverage-matrix.md) and [follow-up audit](redscript-release-readiness-followup-audit.md).

## Current live baseline

- `MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live` passed `26/26` descriptor-driven cases on 2026-06-30 against the local harness at `localhost:25561` (actual runtime proof only for this local run).
- Existing live coverage already includes scoreboard arithmetic, branch/loop returns, macro-with-storage, NBT read/write loops, foreach context, load/tick lifecycle hooks, timer countdown, world setblock, inventory equipment, bounded random range, entity spawn, particle command smoke, and visual/UI command smoke.

## Candidate priorities

### math — medium

- Category: `pure-or-mostly-arithmetic`
- Current proof levels: stdlib-source-present, import-resolution-unit, mcruntime-e2e, mc-integration-offline-skippable, compile-all-static-smoke
- Candidate reason: Arithmetic is broadly covered but fixed/scale-sensitive helpers benefit from live scoreboard proof.
- Suggested next case shape: only add after a minimized bug or deterministic harness setup exists.

### random — medium

- Category: `pure-or-mostly-arithmetic`
- Current proof levels: stdlib-source-present, mcruntime-e2e, mc-integration-offline-skippable, compile-all-static-smoke
- Candidate reason: Random helpers require semantic smoke around bounded ranges/distribution shape without promising determinism.
- Evidence (completed): Added descriptor-driven `bounded random range smoke` using `execute store result score ... run random value 0..4` plus scoreboard range pass-flag assertion. This is range proof only, not distribution proof.
- Suggested next case shape: keep as range-pass only; distribution claims remain out of scope.

### world block boundary — medium

- Category: `minecraft-boundary/high-risk`
- Current proof levels: static-mc-validation, mc-integration-offline-skippable, compile-all-static-smoke, live-paper-oracle
- Candidate reason: Boundary command lowering for setblock/block-state assertions benefits from one deterministic runtime smoke.
- Evidence (completed): Added descriptor-driven `world setblock smoke` with deterministic setblock + `execute if block` pass-flag assertion and cleanup.
- Suggested next case shape: only extend if side-effect cleanup or block-state variants become release blockers.

### inventory/equipment boundary — medium

- Category: `minecraft-boundary/high-risk`
- Current proof levels: static-mc-validation, mc-integration-offline-skippable, compile-all-static-smoke, live-paper-oracle
- Candidate reason: Inventory-adjacent commands (`item replace entity`) are high-risk command-boundaries due selector-slot syntax and nbt shape changes across versions.
- Evidence (completed): Added descriptor-driven `inventory equipment smoke` using deterministic armor-stand fixture and `execute store success ... run item replace entity ... weapon.mainhand with minecraft:diamond_sword`.
- Suggested next case shape: keep scope to deterministic fixture setup/teardown + explicit pass-flag scoring; expand only if version-specific nbt assertions become fragile.

### timer — medium

- Category: `minecraft-boundary/high-risk`
- Current proof levels: stdlib-source-present, mc-integration-offline-skippable, compile-all-static-smoke
- Candidate reason: Timer intrinsics lower to scoreboard slots and schedules; good candidate for bounded live smoke.
- Evidence (completed): Added descriptor-driven controlled countdown case in `tests/mc-cases/core-oracle.mcrs` (`test_controlled_timer_countdown`) with `controlledTicks=4` countdown/done assertions in `tests/mc-cases/core-oracle-cases.ts`; included in the 22/22 local live Paper baseline.
- Suggested next case shape: only add after a minimized bug or deterministic harness setup exists.

### entity spawn boundary — medium

- Category: `minecraft-boundary/high-risk`
- Current proof levels: static-mc-validation, mc-integration-offline-skippable, compile-all-static-smoke, live-paper-oracle
- Candidate reason: Entity summon + entity-selector verification is a high-risk runtime boundary and should stay deterministic and cleanup-safe.
- Evidence (completed): Added descriptor-driven `spawn entity smoke` in `tests/mc-cases/core-oracle.mcrs` and `tests/mc-cases/core-oracle-cases.ts` using `summon ... pig` + `kill` before/after and `execute if entity` pass flag assertion; included in the 26/26 local live Paper baseline.
- Suggested next case shape: keep as one-point deterministic smoke unless summon behavior, persistence, or selector semantics regressions are observed.

### particle command boundary — medium

- Category: `minecraft-boundary/high-risk`
- Current proof levels: static-mc-validation, mc-integration-offline-skippable, compile-all-static-smoke, live-paper-oracle
- Candidate reason: Particle emission is a high-risk command boundary with version-sensitive syntax and side-effect-free smoke patterns.
- Evidence (completed): Added descriptor-driven `particle command smoke` in `tests/mc-cases/core-oracle.mcrs` and `tests/mc-cases/core-oracle-cases.ts` using a stable `particle minecraft:flame ... force` command plus a pass-flag assertion after command execution; included in the 26/26 local live Paper baseline.
- Suggested next case shape: keep as one-point command boundary smoke unless particle syntax/version regressions are observed.

### visual/UI command boundary — medium

- Category: `minecraft-boundary/high-risk`
- Current proof levels: static-mc-validation, mc-integration-offline-skippable, compile-all-static-smoke, live-paper-oracle
- Candidate reason: Title, sound, and bossbar commands are high-risk and cross-version-sensitive visual boundaries that need deterministic, cleanup-safe fixture coverage.
- Evidence (completed): Added descriptor-driven `visual command boundary smoke` in `tests/mc-cases/core-oracle.mcrs` and `tests/mc-cases/core-oracle-cases.ts` with a player-independent scaffold and pass-flag assertions for `title`, `playsound`, and `bossbar`; included in the 26/26 local live Paper baseline. Bossbar cleanup uses namespace id `core_oracle:visual_smoke` with explicit remove-before/after.
- Suggested next case shape: keep as one deterministic boundary smoke (single function, isolated objectives/player names under `core_oracle`, deterministic cleanup).

### events — low

- Category: `minecraft-boundary/high-risk`
- Current proof levels: stdlib-source-present, mcruntime-e2e, mc-integration-offline-skippable, compile-all-static-smoke
- Candidate reason: Lifecycle hooks are partly live-covered; more event cases need harness control and should stay selective.
- Suggested next case shape: only add after a minimized bug or deterministic harness setup exists.

## Do not add live cases for now

- Pure formatting/text helpers without runtime-sensitive lowering.
- Broad event/entity demos that require nondeterministic players/mobs unless the harness creates and cleans deterministic fixtures.
- Every stdlib function by rote; prefer one high-signal semantic smoke per fragile lowering family.
