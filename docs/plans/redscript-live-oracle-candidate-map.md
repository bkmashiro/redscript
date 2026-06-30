# RedScript Live Oracle Candidate Map

Generated from `docs/plans/redscript-coverage-matrix.json` as the Track D bounded-candidate selection. This is intentionally selective: live cases should prove semantics only where Minecraft runtime behavior is a real risk, not duplicate every static stdlib compile test.

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
