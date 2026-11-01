# RedScript roadmap

Updated: 2026-11-01. This file owns current priorities and implementation status.
Design contracts and historical validation records are indexed in
[docs/plans/README.md](docs/plans/README.md).

Execution pointer: **4.0.0 is published** on npm (`latest`) and GitHub, and the
English/Chinese 4.0 documentation is deployed. Registry integrity, provenance,
public CJS/ESM/CLI consumption and live documentation pages were verified.
Publication is bounded to version tags or explicit manual input (default dry-run).
See the completed release record below and [release procedure](docs/RELEASING.md).
This release operation is complete; IDE/extension/harness publication was excluded.

New developer-experience audit: [stdlib/syntax findings](docs/plans/stdlib-dx-audit.md).
Public 4.0.0 has unresolved project/stdlib integration, module-qualified-call and
strict unknown-call gaps. README examples are corrected and protected by three
outside-checkout compile regressions; the compiler gaps are not claimed fixed.
Agree on module binding/conflict rules before changing package resolution.

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

### A3. Stronger call and value optimization — partial specialization complete

Ordinary single-block helpers can bind some constant parameters while retaining
dynamic arguments. Generated bodies receive the existing cleanup passes.
Code-growth guards are engineering choices in `SPECIALIZATION_LIMITS`: 8 clones
per origin, 64 per module, 64 body instructions, 10 rounds, and a 240-character
generated-name cap. No new compiler framework was introduced.

New partial specializations reject unknown/raw/context/storage/macro, recursive,
compiler-register, runtime-decorator and division/failure-model boundaries. Parameter
redefinitions, generated-name collisions and transitive ABI dependencies are
covered. Runtime-decorated functions are protected from inlining/body cloning.

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

### B1. Common game APIs — cooldown baseline complete

`cooldown_start(now, ticks)` returns a caller-owned deadline;
`cooldown_ready(deadline, now)` and `cooldown_remaining` have no hidden global slot
or per-instance tick work. The caller owns a shared monotonic clock epoch and
state storage/reset. `@throttle` source syntax is rejected. `@tick(rate=N)` now
has real periodic registration with reset-on-load, module-owned counters, while
direct calls remain ordinary calls. Rates currently require integer literals.

Continue with timer, per-player state and collection processing. Record
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
      Native floor and signed-i32 folding/interpreters are aligned; explicit
      truncation helpers are available. The bounded checker declines missing or
      non-finite scores. Broader command-failure/alias semantics still need work.
- [ ] Make managed core correctness runs reusable without ad-hoc scripts; retain
      strict online mode, version checks, disposable roots and failure cleanup.
      A1 now has its own managed, strict correctness command (see below).
- [x] Cancel managed Paper shutdown timers after exit, including escalation
      paths, so successful correctness runs do not wait on a stale deadline.
- [x] Add a serial offline correctness command that preserves project ignores
      while excluding benchmark/performance files. Explicit core-offline mode
      no longer polls for a server; strict-online/offline conflict fails closed.
- [ ] Layer checks: focused pass tests → output/equivalence tests → affected live
      cases → broader release checks. Do not run the whole live corpus per edit.
- [x] TestHarness 1.2.1 binds the command API to IPv4 loopback. The managed runner
      can select a new JAR through `MC_HARNESS_PLUGIN` without modifying templates.
      The optimizer gate refuses known all-interface 1.2.0 defaults.

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

The selected contracts are implemented and live-checked. After fresh SDK gates,
continue B1 stdlib examples and expand A2 explanations. Prioritize modulo range
facts and use-def/liveness on real hot paths. Keep query/NBT context and mutation
barriers explicit; source text similarity is not a reuse proof. Keep VIR experimental: the bounded comparison below does
not justify a new default path. Maintain D alongside implementation and leave
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

### 2026-11-01: reports, specialization and target calibration

- Production stage reports and the real CLI snapshot path were exercised.
  Reports leave generated files unchanged and keep dynamic cost unknown.
- Partial-specialization fixture paths (entry plus its single straight-line
  callee) change **15 → 7** for identity configuration and **15 → 12** for affine
  and reordered-argument configurations. The fixture pack grows **99 → 109**
  commands because original externally callable helpers are retained. These are
  static counts with only specialization disabled in the comparison baseline.
- MIR large multiplication now uses exact i32 multiplication rather than a
  rounded JS product. VIR add/subtract/multiply wrap to i32. Folding preserves
  source locations. BigInt reference checks and native Paper probes cover edges.
