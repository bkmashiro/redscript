# Inspecting generated command quality

Use the production compiler's stage snapshots. Reporting does not select another
backend or enable experimental rewrites, and must not change generated files.
The new fields described here belong to the upcoming 4.0 source, not npm 3.0.4.

```sh
redscript compile examples/game.mcrs -o ./out \
  --snapshot-stages lowerAndOptimize,emitDatapack \
  --snapshot-output ./optimization.json
```

These existing CLI flags currently support non-incremental single-source builds.
Explicit project-package builds reject them until the project adapter supports
snapshots. Do not silently fall back to a different compilation mode to get a
report. Library users can pass `stageSnapshots` and `snapshotStages` to `compile`.

## Read the two stages together

`lowerAndOptimize.summary.optimization` contains:

- Per-function MIR instruction and `score_read` counts before/after optimization.
  Counts omit block terminators. Inlined/removed functions and new specializations
  are represented with zero counts on the absent side, not a runtime delta.
- `scoreboardEffects`: whether each final MIR helper is proven to preserve user
  scores. A barrier identifies a raw command, score write, context/macro/storage
  boundary, unknown callee, or an unproven callee (including recursion).
  An unproven function is not necessarily mutating. This is not a purity proof.
- `lirPasses`: the existing LIR pass manager's per-pass instruction deltas. An
  instruction count is not necessarily the final emitted command count.

`emitDatapack.summary.commandReport` describes the actual final function files:

- `commands` excludes blank and comment lines, includes macro lines, and is
  reported per file plus a whole-pack total.
- `textIndicators` highlights score reads/copies, function calls, storage,
  selector text and macro lines. Indicators overlap and are lexical, including
  tokens inside raw commands or quoted messages. Never use them as rewrite
  legality, effect analysis or a weighted runtime score.
- `lifecycleRoots` lists direct load/tick tag entries. It does not multiply loop
  iterations, follow scheduled execution or estimate entity cardinality.
- `dynamicCost` stays `unknown`. A smaller pack can still do more work per tick.

## A repeatable optimization change

1. Capture an awkward or inefficient real program as a source fixture.
2. Identify whether the issue is source semantics, missing MIR analysis, storage
   allocation or Minecraft command selection.
3. Add a correctness counterexample and an emitted-output regression. Compare
   the same production pipeline with only the candidate transformation disabled.
4. Check relevant passes and command syntax, then run affected cases on a managed
   disposable Paper server. Include missing/negative scores and mutation barriers
   where the rewrite touches score state.
5. Record exact fixture counts and their scope in the roadmap. Report code growth
   as well as execution-path savings when specialization clones functions.

The scoreboard call-effects fixture is an example: `test_readonly` emits 8 → 7
commands with effect-aware read reuse, while explicit/raw/context mutations keep
the required second input read. Its managed correctness command is:

```sh
MC_OFFLINE=false npm run test:mc-score-effects:live
```

Use Java 21, a Paper 1.21.4 offline template and a current loopback-only harness
JAR selected with `MC_HARNESS_PLUGIN`, as documented in the roadmap. This
command runs functional checks, not performance benchmarks. Full release builds,
other runtime versions and unrelated corpus cases are separate gates.

## Partial specialization and size trade-offs

Single-block ordinary helpers can retain dynamic arguments while binding constant
ones. Their generated bodies receive the same cleanup passes. For the scoring
fixture, the entry plus its single callee changes 15 → 7 commands for `(x, 1, 0)`
and 15 → 12 for `(x, 3, 7)`. The whole fixture grows 99 → 109 commands because
original user functions remain externally callable.

`SPECIALIZATION_LIMITS` in `src/optimizer/interprocedural.ts` bounds clones and
body/name size. These are engineering guards, not Minecraft standards or tuned
optima. Unknown/raw/context/storage/macro, recursive, compiler-slot and general
selector boundaries restrict new partial specialization. Division/remainder
boundaries remain conservative while broader command-failure modeling is pending.
Runtime-decorated functions are protected from body cloning and inlining.

## Correctness commands and open contracts

```sh
npm run test:unit:correctness
MC_OFFLINE=false npm run test:mc-score-effects:live
```

The offline command preserves Jest's unit-project exclusions, adds a no-performance
filter, and runs serially. Offline core cases report `[SKIP]`, not live proof.
Strict-online plus forced-offline settings fail immediately rather than waiting
for a server. The managed live gate now checks native floor arithmetic, explicit trunc helpers,
periodic registration and independent cooldown deadlines. The old throttle
regression is resolved by source-language retirement plus an explicit replacement
program that produces the intended result. See [the approved contracts](plans/integer-and-runtime-contracts.md)
and the current results in [the roadmap](../ROADMAP.md).

The [VIR region spike](../spikes/001-vir-region/README.md) is a separate bounded
experiment. Including production ABI copies leaves gains of 8 → 7 and 2 → 2 on
two arithmetic regions, while whole-module calls are unsupported. It does not
enable a second production compilation path.
