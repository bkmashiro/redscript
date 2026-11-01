# RedScript 4.0.0 release candidate

Prepared for review; npm publication, the release tag and documentation deployment
have not been performed.

## Highlights since npm 3.0.4

### Project, package and target builds

- First-class `redscript.toml` manifests and a reusable compiler session.
- Directory packages, function exports and declaration-only `.d.mcrs` surfaces.
- Local dependencies and reproducible Git dependencies recorded in `redscript.lock`.
- Target capability validation, datapack output and the finite `commands` backend.
- Typed resource categories, contextual resource literals and selected typed
  builders for tags, recipes, loot and other supported resource artifacts.

Project builds use the package resolver. Project-aware watch, test and LSP flows,
and public struct/enum exports across package boundaries, remain roadmap work.
The command validator uses the Minecraft 1.21.4 command tree; accepting a year-based
Minecraft target does not establish complete validation for that runtime.

### Command quality

- User-score reads can be reused across ordinary helpers proven not to mutate them.
- Bounded partial constant-argument specialization retains dynamic parameters and
  runs generated bodies through the existing cleanup passes.
- Stage snapshots expose per-function MIR changes, conservative call barriers,
  LIR pass deltas, emitted command counts and direct lifecycle roots.
- Exact signed-i32 folding avoids host-language multiplication precision loss.
- Native tile division removes an incorrect negative-coordinate correction.

Fixture evidence includes an 8 → 7 command read-reuse case and straight-line
entry-plus-callee specialization paths of 15 → 7 and 15 → 12 commands. Cloning
can increase total pack size. These are static counts, not server speed claims.
VIR and experimental local-copy rewrites are not new default compiler paths.

### Explicit game lifecycle contracts

- Integer `/` and `%` follow native scoreboard floor semantics in constant and
  dynamic paths. `math.div_trunc` and `mod_trunc` explicitly provide toward-zero
  arithmetic for algorithms that need it.
- `@tick(rate=N)` now implements periodic registration, including reload phase
  reset and module-owned counters. Bare tick and rate 1 use the direct hook.
  Direct function calls remain ordinary calls. Rates currently require positive
  integer literals within the signed-i32 range.
- Cooldown helpers return caller-owned deadlines instead of ignoring a string
  name and sharing one global slot. They do not schedule per-instance tick work.

### Tooling and distribution

- Declaration generation, contextual resource hints and editor diagnostics were
  expanded since the last npm release.
- Bare and quoted stdlib discovery share source/installed-layout resolution.
- Published files exclude agent plans and unit artifacts while retaining runtime
  code/data. README images use repository URLs rather than requiring bundled media.
- Package smoke handles npm's keyed metadata format, checks current compiler
  semantics in an isolated installed consumer and cleans temporary consumers on failure.
- Managed Paper validation uses disposable roots and supports an explicit
  `MC_HARNESS_PLUGIN` JAR without editing frozen templates. Companion TestHarness
  1.2.1 binds its unauthenticated command API to loopback.

The independently distributed VS Code extension, web IDE and harness release
assets are not published by this compiler release preparation.

## Breaking changes

- Negative integer division/remainder now follow native floor rules consistently.
- Source `@throttle` is rejected, including in lenient compilation. Use periodic
  registration or explicit cooldown state according to the desired behavior.
- The cooldown string-name API and `cooldown_tick` implementation are removed.
- Legacy `@on(ItemUse)` and `@on(BlockBreak)` contracts are removed. Use explicit
  item/block-specific scoreboard or advancement assets and `@function_tag` handlers.
- Unsupported `strings` helpers (`str_len`, `str_concat`, `str_contains`,
  `str_slice`) and their module were removed rather than advertised as working
  general-purpose string operations.

See [4.0 migration](docs/MIGRATION_4.md) and [the full changelog](CHANGELOG.md).

## Verification boundary

The local gate includes a fresh TypeScript build, the complete non-performance
unit selection (including compiled-CLI corpus and static command validation),
and a real packed-install consumer smoke. Exact current results are recorded in
[ROADMAP.md](ROADMAP.md).

New numeric, cooldown, grid and cadence scenarios passed 58 checks on managed
Paper 1.21.4 with no skips. Earlier dual-Paper qualification remains historical
evidence; this preparation does not claim that the full changed corpus has been
requalified on Paper 26.2. No runtime performance benchmark was run.