- The [VIR region spike](spikes/001-vir-region/README.md) found **8 → 7** and
  **2 → 2** after ABI copies. Whole-module ordinary calls are unsupported. No
  default VIR integration or external compiler dependency was added.
- Final `npm run test:unit:correctness`: **5738 passed, 45 skipped**, 336 passing
  suites. Offline core cases report `[SKIP]` and are not live qualification.
  The script preserves unit project exclusions and excludes performance files.
- Final managed Paper gate: **31 passed, 2 failed**, with no skipped cases.
  The two failures pin the pre-existing documented/direct-call throttle mismatch
  under both conservative and effect-aware output. Do not call this gate green.
- Division/remainder rounding is independently inconsistent between native
  operations and current folding. It remains an owner decision, not a verified
  optimization. See the [contract review](docs/plans/integer-and-runtime-contracts.md).

No benchmark/load test, package publication or release was performed. The full
release build/package-consumer gates remain pending. Disposable servers and roots
were cleaned up even on failed live assertions.

### 2026-11-01: approved numeric/lifecycle contracts and publication hygiene

- Native integer floor division/remainder now agree across MIR/VIR folding,
  test interpreters and tuning arithmetic. Explicit `math.div_trunc` and
  `mod_trunc` preserve toward-zero algorithms. The bounded checker declines
  missing/non-finite score proofs. This is not a complete command-failure model.
- `@throttle` is retired in source, including lenient compilation. Cooldown
  helpers now use caller-owned integer deadlines, with no shared named slot or
  per-instance updater. Source/installed-layout stdlib discovery shares one resolver.
- `@tick(rate=N)` previously only parsed its rate. It now registers a periodic
  dispatcher in both source and named-module compilation. Native controlled
  ticks prove 3/5/7 cadence, first firing, direct-call behavior, reload phase and
  namespace isolation. Bare tick and rate 1 add no dispatcher counter.
- `tile_of` no longer applies a second negative-coordinate correction. Its
  generated family changes **3 functions / 16 commands → 1 function / 5 commands**.
  Negative boundaries and minimum-i32 coordinates pass in Paper. This includes
  correcting an invalid old algorithm, not equivalence of that old program.
- Final source-scoped unit run: **5663 passed, 70 skipped**, 340 passing suites.
  The two existing compiled-CLI corpus suites were explicitly not qualified:
  their SDK is stale. They remain in the normal gate and are not waived.
- Final managed Paper 1.21.4 gate: **58 passed, zero skipped**, using TestHarness
  **1.2.1** (`redscript-testharness` source `6d4a3a1`) built with Java 21 / Gradle 8.5. Harness JVM tests: **15 passed**.
  OS listener inspection confirmed `127.0.0.1:25561`, not wildcard binding.
  The new JAR is selected through `MC_HARNESS_PLUGIN`; original templates/worlds
  are not replaced. The temporary Gradle distribution was removed.
- Publication files now exclude agent plans and unit artifacts. The prior local
  packlist included agent plans; no 4.0 package was published. Existing-dist dry
  inventories change **8.73 → 1.46 MB compressed**, **26.15 → 8.98 MB unpacked**
  (decimal MB). All 128 existing static relative dependencies reachable from the
  three public JS entrypoints remain included. This is not fresh SDK/install proof.
- npm package smoke understands keyed metadata output, checks current numeric,
  cooldown, periodic and retirement contracts in an installed consumer, and cleans
  owned temporary directories on failure. New parser/policy/smoke tests pass; the
  actual installed-consumer run still awaits the fresh SDK build.
- Runtime coverage inventory is **719 functions/methods**, **661 public runtime
  entries**, **98 mapped**, **563 still unmapped**. The new six stdlib function
  mappings are based on this Paper 1.21.4 run only. Historical mappings remain
  historical evidence. Regeneration now preserves them instead of resetting them.
- Bilingual docs were generated/checked and the VitePress build passed. The
  **48-file draft** is signed locally on `redscript-docs` branch
  `release/4.0-docs` (`a77be8c`), held from deployment until package alignment.

The current `dist` dates to 2026-08-11 and lacks the new resolver/tick-rate module.
A prior direct tsc attempt was rejected by the host's 1 MiB command-scan limit
(the vendor `_tsc.js` is 6,213,092 bytes). A normal fresh SDK build must happen in
an allowed execution context before the compiled-CLI corpus and real packed
consumer can qualify 4.0. Source CLI/API output and dry pack inventories do not
replace those gates. No release/tag/npm publication, manual CI run or performance
benchmark was performed.

Next efficiency work should preserve these contracts:

