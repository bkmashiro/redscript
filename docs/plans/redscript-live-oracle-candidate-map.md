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

- `MC_CORE_REQUIRE_ONLINE=true npm run test:mc-core:live` passed 19/19 descriptor-driven cases on 2026-06-30 against the local harness at `localhost:25561`.
- Existing live coverage already includes scoreboard arithmetic, branch/loop returns, macro-with-storage, NBT read/write loops, foreach context, and load/tick lifecycle hooks.

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
- Suggested next case shape: only add after a minimized bug or deterministic harness setup exists.

### timer — medium

- Category: `minecraft-boundary/high-risk`
- Current proof levels: stdlib-source-present, mc-integration-offline-skippable, compile-all-static-smoke
- Candidate reason: Timer intrinsics lower to scoreboard slots and schedules; good candidate for bounded live smoke.
- Evidence (completed): Added descriptor-driven controlled countdown case in `tests/mc-cases/core-oracle.mcrs` (`test_controlled_timer_countdown`) with `controlledTicks=4` countdown/done assertions in `tests/mc-cases/core-oracle-cases.ts`, proving deterministic timer-like tick behavior in live harness once available.
- Suggested next case shape: only add after a minimized bug or deterministic harness setup exists.

### events — low

- Category: `minecraft-boundary/high-risk`
- Current proof levels: stdlib-source-present, mcruntime-e2e, mc-integration-offline-skippable, compile-all-static-smoke
- Candidate reason: Lifecycle hooks are partly live-covered; more event cases need harness control and should stay selective.
- Suggested next case shape: only add after a minimized bug or deterministic harness setup exists.

## Do not add live cases for now

- Pure formatting/text helpers without runtime-sensitive lowering.
- Broad event/entity demos that require nondeterministic players/mobs unless the harness creates and cleans deterministic fixtures.
- Every stdlib function by rote; prefer one high-signal semantic smoke per fragile lowering family.
