# ADR: Local-copy/RMW Default Enablement

Date: 2026-06-30
Status: Rejected/deferred for default enablement
Decision owner: compiler/backend roadmap P15

## Context

RedScript has an experimental LIR local-copy/RMW rewrite path behind explicit opt-in flags. The pass can reduce generated scoreboard copy commands on arithmetic-heavy programs, but it touches a high-risk compiler boundary: scoreboard values are both local compiler temporaries and cross-function ABI/runtime-visible state.

This ADR decides whether the experimental local-copy/RMW path should become default behavior.

## Evidence source

Command run:

```bash
npm run gate:lir-local-copy -- --output /tmp/redscript-p15-lir-local-copy-adr.json
```

Observed key results:

- Gate status: `pass`.
- Rollout readiness recommendation: `manual-experimental-opt-in-only`.
- Evidence status: `benchmark-and-bounded-offline-evidence-only`.
- Command delta: `-497`.
- Score-copy delta: `-497`.
- Command regressions: `0`.
- Score-copy regressions: `0`.
- Improved rollout-readiness cases: `div3_hp`, `double_div`, `double_mul`, `fixed_mul_div`, `int_add_sub_mul`.
- Offline rewrite equivalence pack: `31` fixtures, `0` failed, status `pass`.
- Offline pack composition: `17` equivalent fixtures, `5` counterexample fixtures, `9` unsupported fixtures.
- VIR decision dashboard: `stay-experimental`.

## Decision

Do **not** default-enable local-copy/RMW now.

Keep the feature as manual experimental opt-in only.

## Rationale

The current evidence is useful and positive for the explicit experimental path, but it is not strong enough for default production behavior.

Default enablement is rejected/deferred because:

1. The gate itself recommends `manual-experimental-opt-in-only`.
2. The dashboard status is `stay-experimental`.
3. Offline evidence is bounded and explicitly not production correctness proof.
4. The offline equivalence pack still contains unsupported families/cases (`9` unsupported fixtures) and intentional counterexamples (`5`). Unsupported/counterexample coverage is valuable as safety evidence, but it cannot justify making the pass default.
5. ABI-visible slots (`$pN`, `$ret`, `$ret_*`), raw/macro text, call/context boundaries, and storage/NBT side effects remain conservative barriers.
6. Residual diagnostics still show large unknown/safe-candidate populations, so the remaining optimization surface needs more classification before default rollout.

## Default-enablement criteria for a future ADR

A future ADR may revisit default enablement only if all of the following are true:

1. The no-regression gate passes on CI for every PR that touches optimizer/LIR/lowering/emit.
2. Offline equivalence families cover scalar returns, aggregate returns, calls, macro calls, context calls, storage/NBT, and raw/macro barriers with no unsupported required families.
3. The gate recommendation changes from `manual-experimental-opt-in-only`/`stay-experimental` to an explicit production/default recommendation.
4. Benchmarks show no command-count or score-copy regressions across controlled and broad arithmetic/std-library probes.
5. Negative fixtures prove the pass does not rewrite across protected ABI slots, opaque barriers, or storage/NBT side effects.
6. A rollback path exists and is tested.

## Rollback plan if default enablement is attempted later

1. Keep a CLI/config/env kill switch that can disable the pass without reverting unrelated compiler changes.
2. Keep the current experimental flag path available for bisection.
3. On any CI or field regression, revert the default-toggle commit first while preserving tests/diagnostics.
4. Re-run:
   - `npm test -- --selectProjects unit --runInBand`
   - `npm run test:lir`
   - `npm run test:probe`
   - `npm run build`
   - `npm run validate-mc`
   - `npm run gate:lir-local-copy -- --output /tmp/redscript-p15-rollback-check.json`

## CI requirements before reconsideration

The following should be present before another default-enable proposal:

- A cheap required CI gate equivalent to `gate:lir-local-copy`.
- A stable offline equivalence pack checked into tests or generated deterministically.
- At least one broad compiler-output regression lane that compares command/score-copy deltas while preserving existing static MC validation.
- Clear dashboard fields that distinguish “experimental pass is safe to inspect” from “default behavior is production-ready”.

## Consequences

- Users and maintainers can continue to collect evidence with the explicit experimental flag.
- Default compiler output remains stable.
- P15 closes without production code changes.
- The next recommended work is expanding typed boundary/equivalence coverage, not flipping the default.

## Gates run

- `npm run gate:lir-local-copy -- --output /tmp/redscript-p15-lir-local-copy-adr.json`
- `npm run build`
- `git diff --check`