1. Feed modulo range facts into MIR to remove provably unreachable branches,
   then use def-use/liveness to remove copies without breaking ABI slots.
2. Select selector/NBT/context work from real game fixtures and typed effects.
   Unknown/raw mutations and nondeterministic selections remain barriers.
3. Improve reload readiness before shortening waits. Each scenario currently
   performs two reloads, each waiting 40 server ticks. Across 46 scenario runs
   that is a nominal **184 seconds at 20 TPS**, plus the cadence test's reloads.
   The last functional suite took about 249 seconds. Distinguish resources-ready
   from load-tag execution, especially while simulation ticks are frozen.
4. Make SDK freshness explicit before slow compiled-CLI corpus checks; do not
   let file existence stand in for a build of current source.

### 2026-11-01: build blocker resolved and 4.0.0 candidate verified

The operator repaired the execution scanner. The agent then ran the original
standard `npm run build` successfully, without changing Hermes or using another
execution entrypoint. The previous scanner blocker is historical, not current.

- Package manifest and lockfile are prepared as **4.0.0** on `release/4.0`.
- The CLI help banner now uses the installed manifest version instead of a
  hardcoded v2 label. The regression failed first and then passed.
- Final candidate `npm run test:unit:correctness`: **5783 passed, 70 skipped**,
  **342 passing suites**, including both previously pending compiled-CLI corpus
  and static command-validation gates. Offline cases are not extra live proof.
- Fresh TypeScript build/postbuild and real tarball installation passed. The
  installed package checks numeric/periodic/retirement contracts, bare stdlib
  resolution, API/resource exports, versioned CLI help, and init → project
  inspection → project compilation from an unrelated consumer directory.
- Version-only/help changes do not alter the earlier **58/58 Paper 1.21.4**
  qualification; that live run is not relabeled as a new Paper run.
- Release notes and migration details now cover the candidate and prior
  unpublished package/target/resource work, removed legacy events and unsupported
  string helpers. Remaining project-aware IDE/watch/test limitations are explicit.
- Bilingual project workflow documentation is based on commands exercised through
  the installed CLI. The documentation build passed. The docs branch remains a
  draft pending aligned publication.

No npm version, release tag or GitHub release has been published for 4.0.0.
The existing npm workflow currently publishes after any successful main CI and
checks out the latest main head rather than explicitly binding that tested SHA.
Before merging the version bump, confirm the intended npm/GitHub/docs publication
scope and whether to replace that automatic trigger with an intentional version
tag plus dry-run-default manual execution. No manual CI run was triggered during
candidate preparation.


### 2026-11-01: 4.0.0 published and documentation deployed

- **npm:** `redscript-mc@4.0.0`, with `latest=4.0.0`. Public registry metadata
  identifies a Trusted Publisher and SLSA provenance. A fresh independent public
  installation passed CJS/ESM compiler contracts, installed CLI version, project
  init/build and lockfile-integrity checks.
- **GitHub:** [v4.0.0](https://github.com/bkmashiro/redscript/releases/tag/v4.0.0)
  is a published stable release on the unchanged signed tag at `3c61c49`.
  Its tarball, release manifest and SHA256SUMS are uploaded. The tarball's GitHub
  digest and npm integrity match the exact consumer-tested Linux CI artifact.
- **Release CI:** [41283281455](https://github.com/bkmashiro/redscript/actions/runs/41283281455)
  finished successfully. Verification passed **5802 tests / 344 suites**, with
  **70 tests / 1 suite skipped**. No performance or live-Paper rerun was added.
- The initial publication job was blocked before writing by setup-node's dummy
  token; step-level empty auth fixed that without permitting token fallback.
  The subsequent OIDC write returned a success receipt, but asynchronous npm
  processing exceeded the old 16-second read window. Only after exact public
  integrity was confirmed was the failed job rerun, taking its already-published
  skip path. There was one accepted npm publication, not two uploads.
- Future confirmation uses a ten-minute target read window with per-request
  timeouts and a 15-minute job budget. Those are engineering budgets, not npm
  service guarantees. Read failures never trigger another automatic write.
- **Docs:** `redscript-docs` main `0dceba1` deployed through
  [41284045194](https://github.com/bkmashiro/redscript-docs/actions/runs/41284045194).
  The deployment is `https://87ba380e.redscript-docs.pages.dev`.
  Production English/Chinese homepages, project workflows and cooldown reference
  pages returned 200 with the current 4.0 content.
- Standalone IDE, VS Code and TestHarness release assets were not published.
  Existing private/untracked user plans were not staged or packed.
