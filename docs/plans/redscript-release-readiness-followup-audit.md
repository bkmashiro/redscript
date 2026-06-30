# RedScript release-readiness follow-up audit

## 1) Current observed state

- `known-language-gap` has been reduced to zero by the recent string-specialization and external-scoreboard verifier slices.
- Priority 2 is now a minimal ABI boundary rather than an open broad-design question: compiler-owned fake players stay protected, while explicit external scoreboard slots such as `$(player)` and user display labels remain valid.
- Golden coverage exists for several core command paths, but the release-readiness track still benefits from a small public examples/templates gate that proves representative examples compile and emit stable artifact shapes.
- Static validation and live Paper oracle coverage must remain separate: compile-only/offline tests are useful release gates, not live Minecraft behavior proof.

### Evidence labels for release claims (required)

- `compile-only`: proves the source compiles and datapack files emit.
- `static-mc-validation`: proves generated strings pass current static MC validation subset.
- `golden-artifact-shape`: proves stable emitted artifacts and command fragments via snapshots/goldens.
- `live-paper-oracle`: proves runtime semantics when the harness returns structured results from a live Paper server.

A release-readiness gate is considered live-proof only where `live-paper-oracle` evidence exists; do not reclassify other labels as runtime proof.

Inspected surfaces from the Spark audit worktree included:

- `docs/plans/compiler-mc-hardening-roadmap.md`
- `docs/plans/redscript-coverage-matrix.md`
- `docs/plans/redscript-coverage-matrix.json`
- `docs/plans/redscript-live-oracle-candidate-map.md`
- `docs/plans/2026-06-30-redscript-autonomous-megagoal.md`
- `docs/plans/mc-mechanism-optimization/36-typed-boundary-and-diagnostic-roadmap.md`
- `src/__tests__/helpers/compile-all-skip-manifest.ts`
- `src/__tests__/compile-all-skip-manifest.test.ts`
- `src/__tests__/compile-all.test.ts`
- `src/__tests__/coverage-matrix.test.ts`
- `src/__tests__/datapack-artifact-validator.test.ts`
- `src/testing/datapack-artifact-validator.ts`
- `src/__tests__/golden/core-command-golden.test.ts`
- `src/__tests__/lir/verify.test.ts`
- `src/lir/verify.ts`
- `src/__tests__/mc-syntax.test.ts`
- `src/__tests__/mc-validator-coverage.test.ts`
- `src/__tests__/mc-validator-extra.test.ts`

## 2) Ranked bounded slices

| ID | Value | Allowed files | Forbidden files | Conflict risk | Exact gate command | Why bounded |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Add public golden examples/templates gate for restored release examples. | `src/__tests__/golden-examples.test.ts` | compiler source, examples/templates, skip manifest | Low | `npm test -- --selectProjects unit --runTestsByPath src/__tests__/golden-examples.test.ts --runInBand` | New isolated test file; compile/static artifact shape only; no live oracle claim. |
| S2 | Close external objective ABI docs and roadmap status. | `docs/plans/redscript-external-scoreboard-objective-abi.md`, `docs/plans/2026-06-30-redscript-autonomous-megagoal.md` | source/tests/package files | Medium | `git diff --check` | Documentation-only alignment after code already landed. |
| S3 | Add extra verifier edge tests for `$(target)` and user display labels that resemble compiler slots but are not current-function-owned. | `src/__tests__/lir/verify.test.ts` | `src/lir/verify.ts` unless a real bug appears | Low | `npm test -- --selectProjects unit --runTestsByPath src/__tests__/lir/verify.test.ts --runInBand` | Isolated contract tests; no verifier behavior change unless RED exposes a precise bug. |
| S4 | Add focused static validator cases for high-risk function-with-storage/macro boundaries, explicitly labelled as static-not-live proof. | `src/__tests__/mc-syntax.test.ts`, `src/__tests__/mc-validator-coverage.test.ts`, `src/__tests__/mc-validator-extra.test.ts` | `src/mc-validator/**`, live harness code | Medium | `npm test -- --selectProjects unit --runTestsByPath src/__tests__/mc-syntax.test.ts src/__tests__/mc-validator-coverage.test.ts src/__tests__/mc-validator-extra.test.ts --runInBand` | Test-only static command coverage; avoids runtime semantics and broad validator rewrites. |
| S5 | Add coverage-matrix note distinguishing compile/static evidence from live-oracle evidence for release-green claims. | `docs/plans/redscript-coverage-matrix.md`, `docs/plans/redscript-live-oracle-candidate-map.md` | code/tests/package files | Low | `git diff --check` | Docs-only traceability; reduces future overclaim risk. |

## 3) Parallelization plan

Safe parallel batches:

- Batch A: S1 and S2 can run together if S1 does not edit the roadmap.
- Batch B: S3 and S5 can run together after S2 lands.
- Batch C: S4 should run alone or after S3, because it touches adjacent static-validator contract surfaces and may uncover documentation wording that affects S5.

Sequential constraints:

- Any slice that edits `docs/plans/2026-06-30-redscript-autonomous-megagoal.md` should be serialized to avoid roadmap conflicts.
- Any behavior change to `src/lir/verify.ts` must be controller-reviewed and should not run in parallel with verifier-test-only slices.
- Live Paper oracle work is separate and must not be claimed from compile/static gates.

## 4) Stop conditions / blocked product decisions

- Stop if a proposed slice needs general runtime string equality, a raw/macro semantic parser, broad scoreboard ABI redesign, new IR/VIR, or default enablement of experimental optimizer flags.
- Stop if a static/offline gate is the only evidence for a runtime-behavior claim; either label it static-only or run a real live oracle.
- Stop if new examples require reintroducing `known-language-gap` instead of explicit policy/test coverage.

## 5) Stale docs requiring follow-up

- The active release roadmap should point Priority 3 at the new public golden examples gate once it is controller-verified.
- `docs/plans/redscript-coverage-matrix.md` and `.json` may still contain older wording around compile-all blockers; update only after checking current generated expectations.
- The optimizer docs remain deferred/evidence-only and should not be mixed into this release-readiness gate unless the user opens a new optimizer track.
