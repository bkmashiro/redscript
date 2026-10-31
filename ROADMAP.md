# RedScript roadmap

Updated: 2026-11-01. This file owns current priorities and implementation status.
Design contracts and historical validation records are indexed in
[docs/plans/README.md](docs/plans/README.md).

Execution pointer: A3 bounded partial constant specialization and correctness
calibration. A2 now reports the production IR and emitted commands. Evaluate existing VIR only
on a bounded example, without changing the default compiler pipeline. Continue
through verified slices without requiring confirmation at each checkpoint.

## Goals and constraints

- Reduce generated Minecraft commands without changing observable game behavior.
- Make common game logic comfortable to express through the language and stdlib.
- Shorten the path from an inefficient output or bug to a verified regression test.
- Prepare a documented 4.0.0 release across npm, GitHub and the documentation site.

Work stays incremental on `main`. Preserve existing user files and server worlds.
Do not add dependencies or rewrite the compiler to introduce an optimization.
Compiler wall-clock speed is not the current bottleneck. Do not run performance
benchmarks or load tests in this workstream. Static command counts and bounded
correctness tests are allowed; report their scope separately from runtime speed.

## Current baseline

- The source manifest and npm latest are 3.0.4. The latest GitHub release is
  v3.0.0. Release metadata must be rechecked before publication.
- Project manifests, directory packages, local/locked remote dependencies,
  target capability checks, finite command output and typed artifacts exist.
  `watch`, user-facing `test` and LSP still have legacy single-file paths.
- The optimizer includes MIR passes, typed LIR analysis/rewrite facilities and
  an experimental VIR path. Reuse these before adding another framework.
- Local-copy/RMW rewriting remains opt-in. The earlier
  [opportunity report](docs/plans/redscript-typed-optimizer-opportunity-report.md)
  records static reductions, not permission to enable it by default.
- On 2026-11-01, core tests passed on disposable Paper 1.21.4 build 232:
  27 live descriptors and 3 compiler/mapping checks, no skips. The server was
  stopped and its temporary world removed. This core baseline precedes A1.
  It is not a new full-suite or Paper 26.2 qualification.

## A. Command quality and optimization workflow

### A1. Scoreboard effects across helper calls — complete

Current path: `src/optimizer/pipeline.ts` and `scoreboard-batch.ts`.

- [x] Pin read reuse and invalidation with focused regression tests.
- [x] Infer which acyclic, ordinary module-local helpers preserve external
      scoreboard state, including transitive calls.
- [x] Reuse repeated reads across those calls. Keep unknown/raw calls, macros,
      context calls, recursive call graphs and compiler-owned slots conservative.
- [x] Preserve source locations and invalidate cached values when their MIR
      destination is overwritten. Test selector/write alias boundaries.
- [x] Show a reduction on a cooldown/score helper fixture through the production
      pipeline, plus counterexamples where reuse must not happen.
- [x] Verify the affected behavior on disposable Paper before declaring live
      equivalence. Offline checks alone do not establish Minecraft semantics.

Keep this first slice narrow. A scoreboard-preserving helper is not necessarily
pure: the analysis must not be reused as permission for NBT or world transforms.

### A2. Explain optimization decisions — initial report complete

Production stage snapshots now include per-function MIR read/instruction counts,
scoreboard-preservation barriers, existing LIR pass deltas, emitted command counts
and lexical indicators, plus direct load/tick roots. See
[the inspection guide](docs/optimization.md). Reporting preserves generated output.

Next expand explanations beyond scoreboard calls and use game fixtures for cooldowns, area
queries, scoring, waves, collections and particle paths.

Report per-function static command counts, pass deltas and reasons an operation
could not be optimized. Separate load and tick work. Dynamic execution estimates
must state loop bounds/entity-count assumptions and retain an unknown result.
Do not label static line reductions as measured runtime improvements.

### A3. Stronger call and value optimization — planned

Use A1/A2 evidence to choose among partial-constant specialization, a cleanup
round after specialization, call-site-aware inlining, copy/return-slot removal
and direct condition lowering. Bound code growth. Reuse LIR/VIR allocation and
rewrite work where it already covers the case. No default experimental rollout
without semantic and generated-output regression coverage.

### A4. Minecraft-specific optimization — planned

Evaluate execute-context factoring, selector reuse and NBT/array access using
explicit effect and context boundaries. Preserve executor, position, dimension,
selection multiplicity, failure/result behavior and ordering. Unknown `raw`
commands remain opaque. Do not change update frequency or assume selectors are
stable without a contract. Minecraft 26.3 `/compute` work remains deferred.

## B. Language and stdlib usability

### B1. Specify common game APIs through working examples — planned

Start with cooldown/timer, per-player state and collection processing. Record
awkward source patterns and generated costs together. Define global, per-entity
and local lifetimes, reload behavior, array copy/mutation semantics and aliasing
before choosing new syntax. Review Timer's static-ID intrinsic restrictions and
stdlib stubs against the actual lowering path.

### B2. Make those APIs reusable across packages — planned

Support public struct/enum identities and diagnostics for private types in public
signatures where the examples require them. Integrate stdlib discovery, imports,
completion and required runtime initialization with project packages. Prefer
small composable APIs to hidden copies or broad chainable collection helpers.

## C. Development and correctness infrastructure

- [ ] Project-aware `watch`: build the selected target, include resource and
      manifest changes, and reload only successful output. Full project rebuilds
      are acceptable before a correct incremental dependency model exists.
- [ ] Project-level test discovery using the production package compiler.
- [ ] LSP project resolution and diagnostics, followed by symbol-based references
      and cross-file rename. Cover unsaved buffers through protocol tests.
- [ ] Calibrate bounded scoreboard interpreters against Paper for missing scores,
      signed integer edges, negative division/modulo and command failure.
      Unsupported behavior must remain unsupported, not silently equivalent.
- [ ] Make managed core correctness runs reusable without ad-hoc scripts; retain
      strict online mode, version checks, disposable roots and failure cleanup.
      A1 now has its own managed, strict correctness command (see below).
- [x] Cancel managed Paper shutdown timers after exit, including escalation
      paths, so successful correctness runs do not wait on a stale deadline.
- [ ] Layer checks: focused pass tests → output/equivalence tests → affected live
      cases → broader release checks. Do not run the whole live corpus per edit.
- [ ] Default the harness command API to loopback; require explicit remote setup.

## D. Documentation and 4.0.0 release

- [ ] Document a complete multi-file project, dependencies/lockfiles and targets
      in English and Chinese, with commands that exercise the current CLI.
- [ ] Correct testing/plugin examples and compile-check executable examples.
- [ ] Write migration notes for removed event contracts and invalid helpers.
- [ ] Align CHANGELOG, release notes, npm metadata and GitHub release with the
      tested source. Existing published versions are immutable.
- [ ] Bound release triggers so a compiler commit does not incidentally publish
      an extension or rebuild the IDE. Validate packed-package consumers.
- [ ] Publish 4.0.0 only after its selected slices and release gates pass.
      The roadmap is not a promise to finish every B/C item before this release.

## Delivery order

A1 is complete. Next use A2 plus a B1 example to select the next
optimization/API slice. Maintain
D alongside implementation so documentation follows tested behavior. Start the
larger project-tooling work in C as separate verified changes.

Record completed slices and their actual checks here. Detailed implementation
notes belong next to their design or tests, not in a second active roadmap.

## Verified slices

### 2026-11-01: scoreboard call effects and managed shutdown

- Added acyclic module-local scoreboard-effect inference and integrated it into
  the default MIR read pass. Standalone/custom pass lists stay conservative.
- Fixed cache invalidation across context calls, selector/wildcard aliases and
  temporary redefinitions. Replacement copies retain their source positions.
- The shared cooldown fixture in `tests/mc-cases/scoreboard-call-effects.mcrs`
  emits **8 → 7** non-comment commands in `test_readonly`. Its scoreboard reads
  fall **2 → 1**. The baseline uses the same compiler without call summaries.
  These are static output counts for one fixture, not a runtime speed claim.
- **628 offline checks passed**: 564 optimizer/managed-runtime checks and 64
  emission/module/syntax checks. The VIR benchmark test was excluded.
- **12 live checks passed**, no skips, on Paper 1.21.4 build 232: six scenarios
  with conservative output and the same six with effect-aware output. Scenarios
  cover transitive helpers, negative and missing scores, explicit writes, raw
  mutation and context mutation. Initial fixture ID/entrypoint mistakes were
  corrected and guarded by an offline deployment/entrypoint check.
- Shutdown deadline cancellation is covered for graceful, SIGTERM and SIGKILL
  exits. The final live run exited without Jest's open-handle warning. Its
  disposable world was removed. No benchmarks or load tests ran.

Reproduce the focused live checks with Java 21 and an offline Paper 1.21.4 template:

```sh
MC_JAVA_BIN=/path/to/java21/bin/java \
MC_SCORE_EFFECTS_TEMPLATE_DIR=/path/to/paper-1.21.4-template \
MC_OFFLINE=false npm run test:mc-score-effects:live
```

The command owns a disposable server, requires free localhost ports 25561/25566,
fails rather than skipping when prerequisites are missing, and cleans up in the
test teardown. `TMPDIR` controls where the disposable root is created. These
checks do not replace the full release build, full corpus or Paper 26.2 gates.
